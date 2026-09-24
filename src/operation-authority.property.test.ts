/**
 * A stateful model of operation authority under managed permissions.
 *
 * The model drives the production permission layer, preparation, read
 * execution and write confirmation on a real state home with the bundled X
 * interface and one OAuth account. A counting executor stands in for the
 * provider. Commands change the account incarnation (remove and save the same
 * account: A to B to A), the installed interface (two manifests that differ
 * only in display name, so it returns to the exact earlier bytes), the
 * executable closure (a registry whose implementation closure hash differs),
 * and the policy (allow, ask or deny for the current exact identity). Other
 * commands prepare reads, preview writes, execute prepared reads, and confirm
 * saved plans, on time or after the plan expired.
 *
 * The laws:
 * - the capability digest is a function of the exact identity: equal for the
 *   same account incarnation, interface and closure, and distinct otherwise,
 *   so a grant for one identity never applies to another;
 * - a prepared read dispatches only when its account incarnation and
 *   interface are still current and the policy for the current identity is
 *   allow; `ask` without a human approval and `deny` never dispatch;
 * - a saved plan dispatches only under the same conditions and only once; an
 *   expired or drifted plan is consumed without dispatch, so restoring the
 *   account, interface or clock cannot revive it; a plan refused only by
 *   policy stays for a later confirmation under current authority.
 */
import { afterEach, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { chmodSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createAuth, removeAuth, saveAuth } from "./auth";
import type { PermissionDecision } from "./control/protocol";
import type { GhostgetManifest } from "./model";
import { describeOperationPermission, setOperationPermission } from "./operation-permission";
import { enableOperationPermissions } from "./operation-permission-store";
import type { ProviderExecution } from "./provider";
import type { ProviderPluginRegistry } from "./provider-plugin-registry";
import { providerPluginRegistry as registry } from "./provider-plugins";
import { confirmInvocation, createAndSaveInvocationPlan, executeReadInvocation, loadInvocationPlan, prepareInvocation, type PreparedInvocation } from "./runtime";
import { installManifest } from "./storage";
import { assertAsyncProperty, fc } from "./test-support";

const directories: string[] = [];
afterEach(() => { for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true }); });

type Identity = { inc: number; manifest: 0 | 1; closure: 0 | 1 };
type Prepared = { readonly invocation: PreparedInvocation; readonly identity: Identity };
type Plan = { readonly digest: string; readonly identity: Identity; readonly body: string; readonly retry: boolean; live: boolean; dispatched: boolean };
type World = {
  readonly environment: { GHOSTGET_STATE_HOME: string };
  readonly manifests: readonly [GhostgetManifest, GhostgetManifest];
  readonly registries: readonly [ProviderPluginRegistry, ProviderPluginRegistry];
  readonly auth: ReturnType<typeof createAuth>;
  readonly policy: Map<string, PermissionDecision>;
  readonly digests: Map<string, string>;
  identity: Identity;
  prepared: Prepared[];
  plans: Plan[];
  calls: number;
  serial: number;
};
type Model = { prepared: number; plans: number };

const key = (identity: Identity) => `${identity.inc}:${identity.manifest}:${identity.closure}`;
const decision = (world: World) => world.policy.get(key(world.identity)) ?? "deny";
const sameAuthority = (bound: Identity, current: Identity) => bound.inc === current.inc && bound.manifest === current.manifest;
const options = (world: World) => ({ environment: world.environment, registry: world.registries[world.identity.closure] });

function execution(): ProviderExecution {
  return { status: "succeeded", output: { id: "1", text: "done" }, finalUrl: null, dispatchStarted: true, dispatch: { planned: 1, started: 1, verified: 1 } };
}

function planExists(world: World, digest: string): boolean {
  try { loadInvocationPlan(digest, world.environment); return true; } catch { return false; }
}

class Grant implements fc.AsyncCommand<Model, World> {
  constructor(readonly decision: PermissionDecision) {}
  check(): boolean { return true; }
  async run(_model: Model, world: World): Promise<void> {
    const operation = "posts.read";
    const described = [operation, "posts.publish"].map((id) => describeOperationPermission("x", id, world.auth.id, options(world)));
    // The digest is a function of the exact identity.
    const current = key(world.identity);
    for (const description of described) {
      const slot = `${description.coordinate.operation}@${current}`;
      const known = world.digests.get(slot);
      if (known !== undefined) expect(description.digest).toBe(known);
      else {
        for (const [other, digest] of world.digests) if (other.startsWith(`${description.coordinate.operation}@`)) expect(description.digest).not.toBe(digest);
        world.digests.set(slot, description.digest);
      }
      expect(description.decision).toBe(decision(world));
    }
    for (const [index, id] of [operation, "posts.publish"].entries()) {
      const description = described[index]!;
      const latest = index === 0 ? description : describeOperationPermission("x", id, world.auth.id, options(world));
      setOperationPermission({ adapterId: "x", operationId: id, authId: world.auth.id, decision: this.decision, expectedRevision: latest.revision, expectedCapabilityDigest: latest.digest }, options(world));
    }
    world.policy.set(current, this.decision);
  }
  toString(): string { return `grant(${this.decision})`; }
}

