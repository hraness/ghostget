import { randomUUID } from "node:crypto";
import type { ActivityStore } from "./activity";
import type { ApprovalBroker } from "./approval-broker";
import { checkCredentialGrant, credentialFailure } from "./credential-executor";
import { runVaultHelper } from "./vault-process";
import type { CredentialResult } from "./vault-model";
import { ControlError, integer, keys, record } from "./validation";
import type { ControlEnvironment } from "./web-policy";

export function parseCredentialResult(value: unknown, id: string, grantId: string, fields: readonly string[]): CredentialResult {
  const v = record(value); keys(v, ["protocol", "ok", "id", "grantId", "status", "responseBytes", "fields", "trusted"]);
  if (v.protocol !== "ghostget.credential/1" || v.ok !== true || v.id !== id || v.grantId !== grantId || v.trusted !== false) throw new Error("Invalid credential result");
  const output = record(v.fields); keys(output, fields);
  for (const value of Object.values(output)) if (!(value === null || typeof value === "string" && value.length <= 8192 || typeof value === "boolean" || typeof value === "number" && Number.isFinite(value))) throw new Error("Invalid credential result");
  if (Buffer.byteLength(JSON.stringify(output)) > 65536) throw new Error("Invalid credential result");
  return { protocol: "ghostget.credential/1", ok: true, id, grantId, status: integer(v.status, 200, 299), responseBytes: integer(v.responseBytes, 0, 262144), fields: output as CredentialResult["fields"], trusted: false };
}

export class CredentialGateway {
  private readonly active = new Set<AbortController>();
  private paused = 0;
  constructor(private readonly activity: ActivityStore, private readonly approvals: ApprovalBroker, private readonly environment: ControlEnvironment, private readonly execute = runVaultHelper) {}
  cancel(): void { for (const controller of this.active) controller.abort(); }
  pause(): void { this.paused++; this.cancel(); }
  resume(): void { this.paused = Math.max(0, this.paused - 1); }
  async run(grantId: string, signal: AbortSignal): Promise<CredentialResult> {
    if (this.paused) throw new ControlError("CREDENTIAL_BUSY", "Vault changes are in progress. Wait for them to finish.");
    if (this.active.size >= 4) throw new ControlError("CREDENTIAL_BUSY", "Four credential operations are already active.");
    const checked = checkCredentialGrant(grantId, this.environment);
    const id = randomUUID(); const controller = new AbortController(); this.active.add(controller);
    const combined = AbortSignal.any([signal, controller.signal]);
    let started = false; let finished = false; let status: number | null = null;
    const recheck = () => {
      combined.throwIfAborted(); const next = checkCredentialGrant(grantId, this.environment);
      if (next.approval.digest !== checked.approval.digest) credentialFailure("VAULT_CHANGED");
      if (next.approval.decision === "deny") credentialFailure(next.state.locked ? "VAULT_LOCKED" : "CREDENTIAL_DENIED");
    };
    try {
      const url = new URL(checked.grant.use.url);
      this.activity.start({ id, method: "GET", origin: url.origin, ruleId: `credential:${grantId}`, endpoint: url.pathname, decision: checked.approval.decision }); started = true;
      recheck();
      if (checked.approval.decision === "ask") {
        let approval = await this.approvals.request(id, { kind: "credential", grantId }, checked.approval.digest);
        while (approval.status === "pending") { combined.throwIfAborted(); await new Promise<void>(resolve => setTimeout(resolve, 200)); approval = await this.approvals.check(id, checked.approval.digest); }
        if (approval.status !== "allowed") credentialFailure("CREDENTIAL_DENIED");
      }
      recheck();
      const value = await this.execute({ action: "use", grantId, digest: checked.approval.digest, id }, this.environment, combined);
      const result = parseCredentialResult(value, id, grantId, checked.grant.use.fields); status = result.status;
      recheck();
      if (checked.approval.decision === "ask" && (await this.approvals.check(id, checked.approval.digest)).status !== "allowed") credentialFailure("CREDENTIAL_DENIED");
      this.activity.finish(id, { outcome: "succeeded", httpStatus: status, responseBytes: result.responseBytes, errorCode: null }); finished = true;
      return result;
    } catch (error) {
      const code = combined.aborted ? "REQUEST_CANCELLED" : error instanceof ControlError ? error.code : "CREDENTIAL_REQUEST_FAILED";
      if (started && !finished) {
        try { this.activity.finish(id, { outcome: combined.aborted ? "cancelled" : ["CREDENTIAL_DENIED", "VAULT_LOCKED"].includes(code) ? "denied" : "failed", httpStatus: status, responseBytes: 0, errorCode: code }); }
        catch { throw new ControlError("ACTIVITY_COMMIT_FAILED", "The request may have reached the server, but its history could not be committed. No result was returned. Do not retry automatically."); }
      }
      if (error instanceof ControlError && !combined.aborted) throw error;
      throw new ControlError(code, combined.aborted ? "Credential use was cancelled. An already sent request cannot be undone." : "Credential use failed. Do not retry automatically.");
    } finally { this.approvals.cancel(id, checked.approval.digest); this.active.delete(controller); }
  }
}
