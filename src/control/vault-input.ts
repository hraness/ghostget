import { normalizeOAuthScopes } from "../auth";
import { isXAccountSubject } from "../provider-subject";
import { parseControlRequest } from "./validation";
import type { ControlRequest } from "./protocol";
export type VaultImportRequest = Extract<ControlRequest, { action: "vault.import" }>;

const X_IMPORT_SCOPES = new Set(["tweet.read", "tweet.write", "users.read", "dm.read", "dm.write", "bookmark.write"]);

/** The import metadata is declared by the human; only the exact user subject is proved. */
export function parseVaultImport(value: unknown, now = Date.now()): VaultImportRequest {
  const request = parseControlRequest(value);
  if (request.action !== "vault.import" || !/^[a-z][a-z0-9-]{0,47}$/u.test(request.id)
    || !isXAccountSubject(request.expectedSubject)
    || request.account.trim() !== request.account || /[\u0000-\u001f\u007f]/u.test(request.account)
    || !/^op:\/\/[^/\u0000-\u001f\u007f?#\\]+\/[^/\u0000-\u001f\u007f?#\\]+\/(?:[^/\u0000-\u001f\u007f?#\\]+\/)?[^/\u0000-\u001f\u007f?#\\]+$/u.test(request.reference)
    || /%(?:2f|5c|00|0a|0d)/iu.test(request.reference)) throw new Error("invalid token import");
  const scopes = normalizeOAuthScopes(request.scopes);
  if (!scopes.includes("tweet.read") || !scopes.includes("users.read") || scopes.some(scope => !X_IMPORT_SCOPES.has(scope))) throw new Error("unsupported token scopes");
  if (request.expiresAt !== null && (!Number.isFinite(Date.parse(request.expiresAt)) || new Date(request.expiresAt).toISOString() !== request.expiresAt || Date.parse(request.expiresAt) <= now + 30_000)) throw new Error("invalid declared expiry");
  return { ...request, scopes };
}

