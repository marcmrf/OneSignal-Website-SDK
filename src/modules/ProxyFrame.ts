import Postmam from '../Postmam';
import { MessengerMessageEvent } from '../models/MessengerMessageEvent';
import Database from "../services/Database";
import Event from "../Event";
import EventHelper from "../helpers/EventHelper";
import { executeAndTimeoutPromiseAfter } from "../utils";

/**
 * Manager for an instance of the OneSignal proxy frame.
 *
 * This is loaded as subdomain.onesignal.com/webPushIFrame or
 * subdomain.os.tc/webPushIFrame.
 *
 */
export default class ProxyFrame {

  private url: URL;
  private element: HTMLIFrameElement;
  private messenger: Postmam;

  // Promise to track whether the frame has finished loading
  private loadPromise: {
    promise: Promise<void>,
    resolver: Function,
    rejector: Function
  }

  /**
   *
   * @param origin The URL object describing the origin to load.
   */
  constructor(origin: URL) {
    this.url = origin;
    this.url.pathname = 'webPushIframe';
  }

  /**
   * Creates and loads an iFrame on the DOM, replacing any existing iFrame of
   * the same URL.
   */
  load(timeout: Number): Promise<void> {
    /*
      This class removes existing iFrames with the same URL. This prevents
      multiple iFrames to the same origin, which can cause issues with
      cross-origin messaging.
    */
    log.debug('Opening an iFrame to', this.url.toString());
    const existingInstance = document.querySelector(`iFrame[src='${this.url.toString()}'`);
    if (existingInstance) {
      existingInstance.remove();
    }

    const iframe = document.createElement("iframe");
    iframe.style.display = "none";
    iframe.src = this.url.toString();
    (iframe as any).sandbox = 'allow-popups allow-popups-to-escape-sandbox allow-same-origin allow-scripts allow-top-navigation';
    iframe.onload = this.onFrameLoad;
    (this as any).loadPromise = {
      promise: new Promise((resolve, reject) => {
        this.loadPromise.resolver = resolve;
        this.loadPromise.rejector = reject;
      })
    };
    document.body.appendChild(iframe);

    this.element = iframe;
    return executeAndTimeoutPromiseAfter(this.loadPromise.promise, timeout)
      .catch(() => log.warn(`OneSignal: Could not load iFrame with URL ${this.url.toString()}. Please check that your 'subdomainName' matches that on your OneSignal Chrome platform settings. Also please check that your Site URL on your Chrome platform settings is a valid reachable URL pointing to your site.`));
  }

  onFrameLoad(e: UIEvent): void {
    log.debug('iFrame at', this.url.toString(), 'finished loading (onload event).');
    this.establishCrossOriginMessaging();
  }

  establishCrossOriginMessaging() {
    this.messenger = new Postmam(this.element.contentWindow, this.url.toString(), this.url.toString());
    this.messenger.on('connect', this.onMessengerConnect);
    this.messenger.connect();
  }

  async onMessengerConnect(e: MessengerMessageEvent) {
    log.debug('iFrame at', this.url.toString(), 'connected their messenger to ours.');

    let defaultUrl = await Database.get<string>('Options', 'defaultUrl');
    let defaultTitle = await Database.get<string>('Options', 'defaultTitle');

    defaultUrl = defaultUrl ? defaultUrl : location.href;
    defaultTitle = defaultTitle ? defaultTitle : document.title;

    this.messenger.message(OneSignal.POSTMAM_COMMANDS.IFRAME_POPUP_INITIALIZE, {
      hostInitOptions: JSON.parse(JSON.stringify(OneSignal.config)), // Removes functions and unmessageable objects
      defaultUrl: defaultUrl,
      pageUrl: window.location.href,
      pageTitle: defaultTitle,
    }, reply => {
      if (reply.data === OneSignal.POSTMAM_COMMANDS.REMOTE_OPERATION_COMPLETE) {
        this.loadPromise.resolver();
        Event.trigger(OneSignal.EVENTS.SDK_INITIALIZED);
      }
      return false;
    });
  }

  onRemoteRetriggerEvent(message: MessengerMessageEvent) {
    // e.g. { eventName: 'subscriptionChange', eventData: true}
    let {eventName, eventData} = (message.data as any);
    Event.trigger(eventName, eventData, message.source);
    return false;
  }

  onRemoteNotificationPermissionChanged(message: MessengerMessageEvent) {
    let {forceUpdatePermission} = (message.data as any);
    EventHelper.triggerNotificationPermissionChanged(forceUpdatePermission);
    return false;
  }

  onRequestHostUrl(message: MessengerMessageEvent) {
    message.reply(location.href);
    return false;
  }

  onServiceWorkerCommandRedirect(message: MessengerMessageEvent) {
    window.location.href = (message.data as any);
    return false;
  }

  onHttpPermissionRequestResubscribe(message: MessengerMessageEvent) {
    log.debug('(Reposted from iFrame -> Host) User unsubscribed but permission granted. Re-prompting the user for push.');
    OneSignal.showHttpPrompt({ __sdkCall: true, __useHttpPermissionRequestStyle: true }).catch(e => {
      log.debug('[Resubscribe Prompt Error]', e);
    });
    return false;
  }
}
