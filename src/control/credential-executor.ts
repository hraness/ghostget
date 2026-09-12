import { canonicalJson, sha256 } from "../canonical-json";
import { pinnedHttpsFetch } from "../pinned-https";
import { GHOSTGET_VERSION } from "../version";
import type { CheckedApproval } from "./protocol";
import type { CredentialGrant, CredentialResult, VaultItem, VaultState } from "./vault-model";
import { VaultStore } from "./vault-store";
import { checkWebRequest, type ControlEnvironment } from "./web-policy";
import { ControlError } from "./validation";
import { readInterfaceJson } from "./interface-json";
import { VAULT_MESSAGES } from "./vault-process";

export function credentialFailure(code: keyof typeof VAULT_MESSAGES): never { throw new ControlError(code, VAULT_MESSAGES[code]!); }
export function checkCredentialGrant(grantId: string, environment: ControlEnvironment, now = Date.now()): { approval: CheckedApproval; state: VaultState; grant: CredentialGrant; item: VaultItem; timeoutMs: number; maxResponseBytes: number } {
  const state = new VaultStore(environment).read();
  const grant = state.grants.find(grant => grant.id === grantId);
  const item = grant && state.items.find(item => item.id === grant.itemId);
  if (!grant || !item) return credentialFailure("VAULT_NOT_FOUND");
  const web = checkWebRequest("GET", grant.use.url, environment);
  const denied = state.locked || Date.parse(grant.expiresAt) <= now || grant.decision === "deny" || web.approval.decision === "deny";
  const decision = denied ? "deny" : grant.decision === "ask" || web.approval.decision === "ask" ? "ask" : "allow";
  const connection = item.source.kind === "1password" ? state.connections.find(connection => item.source.kind === "1password" && connection.id === item.source.connectionId) : null;
  const digest = sha256(canonicalJson({ executor: "ghostget.https-json/1", version: GHOSTGET_VERSION, revision: state.revision, locked: state.locked, grant, item, connection, web: web.approval.digest }));
  return { state, grant, item, timeoutMs: web.timeoutMs, maxResponseBytes: Math.min(web.maxResponseBytes, 262144), approval: { digest, revision: state.revision, decision, kind: "credential", title: grant.title, account: item.title, effect: "Authenticated HTTPS GET", preview: `GET ${grant.use.url}\nCredential: ${item.title} (${item.source.kind === "local" ? "Local vault" : "1Password"})\nAuthentication: ${grant.use.authentication}\nReturned fields: ${grant.use.fields.join(", ")}\nNo redirects, URL substitutions or secret values returned.` } };
}

export type CredentialTransport = (url: URL, init: RequestInit, timeoutMs: number, beforeRequest: () => void) => Promise<Response>;
export interface CredentialExecutorPort {
  resolve(item: VaultItem, state: VaultState, signal: AbortSignal): Promise<string>;
  transport: CredentialTransport;
}
export const credentialTransport: CredentialTransport = (url, init, timeoutMs, beforeRequest) => pinnedHttpsFetch(url, init, timeoutMs, { beforeRequest });

/** Explicit scalar projections reduce disclosure. The authorized server receives the secret. */
export function projectCredentialResponse(body: string, fields: readonly string[], sensitive: readonly string[]): CredentialResult["fields"] {
  const needles = new Set(sensitive.flatMap(value => [value, encodeURIComponent(value), Buffer.from(value).toString("base64"), Buffer.from(value).toString("base64url"), JSON.stringify(value).slice(1, -1)]));
  const exposes = (text: string) => [...needles].some(needle => needle.length > 0 && text.includes(needle));
  if (exposes(body)) return credentialFailure("CREDENTIAL_RESPONSE_BLOCKED");
  let parsed: unknown;
  try { parsed = readInterfaceJson(body, 262144); } catch { return credentialFailure("CREDENTIAL_RESPONSE_BLOCKED"); }
  const result: Record<string, string | number | boolean | null> = Object.create(null);
  for (const pointer of fields) {
    let value = parsed;
    for (const part of pointer.slice(1).split("/")) {
      if (value === null || typeof value !== "object" || Array.isArray(value) || !Object.hasOwn(value, part)) return credentialFailure("CREDENTIAL_RESPONSE_BLOCKED");
      value = (value as Record<string, unknown>)[part];
    }
    if (!(value === null || typeof value === "string" && value.length <= 8192 || typeof value === "boolean" || typeof value === "number" && Number.isFinite(value))) return credentialFailure("CREDENTIAL_RESPONSE_BLOCKED");
    if (exposes(String(value))) return credentialFailure("CREDENTIAL_RESPONSE_BLOCKED");
    result[pointer] = value;
  }
  if (Buffer.byteLength(JSON.stringify(result)) > 65536) return credentialFailure("CREDENTIAL_RESPONSE_BLOCKED");
  return result;
}

