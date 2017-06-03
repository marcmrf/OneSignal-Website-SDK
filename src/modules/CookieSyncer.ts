export default class CookieSyncer {
  static get SYNC_URL() {
    return 'onesignal-cookie-sync';
  }
  static get DOM_ID() {
    return 'onesignal-cookie-sync';
  }

  getElement() {
    return document.getElementById(CookieSyncer.DOM_ID);
  }

  uninstall() {
    if (this.getElement()) {
      this.getElement().remove();
    }
  }

  install() {
    // <img border='0' hspace='0' vspace='0' width='1' height='1' src='https://rc.rlcdn.com/463096.gif?n=5'/>
    this.uninstall();
    const domElement = document.createElement('img');
    domElement.setAttribute('id', CookieSyncer.DOM_ID);
    domElement.setAttribute('border', '0');
    domElement.setAttribute('hspace', '0');
    domElement.setAttribute('vspace', '0');
    domElement.setAttribute('width', '1');
    domElement.setAttribute('height', '1');
    domElement.setAttribute('src', CookieSyncer.SYNC_URL);
    document.querySelector('body').appendChild(domElement);
  }
}