class Reincarnate implements fc.AsyncCommand<Model, World> {
  check(): boolean { return true; }
  async run(_model: Model, world: World): Promise<void> {
    removeAuth(world.auth.id, world.environment);
    saveAuth(world.auth, world.environment);
    world.identity = { ...world.identity, inc: world.identity.inc + 1 };
  }
  toString(): string { return "reincarnate"; }
}

class ToggleInterface implements fc.AsyncCommand<Model, World> {
  check(): boolean { return true; }
  async run(_model: Model, world: World): Promise<void> {
    const next = world.identity.manifest === 0 ? 1 : 0;
    installManifest(world.manifests[next], { force: true, environment: world.environment, registry });
    world.identity = { ...world.identity, manifest: next };
  }
  toString(): string { return "toggle-interface"; }
}

class ToggleClosure implements fc.AsyncCommand<Model, World> {
  check(): boolean { return true; }
  async run(_model: Model, world: World): Promise<void> {
    world.identity = { ...world.identity, closure: world.identity.closure === 0 ? 1 : 0 };
  }
  toString(): string { return "toggle-closure"; }
}

class Prepare implements fc.AsyncCommand<Model, World> {
  check(model: Readonly<Model>): boolean { return model.prepared < 3; }
  async run(model: Model, world: World): Promise<void> {
    const allowed = decision(world) !== "deny";
    let invocation: PreparedInvocation | null = null;
    try { invocation = prepareInvocation("x", "posts.read", { post_ids: ["2078889282404569267"] }, world.auth.id, world.environment, world.registries[world.identity.closure]); } catch (error) {
      if (allowed) throw error;
    }
    expect(invocation !== null).toBe(allowed);
    if (invocation !== null) { world.prepared.push({ invocation, identity: world.identity }); model.prepared += 1; }
  }
  toString(): string { return "prepare"; }
}

class ExecuteRead implements fc.AsyncCommand<Model, World> {
  constructor(readonly index: number) {}
  check(model: Readonly<Model>): boolean { return model.prepared > 0; }
  async run(_model: Model, world: World): Promise<void> {
    const prepared = world.prepared[this.index % world.prepared.length]!;
    const expected = sameAuthority(prepared.identity, world.identity) && decision(world) === "allow";
    const before = world.calls;
    let dispatched = true;
    try {
      await executeReadInvocation(prepared.invocation, { ...options(world), headed: false, executeProvider: async () => { world.calls += 1; return { ...execution(), dispatchStarted: false, dispatch: { planned: 0, started: 0, verified: 0 } }; } });
    } catch (error) {
      if (expected) throw error;
      dispatched = false;
    }
    expect(dispatched).toBe(expected);
    expect(world.calls - before).toBe(expected ? 1 : 0);
  }
  toString(): string { return `execute-read(${this.index})`; }
}

class Preview implements fc.AsyncCommand<Model, World> {
  constructor(readonly retry: boolean) {}
  check(model: Readonly<Model>): boolean { return model.plans < 4; }
  async run(model: Model, world: World): Promise<void> {
    const allowed = decision(world) !== "deny";
    const retried = this.retry ? world.plans.findLast((plan) => plan.dispatched) : undefined;
    if (this.retry && retried === undefined) return;
    const body = retried?.body ?? `authority model ${world.serial++}`;
    let digest: string | null = null;
    try {
      const invocation = prepareInvocation("x", "posts.publish", { body }, world.auth.id, world.environment, world.registries[world.identity.closure]);
      digest = createAndSaveInvocationPlan(invocation, world.environment, new Date(), world.registries[world.identity.closure]).digest;
    } catch (error) {
      if (allowed) throw error;
    }
    expect(digest !== null).toBe(allowed);
    if (digest !== null) { world.plans.push({ digest, identity: world.identity, body, retry: this.retry, live: true, dispatched: false }); model.plans += 1; }
  }
  toString(): string { return this.retry ? "preview(retry of a dispatched intent)" : "preview"; }
}

class Confirm implements fc.AsyncCommand<Model, World> {
  constructor(readonly index: number, readonly late: boolean) {}
  check(model: Readonly<Model>): boolean { return model.plans > 0; }
  async run(_model: Model, world: World): Promise<void> {
    const plan = world.plans[this.index % world.plans.length]!;
    const fresh = plan.live && !this.late && sameAuthority(plan.identity, world.identity);
    const permitted = fresh && decision(world) === "allow";
    // A retried intent never reaches the provider again: the idempotency
    // fence replays the earlier result or refuses.
    const expected = permitted && !plan.retry;
    const before = world.calls;
    let settled = true;
    try {
      await confirmInvocation(plan.digest, {
        ...options(world), headed: false,
        ...(this.late ? { now: new Date(Date.now() + 24 * 60 * 60 * 1000) } : {}),
        executeProvider: async (_manifest, _recipe, _input, _auth, hooks) => {
          // The durable dispatch boundary is \`beforeDispatch\`; count only what passes it.
          await hooks?.beforeDispatch?.({ id: "posts-publish", index: 1, progress: { planned: 1, started: 0, verified: 0 } });
          world.calls += 1;
          await hooks?.afterDispatchVerified?.({ id: "posts-publish", index: 1, progress: { planned: 1, started: 1, verified: 1 } });
          return execution();
        },
      });
    } catch (error) {
      if (expected) throw error;
      settled = false;
    }
    if (!plan.retry) expect(settled).toBe(expected);
    expect(world.calls - before).toBe(expected ? 1 : 0);
    if (expected) plan.dispatched = true;
    // A plan refused only by policy stays; every other attempt consumes it.
    if (plan.live && !(fresh && !permitted)) plan.live = false;
    expect(planExists(world, plan.digest)).toBe(plan.live);
  }
  toString(): string { return `confirm(${this.index}${this.late ? ", late" : ""})`; }
}

