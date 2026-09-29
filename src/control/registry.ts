import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { defineRegistry, HranessError, runCli, type CliIO, type ParsedArgs, type Registry, type Verb } from "@hraness/desktop-foundation/registry";
import { installLoginItem, uninstallLoginItem } from "@hraness/desktop-foundation/login";
import { canonicalJson, sha256 } from "../canonical-json";
import { probeSafariAccess } from "../cookie-access";
import { ghostgetStateHome } from "../storage";
import { ADMIN_STOP, adminClient, adminOwnerRunning, adminRequest } from "./admin-socket";
import { browserChoices } from "./browser-choices";
import { spawnHelper, type HelperClient } from "./helper-client";
import { readOutputs } from "./outputs";
import type { ActivityQuery, ApprovalView, ControlData, ControlRequest, ControlResponse, ControlSnapshot, WebRule } from "./protocol";
import { buildStatus, renderStatus, STATUS_SCHEMA, type GhostgetStatus } from "./status-view";
import { parseControlRequest } from "./validation";
import type { ControlEnvironment } from "./web-policy";

/**
 * Every administrative `ControlRequest` action is one verb here, and every
 * former menu-bar item maps to one of these or an existing Ghostget command
 * (docs/cli-parity.md, checked by registry.test.ts). Verbs are clients: the
 * control owner (`ghostget control serve`, or an open TUI) stays the
 * authority for every admission decision.
 */
export const PRODUCT = "ghostget";
export const LOGIN_ITEM_LABEL = "app.hraness.ghostget.control";
const SNAPSHOT_TIMEOUT_MS = 90_000;
const VERIFY_TIMEOUT_MS = 70_000;
const REQUEST_TIMEOUT_MS = 15_000;

/** How verbs reach an owner; tests replace it. */
export interface ControlPorts {
  readonly environment: ControlEnvironment;
  /** The running owner's admin client, or null when none answers. */
  owner(): Promise<HelperClient | null>;
  /** A private helper for one command when no owner runs. */
  transient(): HelperClient;
  /** Start a detached `ghostget control serve` and wait until it answers. */
  startOwner(): Promise<HelperClient>;
  readonly platform: NodeJS.Platform;
  readonly now: () => number;
}

function cliScript(): string { return fileURLToPath(new URL("../cli.ts", import.meta.url)); }

export function defaultPorts(environment: ControlEnvironment): ControlPorts {
  return {
    environment,
    owner: async () => (await adminOwnerRunning(environment) ? adminClient(environment) : null),
    transient: () => spawnHelper(environment),
    startOwner: async () => {
      if (await adminOwnerRunning(environment)) return adminClient(environment);
      const env: Record<string, string> = {};
      for (const [key, value] of Object.entries(environment)) if (value !== undefined) env[key] = value;
      const child = spawn(process.execPath, ["--no-env-file", cliScript(), "control", "serve"], { detached: true, stdio: "ignore", env });
      child.unref();
      const deadline = Date.now() + 20_000;
      while (Date.now() < deadline) {
        if (await adminOwnerRunning(environment)) return adminClient(environment);
        if (child.exitCode !== null) break;
        await new Promise((resolve) => setTimeout(resolve, 150));
      }
      throw new HranessError("owner-unavailable", "Ghostget could not start its control owner.", undefined, [{ command: "ghostget control serve", why: "Run the owner in the foreground to see why it stops", audience: "human" }]);
    },
    platform: process.platform,
    now: () => Date.now(),
  };
}

/** Map a Ghostget control failure to a shared or `ghostget.*` error code. */
export function controlError(response: Extract<ControlResponse, { readonly ok: false }>): HranessError {
  const code = response.code;
  const shared: Readonly<Record<string, ConstructorParameters<typeof HranessError>[0]>> = {
    CONTROL_OWNER_UNAVAILABLE: "owner-unavailable",
    CONTROL_DISCONNECTED: "owner-unavailable",
    CONTROL_CLOSED: "owner-unavailable",
    CONTROL_ALREADY_RUNNING: "control-already-running",
    REVISION_CONFLICT: "conflict",
    STALE_REVISION: "conflict",
    ACCOUNT_CHANGED: "conflict",
    APPROVAL_DIGEST_MISMATCH: "digest-mismatch",
    APPROVAL_UNAVAILABLE: "not-found",
    ACCOUNT_UNAVAILABLE: "not-found",
  };
  const mapped = shared[code] ?? `ghostget.${code.toLowerCase().replaceAll("_", "-")}`;
  const next = mapped === "owner-unavailable" ? [{ command: "ghostget control serve", why: "Start the control owner", audience: "human" as const }] : [];
  return new HranessError(mapped as ConstructorParameters<typeof HranessError>[0], response.message, undefined, next);
}

