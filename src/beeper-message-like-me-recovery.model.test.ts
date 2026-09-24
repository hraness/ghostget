/**
 * A stateful model of the Beeper Message Like Me export admission: one
 * controller at a time owns the admission claim, launches and binds a helper,
 * settles it or marks its cleanup unsafe, and releases. The environment kills
 * the parent or the helper, makes either one's liveness unreadable, or reboots
 * the machine, and later controllers try to take the admission over.
 *
 * The law: a later controller never takes over a claim until its owner's death
 * is proved. The parent must read as dead, and a claim that may still have a
 * helper running (launching, active, or cleanup-unsafe) needs a proved reboot.
 * A live or unreadable owner is retained. The claim file is real, and every
 * command compares it with the model.
 *
 * Liveness readings come from the model through the test-only seams, answered
 * as `processOwnerStatus` answers from a truthful operating system: after a
 * reboot every recorded owner is different-or-dead.
 */
import { chmodSync, existsSync, mkdtempSync, readFileSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, test } from "bun:test";

import {
  acquireBeeperMessageLikeMeExportAdmission,
  beginBeeperMessageLikeMeHelperLaunch,
  bindBeeperMessageLikeMeHelperOwner,
  markBeeperMessageLikeMeHelperCleanupUnsafe,
  releaseBeeperMessageLikeMeExportAdmission,
  settleBeeperMessageLikeMeHelper,
  type BeeperMessageLikeMeExportAdmission,
} from "./beeper-message-like-me-recovery";
import { currentProcessStartIdentity, type ProcessOwnerIdentity, type ProcessOwnerStatus } from "./process-identity";
import { assertProperty, fc } from "./test-support";

type Liveness = "live" | "dead" | "unknown";
type Phase = "parent-owned" | "helper-launching" | "helper-active" | "cleanup-unsafe";

type Model = {
  claim: null | {
    readonly holder: number;
    phase: Phase;
    helper: boolean;
    parent: Liveness;
    helperStatus: Liveness;
  };
};

type Real = {
  readonly environment: Readonly<Record<string, string | undefined>>;
  readonly helperPid: number;
  /** Every admission any controller ever held, by controller number. */
  readonly admissions: BeeperMessageLikeMeExportAdmission[];
  readonly claimPath: string;
  /** The liveness the seam reports for the current claim's parent and helper. */
  parent: Liveness;
  helper: Liveness;
};

const BOOT_ID = currentProcessStartIdentity().bootId;
const REBOOTED_BOOT_ID = BOOT_ID === "a".repeat(64) ? "b".repeat(64) : "a".repeat(64);

function reading(status: Liveness): ProcessOwnerStatus {
  return status === "live" ? "exact-live-owner" : status === "dead" ? "different-or-dead" : "unknown";
}

/**
 * The seam for one acquisition. After a reboot every recorded owner reads as
 * different-or-dead, as `processOwnerStatus` reads a prior boot's owner.
 */
function inspector(real: Real, rebooted: boolean): (owner: ProcessOwnerIdentity) => ProcessOwnerStatus {
  return (owner) => {
    if (rebooted) return "different-or-dead";
    if (owner.pid === real.helperPid) return reading(real.helper);
    if (owner.pid === process.pid) return reading(real.parent);
    throw new Error("the admission inspected an owner the model never recorded");
  };
}

/**
 * The model's verdict for a later controller. Only a proved death is taken
 * over: a dead parent of a settled claim, or any claim after a reboot. A live
 * owner (the parent, or the helper of an active claim) keeps it as active; an
 * unreadable owner or a possibly surviving helper keeps it as indeterminate.
 */
function verdict(claim: NonNullable<Model["claim"]>, rebooted: boolean): "take-over" | "active" | "indeterminate" {
  if (rebooted) return "take-over";
  if (claim.parent === "live") return "active";
  if (claim.parent === "unknown") return "indeterminate";
  if (claim.phase === "parent-owned") return "take-over";
  if (claim.phase === "helper-active" && claim.helperStatus === "live") return "active";
  return "indeterminate";
}

type OnDisk = null | { readonly id: string; readonly phase: Phase; readonly helper: boolean };

