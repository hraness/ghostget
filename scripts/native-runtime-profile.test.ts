import { expect, test } from "bun:test";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { generateNativeRuntimeProfile } from "./native-runtime-profile";
import { createProviderPluginRegistry } from "../src/provider-plugin-registry";
import xPlugin from "../src/plugins/x-web/plugin";
import { parseRuntimeManifest } from "../src/model";

const repository = resolve(import.meta.dir, "..");
test("generated native projection loads the relocated X runtime and retains identity checks", async () => {
  const profileDocument = JSON.parse(readFileSync(join(repository, "native-runtime-profiles.json"), "utf8"));
  expect(await generateNativeRuntimeProfile()).toEqual(profileDocument);
  const profile = profileDocument.profiles["app-host-x-macos-arm64"] as { packages: { name: string; version: string; exclude: string[] }[] };
  const registry = createProviderPluginRegistry([xPlugin]);
  const expectedContract = registry.contractImplementationHash(registry.requireRoute("web-session-api", "x")).toString("hex");
  const expectedManifests = Object.fromEntries(readdirSync(join(repository, "src/assets/adapters/x")).filter(name => name.endsWith(".json")).map(name => [name, parseRuntimeManifest(JSON.parse(readFileSync(join(repository, "src/assets/adapters/x", name), "utf8")), registry).ok]));
  expect(expectedManifests["wrench-web-adapter.json"]).toBe(true);
  const root = realpathSync(mkdtempSync(join(tmpdir(), "ghostget-native-runtime-")));
  try {
    const consumer = join(root, "consumer"); mkdirSync(consumer);
    for (const path of ["src", "package.json", "tsconfig.json", "bunfig.toml"]) cpSync(join(repository, path), join(consumer, path), { recursive: true });
    for (const dependency of profile.packages) {
      const source = join(repository, "node_modules", dependency.name);
      expect(JSON.parse(readFileSync(join(source, "package.json"), "utf8")).version).toBe(dependency.version);
      const target = join(consumer, "node_modules", dependency.name);
      mkdirSync(dirname(target), { recursive: true });
      cpSync(source, target, { recursive: true, dereference: true });
      for (const path of dependency.exclude) rmSync(join(target, path), { recursive: true });
    }
    writeFileSync(join(consumer, "probe.ts"), `
import { appendFileSync, readFileSync, readdirSync } from "node:fs";
import { createProviderPluginRegistry } from "./src/provider-plugin-registry";
import x from "./src/plugins/x-web/plugin";
import { parseRuntimeManifest } from "./src/model";
import { createClassifiedCookieRecordReader } from "./src/cookie-access";
import { AppHostService } from "./src/app-host-service";
import { admitAppHostState } from "./src/app-host-state";
const registry = createProviderPluginRegistry([x]);
const binding = registry.requireRoute("web-session-api", "x");
const identity = { contract: registry.contractImplementationHash(binding).toString("hex"), closure: registry.implementationClosureHash(binding) };
if (process.env.MUTATE === "package") appendFileSync("node_modules/@hraness/wordcell/package.json", " ");
if (process.env.MUTATE === "1") appendFileSync("src/providers/x-web-runtime.ts", "\\n// changed after registry snapshot\\n");
try { await binding.loadRuntime(); } catch (error) { if (process.env.MUTATE !== "0" && /changed|identity|closure/.test(String(error))) process.exit(17); throw error; }
const manifests: Record<string, boolean> = {};
for (const asset of readdirSync("src/assets/adapters/x").filter(name => name.endsWith(".json"))) {
  manifests[asset] = parseRuntimeManifest(JSON.parse(readFileSync("src/assets/adapters/x/" + asset, "utf8")), registry).ok;
}
const cookies = await createClassifiedCookieRecordReader(async () => ({ cookies: [{ name: "sid", value: "fixture", domain: "example.com", hostOnly: true, path: "/", secure: true, httpOnly: true }], warnings: [] }), { platform: "linux" })({ cookieSources: ["chrome"], cookieProfile: undefined, cookiesFile: undefined, timeoutMs: 1000 }, new URL("https://example.com/"));
if (cookies.cookies.length !== 1) throw new Error("synthetic cookie-reader path failed");
admitAppHostState("com.example.projection", process.env);
const host = new AppHostService("com.example.projection", process.env);
if ((await host.handle({action:"hello"})).kind !== "hello") throw new Error("host hello failed");
const accounts = await host.handle({action:"accounts.list"});
if (accounts.kind !== "accounts" || accounts.accounts.length !== 0) throw new Error("isolated accounts failed");
await host.handle({action:"close"});
console.log(JSON.stringify({ ...identity, manifests }));
`);
    const environment = { PATH: "/usr/bin:/bin", HOME: root, GHOSTGET_STATE_HOME: join(root, "state") };
    const run = (mutate: string) => Bun.spawnSync([process.execPath, "--no-env-file", "--no-install", "probe.ts"], { cwd: consumer, env: { ...environment, MUTATE: mutate }, timeout: 20_000 });
    const loaded = run("0");
    expect(loaded.stderr.toString()).toBe(""); expect(loaded.exitCode).toBe(0);
    const identity = JSON.parse(loaded.stdout.toString());
    expect(identity.manifests).toEqual(expectedManifests);
    expect(identity.contract).toBe(expectedContract); expect(identity.closure).toMatch(/^[a-f0-9]{64}$/);
    expect(run("1").exitCode).toBe(17);
    cpSync(join(repository, "src/providers/x-web-runtime.ts"), join(consumer, "src/providers/x-web-runtime.ts"));
    expect(run("package").exitCode).toBe(17);
    cpSync(join(repository, "node_modules/@hraness/wordcell/package.json"), join(consumer, "node_modules/@hraness/wordcell/package.json"));
    rmSync(join(consumer, "node_modules/typescript"), { recursive: true });
    expect(run("0").exitCode).not.toBe(0);
  } finally { rmSync(root, { recursive: true, force: true }); }
});
