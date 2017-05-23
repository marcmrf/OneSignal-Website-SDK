import Postmam from '../Postmam';
import { MessengerMessageEvent } from '../models/MessengerMessageEvent';
import Database from "../services/Database";
import Event from "../Event";
import EventHelper from "../helpers/EventHelper";
import { timeoutPromise, unsubscribeFromPush } from "../utils";
import TimeoutError from '../errors/TimeoutError';
import { ProxyFrameInitOptions } from '../models/ProxyFrameInitOptions';
import { Uuid } from '../models/Uuid';
import ServiceWorkerHelper from "../helpers/ServiceWorkerHelper";
import * as objectAssign from 'object-assign';
import SdkEnvironment from '../managers/SdkEnvironment';
import { InvalidStateReason } from "../errors/InvalidStateError";
import HttpHelper from "../helpers/HttpHelper";
import TestHelper from "../helpers/TestHelper";
import InitHelper from "../helpers/InitHelper";
import MainHelper from "../helpers/MainHelper";

/**
 * The actual OneSignal proxy frame contents / implementation, that is loaded
 * into the iFrame URL as subdomain.onesignal.com/webPushIFrame or
 * subdomain.os.tc/webPushIFrame. *
 */
export default class ProxyFrame implements Disposable {
  private messenger: Postmam;
  private options: ProxyFrameInitOptions;

  constructor(initOptions: any) {
    this.options = {
      appId: new Uuid(initOptions.appId),
      subdomain: initOptions.subdomainName,
      originUrl: new URL(initOptions.origin)
    };
  }

  /**
   * Loads the messenger on the iFrame to communicate with the host page and
   * assigns init options to an iFrame-only initialization of OneSignal.
   *
   * Our main host page will wait for all iFrame scripts to complete since the
   * host page uses the iFrame onload event to begin sending handshake messages
   * to the iFrame.
   *
   * There is no load timeout here; the iFrame initializes it scripts and waits
   * forever for the first handshake message.
   */
  initialize(): Promise<void> {
    ServiceWorkerHelper.applyServiceWorkerEnvPrefixes();

    const creator = window.opener || window.parent;
    if (creator == window) {
      document.write(`<span style='font-size: 14px; color: red; font-family: sans-serif;'>OneSignal: This page cannot be directly opened, and must be opened as a result of a subscription call.</span>`);
      return;
    }

    // The rest of our SDK isn't refactored enough yet to accept typed objects
    // Within this class, we can use them, but when we assign them to
    // OneSignal.config, assign the simple string versions
    const rasterizedOptions = objectAssign(this.options);
    rasterizedOptions.appId = rasterizedOptions.appId.value;
    rasterizedOptions.origin = rasterizedOptions.origin.origin;
    OneSignal.config = rasterizedOptions || {};
    OneSignal.initialized = true;

    this.establishCrossOriginMessaging();
    Event.trigger('httpInitialize');
  }

  establishCrossOriginMessaging() {
    this.messenger = new Postmam(window, this.options.originUrl.origin, this.options.originUrl.origin);
    this.messenger.on(OneSignal.POSTMAN_COMMANDS.CONNECTED, this.onMessengerConnect);
    this.messenger.on(OneSignal.POSTMAN_COMMANDS.IFRAME_POPUP_INITIALIZE, this.onProxyFrameInitializing);
    this.messenger.on(OneSignal.POSTMAN_COMMANDS.REMOTE_NOTIFICATION_PERMISSION, this.onRemoteNotificationPermission);
    this.messenger.on(OneSignal.POSTMAN_COMMANDS.REMOTE_DATABASE_GET, this.onRemoteDatabaseGet);
    this.messenger.on(OneSignal.POSTMAN_COMMANDS.REMOTE_DATABASE_PUT, this.onRemoteDatabasePut);
    this.messenger.on(OneSignal.POSTMAN_COMMANDS.REMOTE_DATABASE_REMOVE, this.onRemoteDatabaseRemove);
    this.messenger.on(OneSignal.POSTMAN_COMMANDS.UNSUBSCRIBE_FROM_PUSH, this.onUnsubscribeFromPush);
    this.messenger.on(OneSignal.POSTMAN_COMMANDS.SHOW_HTTP_PERMISSION_REQUEST, this.onShowHttpPermissionRequest);
    this.messenger.on(OneSignal.POSTMAN_COMMANDS.IS_SHOWING_HTTP_PERMISSION_REQUEST, this.onIsShowingHttpPermissionRequest);
    this.messenger.on(OneSignal.POSTMAN_COMMANDS.MARK_PROMPT_DISMISSED, this.onMarkPromptDismissed);
    this.messenger.listen();
  }