function onDisk(real: Real): OnDisk {
  if (!existsSync(real.claimPath)) return null;
  const claim = JSON.parse(readFileSync(real.claimPath, "utf8")) as {
    readonly id: string;
    readonly phase: Phase;
    readonly helperOwner: unknown;
  };
  return { id: claim.id, phase: claim.phase, helper: claim.helperOwner !== null };
}

function check(model: Model, real: Real): void {
  const disk = onDisk(real);
  if (model.claim === null) {
    expect(disk).toBeNull();
    return;
  }
  const holder = real.admissions[model.claim.holder]!;
  expect(disk).toEqual({ id: holder.claimId, phase: model.claim.phase, helper: model.claim.helper });
}

/** The current holder, when its parent is alive to act. */
function actingHolder(model: Readonly<Model>): number | null {
  return model.claim !== null && model.claim.parent === "live" ? model.claim.holder : null;
}

function acquire(model: Model, real: Real, rebooted: boolean): void {
  const before = onDisk(real);
  const expected = model.claim === null ? "take-over" : verdict(model.claim, rebooted);
  const attempt = (): BeeperMessageLikeMeExportAdmission => acquireBeeperMessageLikeMeExportAdmission({
    environment: real.environment,
    inspectOwnerForTest: inspector(real, rebooted),
    currentBootIdForTest: rebooted ? REBOOTED_BOOT_ID : BOOT_ID,
  });
  if (expected === "take-over") {
    const admission = attempt();
    expect(admission.claimPath).toBe(real.claimPath);
    real.admissions.push(admission);
    real.parent = "live";
    real.helper = "live";
    model.claim = { holder: real.admissions.length - 1, phase: "parent-owned", helper: false, parent: "live", helperStatus: "live" };
    check(model, real);
    return;
  }
  expect(attempt).toThrow(expected === "active" ? "another export is active" : "prior export owner cannot be inspected safely");
  // A refused controller leaves the retained claim byte for byte.
  expect(onDisk(real)).toEqual(before);
  check(model, real);
}

class AcquireCommand implements fc.Command<Model, Real> {
  check(): boolean {
    return true;
  }

  run(model: Model, real: Real): void {
    acquire(model, real, false);
  }

  toString(): string {
    return "acquire";
  }
}

/**
 * The machine reboots and a controller in the new boot takes the claim over,
 * then settles and releases it. The model returns to the original boot with no
 * claim, which is indistinguishable from a fresh boot.
 */
class RebootCommand implements fc.Command<Model, Real> {
  check(): boolean {
    return true;
  }

  run(model: Model, real: Real): void {
    acquire(model, real, true);
    releaseBeeperMessageLikeMeExportAdmission(real.admissions.at(-1)!);
    model.claim = null;
    check(model, real);
  }

  toString(): string {
    return "reboot";
  }
}

type Lifecycle = "begin" | "bind" | "settle" | "unsafe" | "release";

function lifecycleAllowed(claim: NonNullable<Model["claim"]>, step: Lifecycle): boolean {
  switch (step) {
    case "begin":
      return claim.phase === "parent-owned";
    case "bind":
      return claim.phase === "helper-launching";
    case "settle":
      return claim.phase === "helper-launching" || claim.phase === "helper-active";
    case "unsafe":
      return claim.phase === "helper-launching" || claim.phase === "helper-active";
    case "release":
      return claim.phase === "parent-owned";
  }
}

/** The live holder moves its claim through one lifecycle step. */
class LifecycleCommand implements fc.Command<Model, Real> {
  constructor(readonly step: Lifecycle) {}

  check(model: Readonly<Model>): boolean {
    return actingHolder(model) !== null && lifecycleAllowed(model.claim!, this.step);
  }

  run(model: Model, real: Real): void {
    const claim = model.claim!;
    const admission = real.admissions[claim.holder]!;
    switch (this.step) {
      case "begin":
        beginBeeperMessageLikeMeHelperLaunch(admission);
        claim.phase = "helper-launching";
        break;
      case "bind":
        bindBeeperMessageLikeMeHelperOwner(admission, real.helperPid);
        claim.phase = "helper-active";
        claim.helper = true;
        claim.helperStatus = "live";
        real.helper = "live";
        break;
      case "settle":
        settleBeeperMessageLikeMeHelper(admission);
        claim.phase = "parent-owned";
        claim.helper = false;
        break;
      case "unsafe":
        markBeeperMessageLikeMeHelperCleanupUnsafe(admission);
        claim.phase = "cleanup-unsafe";
        break;
      case "release":
        releaseBeeperMessageLikeMeExportAdmission(admission);
        model.claim = null;
        break;
    }
    check(model, real);
  }

