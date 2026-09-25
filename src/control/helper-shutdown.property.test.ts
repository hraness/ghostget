/**
 * Stateful models of helper and connection shutdown.
 *
 * The first model runs the helper's production shutdown sequencer,
 * `settleHelperShutdown`, over a set of in-flight requests tracked the way
 * `runControlHelper` tracks them. A request is either abort-aware (it settles
 * when the service's shutdown signal aborts, as provider calls do) or slow
 * (it settles only when the test releases it, successfully or with a
 * failure). Commands start and release requests and begin shutdown at any
 * point; the run then releases whatever is still pending and waits for
 * shutdown to finish. Its laws:
 * - the steps run in the fixed order (disconnect clients, begin shutdown,
 *   close the service, close the server, remove the owned socket, release
 *   the owner), and the owner is released exactly once, last;
 * - the service closes, the socket goes and the owner is released only after
 *   every request that was in flight when shutdown began has settled, and
 *   abort-aware requests settle as soon as shutdown begins.
 *
 * The second model drives the production `Connections` class: sign-in
 * attempts, verifications through an abort-aware or slow probe, releases,
 * and `close()` (what the service's shutdown calls). Its laws: closing aborts
 * every attempt, an abort-aware probe settles without being released, no
 * verification that finishes after close reports a verified account, and no
 * attempt, verified or not, can be committed afterwards.
 */
import { afterEach, expect, test } from "bun:test";
import { chmodSync, mkdtempSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { providerPluginRegistry as registry } from "../provider-plugins";
import { assertAsyncProperty, fc } from "../test-support";
import { Connections } from "./connections";
import { settleHelperShutdown } from "./helper";

const roots: string[] = [];
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });

async function flush(): Promise<void> {
  for (let index = 0; index < 4; index += 1) await new Promise<void>((resolve) => setImmediate(resolve));
}

type RequestKind = "abort-aware" | "slow";
type Outcome = "success" | "failure";
type Pending = { readonly kind: RequestKind; release: (outcome: Outcome) => void; settled: boolean };

// Helper sequencer model ----------------------------------------------------

type HelperModel = { pending: number; shutdown: boolean };
type HelperReal = {
  readonly controller: AbortController;
  readonly works: Pending[];
  readonly active: Set<Promise<void>>;
  readonly log: string[];
  readonly violations: string[];
  shutdown: Promise<void> | null;
  inFlightAtShutdown: Pending[];
};

function unsettledAtShutdown(real: HelperReal): number {
  return real.inFlightAtShutdown.filter((pending) => !pending.settled).length;
}

class StartRequest implements fc.AsyncCommand<HelperModel, HelperReal> {
  constructor(readonly kind: RequestKind) {}
  check(model: Readonly<HelperModel>): boolean { return !model.shutdown && model.pending < 6; }
  async run(model: HelperModel, real: HelperReal): Promise<void> {
    const pending: Pending = { kind: this.kind, release: () => undefined, settled: false };
    const signal = real.controller.signal;
    const request = new Promise<void>((resolve, reject) => {
      pending.release = (outcome) => { if (outcome === "success") resolve(); else reject(new Error("synthetic request failure")); };
      if (this.kind === "abort-aware") signal.addEventListener("abort", () => reject(new Error("aborted")), { once: true });
    });
    // `runControlHelper` turns every request into a work that settles once
    // its response is written, whether the handler resolved or threw.
    const work = request.then(() => undefined, () => undefined);
    real.active.add(work);
    real.works.push(pending);
    void work.then(() => { pending.settled = true; real.log.push("settled"); real.active.delete(work); });
    model.pending += 1;
    await flush();
  }
  toString(): string { return `start(${this.kind})`; }
}

class ReleaseRequest implements fc.AsyncCommand<HelperModel, HelperReal> {
  constructor(readonly index: number, readonly outcome: Outcome) {}
  check(model: Readonly<HelperModel>): boolean { return model.pending > 0; }
  async run(_model: HelperModel, real: HelperReal): Promise<void> {
    const open = real.works.filter((pending) => !pending.settled);
    if (open.length === 0) return;
    const pending = open[this.index % open.length]!;
    if (real.log.includes("release-owner") && unsettledAtShutdown(real) > 0) real.violations.push("the owner was released while requests were still running");
    pending.release(this.outcome);
    await flush();
    if (!pending.settled) real.violations.push("a released request did not settle");
  }
  toString(): string { return `release(${this.index}, ${this.outcome})`; }
}

