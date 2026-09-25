/**
 * A stateful model of private-state compare-and-swap, run against the real
 * bound state helper.
 *
 * Each generated schedule interleaves writers and removers that hold a
 * snapshot hash picked from everything the file has ever held (so most are
 * stale), an admitted unconditional writer that recreates the file, and a
 * swap of the file for a symbolic link to a file outside the state layout
 * whose bytes match a snapshot. The model predicts every result from the
 * exact current bytes alone: a conditional write or removal succeeds only when
 * the file exists as a regular file and its bytes hash to the snapshot, a
 * symbolic link is refused by a throw, and a refusal changes nothing. After
 * every command the file's bytes, or its absence, must equal the model, and
 * the link target must keep its bytes.
 *
 * Genuinely overlapping cross-process writers are covered by the example test
 * "admits exactly one overlapping cross-process writer for an exact snapshot"
 * in `src/storage-cas.test.ts`; this model covers every sequential
 * interleaving of stale and current snapshots.
 */
import { afterEach, describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { chmodSync, existsSync, lstatSync, mkdtempSync, readFileSync, rmSync, symlinkSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  ensurePrivateStateDirectory,
  ghostgetStateHome,
  removePrivateStateFileIfUnchanged,
  writePrivateJson,
  writePrivateJsonIfUnchanged,
} from "./storage";
import { assertProperty, fc, type Command } from "./test-support";

const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

type Model = {
  /** The file's exact bytes, or null when it is absent. */
  current: string | null;
  /** True while the path is a symbolic link to `outside`. */
  linked: boolean;
  /** Every hash the file has held, oldest first; writers pick snapshots from it. */
  history: string[];
};

type Real = {
  readonly environment: Readonly<Record<string, string | undefined>>;
  readonly path: string;
  readonly outside: string;
};

const hash = (bytes: string | Buffer): string => createHash("sha256").update(bytes).digest("hex");

/** The file as it is on disk: its bytes, absent, or a symbolic link. */
function observed(path: string): string | null | "link" {
  if (!existsSync(path) && !isLink(path)) return null;
  if (isLink(path)) return "link";
  return readFileSync(path, "utf8");
}

function isLink(path: string): boolean {
  try {
    return lstatSync(path).isSymbolicLink();
  } catch {
    return false;
  }
}

function check(model: Readonly<Model>, real: Real, outsideBytes: string): void {
  expect(observed(real.path)).toBe(model.linked ? "link" : model.current);
  expect(readFileSync(real.outside, "utf8")).toBe(outsideBytes);
}

const OUTSIDE_BYTES = `${JSON.stringify({ version: 0 })}\n`;

/**
 * The snapshot a writer holds: `pick` counts back from the newest hash, so a
 * small pick is usually current and a larger one usually stale.
 */
function snapshotAt(model: Readonly<Model>, pick: number): string {
  return model.history[model.history.length - 1 - (pick % model.history.length)]!;
}

/** A snapshot writer: it holds a snapshot picked by `snapshotAt` and writes `{ version }`. */
class ConditionalWrite implements Command<Model, Real> {
  constructor(readonly pick: number, readonly version: number) {}
  check(): boolean {
    return true;
  }
  run(model: Model, real: Real): void {
    const snapshot = snapshotAt(model, this.pick);
    if (model.linked) {
      expect(() => writePrivateJsonIfUnchanged(real.path, { version: this.version }, { expectedCurrentContentSha256: snapshot }))
        .toThrow();
    } else {
      const expected = model.current !== null && hash(model.current) === snapshot;
      expect(writePrivateJsonIfUnchanged(real.path, { version: this.version }, { expectedCurrentContentSha256: snapshot }))
        .toBe(expected);
      if (expected) {
        model.current = readFileSync(real.path, "utf8");
        model.history.push(hash(model.current));
      }
    }
    check(model, real, OUTSIDE_BYTES);
  }
  toString(): string {
    return `ConditionalWrite(${String(this.pick)}, ${String(this.version)})`;
  }
}

/** A snapshot remover: it holds a snapshot picked by `snapshotAt`. */
class ConditionalRemove implements Command<Model, Real> {
  constructor(readonly pick: number) {}
  check(): boolean {
    return true;
  }
  run(model: Model, real: Real): void {
    const snapshot = snapshotAt(model, this.pick);
    if (model.linked) {
      expect(() => removePrivateStateFileIfUnchanged(real.path, { expectedCurrentContentSha256: snapshot }, real.environment))
        .toThrow();
    } else {
      const expected = model.current !== null && hash(model.current) === snapshot;
      expect(removePrivateStateFileIfUnchanged(real.path, { expectedCurrentContentSha256: snapshot }, real.environment))
        .toBe(expected);
      if (expected) model.current = null;
    }
    check(model, real, OUTSIDE_BYTES);
  }
  toString(): string {
    return `ConditionalRemove(${String(this.pick)})`;
  }
}

/** An admitted unconditional writer, which is how a removed file comes back. */
class Recreate implements Command<Model, Real> {
  constructor(readonly version: number) {}
  check(model: Readonly<Model>): boolean {
    return !model.linked;
  }
  run(model: Model, real: Real): void {
    writePrivateJson(real.path, { version: this.version });
    model.current = readFileSync(real.path, "utf8");
    model.history.push(hash(model.current));
    check(model, real, OUTSIDE_BYTES);
  }
  toString(): string {
    return `Recreate(${String(this.version)})`;
  }
}

/**
 * Replace the file with a symbolic link to a file outside the state layout.
 * The outside file holds `{ version: 0 }`, and that hash joins the history, so
 * a later writer can hold exactly the bytes the link resolves to.
 */
class SwapForLink implements Command<Model, Real> {
  check(model: Readonly<Model>): boolean {
    return !model.linked;
  }
  run(model: Model, real: Real): void {
    if (model.current !== null) unlinkSync(real.path);
    symlinkSync(real.outside, real.path);
    model.linked = true;
    model.history.push(hash(OUTSIDE_BYTES));
    check(model, real, OUTSIDE_BYTES);
  }
  toString(): string {
    return "SwapForLink";
  }
}

/** Remove the link and put back the file's last bytes. */
class RestoreFromLink implements Command<Model, Real> {
  check(model: Readonly<Model>): boolean {
    return model.linked;
  }
  run(model: Model, real: Real): void {
    unlinkSync(real.path);
    if (model.current !== null) writeFileSync(real.path, model.current, { mode: 0o600 });
    model.linked = false;
    check(model, real, OUTSIDE_BYTES);
  }
  toString(): string {
    return "RestoreFromLink";
  }
}

/** Small versions so that two writers can produce the same bytes (A-B-A). */
const version = fc.integer({ min: 1, max: 4 });
const pick = fc.nat({ max: 7 });

const commands = fc.commands([
  fc.tuple(pick, version).map(([index, value]) => new ConditionalWrite(index, value)),
  pick.map((index) => new ConditionalRemove(index)),
  version.map((value) => new Recreate(value)),
  fc.constant(new SwapForLink()),
  fc.constant(new RestoreFromLink()),
], { maxCommands: 8, size: "max" });

function stateHome(): Real & { readonly initial: string } {
  const root = mkdtempSync(join(tmpdir(), "ghostget-storage-cas-model-"));
  chmodSync(root, 0o700);
  roots.push(root);
  const environment = { ...process.env, GHOSTGET_STATE_HOME: root };
  const home = ghostgetStateHome(environment);
  ensurePrivateStateDirectory(join(home, "session-secrets"), environment);
  const path = join(home, "session-secrets", "value.json");
  const outside = join(home, "outside.json");
  writeFileSync(outside, OUTSIDE_BYTES, { mode: 0o600 });
  writePrivateJson(path, { version: 1 });
  return { environment, path, outside, initial: readFileSync(path, "utf8") };
}

/** Each run spawns the bound state helper once per command, so the runs stay few. */
const MODEL_PARAMETERS = { numRuns: 12, interruptAfterTimeLimit: 150_000 };

describe("private state compare-and-swap model", () => {
  // The model's shrink against a helper that recreated a missing file:
  // [ConditionalRemove(0), ConditionalWrite(0, 1)].
  test("a writer holding the snapshot of a removed file does not resurrect it", () => {
    const real = stateHome();
    const snapshot = hash(real.initial);
    expect(removePrivateStateFileIfUnchanged(real.path, { expectedCurrentContentSha256: snapshot }, real.environment)).toBeTrue();
    expect(writePrivateJsonIfUnchanged(real.path, { version: 2 }, { expectedCurrentContentSha256: snapshot })).toBeFalse();
    expect(existsSync(real.path)).toBeFalse();
  });

  test("stale snapshots never roll state back, resurrect a removed file, or follow a link", () => {
    assertProperty(fc.property(commands, (generated) => {
      const real = stateHome();
      fc.modelRun(() => ({
        model: { current: real.initial, linked: false, history: [hash(real.initial)] },
        real,
      }), generated);
    }), MODEL_PARAMETERS);
  });
});