  toString(): string {
    return this.step;
  }
}

/** The parent or the helper dies, or its liveness becomes unreadable. */
class LivenessCommand implements fc.Command<Model, Real> {
  constructor(readonly who: "parent" | "helper", readonly status: Exclude<Liveness, "live">) {}

  check(model: Readonly<Model>): boolean {
    if (model.claim === null) return false;
    return this.who === "parent" ? model.claim.parent === "live" : model.claim.helper && model.claim.helperStatus === "live";
  }

  run(model: Model, real: Real): void {
    if (this.who === "parent") {
      model.claim!.parent = this.status;
      real.parent = this.status;
    } else {
      model.claim!.helperStatus = this.status;
      real.helper = this.status;
    }
    check(model, real);
  }

  toString(): string {
    return `${this.who}-${this.status}`;
  }
}

/**
 * A controller whose claim was taken over or released tries one lifecycle
 * step with its stale admission. Its compare-and-swap must fail and leave the
 * current claim alone.
 */
class StaleCommand implements fc.Command<Model, Real> {
  constructor(readonly pick: number, readonly step: Lifecycle) {}

  check(): boolean {
    return true;
  }

  run(model: Model, real: Real): void {
    const stale = real.admissions.filter((_admission, index) => index !== model.claim?.holder && !_admission.released);
    if (stale.length === 0) return;
    const admission = stale[this.pick % stale.length]!;
    const before = onDisk(real);
    const attempt = (): void => {
      switch (this.step) {
        case "begin":
          return beginBeeperMessageLikeMeHelperLaunch(admission);
        case "bind":
          return bindBeeperMessageLikeMeHelperOwner(admission, real.helperPid);
        case "settle":
          return settleBeeperMessageLikeMeHelper(admission);
        case "unsafe":
          return markBeeperMessageLikeMeHelperCleanupUnsafe(admission);
        case "release":
          return releaseBeeperMessageLikeMeExportAdmission(admission);
      }
    };
    expect(attempt).toThrow();
    expect(onDisk(real)).toEqual(before);
    check(model, real);
  }

  toString(): string {
    return `stale-${this.step}(${String(this.pick)})`;
  }
}

const lifecycle = fc.constantFrom<Lifecycle>("begin", "bind", "settle", "unsafe", "release");
const commands = fc.commands([
  fc.constant(new AcquireCommand()),
  fc.constant(new RebootCommand()),
  lifecycle.map((step) => new LifecycleCommand(step)),
  fc.tuple(fc.constantFrom<"parent" | "helper">("parent", "helper"), fc.constantFrom<"dead" | "unknown">("dead", "unknown"))
    .map(([who, status]) => new LivenessCommand(who, status)),
  fc.tuple(fc.nat(7), lifecycle).map(([pick, step]) => new StaleCommand(pick, step)),
], { maxCommands: 10 });

describe("Beeper Message Like Me export admission stateful model", () => {
  test("retains a live or indeterminate owner and takes over only after death is proved", () => {
    const helper = Bun.spawn(["sleep", "600"], { stdout: "ignore", stderr: "ignore" });
    try {
      assertProperty(fc.property(commands, (sequence) => {
        const root = realpathSync(mkdtempSync(join(tmpdir(), "ghostget-recovery-model-")));
        chmodSync(root, 0o700);
        try {
          const real: Real = {
            environment: Object.freeze({ GHOSTGET_STATE_HOME: join(root, "state") }),
            helperPid: helper.pid,
            admissions: [],
            claimPath: join(root, "state", "recovery", "beeper-message-like-me-export-admission", "active.json"),
            parent: "live",
            helper: "live",
          };
          fc.modelRun(() => ({ model: { claim: null }, real }), sequence);
        } finally {
          rmSync(root, { recursive: true, force: true });
        }
      }), { numRuns: 10, interruptAfterTimeLimit: 150_000 });
    } finally {
      helper.kill(9);
    }
  });
});
