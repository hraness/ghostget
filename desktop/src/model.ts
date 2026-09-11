import type { ActivityPage, ActivityQuery, ActivityRow, ControlData, ControlPanelPort, ControlRequest, ControlSection, ControlSnapshot } from "../../src/control/protocol.ts";

export const initialQuery: ActivityQuery = { search: "", method: "all", outcome: "all", origin: null, since: null, order: "newest", cursor: null, limit: 100 };
export interface ActivityState {
  readonly query: ActivityQuery; readonly rows: readonly ActivityRow[]; readonly nextCursor: string | null;
  readonly snapshotSequence: number | null; readonly matchingCount: number; readonly newerCount: number;
  readonly loading: boolean; readonly loaded: boolean; readonly error: string | null;
}
export interface PanelState {
  readonly section: ControlSection; readonly snapshot: ControlSnapshot | null; readonly accountId: string | null;
  readonly loading: boolean; readonly busy: boolean; readonly cancellingConnection: boolean; readonly error: string | null; readonly notice: string | null;
  readonly output: Extract<ControlData, { kind: "prompt" | "document" }> | null;
  readonly connection: Extract<ControlData, { kind: "connection" }> | null;
  readonly activity: ActivityState;
}
const emptyActivity = (query: ActivityQuery): ActivityState => ({ query, rows: [], nextCursor: null, snapshotSequence: null, matchingCount: 0, newerCount: 0, loading: false, loaded: false, error: null });

