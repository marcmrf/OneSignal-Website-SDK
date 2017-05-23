import "../../support/polyfills/polyfills";
import test from "ava";
import { TestEnvironment } from "../../support/sdk/TestEnvironment";
import AltOriginManager from '../../../src/managers/AltOriginManager';
import { AppConfig } from '../../../src/models/AppConfig';
import { BuildEnvironmentKind } from '../../../src/models/BuildEnvironmentKind';


test(`should get correct canonical subscription URL`, async t => {
  const config = new AppConfig();
  config.subdomain = 'test';
  config.useLegacyDomain = true;

  const devUrls = AltOriginManager.getCanonicalSubscriptionUrls(config, BuildEnvironmentKind.Development);
  t.is(devUrls.length, 1);
  t.is(devUrls[0].host, new URL('https://test.localhost:3001').host);

  const stagingUrls = AltOriginManager.getCanonicalSubscriptionUrls(config, BuildEnvironmentKind.Staging);
  t.is(stagingUrls.length, 1);
  t.is(stagingUrls[0].host, new URL('https://test.onesignal-staging.pw').host);

  const prodUrls = AltOriginManager.getCanonicalSubscriptionUrls(config, BuildEnvironmentKind.Production);
  t.is(prodUrls.length, 1);
  t.is(prodUrls[0].host, new URL('https://test.onesignal.com').host);

  config.useLegacyDomain = false;

  const devUrlsOsTcDomain = AltOriginManager.getCanonicalSubscriptionUrls(config, BuildEnvironmentKind.Development);
  t.is(devUrlsOsTcDomain.length, 2);
  t.is(devUrlsOsTcDomain[0].host, new URL('https://test.localhost:3001').host);
  t.is(devUrlsOsTcDomain[1].host, new URL('https://test.os.tc:3001').host);

  const stagingUrlsOsTcDomain = AltOriginManager.getCanonicalSubscriptionUrls(config, BuildEnvironmentKind.Staging);
  t.is(stagingUrlsOsTcDomain.length, 2);
  t.is(stagingUrlsOsTcDomain[0].host, new URL('https://test.onesignal-staging.pw').host);
  t.is(stagingUrlsOsTcDomain[1].host, new URL('https://test.os.tc').host);

  const prodUrlsOsTcDomain = AltOriginManager.getCanonicalSubscriptionUrls(config, BuildEnvironmentKind.Production);
  t.is(prodUrlsOsTcDomain.length, 2);
  t.is(prodUrlsOsTcDomain[0].host, new URL('https://test.onesignal.com').host);
  t.is(prodUrlsOsTcDomain[1].host, new URL('https://test.os.tc').host);
});
