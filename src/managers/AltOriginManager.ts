import SubscriptionHelper from '../helpers/SubscriptionHelper';
import { AppConfig } from '../models/AppConfig';
import SdkEnvironment from './SdkEnvironment';
import { BuildEnvironmentKind } from '../models/BuildEnvironmentKind';
import { InvalidStateError, InvalidStateReason } from '../errors/InvalidStateError';
import OneSignalApi from '../OneSignalApi';
import { Uuid } from '../models/Uuid';
import Database from '../services/Database';

export default class AltOriginManager {

  constructor() {

  }

  discoverAltOrigin() {

  }

  /**
   * Saves into IndexedDb and returns the app config pulled from OneSignal.
   */
  static async queryAndSaveAppConfig(appId: Uuid) {
    const config = await OneSignalApi.getAppConfig(appId);
    await Database.setAppConfig(config);
    return config;
  }

  /**
   * Returns the array of possible URL in which the push subscription and
   * IndexedDb site data will be stored.
   *
   * For native HTTPS sites not using a subdomain of our service, this is the
   * top-level URL.
   *
   * For sites using a subdomain of our service, this URL was typically
   * subdomain.onesignal.com, until we switched to subdomain.os.tc for a shorter
   * origin to fit into Mac's native notifications on Chrome 59+.
   *
   * Because a user may be subscribed to subdomain.onesignal.com or
   * subdomain.os.tc, we have to load both in certain scenarios to determine
   * which the user is subscribed to; hence, this method returns an array of
   * possible URLs.
   */
  static getCanonicalSubscriptionUrls(config: AppConfig,
                                      buildEnv: BuildEnvironmentKind = SdkEnvironment.getBuildEnv()
                                     ): Array<URL> {
    let urls = [];

    let legacyDomainUrl = SdkEnvironment.getOneSignalApiUrl(buildEnv);
    legacyDomainUrl.host = [config.subdomain, legacyDomainUrl.host].join('.');
    urls.push(legacyDomainUrl);

    if (!config.useLegacyDomain) {
      let osTcDomainUrl = SdkEnvironment.getOneSignalApiUrl(buildEnv);
      osTcDomainUrl.host = [config.subdomain, 'os.tc'].join('.');
      urls.push(osTcDomainUrl);
    }

    for (const url of urls) {
      url.pathname = '';
    }

    return urls;
  }

  /**
   * Returns the URL of the OneSignal proxy iFrame helper.
   */
  static getOneSignalProxyIframeUrls(config: AppConfig): Array<URL> {
    const urls = AltOriginManager.getCanonicalSubscriptionUrls(config);

    for (const url of urls) {
      url.pathname = 'webPushIframe';
    }

    return urls;
  }

  /**
   * Returns the URL of the OneSignal subscription popup.
   */
  static getOneSignalSubscriptionPopupUrls(config: AppConfig): Array<URL> {
    const urls = AltOriginManager.getCanonicalSubscriptionUrls(config);

    for (const url of urls) {
      url.pathname = 'subscribe';
    }

    return urls;
  }
}
