import Postmam from '../../Postmam';
import { MessengerMessageEvent } from '../../models/MessengerMessageEvent';
import Database from "../../services/Database";
import Event from "../../Event";
import EventHelper from "../../helpers/EventHelper";
import { timeoutPromise, unsubscribeFromPush, isPushNotificationsSupported } from '../../utils';
import TimeoutError from '../../errors/TimeoutError';
import { ProxyFrameInitOptions } from '../../models/ProxyFrameInitOptions';
import { Uuid } from '../../models/Uuid';
import ServiceWorkerHelper from "../../helpers/ServiceWorkerHelper";
import * as objectAssign from 'object-assign';
import SdkEnvironment from '../../managers/SdkEnvironment';
import { InvalidStateReason } from "../../errors/InvalidStateError";
import HttpHelper from "../../helpers/HttpHelper";
import TestHelper from "../../helpers/TestHelper";
import InitHelper from "../../helpers/InitHelper";
import MainHelper from "../../helpers/MainHelper";
import AltOriginManager from '../../managers/AltOriginManager';
import { AppConfig } from '../../models/AppConfig';
import { SubscriptionModalInitOptions } from '../../models/SubscriptionModalInitOptions';
import SubscriptionHelper from '../../helpers/SubscriptionHelper';
import * as log from 'loglevel';

/**
 * The actual OneSignal proxy frame contents / implementation, that is loaded
 * into the iFrame URL as subdomain.onesignal.com/webPushIFrame or
 * subdomain.os.tc/webPushIFrame. *
 */
export default class SubscriptionModalHost implements Disposable {
  private messenger: Postmam;
  private options: SubscriptionModalInitOptions;
  private modal: HTMLIFrameElement;
  private url: URL;
  private registrationOptions: any;

  constructor(initOptions: any, registrationOptions: any) {
    this.options = {
      appId: new Uuid(initOptions.appId)
    };
    this.registrationOptions = registrationOptions;
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
  async load(): Promise<void> {
    const isPushEnabled = await OneSignal.isPushNotificationsEnabled();
    const notificationPermission = await OneSignal.getNotificationPermission();
    this.url = AltOriginManager.getCanonicalSubscriptionUrls(new AppConfig())[0];
    this.url.pathname = 'webPushModal';
    this.url.search = `${MainHelper.getPromptOptionsQueryString()}&id=${this.options.appId}&httpsPrompt=true&pushEnabled=${isPushEnabled}&permissionBlocked=${(notificationPermission as any) === 'denied'}&promptType=modal`;
    log.info(`Loading iFrame for HTTPS subscription modal at ${this.url.toString()}`);

    this.modal = this.createHiddenSubscriptionDomModal(this.url.toString());

    this.establishCrossOriginMessaging();
  }

  createHiddenSubscriptionDomModal(url) {
    let iframeContainer = document.createElement('div');
    iframeContainer.setAttribute('id', 'OneSignal-iframe-modal');
    iframeContainer.setAttribute('style', 'display:none !important');
    iframeContainer.innerHTML = '<div id="notif-permission" style="background: rgba(0, 0, 0, 0.7); position: fixed;' +
      ' top: 0; left: 0; right: 0; bottom: 0; z-index: 3000000000; display: flex;' +
      ' align-items: center; justify-content: center;"></div>';
    document.body.appendChild(iframeContainer);

    let iframeContainerStyle = document.createElement('style');
    iframeContainerStyle.innerHTML = `@media (max-width: 560px) { .OneSignal-permission-iframe { width: 100%; height: 100%;} }`;
    document.getElementsByTagName('head')[0].appendChild(iframeContainerStyle);

    let iframe = document.createElement("iframe");
    iframe.className = "OneSignal-permission-iframe";
    iframe.setAttribute('frameborder', '0');
    iframe.width = OneSignal._windowWidth.toString();
    iframe.height = OneSignal._windowHeight.toString();
    iframe.src = url;

    document.getElementById("notif-permission").appendChild(iframe);
    return iframe;
  }

  removeFrame() {
    const existingInstance = document.querySelector(`iFrame[src='${this.url.toString()}'`);
    if (existingInstance) {
      existingInstance.remove();
    }
  }

  showSubscriptionDomModal() {
    const iframeContainer = document.getElementById('OneSignal-iframe-modal');
    iframeContainer.setAttribute('style', '');
  }

  establishCrossOriginMessaging() {
    this.messenger = new Postmam(this.modal, this.url.origin, this.url.origin);
    this.messenger.startPostMessageReceive();

    this.messenger.once(OneSignal.POSTMAM_COMMANDS.MODAL_PROMPT_LOADED, this.onModalLoaded.bind(this));
    this.messenger.once(OneSignal.POSTMAM_COMMANDS.MODAL_PROMPT_ACCEPTED, this.onModalAccepted.bind(this));
    this.messenger.once(OneSignal.POSTMAM_COMMANDS.MODAL_PROMPT_REJECTED, this.onModalRejected.bind(this));
    this.messenger.once(OneSignal.POSTMAM_COMMANDS.POPUP_CLOSING, this.onModalClosing.bind(this));
  }

  onModalLoaded(message: MessengerMessageEvent) {
    this.showSubscriptionDomModal();
    Event.trigger('modalLoaded');
  }

  async onModalAccepted(message: MessengerMessageEvent) {
    log.debug('User accepted the HTTPS modal prompt.');
    OneSignal._sessionInitAlreadyRunning = false;
    this.dispose();
    MainHelper.triggerCustomPromptClicked('granted');
    log.debug('Calling setSubscription(true)');
    await OneSignal.setSubscription(true)
    SubscriptionHelper.registerForW3CPush(this.registrationOptions);
  }

  onModalRejected(message: MessengerMessageEvent) {
    log.debug('User rejected the HTTPS modal prompt.');
    OneSignal._sessionInitAlreadyRunning = false;
    this.dispose();
    MainHelper.triggerCustomPromptClicked('denied');
  }

  onModalClosing(message: MessengerMessageEvent) {
    log.info('Detected modal is closing.');
    this.dispose();
  }

  dispose() {
    // Removes all events
    this.messenger.destroy();
    this.removeFrame();
  }

  /**
   * Shortcut method to messenger.message().
   */
  message() {
    this.messenger.message.apply(this.messenger, arguments);
  }
}
