/**
 * A stateful model of approval lifetimes under two independent clocks.
 *
 * The broker takes an injected monotonic clock, which alone decides when a
 * pending request or an allow-once grant expires, and an injected wall clock,
 * which only labels the `expiresAt` shown to the person deciding. Each
 * generated schedule interleaves requests, decisions, holder checks, listings,
 * monotonic advances, and wall-clock jumps of up to ten days in either
 * direction. A jump moves both the injected wall clock and the ambient
 * `Date.now()` (through `setSystemTime`), so a broker that read either one for
 * a lifetime decision would disagree with the model.
 */
import { afterEach, expect, test } from "bun:test";
import { setSystemTime } from "bun:test";

import { assertAsyncProperty, fc } from "../test-support";
import type { AsyncCommand } from "../test-support";
import { ApprovalBroker } from "./approval-broker";
import type { ApprovalTarget, CheckedApproval } from "./protocol";

afterEach(() => {
  setSystemTime();
});

const target: ApprovalTarget = { kind: "web", method: "GET", url: "https://docs.example.com/" };
const checked: CheckedApproval = {
  digest: "a".repeat(64),
  revision: 1,
  decision: "ask",
  kind: "web",
  title: "GET docs.example.com",
  account: null,
  effect: "retrieval",
  preview: "Bound exact URL",
};

const PENDING_LIFETIME = 120_000;
const GRANT_LIFETIME = 600_000;
const WALL_START = Date.UTC(2027, 0, 1);
const DAY = 86_400_000;

type Entry = { status: "pending" | "allowed"; deadline: number; shownExpiry: number };
type Model = { now: number; wall: number; readonly entries: Map<string, Entry> };
type Real = { readonly broker: ApprovalBroker; readonly clock: { now: number; wall: number } };

const ids = ["one", "two", "three"] as const;
const use = (id: string): string => `${id}-holder`.padEnd(64, "0");

/** The broker's sweep, in model terms: only the monotonic deadline matters. */
function sweep(model: Model): void {
  for (const [id, entry] of model.entries) if (model.now >= entry.deadline) model.entries.delete(id);
}

class Request implements AsyncCommand<Model, Real> {
  constructor(readonly id: string) {}
  check(): boolean {
    return true;
  }
  async run(model: Model, real: Real): Promise<void> {
    sweep(model);
    if (model.entries.has(this.id)) {
      await expect(real.broker.request(this.id, target, checked.digest, use(this.id))).rejects.toThrow();
      return;
    }
    expect((await real.broker.request(this.id, target, checked.digest, use(this.id))).status).toBe("pending");
    model.entries.set(this.id, {
      status: "pending",
      deadline: model.now + PENDING_LIFETIME,
      shownExpiry: model.wall + PENDING_LIFETIME,
    });
  }
  toString(): string {
    return `Request(${this.id})`;
  }
}

class Decide implements AsyncCommand<Model, Real> {
  constructor(readonly id: string) {}
  check(): boolean {
    return true;
  }
  async run(model: Model, real: Real): Promise<void> {
    sweep(model);
    const entry = model.entries.get(this.id);
    if (entry?.status !== "pending") {
      await expect(real.broker.decide(this.id, checked.digest, "allow-once")).rejects.toThrow();
      return;
    }
    await real.broker.decide(this.id, checked.digest, "allow-once");
    entry.status = "allowed";
    entry.deadline = model.now + GRANT_LIFETIME;
    entry.shownExpiry = model.wall + GRANT_LIFETIME;
  }
  toString(): string {
    return `Decide(${this.id})`;
  }
}

class Check implements AsyncCommand<Model, Real> {
  constructor(readonly id: string) {}
  check(): boolean {
    return true;
  }
  async run(model: Model, real: Real): Promise<void> {
    sweep(model);
    const expected = model.entries.get(this.id)?.status ?? "expired";
    expect((await real.broker.check(this.id, checked.digest, use(this.id))).status).toBe(expected);
  }
  toString(): string {
    return `Check(${this.id})`;
  }
}

class List implements AsyncCommand<Model, Real> {
  check(): boolean {
    return true;
  }
  async run(model: Model, real: Real): Promise<void> {
    sweep(model);
    const expected = [...model.entries]
      .filter(([, entry]) => entry.status === "pending")
      .map(([id, entry]) => ({ id, expiresAt: new Date(entry.shownExpiry).toISOString() }));
    expect(real.broker.list().map((view) => ({ id: view.id, expiresAt: view.expiresAt }))).toEqual(expected);
  }
  toString(): string {
    return "List";
  }
}

/** Monotonic time passes; the wall clock passes by the same amount. */
class Advance implements AsyncCommand<Model, Real> {
  constructor(readonly elapsed: number) {}
  check(): boolean {
    return true;
  }
  async run(model: Model, real: Real): Promise<void> {
    model.now += this.elapsed;
    model.wall += this.elapsed;
    real.clock.now = model.now;
    real.clock.wall = model.wall;
    setSystemTime(new Date(model.wall));
  }
  toString(): string {
    return `Advance(${String(this.elapsed)})`;
  }
}

/** The wall clock jumps (NTP step, manual change, sleep drift); monotonic time does not move. */
class JumpWall implements AsyncCommand<Model, Real> {
  constructor(readonly delta: number) {}
  check(): boolean {
    return true;
  }
  async run(model: Model, real: Real): Promise<void> {
    model.wall += this.delta;
    real.clock.wall = model.wall;
    setSystemTime(new Date(model.wall));
  }
  toString(): string {
    return `JumpWall(${String(this.delta)})`;
  }
}

const id = fc.constantFrom(...ids);
const commands = fc.commands([
  id.map((value) => new Request(value)),
  id.map((value) => new Decide(value)),
  id.map((value) => new Check(value)),
  fc.constant(new List()),
  fc.integer({ min: 1, max: 400_000 }).map((elapsed) => new Advance(elapsed)),
  fc.oneof(
    fc.integer({ min: -10 * DAY, max: 10 * DAY }),
    fc.constantFrom(-GRANT_LIFETIME, -PENDING_LIFETIME, PENDING_LIFETIME, GRANT_LIFETIME, 10 * DAY, -10 * DAY),
  ).map((delta) => new JumpWall(delta)),
], { maxCommands: 24, size: "max" });

// A broker whose sweep compared `wallNow()` with the shown expiry fails on
// [Request(two), JumpWall(120000), Request(two)]: a forward wall jump expired a
// pending request that monotonic time had not, so its identifier was reusable.
test("property: pending requests and allow-once grants expire by the injected monotonic clock alone, whatever the wall clock does", async () => {
  await assertAsyncProperty(fc.asyncProperty(commands, async (generated) => {
    const clock = { now: 0, wall: WALL_START };
    setSystemTime(new Date(clock.wall));
    const broker = new ApprovalBroker(async () => checked, () => clock.now, async (_target, retained) => retained, () => clock.wall);
    try {
      await fc.asyncModelRun(() => ({
        model: { now: 0, wall: WALL_START, entries: new Map<string, Entry>() },
        real: { broker, clock },
      }), generated);
    } finally {
      broker.close();
      setSystemTime();
    }
  }));
});