/** Owns UI state and generations; adapters own IO. Late replies never cross queries. */
export class PanelModel {
  private state: PanelState;
  private listeners = new Set<() => void>();
  private disposed = false;
  private snapshotGeneration = 0;
  private activityGeneration = 0;
  private activityAbort: AbortController | null = null;
  private snapshotAbort: AbortController | null = null;
  private approvalAbort: AbortController | null = null;
  private requests = new Set<AbortController>();
  private commandAbort: AbortController | null = null;
  private commandGeneration = 0;
  private cancellationInFlight = false;
  private commandAction: ControlRequest["action"] | null = null;
  readonly now: () => number;
  readonly formatTime: (value: string) => string;
  readonly formatCount: (value: number) => string;
  constructor(readonly port: ControlPanelPort, options: { section?: ControlSection; snapshot?: ControlSnapshot; activity?: ActivityPage; now?: () => number; locale?: string; timeZone?: string } = {}) {
    this.now = options.now ?? Date.now;
    const time = new Intl.DateTimeFormat(options.locale, { hour: "2-digit", minute: "2-digit", hour12: false, ...(options.timeZone ? { timeZone: options.timeZone } : {}) });
    const count = new Intl.NumberFormat(options.locale);
    this.formatTime = value => time.format(new Date(value));
    this.formatCount = value => count.format(value);
    this.state = { section: options.section ?? "accounts", snapshot: options.snapshot ?? null, accountId: options.snapshot?.accountId ?? null, loading: false, busy: false, cancellingConnection: false, error: null, notice: null, output: null, connection: null, activity: options.activity ? { ...emptyActivity(initialQuery), ...options.activity, loaded: true } : emptyActivity(initialQuery) };
  }
  getSnapshot = (): PanelState => this.state;
  subscribe = (listener: () => void): (() => void) => { this.listeners.add(listener); return () => this.listeners.delete(listener); };
  private update(patch: Partial<PanelState>): void { if (this.disposed) return; this.state = { ...this.state, ...patch }; for (const listener of this.listeners) listener(); }
  private activity(patch: Partial<ActivityState>): void { this.update({ activity: { ...this.state.activity, ...patch } }); }
  navigate(section: ControlSection): void { this.update({ section, error: null, output: null }); if (section === "activity" && !this.state.activity.loaded && !this.state.activity.loading) void this.loadActivity(false); }
  notice(message: string): void { this.update({ notice: message }); }
  async selectAccount(accountId: string | null): Promise<void> { this.update({ accountId }); await this.refresh(); }
  async refresh(): Promise<void> {
    if (this.disposed) return;
    this.cancelApprovalPoll();
    const generation = ++this.snapshotGeneration;
    this.snapshotAbort?.abort(); const abort = new AbortController(); this.snapshotAbort = abort;
    this.update({ loading: true, error: null });
    try {
      const result = await this.port.request({ action: "snapshot", accountId: this.state.accountId }, abort.signal);
      if (this.disposed || generation !== this.snapshotGeneration) return;
      if (!result.ok) this.update({ error: result.message });
      else if (result.data.kind === "snapshot") this.update({ snapshot: result.data.snapshot, accountId: result.data.snapshot.accountId });
      else this.update({ error: "The control service returned an unexpected response. Refresh to try again." });
    } catch { if (!abort.signal.aborted && generation === this.snapshotGeneration) this.update({ error: "The control service is unavailable. Restart Ghostget and try again." }); }
    finally { if (generation === this.snapshotGeneration) this.update({ loading: false }); }
  }
  private cancelApprovalPoll(): void { this.approvalAbort?.abort(); this.approvalAbort = null; }
  /** Poll only transient approvals; catalog reads and authority checks stay fresh. */
  async refreshApprovals(): Promise<void> {
    const snapshot = this.state.snapshot;
    if (this.disposed || !snapshot || this.state.busy || this.state.loading || this.state.error || this.cancellationInFlight || this.approvalAbort) return;
    const abort = new AbortController(); this.approvalAbort = abort;
    const commandGeneration = this.commandGeneration;
    const current = () => !this.disposed && !abort.signal.aborted && this.approvalAbort === abort && this.state.snapshot === snapshot && this.commandGeneration === commandGeneration;
    try {
      const result = await this.port.request({ action: "approval.list" }, abort.signal);
      if (!current()) return;
      if (!result.ok) this.update({ error: result.message });
      else if (result.data.kind === "approvals") this.update({ snapshot: { ...snapshot, approvals: result.data.approvals } });
      else this.update({ error: "The control service returned an unexpected response. Refresh to try again." });
    } catch { if (current()) this.update({ error: "Pending approvals could not load. Refresh to reconnect." }); }
    finally { if (this.approvalAbort === abort) this.approvalAbort = null; }
  }
  async command(request: ControlRequest): Promise<boolean> {
    if (this.state.busy || this.cancellationInFlight || this.disposed) return false;
    this.cancelApprovalPoll();
    const generation = ++this.commandGeneration; this.commandAction = request.action;
    const abort = new AbortController(); this.requests.add(abort); this.commandAbort = abort; this.update({ busy: true, error: null, notice: null });
    try {
      const result = await this.port.request(request, abort.signal);
      if (this.disposed || generation !== this.commandGeneration) return false;
      if (!result.ok) { this.update({ error: result.message }); return false; }
      const data = result.data;
      if (data.kind === "prompt" || data.kind === "document") this.update({ output: data });
      else if (data.kind === "connection") this.update({ connection: data });
      else {
        this.update({ notice: data.kind === "success" ? data.message : "Changes saved.", ...(request.action === "connection.commit" || request.action === "connection.cancel" ? { connection: null } : {}) });
        await this.refresh();
      }
      return true;
    } catch { if (!abort.signal.aborted) this.update({ error: "The request could not be completed. Refresh before trying again." }); return false; }
    finally { this.requests.delete(abort); if (generation === this.commandGeneration) { this.commandAction = null; this.update({ busy: false }); } }
  }
  async cancelConnection(): Promise<void> {
    const connection = this.state.connection;
    if (!connection || this.disposed || this.cancellationInFlight || this.commandAction === "connection.commit") return;
    this.cancelApprovalPoll();
    this.cancellationInFlight = true; this.update({ cancellingConnection: true });
    const abort = new AbortController(); this.requests.add(abort);
    try {
      const result = await this.port.request({ action: "connection.cancel", attemptId: connection.attemptId }, abort.signal);
      if (!result.ok) this.update({ error: result.message });
      else { ++this.commandGeneration; this.commandAction = null; this.commandAbort?.abort(); this.update({ connection: null, busy: false, notice: "Connection cancelled." }); }
    } catch { this.update({ error: "Cancellation could not be confirmed. Refresh before starting another connection." }); }
    finally { this.requests.delete(abort); this.cancellationInFlight = false; this.update({ cancellingConnection: false }); }
  }
  setQuery(query: Omit<ActivityQuery, "cursor" | "limit">): void {
    this.activityAbort?.abort(); ++this.activityGeneration;
    this.update({ activity: emptyActivity({ ...query, cursor: null, limit: 100 }) }); void this.loadActivity(false);
  }
  refreshActivity(): void { this.setQuery(this.state.activity.query); }
  async loadActivity(append = true): Promise<void> {
    const previous = this.state.activity;
    if (this.disposed || previous.loading || (append && previous.loaded && previous.nextCursor === null)) return;
    const generation = this.activityGeneration; const abort = new AbortController(); this.activityAbort = abort;
    this.activity({ loading: true, error: null });
    try {
      const result = await this.port.request({ action: "activity.query", query: { ...previous.query, cursor: append ? previous.nextCursor : null } }, abort.signal);
      if (this.disposed || generation !== this.activityGeneration || abort.signal.aborted) return;
      if (!result.ok) { this.activity({ error: result.message }); return; }
      if (result.data.kind !== "activity") throw new Error("Wrong response kind");
      const page = result.data.page;
      if (append && previous.snapshotSequence !== null && page.snapshotSequence !== previous.snapshotSequence) throw new Error("Changed activity snapshot");
      const rows = append ? [...previous.rows, ...page.rows] : [...page.rows];
      if (new Set(rows.map(row => row.id)).size !== rows.length || rows.length > 10_000) throw new Error("Invalid activity traversal");
      this.activity({ rows, nextCursor: page.nextCursor, snapshotSequence: page.snapshotSequence, matchingCount: page.matchingCount, newerCount: page.newerCount, loaded: true });
    } catch { if (!abort.signal.aborted && generation === this.activityGeneration) this.activity({ error: "Activity could not load. Retry this page or refresh the results." }); }
    finally { if (generation === this.activityGeneration) this.activity({ loading: false }); }
  }
  dispose(): void { this.disposed = true; ++this.activityGeneration; ++this.snapshotGeneration; this.cancelApprovalPoll(); this.snapshotAbort?.abort(); this.activityAbort?.abort(); for (const request of this.requests) request.abort(); this.requests.clear(); this.listeners.clear(); }
}