async function ask(client: HelperClient, request: ControlRequest, timeoutMs: number = REQUEST_TIMEOUT_MS): Promise<ControlData> {
  const response = await client.request(request, timeoutMs);
  if (!response.ok) throw controlError(response);
  return response.data;
}

/** Run with the owner when one answers, else a transient helper closed afterwards. */
async function withControl<T>(ports: ControlPorts, needsOwner: boolean, run: (client: HelperClient) => Promise<T>): Promise<T> {
  const owner = await ports.owner();
  if (owner !== null) return await run(owner);
  if (needsOwner) throw new HranessError("owner-unavailable", "This needs a running Ghostget control owner.", undefined, [{ command: "ghostget control serve", why: "Start the control owner, then retry", audience: "human" }]);
  const client = ports.transient();
  try { return await run(client); } finally { await client.close(); }
}

async function fetchSnapshot(client: HelperClient, accountId: string | null): Promise<ControlSnapshot> {
  const data = await ask(client, { action: "snapshot", accountId }, SNAPSHOT_TIMEOUT_MS);
  if (data.kind !== "snapshot") throw new HranessError("internal", "The owner answered with the wrong data.");
  return data.snapshot;
}

/** The one-screen status shared by `status`, `tui --snapshot` and `tui --json`. */
export async function readStatus(ports: ControlPorts, accountId: string | null): Promise<GhostgetStatus> {
  let snapshot: ControlSnapshot | null = null;
  let actionError: string | null = null;
  try { snapshot = await withControl(ports, false, (client) => fetchSnapshot(client, accountId)); }
  catch (error) {
    if (!(error instanceof HranessError)) throw error;
    if (error.code !== "control-already-running" && error.code !== "owner-unavailable") throw error;
    actionError = error.code === "control-already-running" ? "CONTROL_ALREADY_RUNNING" : "CONTROL_DISCONNECTED";
  }
  return buildStatus({
    snapshot, actionError, fresh: snapshot !== null, confirmedAgeSeconds: snapshot === null ? null : 0,
    outputs: readOutputs(join(ghostgetStateHome(ports.environment), "outputs")),
    platform: ports.platform,
    browsers: browserChoices(ports.environment),
    safari: ports.platform === "darwin" ? probeSafariAccess() : "ok",
  });
}

const str = (args: ParsedArgs, name: string): string | undefined => { const value = args.flags[name]; return typeof value === "string" ? value : undefined; };
function required(args: ParsedArgs, name: string): string {
  const value = str(args, name);
  if (value === undefined || value.length === 0) throw new HranessError("usage", `--${name} is required.`);
  return value;
}
function positional(args: ParsedArgs, index: number, name: string): string {
  const value = args.positionals[index];
  if (value === undefined || value.length === 0) throw new HranessError("usage", `${name} is required.`);
  return value;
}
function revision(args: ParsedArgs): number {
  const text = required(args, "expected-revision");
  if (!/^(0|[1-9][0-9]{0,15})$/u.test(text)) throw new HranessError("usage", "--expected-revision must be a whole number.");
  return Number(text);
}
/** Parse through the owner's own strict parser so the CLI never builds a request the owner would read differently. */
function parsed(request: unknown): ControlRequest {
  try { return parseControlRequest(request); }
  catch (error) { throw new HranessError("usage", error instanceof Error && error.message !== "" ? `Invalid arguments: ${error.message}` : "Invalid arguments."); }
}
const digestOf = (value: unknown): string => sha256(canonicalJson(value));
const success = (data: ControlData): string => data.kind === "success" ? data.message : data.kind === "prompt" ? data.text : data.kind === "document" ? data.text : JSON.stringify(data);

