import { randomUUID } from "node:crypto";
import { GHOSTGET_VERSION } from "../version";
import { ControlError } from "./validation";
import { parseAgentSetupRequest, setupRequestId, type AgentSetupResponse, type SetupRequestView, type SetupServiceId } from "./setup-model";

/** App-generation-local suggestions only. No auth, policy, scanning or browser IO. */
export class SetupRequests {
  private readonly pending = new Map<string, { readonly view: SetupRequestView; readonly deadline: number }>();
  private readonly dismissed = new Map<string, number>();
  private closed = false;
  constructor(private readonly now: () => number = () => performance.now(), private readonly wallNow: () => number = Date.now, private readonly uuid: () => string = randomUUID) {}
  private sweep(): void { const now = this.now(); for (const [id, value] of this.pending) if (now >= value.deadline) this.pending.delete(id); for (const [id, deadline] of this.dismissed) if (now >= deadline) this.dismissed.delete(id); }
  list(): readonly SetupRequestView[] { this.sweep(); return [...this.pending.values()].map(item => ({ ...item.view })); }
  private create(serviceId: SetupServiceId): string {
    if (this.closed) throw new ControlError("SETUP_CLOSED", "Reopen Ghostget before requesting setup.");
    this.sweep(); const existing = [...this.pending.values()].find(item => item.view.serviceId === serviceId); if (existing) return existing.view.id;
    if (this.pending.size >= 8 || this.dismissed.size >= 64) throw new ControlError("SETUP_LIMIT", "Finish the current setup requests before adding another.");
    const id = setupRequestId(this.uuid()); if (this.pending.has(id) || this.dismissed.has(id)) throw new ControlError("SETUP_UNAVAILABLE", "A setup request could not be created safely.");
    const wall = this.wallNow(); const view = { id, serviceId, requestedAt: new Date(wall).toISOString(), expiresAt: new Date(wall + 600_000).toISOString() };
    this.pending.set(id, { view, deadline: this.now() + 600_000 }); return id;
  }
  dismiss(rawId: string): void {
    const id = setupRequestId(rawId); this.sweep(); if (this.closed) throw new ControlError("SETUP_CLOSED", "The setup session is closed.");
    if (this.dismissed.has(id)) return;
    const current = this.pending.get(id); if (!current) throw new ControlError("SETUP_EXPIRED", "This setup request expired or belongs to an earlier app session.");
    this.pending.delete(id); this.dismissed.set(id, current.deadline);
  }
  handle(value: unknown, configuredAccountCount: number): AgentSetupResponse {
    if (this.closed) throw new ControlError("SETUP_CLOSED", "Reopen Ghostget before requesting setup.");
    const request = parseAgentSetupRequest(value); let requestId: string | null = null;
    if (request.action === "request") requestId = this.create(request.serviceId);
    else if (request.action === "cancel") this.dismiss(request.requestId);
    return { protocol: "ghostget.setup/1", ok: true, version: GHOSTGET_VERSION, configuredAccountCount, setupRequests: this.list(), requestId };
  }
  close(): void { this.closed = true; this.pending.clear(); this.dismissed.clear(); }
}
