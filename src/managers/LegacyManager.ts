import SdkEnvironment from './SdkEnvironment';
import { WindowEnvironmentKind } from '../models/WindowEnvironmentKind';


/**
 * Creates method proxies for once-supported methods.
 */
export default class LegacyManager {
  static ensureBackwardsCompatibility(oneSignal) {
    LegacyManager.environmentPolyfill(oneSignal);
  }

  static environmentPolyfill(oneSignal) {
    oneSignal.environment = {};
    oneSignal.environment.getEnv = function () { return ''; }
    oneSignal.environment.isPopup = function () {
      return SdkEnvironment.getWindowEnv() === WindowEnvironmentKind.OneSignalSubscriptionPopup;
    }
    oneSignal.environment.isIframe = function () {
      return SdkEnvironment.getWindowEnv() === WindowEnvironmentKind.OneSignalProxyFrame;
    }
  }

  static Postmams(oneSignal) {
    oneSignal.iframePostmam = OneSignal.proxyFrame;
    oneSignal.popupPostmam = OneSignal.subscriptionPopup;
  }
}