class Shutdown implements fc.AsyncCommand<HelperModel, HelperReal> {
  check(model: Readonly<HelperModel>): boolean { return !model.shutdown; }
  async run(model: HelperModel, real: HelperReal): Promise<void> {
    real.inFlightAtShutdown = real.works.filter((pending) => !pending.settled);
    const custody = (step: string) => () => {
      const running = unsettledAtShutdown(real);
      if (running > 0) real.violations.push(`${step} ran with ${running} request(s) still running`);
      real.log.push(step);
    };
    real.shutdown = settleHelperShutdown({
      disconnectClients: async () => { real.log.push("disconnect-clients"); },
      beginShutdown: () => { real.log.push("begin-shutdown"); real.controller.abort(); },
      active: real.active,
      closeService: custody("close-service"),
      closeServer: async () => { custody("close-server")(); },
      removeOwnedSocket: custody("remove-socket"),
      releaseOwner: custody("release-owner"),
    });
    model.shutdown = true;
    await flush();
    for (const pending of real.inFlightAtShutdown) {
      if (pending.kind === "abort-aware" && !pending.settled) real.violations.push("an abort-aware request did not settle when shutdown began");
    }
    const waiting = real.inFlightAtShutdown.some((pending) => !pending.settled);
    if (!waiting && !real.log.includes("release-owner")) real.violations.push("shutdown did not finish once nothing was running");
  }
  toString(): string { return "shutdown"; }
}

const ORDER = ["disconnect-clients", "begin-shutdown", "close-service", "close-server", "remove-socket", "release-owner"];

// Everything in this model is in memory, so 200 runs take about a second.
test("property: helper shutdown settles every in-flight request before closing the service and releases the owner once, last", async () => {
  await assertAsyncProperty(fc.asyncProperty(fc.commands([
    fc.constantFrom<RequestKind>("abort-aware", "slow").map((kind) => new StartRequest(kind)),
    fc.tuple(fc.nat({ max: 5 }), fc.constantFrom<Outcome>("success", "failure")).map(([index, outcome]) => new ReleaseRequest(index, outcome)),
    fc.constant(new Shutdown()),
  ], { maxCommands: 14, size: "+1" }), async (commands) => {
    const real: HelperReal = { controller: new AbortController(), works: [], active: new Set(), log: [], violations: [], shutdown: null, inFlightAtShutdown: [] };
    const model = (): HelperModel => ({ pending: 0, shutdown: false });
    await fc.asyncModelRun(() => ({ model: model(), real }), commands);
    if (real.shutdown === null) await new Shutdown().run(model(), real);
    // Release whatever is still pending, one at a time, and let shutdown finish.
    for (const pending of real.works) {
      if (pending.settled) continue;
      if (real.log.includes("close-service")) real.violations.push("the service closed while requests were still running");
      pending.release("success");
      await flush();
    }
    await real.shutdown;
    expect(real.violations).toEqual([]);
    expect(real.log.filter((entry) => entry !== "settled")).toEqual(ORDER);
    expect(real.log.lastIndexOf("settled")).toBeLessThan(real.log.indexOf("close-service"));
    expect(real.active.size).toBe(0);
  }), { numRuns: 200, interruptAfterTimeLimit: 60_000 });
});

test("shutdown waits for a slow request before closing the service and releasing the owner", async () => {
  const log: string[] = [];
  let finish: () => void = () => undefined;
  const work = new Promise<void>((resolve) => { finish = resolve; }).then(() => { log.push("settled"); });
  const done = settleHelperShutdown({
    disconnectClients: async () => { log.push("disconnect-clients"); },
    beginShutdown: () => { log.push("begin-shutdown"); },
    active: new Set([work]),
    closeService: () => { log.push("close-service"); },
    closeServer: async () => { log.push("close-server"); },
    removeOwnedSocket: () => { log.push("remove-socket"); },
    releaseOwner: () => { log.push("release-owner"); },
  });
  await flush();
  expect(log).toEqual(["disconnect-clients", "begin-shutdown"]);
  finish();
  await done;
  expect(log).toEqual(["disconnect-clients", "begin-shutdown", "settled", ...ORDER.slice(2)]);
});

// Connection shutdown model -------------------------------------------------

type ConnectionModel = { verifying: Set<number>; closed: boolean };
type ConnectionReal = {
  readonly connections: Connections;
  readonly attempts: readonly string[];
  readonly verifications: Map<number, Pending & { result: "verified" | "refused" | null; startedBeforeClose: boolean }>;
  readonly violations: string[];
  probeKind: RequestKind;
  probeHooks: { resolve: (subject: string) => void; reject: (error: Error) => void } | null;
  closed: boolean;
};

class VerifyAttempt implements fc.AsyncCommand<ConnectionModel, ConnectionReal> {
  constructor(readonly attempt: number, readonly kind: RequestKind) {}
  check(model: Readonly<ConnectionModel>): boolean { return !model.verifying.has(this.attempt); }
  async run(model: ConnectionModel, real: ConnectionReal): Promise<void> {
    real.probeKind = this.kind;
    real.probeHooks = null;
    const entry = { kind: this.kind, release: (_outcome: Outcome) => undefined as void, settled: false, result: null as "verified" | "refused" | null, startedBeforeClose: !real.closed };
    const verification = real.connections.verify(real.attempts[this.attempt]!);
    const hooks = real.probeHooks as ConnectionReal["probeHooks"];
    entry.release = (outcome) => { if (hooks === null) return; if (outcome === "success") hooks.resolve("12345"); else hooks.reject(new Error("synthetic verifier failure")); };
    void verification.then(
      (result) => { entry.result = result.kind === "connection" && result.status === "verified" ? "verified" : "refused"; entry.settled = true; if (real.closed) real.violations.push(`attempt ${this.attempt} verified after close`); },
      () => { entry.result = "refused"; entry.settled = true; },
    );
    real.verifications.set(this.attempt, entry);
    model.verifying.add(this.attempt);
    await flush();
  }
  toString(): string { return `verify(${this.attempt}, ${this.kind})`; }
}

