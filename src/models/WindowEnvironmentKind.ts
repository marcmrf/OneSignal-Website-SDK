export enum WindowEnvironmentKind {
  /**
   * A service worker environment.
   */
  ServiceWorker,

  /**
   * The top-level frame to the "main" client's site.
   */
  Host,

  /**
   * Our subscription popup for alt-origin sites.
   */
  OneSignalSubscriptionPopup,

  /**
   * Our subscription helper iFrame.
   */
  OneSignalProxyFrame,

  /**
   * A custom iFrame on the site.
   */
  CustomIframe,

  /**
   * An unknown window context type not matching any of the above.
   */
  Unknown
}
