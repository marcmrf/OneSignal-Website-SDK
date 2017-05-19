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

  t.is(AltOriginManager.getCanonicalSubscriptionUrl(config, BuildEnvironmentKind.Development).host, new URL('https://test.localhost:3001').host);
  t.is(AltOriginManager.getCanonicalSubscriptionUrl(config, BuildEnvironmentKind.Staging).host, new URL('https://test.onesignal-staging.pw').host);
  t.is(AltOriginManager.getCanonicalSubscriptionUrl(config, BuildEnvironmentKind.Production).host, new URL('https://test.onesignal.com').host);

  config.useLegacyDomain = false;

  // First two identical
  t.is(AltOriginManager.getCanonicalSubscriptionUrl(config, BuildEnvironmentKind.Development).host, new URL('https://test.localhost:3001').host);
  t.is(AltOriginManager.getCanonicalSubscriptionUrl(config, BuildEnvironmentKind.Staging).host, new URL('https://test.onesignal-staging.pw').host);

  // Use new os.tc
  t.is(AltOriginManager.getCanonicalSubscriptionUrl(config, BuildEnvironmentKind.Production).host, new URL('https://test.os.tc').host);
});
