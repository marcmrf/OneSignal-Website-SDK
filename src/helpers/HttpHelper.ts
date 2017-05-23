import Environment from "../Environment";
import * as log from "loglevel";
import Event from "../Event";
import Database from "../services/Database";
import {
  getConsoleStyle,
  timeoutPromise,
  unsubscribeFromPush
} from "../utils";
import * as objectAssign from "object-assign";
import Postmam from "../Postmam";
import MainHelper from "./MainHelper";
import ServiceWorkerHelper from "./ServiceWorkerHelper";
import InitHelper from "./InitHelper";
import EventHelper from "./EventHelper";
import SubscriptionHelper from "./SubscriptionHelper";
import { InvalidStateReason } from "../errors/InvalidStateError";
import TestHelper from './TestHelper';
import SdkEnvironment from '../managers/SdkEnvironment';
import { BuildEnvironmentKind } from "../models/BuildEnvironmentKind";
import { WindowEnvironmentKind } from "../models/WindowEnvironmentKind";
import AltOriginManager from '../managers/AltOriginManager';

declare var OneSignal: any;


export default class HttpHelper {

  static async isShowingHttpPermissionRequest() {
    if (SubscriptionHelper.isUsingSubscriptionWorkaround()) {
      return await new Promise((resolve, reject) => {
        OneSignal.proxyFrame.message(OneSignal.POSTMAM_COMMANDS.IS_SHOWING_HTTP_PERMISSION_REQUEST, null, reply => {
          resolve(reply.data);
        });
      });
    } else {
      return OneSignal._showingHttpPermissionRequest;
    }
  }

