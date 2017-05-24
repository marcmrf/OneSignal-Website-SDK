import OneSignalError from "./OneSignalError";


export enum SdkInitErrorKind {
  AppNotConfiguredForWebPush,
}

export class SdkInitError extends OneSignalError {
  reason: string;

  constructor(reason: SdkInitErrorKind) {
    switch (reason) {
      case SdkInitErrorKind.AppNotConfiguredForWebPush:
        super('This app is not configured for web push.');
        break;
    }
    this.reason = SdkInitErrorKind[reason];
  }
}
