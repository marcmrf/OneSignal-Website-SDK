import { BuildEnvironmentKind } from '../models/BuildEnvironmentKind';
import Environment from '../Environment';
import { TestEnvironmentKind } from '../models/TestEnvironmentKind';
import { TestEnvironment } from '../../test/support/sdk/TestEnvironment';
import { WindowEnvironmentKind } from '../models/WindowEnvironmentKind';

export default class SdkEnvironment {

  /**
   * Returns the URL in which the push subscription and IndexedDb site data
   * will be stored.
   *
   * For native HTTPS sites not using a subdomain of our service, this is
   * the top-level URL.
   *
   * For sites using a subdomain of our service, this URL was typically
   * subdomain.onesignal.com, until we switched to subdomain.os.tc for a shorter
   * origin to fit into Mac's native notifications on Chrome 59+.
   */
  getCanonicalSubscriptionUrl(): URL {
    if (SubscriptionHelper.isUsingSubscriptionWorkaround()) {

    } else {

    }
  }

  /**
   * Returns development, staging, or production.
   *
   * The magic constants used to detect the environment is set or unset when
   * building the SDK.
   */
  static getBuildEnv(): BuildEnvironmentKind {
    if ((typeof __DEV__ !== "undefined")) {
      return BuildEnvironmentKind.Development;
    } else if (typeof __STAGING__ !== "undefined") {
      return BuildEnvironmentKind.Staging;
    } else {
      return BuildEnvironmentKind.Production;
    }
  }

  static getWindowEnv(): WindowEnvironmentKind {
    if (typeof window === "undefined") {
      if (typeof self !== "undefined" && typeof self.registration !== "undefined") {
        return WindowEnvironmentKind.ServiceWorker;
      } else {
        return WindowEnvironmentKind.Unknown;
      }
    }
    else {
      // If the window is the root top-most level
      if (window === window.top) {
        if (location.href.indexOf("initOneSignal") !== -1 ||
          (location.pathname === '/subscribe' &&
            location.search === '') &&
          (
            location.hostname.endsWith('.onesignal.com') ||
            (location.hostname.indexOf('.localhost') !== -1 && SdkEnvironment.getBuildEnv() === BuildEnvironmentKind.Development)
          )
        ) {
          return WindowEnvironmentKind.OneSignalSubscriptionPopup;
        }
        else {
          return WindowEnvironmentKind.Host;
        }
      }
      else if (location.pathname === '/webPushIframe' ||
        location.pathname === '/webPushModal') {
        return WindowEnvironmentKind.OneSignalProxyFrame;
      }
      else {
        return WindowEnvironmentKind.CustomIframe;
      }
    }
  }

  /**
   * Describes whether the SDK is built in tests mode or not.
   *
   * The magic constants used to detect the environment is set or unset when
   * building the SDK.
   */
  static getTestEnv(): TestEnvironmentKind {
    if ((typeof __TEST__ !== "undefined")) {
      return TestEnvironmentKind.UnitTesting;
    } else {
      return TestEnvironmentKind.None;
    }
  }

  /**
   * Returns build-specific prefixes used for operations like registering the
   * service worker.
   *
   * For example, in staging the registered service worker filename is
   * Staging-OneSignalSDKWorker.js.
   */
  static getBuildEnvPrefix(buildEnv?: BuildEnvironmentKind) : string {
    if (!buildEnv) {
      buildEnv = SdkEnvironment.getBuildEnv();
    }

    switch (buildEnv) {
      case BuildEnvironmentKind.Development:
        return 'Dev-';
      case BuildEnvironmentKind.Staging:
        return 'Staging-';
      case BuildEnvironmentKind.Production:
        return '';
    }
  }

  /**
   * Returns the URL object representing the components of OneSignal's API
   * endpoint.
   */
  static getOneSignalApiUrl(buildEnv?: BuildEnvironmentKind): URL {
    if (!buildEnv) {
      buildEnv = SdkEnvironment.getBuildEnv();
    }

    switch (buildEnv) {
      case BuildEnvironmentKind.Development:
        return new URL('https://localhost:3001/api/v1/');
      case BuildEnvironmentKind.Staging:
        return new URL('https://onesignal-staging.pw/api/v1/');
      case BuildEnvironmentKind.Production:
        return new URL('https://onesignal.com/api/v1');
    }
  }
}
