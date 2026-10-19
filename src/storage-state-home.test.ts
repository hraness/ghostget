import { afterEach, describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { existsSync, lstatSync, mkdirSync, mkdtempSync, readdirSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import { pathToFileURL } from "node:url";
import { assertProperty, fc } from "./test-support";

const fixtures: string[] = [];
const comparisonNames = ["Desktop", "Documents", "Downloads", "Library", ".cache", ".config", ".local"];
afterEach(() => { for (const root of fixtures.splice(0)) rmSync(root, { recursive: true, force: true }); });

function fixture() {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "ghostget-state-comparison-")));
  fixtures.push(root);
  const home = join(root, "home"), state = join(root, "ghostget-state"), data = join(root, "data");
  for (const path of [home, state, data]) mkdirSync(path, { mode: 0o700 });
  return { root, home, state, data };
}

/** Isolate module replacement and HOME. A realpath/open of a comparison root
 * fails immediately rather than requiring protected-folder access or hanging. */
function inspect(value: ReturnType<typeof fixture>, selected = value.state) {
  const childSource = `
    import fs from "node:fs";
    import { mock } from "bun:test";
    const comparisonRoots = ${JSON.stringify(comparisonNames)}.map(name => ${JSON.stringify(value.home)} + "/" + name);
    let opens = 0;
    const checked = (fn) => (...args) => {
      if (comparisonRoots.includes(String(args[0]))) { opens++; throw Error("comparison-root-opened"); }
      return fn(...args);
    };
    const realpath = checked(fs.realpathSync);
    realpath.native = checked(fs.realpathSync.native);
    mock.module("node:fs", () => ({ ...fs, realpathSync: realpath, openSync: checked(fs.openSync), default: fs }));
    const storage = await import(${JSON.stringify(pathToFileURL(join(import.meta.dir, "storage.ts")).href)});
    try {
      const environment = {GHOSTGET_STATE_HOME:${JSON.stringify(selected)}, XDG_DATA_HOME:${JSON.stringify(value.data)}};
      const root = storage.ghostgetStateHome(environment);
      const policy = storage.privateStateFilesMayExist("control", ["gateway-only.json"], environment);
      console.log(JSON.stringify({ok:true, root, policy, opens}));
    } catch (error) { console.log(JSON.stringify({ok:false, error:error.message, opens})); }
  `;
  const child = spawnSync(process.execPath, ["--no-env-file", "--no-install", "-e", childSource], {
    cwd: join(import.meta.dir, ".."),
    env: { HOME: value.home, PATH: "/usr/bin:/bin:/usr/sbin:/sbin", BUN_RUNTIME_TRANSPILER_CACHE_PATH: "0" },
    encoding: "utf8", timeout: 20_000, maxBuffer: 65_536,
  });
  expect(child.status).toBe(0);
  expect(child.stderr).toBe("");
  return JSON.parse(child.stdout) as { ok: boolean; root?: string; policy?: boolean; opens: number; error?: string };
}