class Tamper implements fc.AsyncCommand<Model, World> {
  constructor(readonly index: number) {}
  check(model: Readonly<Model>): boolean { return model.plans > 0; }
  async run(_model: Model, world: World): Promise<void> {
    const plan = world.plans[this.index % world.plans.length]!;
    if (!plan.live) return;
    const path = join(world.environment.GHOSTGET_STATE_HOME, "plans", `${plan.digest}.json`);
    const bytes = readFileSync(path);
    bytes[bytes.length >> 1] ^= 0x01;
    writeFileSync(path, bytes);
    plan.live = false;
    const before = world.calls;
    await expect(confirmInvocation(plan.digest, { ...options(world), headed: false, executeProvider: async () => { world.calls += 1; return execution(); } })).rejects.toThrow();
    expect(world.calls).toBe(before);
    // An altered plan is refused, never dispatched, and left for inspection.
    expect(planExists(world, plan.digest)).toBe(false);
  }
  toString(): string { return `tamper(${this.index})`; }
}

class ConfirmUnknown implements fc.AsyncCommand<Model, World> {
  constructor(readonly digest: string) {}
  check(): boolean { return true; }
  async run(_model: Model, world: World): Promise<void> {
    const before = world.calls;
    await expect(confirmInvocation(this.digest, { ...options(world), headed: false, executeProvider: async () => { world.calls += 1; return execution(); } })).rejects.toThrow();
    expect(world.calls).toBe(before);
  }
  toString(): string { return `confirm-unknown(${this.digest.slice(0, 8)})`; }
}

function world(): World {
  const directory = realpathSync(mkdtempSync(join(tmpdir(), "ghostget-authority-model-")));
  chmodSync(directory, 0o700);
  directories.push(directory);
  const environment = { GHOSTGET_STATE_HOME: directory };
  const manifest = JSON.parse(readFileSync(join(import.meta.dir, "assets/adapters/x/wrench-adapter.json"), "utf8")) as GhostgetManifest;
  installManifest(manifest, { force: false, environment, registry });
  const auth = createAuth("authority-account", { oauthProvider: "x", tokenFile: join(directory, "token.json"), scopes: ["tweet.read", "tweet.write", "users.read"], subject: "12345" });
  saveAuth(auth, environment);
  enableOperationPermissions(0, environment);
  const altered: ProviderPluginRegistry = { ...registry, implementationClosureHash: (binding) => createHash("sha256").update(`variant:${registry.implementationClosureHash(binding)}`).digest("hex") };
  return {
    environment, auth,
    manifests: [manifest, { ...manifest, displayName: "Authority model interface" }],
    registries: [registry, altered],
    policy: new Map(), digests: new Map(),
    identity: { inc: 0, manifest: 0, closure: 0 },
    prepared: [], plans: [], calls: 0, serial: 0,
  };
}

// Every command reads or writes the private state layer, and a confirmed
// write adds its claim, journal, ledger and receipt, so one run of up to 10
// commands takes a few seconds on a quiet host. One state home serves every
// run; each run starts from the identity and policy the previous run left,
// which the model carries forward. 8 runs keep this near half a minute.
test("property: authority never outlives a change of account incarnation, interface, closure or policy", async () => {
  const shared = world();
  await assertAsyncProperty(fc.asyncProperty(fc.commands([
    fc.constantFrom<PermissionDecision>("allow", "allow", "ask", "deny").map((value) => new Grant(value)),
    fc.constant(new Reincarnate()),
    fc.constant(new ToggleInterface()),
    fc.constant(new ToggleClosure()),
    fc.constant(new Prepare()),
    fc.nat({ max: 2 }).map((index) => new ExecuteRead(index)),
    fc.boolean().map((retry) => new Preview(retry)),
    fc.tuple(fc.nat({ max: 3 }), fc.boolean()).map(([index, late]) => new Confirm(index, late)),
    fc.nat({ max: 3 }).map((index) => new Tamper(index)),
    fc.stringMatching(/^[0-9a-f]{64}$/).map((digest) => new ConfirmUnknown(digest)),
  ], { maxCommands: 12, size: "+1" }), async (commands) => {
    shared.prepared = [];
    shared.plans = [];
    await fc.asyncModelRun(() => ({ model: { prepared: 0, plans: 0 }, real: shared }), commands);
  }), { numRuns: 8, interruptAfterTimeLimit: 600_000 });
});