  // Http only - Only called from iframe's init.js
  static initHttp(options) {
    log.debug(`Called %cinitHttp(${JSON.stringify(options, null, 4)})`, getConsoleStyle('code'));

    ServiceWorkerHelper.applyServiceWorkerEnvPrefixes();

    var creator = window.opener || window.parent;

    if (creator == window) {
      document.write(`<span style='font-size: 14px; color: red; font-family: sans-serif;'>OneSignal: This page cannot be directly opened, and
must be opened as a result of a subscription call.</span>`);
      return;
    }

    // Forgetting this makes all our APIs stall forever because the promises expect this to be true
    OneSignal.config = options || {};
    OneSignal.initialized = true;

    let sendToOrigin = options.origin;
    let receiveFromOrigin = options.origin;

    let preinitializePromise = Promise.resolve();

    OneSignal._thisIsThePopup = options.isPopup;
    if (SdkEnvironment.getWindowEnv() === WindowEnvironmentKind.OneSignalSubscriptionPopup || OneSignal._thisIsThePopup) {
      OneSignal.popupPostmam = new Postmam(window.opener, sendToOrigin, receiveFromOrigin);
      // The host page will receive this event, and then call connect()
      OneSignal.popupPostmam.postMessage(OneSignal.POSTMAM_COMMANDS.POPUP_BEGIN_MESSAGEPORT_COMMS, null);
      OneSignal.popupPostmam.listen();
      OneSignal.popupPostmam.on('connect', e => {
        log.debug(`(${SdkEnvironment.getWindowEnv().toString()}) The host page is now ready to receive commands from the HTTP popup.`);
        Event.trigger('httpInitialize');
      });
    }

    OneSignal._thisIsTheModal = options.isModal;
    if (OneSignal._thisIsTheModal) {
      OneSignal.modalPostmam = new Postmam(window.parent, sendToOrigin, receiveFromOrigin);
    }

    OneSignal.iframePostmam = new Postmam(window, sendToOrigin, receiveFromOrigin);
    OneSignal.iframePostmam.listen();
    OneSignal.iframePostmam.on(OneSignal.POSTMAM_COMMANDS.CONNECTED, e => {
      log.debug(`(${SdkEnvironment.getWindowEnv().toString()}) Fired Postmam connect event!`);
    });
    OneSignal.iframePostmam.on(OneSignal.POSTMAM_COMMANDS.REMOTE_NOTIFICATION_PERMISSION, message => {
      OneSignal.getNotificationPermission()
               .then(permission => message.reply(permission));
      return false;
    });
    OneSignal.iframePostmam.on(OneSignal.POSTMAM_COMMANDS.REMOTE_DATABASE_GET, message => {
      // retrievals is an array of key-value pairs e.g. [{table: 'Ids', keys: 'userId'}, {table: 'Ids', keys: 'registrationId'}]
      let retrievals = message.data;
      let retrievalOpPromises = [];
      for (let retrieval of retrievals) {
        let {table, key} = retrieval;
        retrievalOpPromises.push(Database.get(table, key));
      }
      Promise.all(retrievalOpPromises)
             .then(results => message.reply(results));
      return false;
    });
    OneSignal.iframePostmam.on(OneSignal.POSTMAM_COMMANDS.REMOTE_DATABASE_PUT, message => {
      // insertions is an array of key-value pairs e.g. [table: {'Options': keypath: {key: persistNotification, value: '...'}}, {table: 'Ids', keypath: {type: 'userId', id: '...'}]
      // It's formatted that way because our IndexedDB database is formatted that way
      let insertions = message.data;
      let insertionOpPromises = [];
      for (let insertion of insertions) {
        let {table, keypath} = insertion;
        insertionOpPromises.push(Database.put(table, keypath));
      }
      Promise.all(insertionOpPromises)
             .then(results => message.reply(OneSignal.POSTMAM_COMMANDS.REMOTE_OPERATION_COMPLETE));
      return false;
    });
    OneSignal.iframePostmam.on(OneSignal.POSTMAM_COMMANDS.REMOTE_DATABASE_REMOVE, message => {
      // removals is an array of key-value pairs e.g. [table: {'Options': keypath: {key: persistNotification, value: '...'}}, {table: 'Ids', keypath: {type: 'userId', id: '...'}]
      // It's formatted that way because our IndexedDB database is formatted that way
      let removals = message.data;
      let removalOpPromises = [];
      for (let removal of removals) {
        let {table, keypath} = removal;
        removalOpPromises.push(Database.remove(table, keypath));
      }
      Promise.all(removalOpPromises)
             .then(results => message.reply(OneSignal.POSTMAM_COMMANDS.REMOTE_OPERATION_COMPLETE));
      return false;
    });
    OneSignal.iframePostmam.on(OneSignal.POSTMAM_COMMANDS.IFRAME_POPUP_INITIALIZE, message => {
      log.info(`(${SdkEnvironment.getWindowEnv().toString()}) The iFrame has just received initOptions from the host page!`);

      preinitializePromise.then(() => {
        OneSignal.config = objectAssign(message.data.hostInitOptions, options, {
          defaultUrl: message.data.defaultUrl,
          pageUrl: message.data.pageUrl,
          pageTitle: message.data.pageTitle
        });

        InitHelper.installNativePromptPermissionChangedHook();

        let opPromises = [];
        if (options.continuePressed) {
          opPromises.push(OneSignal.setSubscription(true));
        }
        // 3/30/16: For HTTP sites, put the host page URL as default URL if one doesn't exist already
        opPromises.push(Database.get('Options', 'defaultUrl').then(defaultUrl => {
          if (!defaultUrl) {
            return Database.put('Options', {key: 'defaultUrl', value: new URL(OneSignal.config.defaultUrl).origin});
          }
        }));

        /**
         * When a user is on http://example.com and receives a notification, we want to open a new window only if the
         * notification's URL is different from http://example.com. The service worker, which only controls
         * subdomain.onesignal.com, doesn't know that the host URL is http://example.com. Although defaultUrl above
         * sets the HTTP's origin, this can be modified if users call setDefaultTitle(). lastKnownHostUrl therefore
         * stores the last visited full page URL.
         */
        opPromises.push(
            Database.put('Options', {key: 'lastKnownHostUrl', value: OneSignal.config.pageUrl})
        );

        opPromises.push(InitHelper.initSaveState());
        opPromises.push(InitHelper.storeInitialValues());
        opPromises.push(InitHelper.saveInitOptions());
        Promise.all(opPromises as any[])
               .then(() => {
                 /* 3/20/16: In the future, if navigator.serviceWorker.ready is unusable inside of an insecure iFrame host, adding a message event listener will still work. */
                 //if (navigator.serviceWorker) {
                 //log.info('We have added an event listener for service worker messages.', SdkEnvironment.getWindowEnv().toString());
                 //navigator.serviceWorker.addEventListener('message', function(event) {
                 //  log.info('Wow! We got a message!', event);
                 //});
                 //}

                 if (navigator.serviceWorker && window.location.protocol === 'https:') {
                   try {
                     MainHelper.establishServiceWorkerChannel();
                   } catch (e) {
                     log.error(`Error interacting with Service Worker inside an HTTP-hosted iFrame:`, e);
                   }
                 }

                 message.reply(OneSignal.POSTMAM_COMMANDS.REMOTE_OPERATION_COMPLETE);
               });
      });
    });
    OneSignal.iframePostmam.on(OneSignal.POSTMAM_COMMANDS.UNSUBSCRIBE_FROM_PUSH, message => {
      log.debug(SdkEnvironment.getWindowEnv().toString() + " (Expected iFrame) has received the unsubscribe from push method.");
      unsubscribeFromPush()
        .then(() => message.reply(OneSignal.POSTMAM_COMMANDS.REMOTE_OPERATION_COMPLETE))
        .catch(e => log.debug('Failed to unsubscribe from push remotely.', e));
    });
    OneSignal.iframePostmam.on(OneSignal.POSTMAM_COMMANDS.SHOW_HTTP_PERMISSION_REQUEST, message => {
      log.debug(SdkEnvironment.getWindowEnv().toString() + " Calling showHttpPermissionRequest() inside the iFrame, proxied from host.");
      let options = {};
      if (message.data) {
        options = message.data;
      }
      log.debug(SdkEnvironment.getWindowEnv().toString() + 'HTTP permission request showing, message data:', message);
      OneSignal.showHttpPermissionRequest(options)
               .then(result => {
                 message.reply({status: 'resolve', result: result});
               })
               .catch(e => {
                 if (e && e.reason === InvalidStateReason[InvalidStateReason.PushPermissionAlreadyGranted]) {
                  // Don't do anything for this error, too common
                 } else {
                   message.reply({ status: 'reject', result: e })
                 }
               });
    });
    OneSignal.iframePostmam.on(OneSignal.POSTMAM_COMMANDS.IS_SHOWING_HTTP_PERMISSION_REQUEST, async message => {
      const isShowingHttpPermReq = await HttpHelper.isShowingHttpPermissionRequest();
      message.reply(isShowingHttpPermReq);
      return false;
    });
    OneSignal.iframePostmam.on(OneSignal.POSTMAM_COMMANDS.MARK_PROMPT_DISMISSED, message => {
      log.debug('(Reposted from iFrame -> Host) Marking prompt as dismissed.');
      TestHelper.markHttpsNativePromptDismissed();
      message.reply(OneSignal.POSTMAM_COMMANDS.REMOTE_OPERATION_COMPLETE);
      return false;
    });
    if (SdkEnvironment.getWindowEnv() === WindowEnvironmentKind.OneSignalProxyFrame) {
      Event.trigger('httpInitialize');
    }
  }