/** Called only after the control service admits the exact grant and any human approval. */
export async function executeCredential(grantId: string, expectedDigest: string, id: string, environment: ControlEnvironment, signal: AbortSignal, port: CredentialExecutorPort): Promise<CredentialResult> {
  const checked = checkCredentialGrant(grantId, environment);
  const recheck = () => {
    signal.throwIfAborted();
    const next = checkCredentialGrant(grantId, environment);
    if (next.approval.digest !== expectedDigest) credentialFailure("VAULT_CHANGED");
    if (next.approval.decision === "deny") credentialFailure(next.state.locked ? "VAULT_LOCKED" : "CREDENTIAL_DENIED");
  };
  recheck();
  const secret = await port.resolve(checked.item, checked.state, signal);
  recheck();
  if (secret.length === 0 || Buffer.byteLength(secret) > 16384 || secret.includes("\0") || checked.grant.use.authentication === "bearer" && !/^[A-Za-z0-9._~+\/-]+=*$/u.test(secret)) credentialFailure("VAULT_SECRET_INVALID");
  const pair = `${checked.item.username ?? ""}:${secret}`;
  const authorization = checked.grant.use.authentication === "basic" ? `Basic ${Buffer.from(pair).toString("base64")}` : `Bearer ${secret}`;
  const timerSignal = AbortSignal.timeout(checked.timeoutMs);
  const combined = AbortSignal.any([signal, timerSignal]);
  let response: Response | undefined;
  try {
    response = await port.transport(new URL(checked.grant.use.url), { method: "GET", redirect: "error", credentials: "omit", headers: { Authorization: authorization, Accept: "application/json", "Accept-Encoding": "identity", "User-Agent": "Ghostget-credential-gateway" }, signal: combined }, checked.timeoutMs, recheck);
    recheck(); combined.throwIfAborted();
    if (response.status < 200 || response.status >= 300 || response.headers.get("content-encoding") !== null && response.headers.get("content-encoding") !== "identity" || !/^application\/(?:[a-z0-9.+-]+\+)?json(?:\s*;|$)/iu.test(response.headers.get("content-type") ?? "")) credentialFailure("CREDENTIAL_RESPONSE_BLOCKED");
    const length = response.headers.get("content-length");
    if (length !== null && (!/^\d+$/u.test(length) || Number(length) > checked.maxResponseBytes)) credentialFailure("CREDENTIAL_RESPONSE_BLOCKED");
    const reader = response.body?.getReader(); const chunks: Uint8Array[] = []; let size = 0;
    if (reader) {
      const abort = () => { void reader.cancel().catch(() => undefined); };
      combined.addEventListener("abort", abort, { once: true });
      try { for (;;) { combined.throwIfAborted(); const next = await reader.read(); combined.throwIfAborted(); if (next.done) break; size += next.value.byteLength; if (size > checked.maxResponseBytes) credentialFailure("CREDENTIAL_RESPONSE_BLOCKED"); chunks.push(next.value); } }
      finally { combined.removeEventListener("abort", abort); await reader.cancel().catch(() => undefined); reader.releaseLock(); }
    }
    const body = new TextDecoder("utf-8", { fatal: true }).decode(Buffer.concat(chunks));
    const fields = projectCredentialResponse(body, checked.grant.use.fields, [secret, pair, authorization]);
    recheck(); combined.throwIfAborted();
    return { protocol: "ghostget.credential/1", ok: true, id, grantId, status: response.status, responseBytes: size, fields, trusted: false };
  } catch (error) {
    if (error instanceof ControlError) throw error;
    return credentialFailure("CREDENTIAL_REQUEST_FAILED");
  } finally { await response?.body?.cancel().catch(() => undefined); }
}
