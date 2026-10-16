import type { AppHostXData, AppHostXRequest } from "./app-host-x-protocol";
/** Bounded product transport. Credentials stay inside GhostGet. */
export const APP_HOST_PROTOCOL = "ghostget.app-host/1" as const;
export const APP_HOST_MAX_FRAME_BYTES = 131_072;
export const APP_HOST_MAX_RESPONSE_BYTES = 2_097_152;
export const APP_HOST_MAX_ACCOUNTS = 32;

export type AppHostRequest =
  | AppHostXRequest
  | { readonly action: "hello" | "accounts.list" | "browsers.list" | "close" }
  | { readonly action: "connection.begin"; readonly browser: "chrome" | "safari"; readonly profile: string | null; readonly id: string | null; readonly expectedRevision: string | null }
  | { readonly action: "connection.verify" | "connection.cancel"; readonly attemptId: string }
  | { readonly action: "connection.commit"; readonly attemptId: string; readonly expectedSubject: string; readonly expectedDigest: string }
  | { readonly action: "connection.disconnect"; readonly id: string; readonly expectedRevision: string; readonly expectedDigest: string };

export type AppHostFrame = {
  readonly protocol: typeof APP_HOST_PROTOCOL;
  readonly id: string;
  readonly request: AppHostRequest;
};
export type AppHostAccount = {
  readonly id: string;
  readonly provider: "x";
  readonly subject: string;
  readonly displayName: string | null;
  readonly browser: "chrome" | "safari";
  readonly profile: string | null;
  readonly revision: string;
  /** This is a stored browser locator, not a live health claim. */
  readonly status: "configured";
  readonly identityVerification: "at-connection";
  readonly disconnectDigest: string;
};
export type AppHostData =
  | AppHostXData
  | { readonly kind: "hello"; readonly version: string; readonly appId: string; readonly capabilities: readonly ["x-browser-connections", "x-workspace-v1"]; readonly nativeConfirmation: "ghostget-dialog" }
  | { readonly kind: "accounts"; readonly accounts: readonly AppHostAccount[] }
  | { readonly kind: "browsers"; readonly browsers: readonly { readonly key: string; readonly label: string; readonly browser: "chrome" | "safari"; readonly profile: string | null }[] }
  | { readonly kind: "connection"; readonly attemptId: string; readonly id: string; readonly status: "awaiting-sign-in" | "verified"; readonly subject: string | null; readonly displayName: string | null; readonly commitDigest: string | null }
  | { readonly kind: "success" };
export type AppHostResponse =
  | { readonly protocol: typeof APP_HOST_PROTOCOL; readonly id: string; readonly ok: true; readonly data: AppHostData }
  | { readonly protocol: typeof APP_HOST_PROTOCOL; readonly id: string; readonly ok: false; readonly code: string; readonly message: string };