  dispose() {
    // Removes all events
    this.messenger.destroy();
  }

  async onMessengerConnect(message: MessengerMessageEvent) {
    log.debug(`(${SdkEnvironment.getWindowEnv().toString()}) Successfully established cross-origin communication.`);
    return false;
  }

  async onProxyFrameInitializing(message: MessengerMessageEvent) {
    log.info(`(${SdkEnvironment.getWindowEnv().toString()}) The iFrame has just received initOptions from the host page!`);

    OneSignal.config = objectAssign(message.data.hostInitOptions, OneSignal.config, {
      defaultUrl: message.data.defaultUrl,
      pageUrl: message.data.pageUrl,
      pageTitle: message.data.pageTitle
    });

    InitHelper.installNativePromptPermissionChangedHook();

    // 3/30/16: For HTTP sites, put the host page URL as default URL if one doesn't exist already
    const defaultUrl = await Database.get('Options', 'defaultUrl');
    if (!defaultUrl) {
      await Database.put('Options', {key: 'defaultUrl', value: new URL(OneSignal.config.defaultUrl).origin});
    }

    /**
     * When a user is on http://example.com and receives a notification, we want to open a new window only if the
     * notification's URL is different from http://example.com. The service worker, which only controls
     * subdomain.onesignal.com, doesn't know that the host URL is http://example.com. Although defaultUrl above
     * sets the HTTP's origin, this can be modified if users call setDefaultTitle(). lastKnownHostUrl therefore
     * stores the last visited full page URL.
     */
    await Database.put('Options', { key: 'lastKnownHostUrl', value: OneSignal.config.pageUrl });
    await InitHelper.initSaveState();
    await InitHelper.storeInitialValues();
    await InitHelper.saveInitOptions();

    if (navigator.serviceWorker && window.location.protocol === 'https:') {
      try {
        MainHelper.establishServiceWorkerChannel();
      } catch (e) {
        log.error(`Error interacting with Service Worker inside an HTTP-hosted iFrame:`, e);
      }
    }

    message.reply(OneSignal.POSTMAM_COMMANDS.REMOTE_OPERATION_COMPLETE);
  }

  async onRemoteNotificationPermission(message: MessengerMessageEvent) {
    const permission = await OneSignal.getNotificationPermission();
    message.reply(permission);
    return false;
  }

  async onRemoteDatabaseGet(message: MessengerMessageEvent) {
    // retrievals is an array of key-value pairs e.g. [{table: 'Ids', keys:
    // 'userId'}, {table: 'Ids', keys: 'registrationId'}]
    const retrievals: Array<{table, key}> = message.data;
    const retrievalOpPromises = [];
    for (let retrieval of retrievals) {
      const {table, key} = retrieval;
      retrievalOpPromises.push(Database.get(table, key));
    }
    const results = await Promise.all(retrievalOpPromises);
    message.reply(results);
    return false;
  }