class ReleaseProbe implements fc.AsyncCommand<ConnectionModel, ConnectionReal> {
  constructor(readonly attempt: number, readonly outcome: Outcome) {}
  check(model: Readonly<ConnectionModel>): boolean { return model.verifying.has(this.attempt); }
  async run(model: ConnectionModel, real: ConnectionReal): Promise<void> {
    const entry = real.verifications.get(this.attempt)!;
    entry.release(this.outcome);
    await flush();
    if (!entry.settled) real.violations.push(`attempt ${this.attempt} did not settle after release`);
    model.verifying.delete(this.attempt);
  }
  toString(): string { return `release(${this.attempt}, ${this.outcome})`; }
}

class CloseConnections implements fc.AsyncCommand<ConnectionModel, ConnectionReal> {
  check(model: Readonly<ConnectionModel>): boolean { return !model.closed; }
  async run(model: ConnectionModel, real: ConnectionReal): Promise<void> {
    real.closed = true;
    real.connections.close();
    await flush();
    for (const [attempt, entry] of real.verifications) {
      if (entry.kind === "abort-aware" && !entry.settled) real.violations.push(`abort-aware attempt ${attempt} did not settle on close`);
      if (entry.settled) model.verifying.delete(attempt);
    }
    model.closed = true;
  }
  toString(): string { return "close"; }
}

// Each run begins two sign-in attempts, and each begin reads the private auth
// record through the bound state helper, which costs tens of milliseconds on
// a quiet host and seconds on a loaded one; 12 runs keep this under a minute
// even then. The rest of the run is in memory.
test("property: closing connections aborts sign-in so no verification or commit survives shutdown", async () => {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "ghostget-shutdown-")));
  chmodSync(root, 0o700);
  roots.push(root);
  const environment = { GHOSTGET_STATE_HOME: root };
  await assertAsyncProperty(fc.asyncProperty(fc.commands([
    fc.tuple(fc.nat({ max: 1 }), fc.constantFrom<RequestKind>("abort-aware", "slow")).map(([attempt, kind]) => new VerifyAttempt(attempt, kind)),
    fc.tuple(fc.nat({ max: 1 }), fc.constantFrom<Outcome>("success", "failure")).map(([attempt, outcome]) => new ReleaseProbe(attempt, outcome)),
    fc.constant(new CloseConnections()),
  ], { maxCommands: 8, size: "+1" }), async (commands) => {
    const holder = { real: null as ConnectionReal | null };
    const probe = (_auth: unknown, context: { signal: AbortSignal }): Promise<string> => new Promise<string>((resolve, reject) => {
      const real = holder.real!;
      real.probeHooks = { resolve, reject };
      if (real.probeKind === "abort-aware") {
        if (context.signal.aborted) reject(new Error("aborted"));
        else context.signal.addEventListener("abort", () => reject(new Error("aborted")), { once: true });
      }
    });
    const testRegistry = { ...registry, requireSessionRoute: (site: Parameters<typeof registry.requireSessionRoute>[0]) => {
      const binding = registry.requireSessionRoute(site);
      return { ...binding, subject: { ...binding.subject, probe } };
    } };
    const connections = new Connections(environment, () => testRegistry as typeof registry, async () => undefined);
    const attempts: string[] = [];
    for (const id of ["x-account-a", "x-account-b"]) {
      const result = await connections.begin({ action: "connection.begin", id, provider: "x-web", browser: "chrome", profile: "Default", expectedRevision: null });
      if (result.kind !== "connection") throw new Error("expected a connection");
      attempts.push(result.attemptId);
    }
    const real: ConnectionReal = { connections, attempts, verifications: new Map(), violations: [], probeKind: "slow", probeHooks: null, closed: false };
    holder.real = real;
    const model = (): ConnectionModel => ({ verifying: new Set(), closed: false });
    await fc.asyncModelRun(() => ({ model: model(), real }), commands);
    if (!real.closed) await new CloseConnections().run(model(), real);
    for (const entry of real.verifications.values()) { entry.release("success"); await flush(); }
    expect(real.violations).toEqual([]);
    for (const entry of real.verifications.values()) expect(entry.settled).toBe(true);
    // Commit refuses before any state write once the attempt is gone.
    for (const attempt of attempts) expect(() => connections.commit(attempt, "12345")).toThrow("expired");
  }), { numRuns: 12, interruptAfterTimeLimit: 120_000 });
});
