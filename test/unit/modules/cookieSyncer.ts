import "../../support/polyfills/polyfills";
import test from "ava";
import { TestEnvironment, HttpHttpsEnvironment } from "../../support/sdk/TestEnvironment";
import CookieSyncer from '../../../src/modules/CookieSyncer';


test("should add 1 pixel image to webpage", async t => {
  await TestEnvironment.initialize({
    httpOrHttps: HttpHttpsEnvironment.Https
  });
  const cookieSyncer = new CookieSyncer();
  cookieSyncer.install();
  const element = cookieSyncer.getElement();
  t.is(element.tagName.toLowerCase(), 'img');
  t.is(element.getAttribute('border'), '0');
  t.is(element.getAttribute('hspace'), '0');
  t.is(element.getAttribute('vspace'), '0');
  t.is(element.getAttribute('width'), '1');
  t.is(element.getAttribute('height'), '1');
  t.is(element.getAttribute('src'), CookieSyncer.SYNC_URL);
});