describe("state-home comparison paths", () => {
  test("explicit state and optional policy inspection never open unrelated protected home roots", () => {
    const value = fixture();
    for (const name of comparisonNames) mkdirSync(join(value.home, name), { mode: 0o700 });
    const before = comparisonNames.map(name => lstatSync(join(value.home, name), { bigint: true }));
    expect(inspect(value)).toEqual({ ok: true, root: value.state, policy: false, opens: 0 });
    expect(readdirSync(value.state)).toEqual([]);
    expect(comparisonNames.map(name => lstatSync(join(value.home, name), { bigint: true }))).toEqual(before);
  });

  test("absolute and relative forbidden-root aliases still reject the same physical directory", () => {
    for (const absolute of [false, true]) {
      const value = fixture();
      symlinkSync(absolute ? value.state : relative(value.home, value.state), join(value.home, "Desktop"));
      const result = inspect(value);
      expect(result.ok).toBeFalse();
      expect(result.error).toContain("dedicated child directory");
      expect(result.opens).toBe(0);
      expect(readdirSync(value.state)).toEqual([]);
    }
  });

  test("symlink-target dot-dot follows the preceding physical alias before comparison", () => {
    const value = fixture();
    const outside = join(value.root, "outside"), nested = join(outside, "nested"), selected = join(outside, "ghostget-state");
    mkdirSync(nested, { recursive: true, mode: 0o700 }); mkdirSync(selected, { mode: 0o700 });
    symlinkSync(nested, join(value.home, "bridge"));
    symlinkSync("bridge/../ghostget-state", join(value.home, "Desktop"));
    const result = inspect(value, selected);
    expect(result.error).toContain("dedicated child directory");
    expect(result.opens).toBe(0);
    expect(existsSync(join(value.home, "ghostget-state"))).toBeFalse();
  });

  test("a missing comparison suffix stays uncreated and is still excluded as an explicit root", () => {
    const value = fixture(), absent = join(value.root, "future", "ghostget-state");
    symlinkSync(absent, join(value.home, "Desktop"));
    expect(inspect(value)).toEqual({ ok: true, root: value.state, policy: false, opens: 0 });
    expect(inspect(value, absent).error).toContain("dedicated child directory");
    expect(existsSync(join(value.root, "future"))).toBeFalse();
  });

  test("cyclic comparison aliases fail within the finite metadata bound", () => {
    const value = fixture();
    symlinkSync("Documents", join(value.home, "Desktop"));
    symlinkSync("Desktop", join(value.home, "Documents"));
    const result = inspect(value);
    expect(result.error).toContain("too many symbolic links");
    expect(result.opens).toBe(0);
    expect(readdirSync(value.state)).toEqual([]);
  });

  test("non-directory ancestors and missing-parent traversal never become a canonical comparison", () => {
    const value = fixture(), file = join(value.root, "ordinary-file");
    writeFileSync(file, "synthetic", { mode: 0o600 });
    symlinkSync(`${file}/child`, join(value.home, "Desktop"));
    expect(inspect(value).error).toContain("non-directory parent");
    rmSync(join(value.home, "Desktop"));
    symlinkSync("missing/../ghostget-state", join(value.home, "Desktop"));
    expect(inspect(value).error).toContain("unresolved parent");
    rmSync(join(value.home, "Desktop"));
    expect(inspect(value, `${file}/child`).ok).toBeFalse();
    expect(readdirSync(value.state)).toEqual([]);
  });

  test("comparison FIFO leaves are metadata only and selected FIFO roots fail before realpath", () => {
    const value = fixture(), fifo = join(value.home, "Desktop");
    const made = spawnSync("/usr/bin/mkfifo", [fifo], { timeout: 2000 });
    expect(made.status).toBe(0);
    expect(inspect(value)).toEqual({ ok: true, root: value.state, policy: false, opens: 0 });
    expect(inspect(value, fifo).error).toContain("non-directory ancestor");
    symlinkSync(fifo, join(value.root, "fifo-alias"));
    expect(inspect(value, join(value.root, "fifo-alias")).error).toContain("non-directory ancestor");
    expect(lstatSync(fifo).isFIFO()).toBeTrue();
  });

  test("bounded absolute and relative alias chains preserve the forbidden-root identity law", () => {
    assertProperty(fc.property(fc.integer({ min: 1, max: 8 }), fc.boolean(), (length, absolute) => {
      const value = fixture();
      for (let index = length - 1; index >= 0; index--) {
        const path = join(value.home, index === 0 ? "Desktop" : `alias-${index}`);
        const target = index === length - 1 ? value.state : join(value.home, `alias-${index + 1}`);
        symlinkSync(absolute ? target : relative(value.home, target), path);
      }
      const result = inspect(value);
      expect(result.error).toContain("dedicated child directory");
      expect(result.opens).toBe(0);
    }), { numRuns: 8 });
  });
});
