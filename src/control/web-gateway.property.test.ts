/**
 * A stateful model of the web gateway's durable audit boundary.
 *
 * Each command sends one gateway request through the production
 * `WebGateway` and `ActivityStore` on a real state home, with a scripted
 * transport in place of DNS and the network. Scenarios cover a success, an
 * HTTP error, a redirect, an oversized body with and without a length header,
 * a policy revocation before and after the request leaves, a network error, a
 * denying rule, a failed start or final audit write, and a process crash while
 * the request is in flight, followed by a restart that recovers the store.
 *
 * The laws, checked against the SQLite file after every command:
 * - the transport reaches the network only while a committed `started` row
 *   for that request exists on disk, and only after the policy recheck at
 *   the pinned transport's request boundary passes;
 * - a caller receives output only when its final audit row committed and no
 *   redirect, oversized body, or revocation intervened;
 * - every row has the terminal outcome its scenario implies, a request whose
 *   final audit failed stays `started` until a restart marks it
 *   `interrupted`, and recovery never contacts the network again.
 */
import { afterEach, expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import { chmodSync, mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";

import { ghostgetStateHome } from "../storage";
import { assertAsyncProperty, fc } from "../test-support";
import { ActivityStore } from "./activity";
import { ApprovalBroker } from "./approval-broker";
import { WebGateway, type GatewayTransport } from "./web-gateway";
import { checkWebRequest, saveWebPolicy, type WebRule } from "./web-policy";

const cleanups: (() => void)[] = [];
afterEach(() => { for (const cleanup of cleanups.splice(0).reverse()) cleanup(); });

const ORIGIN = "https://docs.example.com";
const LIMIT = 1024;
const allowRule: WebRule = {
  id: "docs", origin: ORIGIN, path: { kind: "prefix", value: "/guide/" }, methods: ["GET", "HEAD"], queryKeys: ["q"],
  decision: "allow", effect: "retrieval", maxResponseBytes: LIMIT, timeoutMs: 5_000,
};
const denyRule: WebRule = { ...allowRule, id: "blocked", path: { kind: "prefix", value: "/blocked/" }, decision: "deny" };

const SCENARIOS = [
  "ok", "http-error", "redirect", "oversized-stream", "oversized-length", "revoke-before-request",
  "revoke-after-response", "network-error", "denied-rule", "start-fails", "finish-fails", "crash",
] as const;
type Scenario = (typeof SCENARIOS)[number];

type Expected = Readonly<{
  /** The terminal row outcome, `started` when the final audit write failed, or null for no row. */
  outcome: "succeeded" | "failed" | "denied" | "started" | null;
  errorCode: string | null;
  dispatched: boolean;
  output: boolean;
}>;

function expectation(scenario: Scenario): Expected {
  switch (scenario) {
    case "ok": return { outcome: "succeeded", errorCode: null, dispatched: true, output: true };
    case "http-error": return { outcome: "failed", errorCode: "HTTP_ERROR", dispatched: true, output: true };
    case "redirect": return { outcome: "failed", errorCode: "WEB_REDIRECT_BLOCKED", dispatched: true, output: false };
    case "oversized-stream":
    case "oversized-length": return { outcome: "failed", errorCode: "WEB_RESPONSE_TOO_LARGE", dispatched: true, output: false };
    case "revoke-before-request": return { outcome: "failed", errorCode: "WEB_POLICY_CHANGED", dispatched: false, output: false };
    case "revoke-after-response": return { outcome: "failed", errorCode: "WEB_POLICY_CHANGED", dispatched: true, output: false };
    case "network-error": return { outcome: "failed", errorCode: "WEB_REQUEST_FAILED", dispatched: true, output: false };
    case "denied-rule": return { outcome: "denied", errorCode: "WEB_DENIED", dispatched: false, output: false };
    case "start-fails": return { outcome: null, errorCode: null, dispatched: false, output: false };
    case "finish-fails": return { outcome: "started", errorCode: null, dispatched: true, output: false };
    // A restart in the same command marks the crashed request interrupted.
    case "crash": return { outcome: "started", errorCode: null, dispatched: true, output: false };
  }
}

type Row = Readonly<{ id: string; outcome: string; error_code: string | null }>;
type Model = {
  /** Expected rows by request number, or null when no row may exist. */
  rows: Map<number, Readonly<{ outcome: string; errorCode: string | null }> | null>;
  next: number;
};
type Real = {
  environment: Record<string, string>;
  database: string;
  activity: ActivityStore;
  gateway: WebGateway;
  approvals: ApprovalBroker;
  revision: number;
  /** Request number by gateway id, learned from the durable row the transport saw. */
  ids: Map<string, number>;
  dispatches: Map<number, number>;
  violations: string[];
  failStart: boolean;
  failFinish: boolean;
  scenario: Scenario;
  current: number;
  /** Settles the in-flight crashed request after the restart. */
  abandon: ((error: Error) => void) | null;
};

function readRows(database: string): readonly Row[] {
  const db = new Database(database, { readonly: true });
  try { return db.query<Row, []>("SELECT id, outcome, error_code FROM requests ORDER BY seq").all(); } finally { db.close(); }
}

function savePolicy(real: Real, rules: readonly WebRule[]): void {
  saveWebPolicy(rules, false, real.revision, real.environment);
  real.revision += 1;
}

function openStore(real: Pick<Real, "environment">): { activity: ActivityStore; approvals: ApprovalBroker; gateway: WebGateway } {
  const activity = new ActivityStore(real.environment);
  const approvals = new ApprovalBroker(async (target) => {
    if (target.kind !== "web") throw new Error("web targets only");
    return checkWebRequest(target.method, target.url, real.environment).approval;
  });
  return { activity, approvals, gateway: null as unknown as WebGateway };
}

function instrument(real: Real, activity: ActivityStore): void {
  const start = activity.start.bind(activity);
  const finish = activity.finish.bind(activity);
  activity.start = (row) => {
    if (real.failStart) throw new Error("synthetic disk full at start");
    start(row);
    real.ids.set(row.id, real.current);
  };
  activity.finish = (id, result) => { if (real.failFinish) throw new Error("synthetic disk full at finish"); finish(id, result); };
}

/** The scripted network. It records violations instead of throwing, since the gateway turns a throw into an ordinary failure. */
function transport(real: Real): GatewayTransport {
  return async (url, init, _timeoutMs, beforeRequest) => {
    const request = real.current;
    const scenario = real.scenario;
    const durable = readRows(real.database).filter((row) => row.outcome === "started" && real.ids.get(row.id) === request);
    if (durable.length !== 1) real.violations.push(`request ${String(request)} reached the transport with ${String(durable.length)} committed started rows`);
    if (url.origin !== ORIGIN || init.redirect !== "error") real.violations.push(`request ${String(request)} left with an unpinned target or redirect mode`);
    if (scenario === "revoke-before-request") savePolicy(real, [{ ...allowRule, decision: "deny" }, denyRule]);
    // The pinned transport calls this after DNS and before opening the request.
    beforeRequest();
    real.dispatches.set(request, (real.dispatches.get(request) ?? 0) + 1);
    const text = { "content-type": "text/plain" };
    switch (scenario) {
      case "http-error": return new Response("not here", { status: 404, headers: text });
      case "redirect": return new Response(null, { status: 302, headers: { location: `${ORIGIN}/elsewhere/` } });
      case "oversized-length": return new Response("a".repeat(LIMIT + 1), { headers: { ...text, "content-length": String(LIMIT + 1) } });
      case "oversized-stream": {
        const body = new ReadableStream<Uint8Array>({
          start(controller) { for (let index = 0; index < 3; index += 1) controller.enqueue(new Uint8Array(LIMIT / 2).fill(97)); controller.close(); },
        });
        return new Response(body, { headers: text });
      }
      case "revoke-after-response": savePolicy(real, [{ ...allowRule, decision: "deny" }, denyRule]); return new Response("late", { headers: text });
      case "network-error": throw new Error("synthetic connection reset");
      case "crash": return new Promise<Response>((_resolve, reject) => { real.abandon = reject; });
      default: return new Response(`body ${String(request)}`, { headers: text });
    }
  };
}

function restart(real: Real): void {
  real.activity.close();
  real.approvals.close();
  const opened = openStore(real);
  instrument(real, opened.activity);
  real.activity = opened.activity;
  real.approvals = opened.approvals;
  real.gateway = new WebGateway(real.activity, real.approvals, real.environment, transport(real));
}

function check(model: Model, real: Real): void {
  expect(real.violations).toEqual([]);
  const rows = readRows(real.database);
  const byRequest = new Map<number, Row>();
  for (const row of rows) {
    const request = real.ids.get(row.id);
    expect(request).toBeDefined();
    byRequest.set(request!, row);
  }
  for (const [request, expected] of model.rows) {
    const row = byRequest.get(request);
    if (expected === null) { expect(row).toBeUndefined(); continue; }
    expect({ request, outcome: row?.outcome, errorCode: row?.error_code ?? null })
      .toEqual({ request, outcome: expected.outcome, errorCode: expected.errorCode });
  }
  expect(rows).toHaveLength([...model.rows.values()].filter((expected) => expected !== null).length);
  for (const [request, count] of real.dispatches) expect({ request, count }).toEqual({ request, count: 1 });
}

class Send implements fc.AsyncCommand<Model, Real> {
  constructor(readonly scenario: Scenario, readonly method: "GET" | "HEAD") {}
  check(): boolean { return true; }
  async run(model: Model, real: Real): Promise<void> {
    const request = model.next;
    model.next += 1;
    const expected = expectation(this.scenario);
    real.current = request;
    real.scenario = this.scenario;
    real.failStart = this.scenario === "start-fails";
    real.failFinish = this.scenario === "finish-fails";
    const path = this.scenario === "denied-rule" ? "/blocked/page" : `/guide/${String(request)}`;
    const running = real.gateway.run(this.method, `${ORIGIN}${path}?q=private-${String(request)}`, new AbortController().signal);
    let settled: { ok: true; body: string; status: number } | { ok: false; code: unknown };
    if (this.scenario === "crash") {
      // Wait until the request is in flight at the transport, then kill the process's store and restart.
      for (let spin = 0; spin < 200 && real.abandon === null; spin += 1) await new Promise((resolve) => setTimeout(resolve, 1));
      expect(real.abandon).not.toBeNull();
      const abandoned = real.abandon!;
      real.abandon = null;
      const crashed = real.activity;
      restart(real);
      for (const [earlier, row] of model.rows) {
        if (row?.outcome === "started") model.rows.set(earlier, { outcome: "interrupted", errorCode: "PROCESS_INTERRUPTED" });
      }
      expect(real.activity).not.toBe(crashed);
      abandoned(new Error("synthetic process death"));
    }
    try {
      const result = await running;
      settled = { ok: true, body: Buffer.from(result.bodyBase64, "base64").toString("utf8"), status: result.status };
    } catch (error) {
      settled = { ok: false, code: (error as { code?: unknown }).code };
    } finally {
      real.failStart = false;
      real.failFinish = false;
    }
    if (this.scenario === "revoke-before-request" || this.scenario === "revoke-after-response") savePolicy(real, [allowRule, denyRule]);
    expect({ scenario: this.scenario, output: settled.ok }).toEqual({ scenario: this.scenario, output: expected.output });
    if (settled.ok && this.method === "GET") expect(settled.body).toBe(this.scenario === "ok" ? `body ${String(request)}` : "not here");
    if (!settled.ok && (this.scenario === "finish-fails" || this.scenario === "crash")) expect(settled.code).toBe("ACTIVITY_COMMIT_FAILED");
    if (expected.dispatched) expect(real.dispatches.get(request)).toBe(1);
    else expect(real.dispatches.has(request)).toBe(false);
    // A crashed request's store is already recovered in this command.
    model.rows.set(request, expected.outcome === null ? null
      : this.scenario === "crash" ? { outcome: "interrupted", errorCode: "PROCESS_INTERRUPTED" }
        : { outcome: expected.outcome, errorCode: expected.errorCode });
    check(model, real);
  }
  toString(): string { return `send(${this.scenario}, ${this.method})`; }
}

class Restart implements fc.AsyncCommand<Model, Real> {
  check(): boolean { return true; }
  async run(model: Model, real: Real): Promise<void> {
    const before = new Map(real.dispatches);
    restart(real);
    for (const [request, expected] of model.rows) {
      if (expected?.outcome === "started") model.rows.set(request, { outcome: "interrupted", errorCode: "PROCESS_INTERRUPTED" });
    }
    // Recovery marks unknown requests and never sends them again.
    expect(real.dispatches).toEqual(before);
    check(model, real);
  }
  toString(): string { return "restart"; }
}

function stateHome(): Record<string, string> {
  const raw = mkdtempSync("/tmp/ghostget-gw-"); chmodSync(raw, 0o700);
  cleanups.push(() => { rmSync(raw, { recursive: true, force: true }); });
  return { GHOSTGET_STATE_HOME: raw, PATH: "/usr/bin:/bin:/usr/sbin:/sbin", HOME: process.env.HOME ?? "", TMPDIR: "/tmp" };
}

// Policy saves and audit writes go through the private state layer and a
// synchronous SQLite file, so one run of up to 8 commands takes one to three
// seconds; 15 runs take 15 to 40 seconds.
test("property: gateway output and network dispatch follow a committed durable audit row, and recovery never retries", async () => {
  await assertAsyncProperty(fc.asyncProperty(fc.commands([
    fc.tuple(fc.constantFrom(...SCENARIOS), fc.constantFrom("GET" as const, "HEAD" as const)).map(([scenario, method]) => new Send(scenario, method)),
    fc.constant(new Restart()),
  ], { maxCommands: 8, size: "+1" }), async (commands) => {
    const environment = stateHome();
    const real = { environment, revision: 0, ids: new Map(), dispatches: new Map(), violations: [], failStart: false, failFinish: false, scenario: "ok", current: 0, abandon: null } as unknown as Real;
    real.database = join(ghostgetStateHome(environment), "control", "activity", "requests.sqlite");
    savePolicy(real, [allowRule, denyRule]);
    const opened = openStore(real);
    instrument(real, opened.activity);
    real.activity = opened.activity;
    real.approvals = opened.approvals;
    real.gateway = new WebGateway(real.activity, real.approvals, environment, transport(real));
    try {
      await fc.asyncModelRun(() => ({ model: { rows: new Map(), next: 1 }, real }), commands);
    } finally {
      real.activity.close();
      real.approvals.close();
    }
  }), { numRuns: 15, interruptAfterTimeLimit: 120_000 });
});
