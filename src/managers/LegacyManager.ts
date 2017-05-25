import SdkEnvironment from './SdkEnvironment';
import { WindowEnvironmentKind } from '../models/WindowEnvironmentKind';


/**
 * Creates method proxies for once-supported methods.
 */
export default class LegacyManager {
  static ensureBackwardsCompatibility(oneSignal) {
    LegacyManager.environmentPolyfill(oneSignal);
    LegacyManager.postmams(oneSignal);
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

  static postmams(oneSignal) {
    if (oneSignal.proxyFrame) {
      oneSignal.iframePostmam = oneSignal.proxyFrame;
    }
    if (oneSignal.subscriptionPopup) {
      oneSignal.popupPostmam = oneSignal.subscriptionPopup;
    }
  }
}