// ---- verb inputs -------------------------------------------------------------

type ApprovalDecision = { readonly request: Extract<ControlRequest, { readonly action: "approval.decide" }> };
type PermissionSet = { readonly request: Extract<ControlRequest, { readonly action: "permission.set" }> };

function approvalText(approvals: readonly ApprovalView[]): string {
  if (approvals.length === 0) return "No approval requests are waiting.";
  return approvals.map((a) => `${a.id}  ${a.title}  ${a.effect}  digest ${a.digest}\n  ${a.preview.replaceAll("\n", " ").slice(0, 160)}\n  expires ${a.expiresAt}`).join("\n");
}

export function ghostgetVerbs(portsFor: (io: CliIO) => ControlPorts): Verb<any, any>[] {
  const verbs: Verb<any, any>[] = [
    {
      path: ["status"], opClass: "read", schema: STATUS_SCHEMA, summary: "One-screen health: accounts, approvals, sign-ins, outputs",
      valueFlags: ["account"], usage: "[--account <id>] [--json]",
      input: (a: ParsedArgs) => ({ accountId: str(a, "account") ?? null }),
      run: async (input: { accountId: string | null }, ctx) => await readStatus(portsFor(ctx.io), input.accountId),
      text: (status: GhostgetStatus) => renderStatus(status, 80),
    },
    {
      path: ["approvals", "list"], opClass: "read", schema: "ghostget.approvals/1", summary: "List approval requests waiting for a person",
      input: () => ({}),
      run: async (_input, ctx) => { const data = await withControl(portsFor(ctx.io), true, (c) => ask(c, { action: "approval.list" })); if (data.kind !== "approvals") throw new HranessError("internal", "Wrong data."); return { approvals: data.approvals }; },
      text: (out: { approvals: readonly ApprovalView[] }) => approvalText(out.approvals),
    },
    {
      path: ["approvals", "show"], opClass: "read", schema: "ghostget.approval/1", summary: "Show one approval request in full", usage: "<id> [--json]",
      input: (a: ParsedArgs) => ({ id: positional(a, 0, "The approval id") }),
      run: async (input: { id: string }, ctx) => {
        const data = await withControl(portsFor(ctx.io), true, (c) => ask(c, { action: "approval.list" }));
        const found = data.kind === "approvals" ? data.approvals.find((a) => a.id === input.id) : undefined;
        if (found === undefined) throw new HranessError("not-found", `No approval request ${input.id} is waiting.`, undefined, [{ command: "ghostget approvals list", why: "See what is waiting", audience: "agent" }]);
        return found;
      },
      text: (a: ApprovalView) => approvalText([a]),
    },
    {
      path: ["approvals", "decide"], opClass: "decide", schema: "ghostget.decision/1", summary: "Allow once or deny one approval request",
      valueFlags: ["digest"], usage: "<id> --digest <digest> allow-once|deny",
      input: (a: ParsedArgs): ApprovalDecision => {
        const decision = positional(a, 1, "allow-once or deny");
        if (decision !== "allow-once" && decision !== "deny") throw new HranessError("usage", "The decision must be allow-once or deny.");
        const request = parsed({ action: "approval.decide", id: positional(a, 0, "The approval id"), digest: required(a, "digest"), decision });
        return { request: request as ApprovalDecision["request"] };
      },
      gate: { tier: "T1T2", describe: (i: ApprovalDecision) => ({ title: `Allow approval request ${i.request.id} once`, digest: i.request.digest, command: `ghostget approvals decide ${i.request.id} --digest ${i.request.digest} allow-once` }) },
      operateWhen: { summary: "deny runs without a person", test: (i: ApprovalDecision) => i.request.decision === "deny" },
      run: async (i: ApprovalDecision, ctx) => ({ message: success(await withControl(portsFor(ctx.io), true, (c) => ask(c, i.request))) }),
      text: (o: { message: string }) => o.message,
    },
    {
      path: ["permissions", "list"], opClass: "read", schema: "ghostget.permissions/1", summary: "List capabilities and their allow/ask/deny setting",
      valueFlags: ["account"], input: (a: ParsedArgs) => ({ accountId: str(a, "account") ?? null }),
      run: async (i: { accountId: string | null }, ctx) => {
        const s = await withControl(portsFor(ctx.io), false, (c) => fetchSnapshot(c, i.accountId));
        return { accountId: s.accountId, policy: s.policy, capabilities: s.capabilities.map((c) => ({ adapterId: c.adapterId, operationId: c.operationId, effect: c.effect, risk: c.risk, permission: c.permission, digest: c.digest, state: c.state })) };
      },
      text: (o: { policy: { managed: boolean; revision: number }; capabilities: readonly { adapterId: string; operationId: string; permission: string | null; effect: string }[] }) =>
        [`Permissions ${o.policy.managed ? "managed" : "not enabled"} · revision ${o.policy.revision}`, ...o.capabilities.map((c) => `${(c.permission ?? "-").padEnd(5)} ${c.adapterId} ${c.operationId} (${c.effect})`)].join("\n"),
    },
    {
      path: ["permissions", "enable"], opClass: "decide", schema: "ghostget.result/1", summary: "Turn on permission management for capabilities",
      valueFlags: ["expected-revision"], usage: "--expected-revision <n>",
      input: (a: ParsedArgs) => ({ request: parsed({ action: "permission.enable", expectedRevision: revision(a) }) }),
      gate: { tier: "T1T2", describe: (i: { request: ControlRequest }) => ({ title: "Turn on Ghostget permission management", digest: digestOf(i.request) }) },
      run: async (i: { request: ControlRequest }, ctx) => ({ message: success(await withControl(portsFor(ctx.io), false, (c) => ask(c, i.request))) }),
      text: (o: { message: string }) => o.message,
    },
    {
      path: ["permissions", "set"], opClass: "decide", schema: "ghostget.result/1", summary: "Set one capability to allow, ask or deny",
      valueFlags: ["account", "expected-revision", "capability-digest"],
      usage: "<adapter> <operation> allow|ask|deny --expected-revision <n> --capability-digest <digest> [--account <id>]",
      input: (a: ParsedArgs): PermissionSet => {
        const decision = positional(a, 2, "allow, ask or deny");
        const request = parsed({ action: "permission.set", adapterId: positional(a, 0, "The adapter"), operationId: positional(a, 1, "The operation"), accountId: str(a, "account") ?? null, decision, expectedRevision: revision(a), expectedCapabilityDigest: required(a, "capability-digest") });
        return { request: request as PermissionSet["request"] };
      },
      gate: { tier: "T1T2", describe: (i: PermissionSet) => ({ title: `Set ${i.request.adapterId} ${i.request.operationId} to ${i.request.decision}`, digest: digestOf(i.request) }) },
      // Only deny is always at least as strict as the current setting; ask and allow can loosen.
      operateWhen: { summary: "deny tightens and runs without a person", test: (i: PermissionSet) => i.request.decision === "deny" },
      run: async (i: PermissionSet, ctx) => ({ message: success(await withControl(portsFor(ctx.io), false, (c) => ask(c, i.request))) }),
      text: (o: { message: string }) => o.message,
    },
    {
      path: ["web", "rules", "set"], opClass: "decide", schema: "ghostget.result/1", summary: "Replace the web gateway rules from a JSON file",
      valueFlags: ["file", "expected-revision"], flags: ["gateway-only"],
      usage: "--file <rules.json> --expected-revision <n> [--gateway-only]",
      input: (a: ParsedArgs) => {
        let rules: unknown;
        try { rules = JSON.parse(readFileSync(required(a, "file"), "utf8")); } catch (error) { if (error instanceof HranessError) throw error; throw new HranessError("usage", "--file must name a readable JSON array of web rules."); }
        return { request: parsed({ action: "web.save", rules, gatewayOnly: a.flags["gateway-only"] === true, expectedRevision: revision(a) }) as Extract<ControlRequest, { action: "web.save" }> };
      },
      gate: { tier: "T1T2", describe: (i: { request: { rules: readonly WebRule[] } }) => ({ title: `Replace web gateway rules (${i.request.rules.length} rules)`, digest: digestOf(i.request) }) },
      // Blocking everything is always a tightening: no rules and gateway-only.
      operateWhen: { summary: "an empty rule set with --gateway-only only tightens", test: (i: { request: { rules: readonly WebRule[]; gatewayOnly: boolean } }) => i.request.rules.length === 0 && i.request.gatewayOnly },
      run: async (i: { request: ControlRequest }, ctx) => ({ message: success(await withControl(portsFor(ctx.io), false, (c) => ask(c, i.request))) }),
      text: (o: { message: string }) => o.message,
    },
    {
      path: ["interface", "activate"], opClass: "decide", schema: "ghostget.result/1", summary: "Activate one reviewed interface draft for an adapter",
      valueFlags: ["digest"], usage: "<draft-id> <adapter> --digest <draft-digest>",
      input: (a: ParsedArgs) => {
        const id = positional(a, 0, "The draft id");
        const adapterId = positional(a, 1, "The adapter");
        const digest = required(a, "digest");
        // Validate the shape through the owner's parser; the installed digest is read from the live snapshot at run time.
        parsed({ action: "interface.activate", id, digest, adapterId, expectedInstalledDigest: null });
        return { id, adapterId, digest };
      },
      gate: { tier: "T1T2", describe: (i: { id: string; adapterId: string; digest: string }) => ({ title: `Activate interface draft ${i.id} for ${i.adapterId}`, digest: i.digest }) },
      run: async (i: { id: string; adapterId: string; digest: string }, ctx) => ({
        message: success(await withControl(portsFor(ctx.io), false, async (c) => {
          const entry = (await fetchSnapshot(c, null)).interfaces.find((item) => item.id === i.id);
          const target = entry?.activationTargets.find((item) => item.adapterId === i.adapterId);
          if (entry === undefined || target === undefined) throw new HranessError("not-found", `No draft ${i.id} can be activated for ${i.adapterId}.`, undefined, [{ command: "ghostget interface list", why: "See drafts and their adapters", audience: "agent" }]);
          if (entry.digest !== i.digest) throw new HranessError("digest-mismatch", "That draft changed after review. Review it again.", undefined, [{ command: "ghostget interface list", why: "Read the current draft digest", audience: "agent" }]);
          return await ask(c, { action: "interface.activate", id: entry.id, digest: entry.digest, adapterId: target.adapterId, expectedInstalledDigest: target.installedDigest });
        })),
      }),
      text: (o: { message: string }) => o.message,
    },
    {
      path: ["activity"], opClass: "read", schema: "ghostget.activity/1", summary: "Query gateway and approval activity",
      valueFlags: ["search", "method", "outcome", "origin", "since", "order", "limit", "cursor"],
      input: (a: ParsedArgs) => {
        const query: Record<string, unknown> = { search: str(a, "search") ?? "", method: str(a, "method") ?? "all", outcome: str(a, "outcome") ?? "all", origin: str(a, "origin") ?? null, since: str(a, "since") ?? null, order: str(a, "order") ?? "newest", limit: Number(str(a, "limit") ?? 50), cursor: str(a, "cursor") ?? null };
        return { request: parsed({ action: "activity.query", query: query as unknown as ActivityQuery }) };
      },
      run: async (i: { request: ControlRequest }, ctx) => { const d = await withControl(portsFor(ctx.io), false, (c) => ask(c, i.request)); if (d.kind !== "activity") throw new HranessError("internal", "Wrong data."); return d.page; },
    },
    {
      path: ["prompt"], opClass: "read", schema: "ghostget.prompt/1", summary: "Print the agent prompt for install, use, extend or gateway",
      valueFlags: ["adapter"], usage: "install|use|extend|gateway [--adapter <id>]",
      input: (a: ParsedArgs) => ({ request: parsed({ action: "prompt", kind: positional(a, 0, "install, use, extend or gateway"), adapterId: str(a, "adapter") ?? null }) }),
      run: async (i: { request: ControlRequest }, ctx) => { const d = await withControl(portsFor(ctx.io), false, (c) => ask(c, i.request)); return { text: success(d) }; },
      text: (o: { text: string }) => o.text,
    },
    {
      path: ["outputs", "list"], opClass: "read", schema: "ghostget.outputs/1", summary: "List recent saved outputs and their folder",
      input: () => ({}),
      run: async (_i, ctx) => {
        const directory = join(ghostgetStateHome(portsFor(ctx.io).environment), "outputs");
        const view = readOutputs(directory);
        return { directory, files: view.entries.map((e) => ({ name: e.name, path: join(directory, e.name), bytes: e.size, modifiedAt: new Date(e.modifiedMs).toISOString() })), message: view.message, truncated: view.truncated };
      },
      text: (o: { directory: string; files: readonly { path: string }[]; message: string | null }) => [o.directory, ...o.files.map((f) => `  ${f.path}`), ...(o.message === null ? [] : [o.message])].join("\n"),
    },
    {
      path: ["connections", "begin"], opClass: "operate", schema: "ghostget.connection/1", summary: "Start a browser sign-in (starts the owner on demand)",
      valueFlags: ["browser", "profile", "id", "expected-revision"],
      usage: "<provider> --browser chrome|safari [--profile <name>] [--id <account> --expected-revision <rev>]",
      input: (a: ParsedArgs) => ({ request: parsed({ action: "connection.begin", id: str(a, "id") ?? `${positional(a, 0, "The provider")}-${Date.now().toString(36)}`, provider: positional(a, 0, "The provider"), browser: required(a, "browser"), profile: str(a, "profile") ?? null, expectedRevision: str(a, "expected-revision") ?? null }) }),
      run: async (i: { request: ControlRequest }, ctx) => { const client = await portsFor(ctx.io).startOwner(); const d = await ask(client, i.request, VERIFY_TIMEOUT_MS); if (d.kind !== "connection") throw new HranessError("internal", "Wrong data."); return d; },
      text: (d: { attemptId: string; status: string }) => `Sign-in ${d.attemptId}: ${d.status}. Sign in in the browser, then run ghostget connections verify ${d.attemptId}`,
    },
    {
      path: ["connections", "verify"], opClass: "operate", schema: "ghostget.connection/1", summary: "Check which account is signed in for an attempt",
      usage: "<attempt>",
      input: (a: ParsedArgs) => ({ request: parsed({ action: "connection.verify", attemptId: positional(a, 0, "The attempt id") }) }),
      run: async (i: { request: ControlRequest }, ctx) => { const d = await withControl(portsFor(ctx.io), true, (c) => ask(c, i.request, VERIFY_TIMEOUT_MS)); if (d.kind !== "connection") throw new HranessError("internal", "Wrong data."); return d; },
      text: (d: { attemptId: string; status: string; subject: string | null; displayName: string | null }) => `Sign-in ${d.attemptId}: ${d.status}${d.subject === null ? "" : ` as ${d.displayName ?? d.subject} (${d.subject})`}`,
    },
    {
      path: ["connections", "commit"], opClass: "decide", schema: "ghostget.result/1", summary: "Save a verified sign-in as a connected account",
      valueFlags: ["subject"], usage: "<attempt> --subject <subject>",
      input: (a: ParsedArgs) => ({ request: parsed({ action: "connection.commit", attemptId: positional(a, 0, "The attempt id"), expectedSubject: required(a, "subject") }) as Extract<ControlRequest, { action: "connection.commit" }> }),
      gate: { tier: "T1T2", describe: (i: { request: { attemptId: string; expectedSubject: string } }) => ({ title: `Connect account ${i.request.expectedSubject}`, digest: digestOf(i.request) }) },
      run: async (i: { request: ControlRequest }, ctx) => ({ message: success(await withControl(portsFor(ctx.io), true, (c) => ask(c, i.request, VERIFY_TIMEOUT_MS))) }),
      text: (o: { message: string }) => o.message,
    },
    {
      path: ["connections", "cancel"], opClass: "operate", schema: "ghostget.result/1", summary: "Cancel a sign-in attempt",
      usage: "<attempt>",
      input: (a: ParsedArgs) => ({ request: parsed({ action: "connection.cancel", attemptId: positional(a, 0, "The attempt id") }) }),
      run: async (i: { request: ControlRequest }, ctx) => ({ message: success(await withControl(portsFor(ctx.io), true, (c) => ask(c, i.request))) }),
      text: (o: { message: string }) => o.message,
    },
    {
      path: ["connections", "disconnect"], opClass: "decide", schema: "ghostget.result/1", summary: "Disconnect a connected account",
      valueFlags: ["expected-revision"], usage: "<account> --expected-revision <rev>",
      input: (a: ParsedArgs) => ({ request: parsed({ action: "connection.disconnect", id: positional(a, 0, "The account id"), expectedRevision: required(a, "expected-revision") }) as Extract<ControlRequest, { action: "connection.disconnect" }> }),
      gate: { tier: "T1T2", describe: (i: { request: { id: string; expectedRevision: string } }) => ({ title: `Disconnect account ${i.request.id}`, digest: digestOf(i.request) }) },
      run: async (i: { request: ControlRequest }, ctx) => ({ message: success(await withControl(portsFor(ctx.io), false, (c) => ask(c, i.request))) }),
      text: (o: { message: string }) => o.message,
    },
    {
      path: ["control", "serve"], opClass: "operate", schema: "ghostget.control/1", summary: "Run the headless control owner (agent.sock, admin.sock)",
      flags: ["foreground"], output: "raw", input: () => ({}),
      run: async (_i, ctx) => {
        const { runControlHelper } = await import("./helper");
        const environment = portsFor(ctx.io).environment;
        try { await runControlHelper(environment, "serve", () => { ctx.io.stderr.write("Ghostget control owner is running. Stop it with ghostget control stop.\n"); }); return 0; }
        catch (error) {
          const { controlFailure } = await import("./service");
          throw controlError(controlFailure(error));
        }
      },
    },
    {
      path: ["control", "status"], opClass: "read", schema: "ghostget.control-status/1", summary: "Whether a control owner answers",
      input: () => ({}),
      run: async (_i, ctx) => ({ running: await adminOwnerRunning(portsFor(ctx.io).environment) }),
      text: (o: { running: boolean }) => o.running ? "Ghostget control owner is running." : "No Ghostget control owner is running. Start one with ghostget control serve.",
    },
    {
      path: ["control", "stop"], opClass: "operate", schema: "ghostget.result/1", summary: "Ask the owner to stop over its admin socket (never signals a process)",
      input: () => ({}),
      run: async (_i, ctx) => { const r = await adminRequest(portsFor(ctx.io).environment, ADMIN_STOP); if (!r.ok) throw controlError(r); return { message: success(r.data) }; },
      text: (o: { message: string }) => o.message,
    },
    {
      path: ["control", "install"], opClass: "decide", schema: "ghostget.login-item/1", summary: "Start the control owner at login (opt-in LaunchAgent)",
      input: () => ({}),
      gate: { tier: "T1T2", describe: () => ({ title: "Start Ghostget's control owner at every login", digest: digestOf({ label: LOGIN_ITEM_LABEL, program: process.execPath, script: cliScript() }) }) },
      run: async () => await installLoginItem({ product: PRODUCT, label: LOGIN_ITEM_LABEL, program: process.execPath, args: ["--no-env-file", cliScript(), "control", "serve", "--foreground"] }),
      text: (o: { path: string; changed: boolean }) => o.changed ? `Installed ${o.path}. It starts at next login.` : `Already installed: ${o.path}`,
    },
    {
      path: ["control", "uninstall"], opClass: "operate", schema: "ghostget.login-item/1", summary: "Stop starting the control owner at login",
      input: () => ({}),
      run: async () => await uninstallLoginItem({ product: PRODUCT, label: LOGIN_ITEM_LABEL, program: process.execPath }),
      text: (o: { path: string; changed: boolean }) => o.changed ? `Removed ${o.path}.` : "No login item was installed.",
    },
  ];
  return verbs;
}

export function ghostgetRegistry(portsFor: (io: CliIO) => ControlPorts): Registry {
  return defineRegistry(PRODUCT, ghostgetVerbs(portsFor));
}

export { registryOwns } from "./registry-words";

export async function runRegistryCommand(args: readonly string[], environment: ControlEnvironment, output: { readonly stdout: (text: string) => unknown; readonly stderr: (text: string) => unknown }): Promise<number> {
  const registry = ghostgetRegistry(() => defaultPorts(environment));
  return await runCli(registry, args, { stdout: { write: output.stdout }, stderr: { write: output.stderr }, env: environment as NodeJS.ProcessEnv });
}
