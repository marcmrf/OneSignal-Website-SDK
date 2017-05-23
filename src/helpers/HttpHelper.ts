import Environment from "../Environment";
import * as log from "loglevel";
import Event from "../Event";
import Database from "../services/Database";
import {
  getConsoleStyle,
  timeoutPromise,
  unsubscribeFromPush
} from "../utils";
import * as objectAssign from "object-assign";
import Postmam from "../Postmam";
import MainHelper from "./MainHelper";
import ServiceWorkerHelper from "./ServiceWorkerHelper";
import InitHelper from "./InitHelper";
import EventHelper from "./EventHelper";
import SubscriptionHelper from "./SubscriptionHelper";
import { InvalidStateReason } from "../errors/InvalidStateError";
import TestHelper from './TestHelper';
import SdkEnvironment from '../managers/SdkEnvironment';
import { BuildEnvironmentKind } from "../models/BuildEnvironmentKind";
import { WindowEnvironmentKind } from '../models/WindowEnvironmentKind';
import AltOriginManager from '../managers/AltOriginManager';
import SubscriptionModal from '../modules/SubscriptionModal';
import SubscriptionPopup from "../modules/SubscriptionPopup";
import ProxyFrame from "../modules/ProxyFrame";

declare var OneSignal: any;


export default class HttpHelper {

  static async isShowingHttpPermissionRequest() {
    if (SubscriptionHelper.isUsingSubscriptionWorkaround()) {
      return await new Promise((resolve, reject) => {
        OneSignal.proxyFrame.message(OneSignal.POSTMAM_COMMANDS.IS_SHOWING_HTTP_PERMISSION_REQUEST, null, reply => {
          resolve(reply.data);
        });
      });
    } else {
      return OneSignal._showingHttpPermissionRequest;
    }
  }

  // Http only - Only called from iframe's init.js
  static initHttp(options) {
    log.debug(`Called %cinitHttp(${JSON.stringify(options, null, 4)})`, getConsoleStyle('code'));

    switch (SdkEnvironment.getWindowEnv()) {
      case WindowEnvironmentKind.OneSignalProxyFrame:
        OneSignal.proxyFrame = new ProxyFrame(options);
        OneSignal.proxyFrame.initialize();
        break;
      case WindowEnvironmentKind.OneSignalSubscriptionPopup:
        OneSignal.subscriptionPopup = new SubscriptionPopup(options);
        OneSignal.subscriptionPopup.initialize();
        break;
      case WindowEnvironmentKind.OneSignalSubscriptionModal:
        OneSignal.subscriptionModal = new SubscriptionModal(options);
        OneSignal.subscriptionModal.initialize();
        break;
    }
  }
}