  async onRemoteDatabasePut(message: MessengerMessageEvent) {
    // insertions is an array of key-value pairs e.g. [table: {'Options': keypath: {key: persistNotification, value: '...'}}, {table: 'Ids', keypath: {type: 'userId', id: '...'}]
    // It's formatted that way because our IndexedDB database is formatted that way
    const insertions: Array<{table, keypath}> = message.data;
    let insertionOpPromises = [];
    for (let insertion of insertions) {
      let {table, keypath} = insertion;
      insertionOpPromises.push(Database.put(table, keypath));
    }
    const results = await Promise.all(insertionOpPromises);
    message.reply(OneSignal.POSTMAM_COMMANDS.REMOTE_OPERATION_COMPLETE);
    return false;
  }

  async onRemoteDatabaseRemove(message: MessengerMessageEvent) {
    // removals is an array of key-value pairs e.g. [table: {'Options': keypath: {key: persistNotification, value: '...'}}, {table: 'Ids', keypath: {type: 'userId', id: '...'}]
    // It's formatted that way because our IndexedDB database is formatted that way
    const removals: Array<{table, keypath}> = message.data;
    let removalOpPromises = [];
    for (let removal of removals) {
      let {table, keypath} = removal;
      removalOpPromises.push(Database.remove(table, keypath));
    }
    const results = await Promise.all(removalOpPromises);
    message.reply(OneSignal.POSTMAM_COMMANDS.REMOTE_OPERATION_COMPLETE);
    return false;
  }

  // this.messenger.on(OneSignal.POSTMAN_COMMANDS.UNSUBSCRIBE_FROM_PUSH, this.onUnsubscribeFromPush);
  // this.messenger.on(OneSignal.POSTMAN_COMMANDS.SHOW_HTTP_PERMISSION_REQUEST, this.onShowHttpPermissionRequest);
  // this.messenger.on(OneSignal.POSTMAN_COMMANDS.IS_SHOWING_HTTP_PERMISSION_REQUEST, this.onIsShowingHttpPermissionRequest);
  // this.messenger.on(OneSignal.POSTMAN_COMMANDS.MARK_PROMPT_DISMISSED, this.onMarkPromptDismissed);

  async onUnsubscribeFromPush(message: MessengerMessageEvent) {
    log.debug('(Reposted from iFrame -> Host) User unsubscribed but permission granted. Re-prompting the user for push.');
    try {
      await unsubscribeFromPush();
      message.reply(OneSignal.POSTMAM_COMMANDS.REMOTE_OPERATION_COMPLETE);
    } catch (e) {
      log.debug('Failed to unsubscribe from push remotely:', e);
    }
  }

  async onShowHttpPermissionRequest(message: MessengerMessageEvent) {
    log.debug(SdkEnvironment.getWindowEnv().toString() + " Calling showHttpPermissionRequest() inside the iFrame, proxied from host.");
    let options = {};
    if (message.data) {
      options = message.data;
    }
    log.debug(SdkEnvironment.getWindowEnv().toString() + 'HTTP permission request showing, message data:', message);
    try {
      const result = await OneSignal.showHttpPermissionRequest(options);
      message.reply({ status: 'resolve', result: result });
    } catch (e) {
      if (e && e.reason === InvalidStateReason[InvalidStateReason.PushPermissionAlreadyGranted]) {
      // Don't do anything for this error, too common
      } else {
        message.reply({ status: 'reject', result: e })
      }
    }
  }

  async onIsShowingHttpPermissionRequest(message: MessengerMessageEvent) {
    const isShowingHttpPermReq = await HttpHelper.isShowingHttpPermissionRequest();
    message.reply(isShowingHttpPermReq);
    return false;
  }


  async onMarkPromptDismissed(message: MessengerMessageEvent) {
    log.debug('(Reposted from iFrame -> Host) Marking prompt as dismissed.');
    TestHelper.markHttpsNativePromptDismissed();
    message.reply(OneSignal.POSTMAM_COMMANDS.REMOTE_OPERATION_COMPLETE);
    return false;
  }


  /**
   * Shortcut method to messenger.message().
   */
  message() {
    this.messenger.message.apply(this.messenger, arguments);
  }
}