  static initPopup() {
    OneSignal.config = {};
    OneSignal.initialized = true;

    ServiceWorkerHelper.applyServiceWorkerEnvPrefixes();

    // Do not register OneSignalSDKUpdaterWorker.js for HTTP popup sites; the file does not exist
    OneSignal.isPushNotificationsEnabled(isEnabled => {
      if (!isEnabled) {
        navigator.serviceWorker.register(OneSignal.SERVICE_WORKER_PATH, OneSignal.SERVICE_WORKER_PARAM).then(SubscriptionHelper.enableNotifications, ServiceWorkerHelper.registerError);
      } else {
        window.close();
      }
    });
  }

  static loadPopup(url, options) {
    // Important: Don't use any promises until the window is opened, otherwise the popup will be blocked
    const sendToOrigin = AltOriginManager.getOneSignalSubscriptionPopupUrl(OneSignal.appConfig).origin;
    let postData = objectAssign({}, MainHelper.getPromptOptionsPostHash(), {
      promptType: 'popup',
      parentHostname: encodeURIComponent(location.hostname)
    });
    if (options && options.autoAccept) {
      postData['autoAccept'] = true;
    }
    log.info('loadPopup(options):', options);
    if (options && options.httpPermissionRequest) {
      postData['httpPermissionRequest'] = true;
      var overrides = {
        childWidth: 250,
        childHeight: 150,
        left: -99999999,
        top: 9999999,
      };
    }
    log.info(`Opening popup window to ${url} with POST data:`, url);
    var subdomainPopup = MainHelper.openSubdomainPopup(url, postData, overrides);

    OneSignal.popupPostmam = new Postmam(subdomainPopup, sendToOrigin, sendToOrigin);
    OneSignal.popupPostmam.startPostMessageReceive();

    OneSignal.popupPostmam.on(OneSignal.POSTMAM_COMMANDS.POPUP_BEGIN_MESSAGEPORT_COMMS, message => {
      // e.g. { eventName: 'subscriptionChange', eventData: true}
      log.debug(`(Popup Postmam) (${SdkEnvironment.getWindowEnv().toString()}) Got direct postMessage() event from popup event to begin MessagePort comms.`);
      OneSignal.popupPostmam.connect();
      return false;
    });

    OneSignal.popupPostmam.once(OneSignal.POSTMAM_COMMANDS.POPUP_LOADED, message => {
      Event.trigger('popupLoad');
    });
    OneSignal.popupPostmam.once(OneSignal.POSTMAM_COMMANDS.POPUP_ACCEPTED, message => {
      MainHelper.triggerCustomPromptClicked('granted');
    });
    OneSignal.popupPostmam.once(OneSignal.POSTMAM_COMMANDS.POPUP_REJECTED, message => {
      MainHelper.triggerCustomPromptClicked('denied');
    });
    OneSignal.popupPostmam.once(OneSignal.POSTMAM_COMMANDS.POPUP_CLOSING, message => {
      log.info('Detected popup is closing.');
      Event.trigger(OneSignal.EVENTS.POPUP_CLOSING);
      OneSignal.popupPostmam.destroy();
    });
    OneSignal.popupPostmam.once(OneSignal.POSTMAM_COMMANDS.BEGIN_BROWSING_SESSION, message => {
      log.debug(SdkEnvironment.getWindowEnv().toString() + " Marking current session as a continuing browsing session.");
      MainHelper.beginTemporaryBrowserSession();
    });
    OneSignal.popupPostmam.once(OneSignal.POSTMAM_COMMANDS.WINDOW_TIMEOUT, message => {
      log.debug(SdkEnvironment.getWindowEnv().toString() + " Popup window timed out and was closed.");
      Event.trigger(OneSignal.EVENTS.POPUP_WINDOW_TIMEOUT);
    });
    OneSignal.popupPostmam.once(OneSignal.POSTMAM_COMMANDS.FINISH_REMOTE_REGISTRATION, message => {
      log.debug(SdkEnvironment.getWindowEnv().toString() + " Finishing HTTP popup registration inside the iFrame, sent from popup.");

      message.reply({ progress: true });

      MainHelper.getAppId()
                .then(appId => {
                  OneSignal.popupPostmam.stopPostMessageReceive();
                  MainHelper.registerWithOneSignal(appId, message.data.subscriptionInfo)
                            .then(() => EventHelper.checkAndTriggerSubscriptionChanged());
                });
    });
  }
}
