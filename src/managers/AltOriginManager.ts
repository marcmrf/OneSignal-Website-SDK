import SubscriptionHelper from '../helpers/SubscriptionHelper';
export default class AltOriginManager {

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
}
