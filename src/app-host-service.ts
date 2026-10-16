import { randomUUID } from "node:crypto";
import { listAuthSnapshots } from "./auth";
import { canonicalJson, sha256 } from "./canonical-json";
import { authIncarnationReader } from "./read-projections";
import { createProviderPluginRegistry } from "./provider-plugin-registry";
import xPlugin from "./plugins/x-web/plugin";
import { version } from "../package.json";
import { APP_HOST_MAX_ACCOUNTS, type AppHostAccount, type AppHostData, type AppHostRequest } from "./app-host-protocol";
import { AppHostXService } from "./app-host-x-service";
import { upgradeAppHostXAdapter } from "./app-host-adapter";
import type { AppHostXRequest } from "./app-host-x-protocol";
import { confirmAppHostDecision, type AppHostDecision } from "./app-host-confirmation";
import { connectionAccountSnapshotRevisions, ensureConnectionAccountIncarnations } from "./control/account-revision";
import { browserChoices } from "./control/browser-choices";
import { Connections } from "./control/connections";
import { ControlError } from "./control/validation";
import type { ControlEnvironment } from "./control/web-policy";

// This host admits only X account connections; other product providers stay lazy.
const providerPluginRegistry = createProviderPluginRegistry([xPlugin]);

type Begin = Extract<AppHostRequest, { action: "connection.begin" }>;
type Attempt = {
  readonly id: string;
  readonly request: Begin;
  readonly expiresAt: number;
  readonly controller: AbortController;
  proof: { readonly digest: string; readonly subject: string; readonly displayName: string | null } | null;
};
type ServiceOptions = {
  readonly connections?: Connections;
  readonly confirm?: (decision: AppHostDecision, signal: AbortSignal) => Promise<boolean>;
  readonly now?: () => number;
  readonly confirmX?: (review: string, signal: AbortSignal) => Promise<boolean>;
};

/** Internal implementation. Native clients use the subprocess wire only. */
export class AppHostService {
  private readonly connections: Connections;
  private readonly confirm: NonNullable<ServiceOptions["confirm"]>;
  private readonly now: () => number;
  private readonly attempts = new Map<string, Attempt>();
  private readonly disconnectProofs = new Map<string, string>();
  private readonly decisions = new Set<AbortController>();
  private busy = false;
  private closed = false;
  private readonly x: AppHostXService;

  constructor(readonly appId: string, private readonly environment: ControlEnvironment, options: ServiceOptions = {}) {
    this.connections = options.connections ?? new Connections(environment, () => providerPluginRegistry);
    this.confirm = options.confirm ?? confirmAppHostDecision;
    this.now = options.now ?? Date.now;
    upgradeAppHostXAdapter(environment, providerPluginRegistry);
    ensureConnectionAccountIncarnations(environment);
    this.x = new AppHostXService(environment, providerPluginRegistry, (id, revision) => this.account(id, revision), options.confirmX, this.now);
  }

  private accounts(): AppHostAccount[] {
    const snapshots = listAuthSnapshots(this.environment);
    if (snapshots.length > APP_HOST_MAX_ACCOUNTS) throw new ControlError("ACCOUNT_LIMIT", "This app has too many saved accounts.");
    const revisions = connectionAccountSnapshotRevisions(snapshots, authIncarnationReader(this.environment));
    return snapshots.flatMap(({ auth }) => {
      if (auth.kind !== "cookie-source" || auth.provider !== "x" || auth.subject === undefined || !/^[0-9]{1,19}$/u.test(auth.subject)
        || (auth.source !== "chrome" && auth.source !== "safari")) return [];
      return [{ id: auth.id, provider: "x" as const, subject: auth.subject, displayName: auth.displayName ?? null,
        browser: auth.source, profile: auth.profile ?? null, revision: revisions.get(auth.id)!, status: "configured" as const,
        identityVerification: "at-connection" as const, disconnectDigest: "" }];
    });
  }

  private account(id: string, revision: string): AppHostAccount {
    const account = this.accounts().find(value => value.id === id && value.revision === revision);
    if (account === undefined) throw new ControlError("ACCOUNT_CHANGED", "The account changed. Refresh the account list.");
    return account;
  }

  private checkUnique(id: string, request: Begin, subject?: string): void {
    for (const account of this.accounts()) {
      if (account.id === id) continue;
      if (subject !== undefined && account.subject === subject) throw new ControlError("ACCOUNT_ALREADY_CONNECTED", "This X account is already connected.");
      if (account.browser === request.browser && account.profile === request.profile) {
        throw new ControlError("PROFILE_ALREADY_CONNECTED", "This browser profile is already connected. Use a separate Chrome profile for another X account.");
      }
    }
  }

  private attempt(id: string): Attempt {
    const attempt = this.attempts.get(id);
    if (attempt === undefined || this.now() >= attempt.expiresAt || attempt.controller.signal.aborted) {
      this.cancel(id);
      throw new ControlError("CONNECTION_EXPIRED", "This connection attempt expired or was cancelled. Start again.");
    }
    return attempt;
  }

  private cancel(id: string): void {
    this.attempts.get(id)?.controller.abort();
    this.attempts.delete(id);
    this.connections.cancel(id);
  }

