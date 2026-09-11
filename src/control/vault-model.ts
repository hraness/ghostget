/** Metadata only. Secret values never belong to this browser-safe contract. */
/** 120 seconds for approval plus the bounded 125-second executor and cleanup. */
export const CREDENTIAL_REQUEST_TIMEOUT_MS = 260_000;
export type VaultItemKind = "password" | "token";
export type VaultSource =
  | { readonly kind: "local"; readonly keyId: string }
  | { readonly kind: "1password"; readonly connectionId: string; readonly vaultId: string; readonly itemId: string; readonly fieldId: string };

export interface VaultItem {
  readonly id: string;
  readonly title: string;
  readonly kind: VaultItemKind;
  readonly username: string | null;
  readonly source: VaultSource;
  readonly createdAt: string;
}

export interface VaultConnection {
  readonly id: string;
  readonly title: string;
  readonly vaultId: string;
  readonly keyId: string;
  /** User assertion; SDK vault enumeration does not prove every token permission. */
  readonly access: "dedicated-vault-read-only";
  readonly createdAt: string;
}

export interface CredentialGrant {
  readonly id: string;
  readonly title: string;
  readonly itemId: string;
  readonly decision: "deny" | "ask" | "allow";
  readonly expiresAt: string;
  /** Reviewed retrieval only; arbitrary form submission requires another executor. */
  readonly use: {
    readonly kind: "https-json";
    readonly url: string;
    readonly authentication: "basic" | "bearer";
    /** Exact JSON pointers chosen by the human. No entire response export. */
    readonly fields: readonly string[];
  };
}

export interface VaultState {
  readonly schema: 1;
  readonly revision: number;
  readonly locked: boolean;
  readonly connections: readonly VaultConnection[];
  readonly items: readonly VaultItem[];
  readonly grants: readonly CredentialGrant[];
  /** Owned secret writes/deletions that have no active authority. */
  readonly pending: readonly { readonly id: string; readonly purpose: "credential" | "1password-bootstrap"; readonly operation: "create" | "delete"; readonly owner: { readonly pid: number; readonly bootId: string; readonly processStartId: string } }[];
}

export interface VaultView extends Omit<VaultState, "pending"> {
  readonly pending: readonly { readonly id: string; readonly purpose: "credential" | "1password-bootstrap" }[];
  readonly available: boolean;
  readonly storage: "macos-keychain" | "unavailable";
}

export type VaultControlRequest =
  | { readonly action: "vault.lock"; readonly locked: boolean; readonly expectedRevision: number }
  | { readonly action: "vault.local.add"; readonly title: string; readonly kind: VaultItemKind; readonly username: string | null; readonly expectedRevision: number }
  | { readonly action: "vault.connect"; readonly title: string; readonly vaultId: string; readonly access: "dedicated-vault-read-only"; readonly expectedRevision: number }
  | { readonly action: "vault.link"; readonly title: string; readonly kind: VaultItemKind; readonly username: string | null; readonly connectionId: string; readonly itemId: string; readonly fieldId: string; readonly expectedRevision: number }
  | { readonly action: "vault.remove"; readonly id: string; readonly kind: "item" | "connection"; readonly expectedRevision: number }
  | { readonly action: "vault.grant"; readonly grant: CredentialGrant; readonly expectedRevision: number }
  | { readonly action: "vault.revoke"; readonly id: string; readonly expectedRevision: number }
  | { readonly action: "vault.cleanup"; readonly expectedRevision: number };

export interface CredentialResult {
  readonly protocol: "ghostget.credential/1";
  readonly ok: true;
  readonly id: string;
  readonly grantId: string;
  readonly status: number;
  /** Bytes received from the endpoint, before selecting output fields. */
  readonly responseBytes: number;
  readonly fields: Readonly<Record<string, string | number | boolean | null>>;
  readonly trusted: false;
}
