import SubscriptionHelper from '../helpers/SubscriptionHelper';
import { AppConfig } from '../models/AppConfig';
import SdkEnvironment from './SdkEnvironment';
import { BuildEnvironmentKind } from '../models/BuildEnvironmentKind';
import { InvalidStateError, InvalidStateReason } from '../errors/InvalidStateError';
import OneSignalApi from '../OneSignalApi';
import { Uuid } from '../models/Uuid';
import Database from '../services/Database';

export default class AltOriginManager {

  /**
   * Saves into IndexedDb and returns the app config pulled from OneSignal.
   */
  static async queryAndSaveAppConfig(appId: Uuid) {
    const config = await OneSignalApi.getAppConfig(appId);
    await Database.setAppConfig(config);
    return config;
  }

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
  static getCanonicalSubscriptionUrl(config: AppConfig,
                                     buildEnv: BuildEnvironmentKind = SdkEnvironment.getBuildEnv()): URL {
    let url = SdkEnvironment.getOneSignalApiUrl(buildEnv);
    url.pathname = '';
    url.host = [config.subdomain, url.host].join('.');

    if (!config.useLegacyDomain && buildEnv === BuildEnvironmentKind.Production) {
      url.host = [config.subdomain, 'os.tc'].join('.');
    }
    // TODO: This block below is for testing purposes only. Remove for production.
    // For use with Charles proxy only
    if (!config.useLegacyDomain) {
      url.host = [config.subdomain, 'os.tc'].join('.');
    }

    return url;
  }

  /**
   * Returns the URL of the OneSignal proxy iFrame helper.
   */
  static getOneSignalProxyIframeUrl(config: AppConfig): URL {
    const url = AltOriginManager.getCanonicalSubscriptionUrl(config);
    url.pathname = 'webPushIframe';
    return url;
  }

  /**
   * Returns the URL of the OneSignal subscription popup.
   */
  static getOneSignalSubscriptionPopupUrl(config: AppConfig): URL {
    const url = AltOriginManager.getCanonicalSubscriptionUrl(config);
    url.pathname = 'subscribe';
    return url;
  }
}