  async handle(request: AppHostRequest): Promise<AppHostData> {
    if (this.closed) throw new ControlError("HOST_CLOSED", "The app host has closed.");
    if (request.action.startsWith("x.")) return this.x.handle(request as AppHostXRequest);
    if (request.action === "close") { this.close(); return { kind: "success" }; }
    if (request.action === "connection.cancel") { this.cancel(request.attemptId); return { kind: "success" }; }
    if (request.action === "hello") return { kind: "hello", version, appId: this.appId, capabilities: ["x-browser-connections", "x-workspace-v1"], nativeConfirmation: "ghostget-dialog" };
    if (request.action === "browsers.list") return { kind: "browsers", browsers: browserChoices(this.environment) };
    if (request.action === "accounts.list") {
      const accounts = this.accounts().map(account => {
        const disconnectDigest = sha256(canonicalJson({ appId: this.appId, action: "disconnect", account, nonce: randomUUID() }));
        this.disconnectProofs.set(account.id, disconnectDigest);
        return { ...account, disconnectDigest };
      });
      for (const id of this.disconnectProofs.keys()) if (!accounts.some(account => account.id === id)) this.disconnectProofs.delete(id);
      return { kind: "accounts", accounts };
    }
    if (this.busy) throw new ControlError("HOST_BUSY", "Finish or cancel the active connection operation first.");
    this.busy = true;
    try { return await this.mutate(request); } finally { this.busy = false; }
  }

  private async mutate(request: AppHostRequest): Promise<AppHostData> {
    if (request.action === "connection.begin") {
      for (const [id, attempt] of this.attempts) if (this.now() >= attempt.expiresAt) this.cancel(id);
      if (request.id !== null) this.account(request.id, request.expectedRevision!);
      else if (listAuthSnapshots(this.environment).length >= APP_HOST_MAX_ACCOUNTS) throw new ControlError("ACCOUNT_LIMIT", "Disconnect an account before adding another.");
      const id = request.id ?? `x-${randomUUID()}`;
      this.checkUnique(id, request);
      const result = await this.connections.begin({ ...request, id, provider: "x-web" });
      if (result.kind !== "connection") throw new Error("Unexpected connection response");
      if (this.closed) { this.connections.cancel(result.attemptId); throw new ControlError("HOST_CLOSED", "The app host has closed."); }
      this.attempts.set(result.attemptId, { id, request, expiresAt: this.now() + 600_000, controller: new AbortController(), proof: null });
      return { kind: "connection", attemptId: result.attemptId, id, status: "awaiting-sign-in", subject: null, displayName: null, commitDigest: null };
    }
    if (request.action === "connection.verify") {
      const attempt = this.attempt(request.attemptId);
      attempt.proof = null;
      const result = await this.connections.verify(request.attemptId);
      this.attempt(request.attemptId);
      if (result.kind !== "connection" || result.subject === null || !/^[0-9]{1,19}$/u.test(result.subject)) throw new ControlError("IDENTITY_UNAVAILABLE", "The X account identity could not be verified.");
      this.checkUnique(attempt.id, attempt.request, result.subject);
      const digest = sha256(canonicalJson({ appId: this.appId, action: "connect", id: attempt.id, request: attempt.request,
        subject: result.subject, displayName: result.displayName, attemptId: request.attemptId, nonce: randomUUID() }));
      attempt.proof = { digest, subject: result.subject, displayName: result.displayName };
      return { kind: "connection", attemptId: request.attemptId, id: attempt.id, status: "verified", subject: result.subject, displayName: result.displayName, commitDigest: digest };
    }
    if (request.action === "connection.commit") {
      const attempt = this.attempt(request.attemptId);
      const proof = attempt.proof;
      attempt.proof = null; // Each rendered decision is one use, including denial.
      if (proof === null || proof.digest !== request.expectedDigest || proof.subject !== request.expectedSubject) {
        throw new ControlError("DECISION_CHANGED", "Verify the account again before confirming it.");
      }
      const approved = await this.confirm({ action: "connect", appId: this.appId, id: attempt.id, subject: proof.subject,
        displayName: proof.displayName, browser: attempt.request.browser, profile: attempt.request.profile }, attempt.controller.signal);
      this.attempt(request.attemptId);
      if (!approved) throw new ControlError("DECISION_DENIED", "The connection was not confirmed. Verify again to retry.");
      // Recheck the real viewer after human review; a switched browser account
      // must never inherit the earlier confirmation.
      const current = await this.connections.verify(request.attemptId);
      this.attempt(request.attemptId);
      if (current.kind !== "connection" || current.subject !== proof.subject) throw new ControlError("ACCOUNT_CHANGED", "The signed-in X account changed during confirmation. Verify again.");
      this.checkUnique(attempt.id, attempt.request, proof.subject);
      this.connections.commit(request.attemptId, proof.subject);
      this.attempts.delete(request.attemptId);
      return { kind: "success" };
    }
    if (request.action === "connection.disconnect") {
      const expected = this.disconnectProofs.get(request.id);
      this.disconnectProofs.delete(request.id);
      if (expected === undefined || expected !== request.expectedDigest) throw new ControlError("DECISION_CHANGED", "Refresh the account list before disconnecting.");
      const account = this.account(request.id, request.expectedRevision);
      const controller = new AbortController();
      this.decisions.add(controller);
      try {
        const approved = await this.confirm({ ...account, action: "disconnect", appId: this.appId }, controller.signal);
        if (controller.signal.aborted || this.closed || !approved) throw new ControlError("DECISION_DENIED", "The disconnection was not confirmed.");
        this.connections.disconnect(request.id, request.expectedRevision);
        return { kind: "success" };
      } finally { this.decisions.delete(controller); }
    }
    throw new ControlError("INVALID_REQUEST", "The request is invalid.");
  }

  close(): void {
    this.closed = true;
    this.x.close();
    for (const id of this.attempts.keys()) this.cancel(id);
    for (const decision of this.decisions) decision.abort();
    this.disconnectProofs.clear();
    this.connections.close();
  }
}
