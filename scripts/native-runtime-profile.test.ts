import { expect, test } from "bun:test";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { assertSourceExclusionsUnreachable, generateNativeRuntimeProfile, resolveNativeRuntimePackageRoot } from "./native-runtime-profile";
import { createProviderPluginRegistry } from "../src/provider-plugin-registry";
import xPlugin from "../src/plugins/x-web/plugin";
import { parseRuntimeManifest } from "../src/model";

const repository = resolve(import.meta.dir, "..");
test("native dependency discovery skips nameless subpath manifests within the real package boundary", () => {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "ghostget-native-package-")));
  try {
    for (const name of ["example", "@fixture/example"]) {
      const dependency = join(root, "node_modules", name);
      const subpath = join(dependency, "Effect", "nested"); mkdirSync(subpath, { recursive: true });
      writeFileSync(join(dependency, "package.json"), JSON.stringify({ name, version: "1.2.3", dependencies: { other: "^1.0.0" } }));
      writeFileSync(join(dependency, "Effect", "package.json"), JSON.stringify({ type: "module", sideEffects: [], main: "../dist/cjs/Effect.js" }));
      const input = join(subpath, "index.js"); writeFileSync(input, "export {};\n");
      expect(resolveNativeRuntimePackageRoot(input)).toBe(dependency);
    }
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("native dependency discovery rejects malformed identities and cannot ascend beyond the package", () => {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "ghostget-native-package-invalid-")));
  try {
    const dependency = join(root, "node_modules", "example"), subpath = join(dependency, "subpath");
    mkdirSync(subpath, { recursive: true });
    writeFileSync(join(root, "package.json"), JSON.stringify({ name: "outside-package", version: "9.9.9" }));
    const input = join(subpath, "index.js"); writeFileSync(input, "export {};\n");
    writeFileSync(join(subpath, "package.json"), JSON.stringify({ type: "module" }));
    for (const manifest of [{}, { name: "example" }, { version: "1.2.3" }, { name: null, version: "1.2.3" },
      { name: "../escape", version: "1.2.3" }, { name: "example\n", version: "1.2.3" }, { name: "example", version: "" }, { name: "example", version: 123 },
      { name: "example", version: "1.2.3\n" }, { name: "example", version: "1.2.3-." }, { name: "example", version: "1.2.3-01" },
      { name: "example", version: "1.2.3", dependencies: [] }, null, []]) {
      writeFileSync(join(dependency, "package.json"), JSON.stringify(manifest));
      expect(() => resolveNativeRuntimePackageRoot(input)).toThrow();
    }
    writeFileSync(join(dependency, "package.json"), JSON.stringify({ name: "example", version: "1.2.3" }));
    writeFileSync(join(subpath, "package.json"), JSON.stringify({ name: "partial-subpath" }));
    expect(() => resolveNativeRuntimePackageRoot(input)).toThrow("invalid name or version");
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("source asset exclusions reject reached dependencies and noncanonical paths", () => {
  const asset = "src/assets/messaging-runtime/imsg-darwin-arm64.gz";
  expect(() => assertSourceExclusionsUnreachable(["src/assets/messaging-runtime"], [join(repository, asset)]))
    .toThrow("reached host dependency");
  expect(() => assertSourceExclusionsUnreachable([asset], [join(repository, asset)]))
    .toThrow("reached host dependency");
  for (const path of ["src", "package.json", "/src/assets", "src/assets/../providers", "src/assets//messaging-runtime", "src/assets\\messaging-runtime"]) {
    expect(() => assertSourceExclusionsUnreachable([path], [])).toThrow();
  }
  expect(() => assertSourceExclusionsUnreachable([asset, asset], [])).toThrow("invalid native runtime source exclusions");
});

test("generated native projection loads the relocated X runtime and retains identity checks", async () => {
  const profileDocument = JSON.parse(readFileSync(join(repository, "native-runtime-profiles.json"), "utf8"));
  expect(await generateNativeRuntimeProfile()).toEqual(profileDocument);
  const profile = profileDocument.profiles["app-host-x-macos-arm64"] as { sourceExclude: string[]; packages: { name: string; version: string; exclude: string[] }[] };
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
import { appendFileSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { createProviderPluginRegistry } from "./src/provider-plugin-registry";
import x from "./src/plugins/x-web/plugin";
import { parseRuntimeManifest } from "./src/model";
import { createClassifiedCookieRecordReader } from "./src/cookie-access";
import { AppHostService } from "./src/app-host-service";
import { admitAppHostState } from "./src/app-host-state";
import { createAuth, saveAuth } from "./src/auth";
import { installManifest } from "./src/storage";
import { AppHostXService } from "./src/app-host-x-service";
import { APP_HOST_X_FEEDS, APP_HOST_X_ACTIONS } from "./src/app-host-x-protocol";
import * as appRuntime from "./src/runtime";
import { prepareReadInvocation, executeReadInvocation, readRunReceipt, listRunReceipts, repairInterruptedRunJournals } from "./src/runtime";
import { createRunJournal, initialRunJournal, transitionRunJournal } from "./src/run-journal";
import { projectXSocialPost, projectXSocialProfile } from "./src/providers/x-web-model";
import { minimalPngBytes } from "./src/providers/x-image-provenance";
import { isPlanBoundFile, summarizePlanFile } from "./src/plan-assets";
const registry = createProviderPluginRegistry([x]);
const binding = registry.requireRoute("web-session-api", "x");
const identity = { contract: registry.contractImplementationHash(binding).toString("hex"), closure: registry.implementationClosureHash(binding), implementation: registry.implementationHash(binding).toString("hex") };
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
// Exercise the injected X registry beyond startup: no browser or network is
// used, but preparation, execution, receipts, recovery and cancellation are real.
const manifest = parseRuntimeManifest(JSON.parse(readFileSync("src/assets/adapters/x/wrench-web-adapter.json", "utf8")), registry);
if (!manifest.ok) throw new Error("current X manifest failed");
installManifest(manifest.value, { force: false, registry, environment: process.env });
saveAuth(createAuth("projection-fixture", { source: "chrome", profile: "Default", subject: "123" }), process.env);
const account = { id: "projection-fixture", provider: "x" as const, subject: "123", displayName: "@fixture", browser: "chrome", profile: "Default", revision: "a".repeat(64), status: "configured" as const, identityVerification: "at-connection" as const, disconnectDigest: "b".repeat(64) };
const actor = { accountId: account.id, expectedAccountRevision: account.revision };
const fixtureProfile = projectXSocialProfile({ __typename: "User", rest_id: "123", core: { screen_name: "fixture", name: "Fixture" } });
const fixturePost = projectXSocialPost({ __typename: "Tweet", rest_id: "42", legacy: { full_text: "Synthetic relocation post", user_id_str: "123" } });
const preparedReads = new Set<string>();
// Every gateway request still passes real preparation against the installed
// current manifest. Only the provider dispatch boundary returns synthetic DTOs.
const runtime = { ...appRuntime, executeReadInvocation: async invocation => {
  preparedReads.add(invocation.operationId);
  const output = invocation.operationId === "profiles.read" ? { profile: fixtureProfile }
    : invocation.operationId === "posts.read" ? { post: fixturePost }
    : invocation.operationId === "contacts.list" ? { profiles: [fixtureProfile], cursor: null }
    : invocation.operationId === "explore.read" ? { modelVersion: 1, source: invocation.input.source, entries: [], cursor: null }
    : invocation.operationId === "notifications.list" ? { modelVersion: 1, source: "notifications", entries: [], cursor: null }
    : { posts: [fixturePost], cursor: null };
  return { receipt: { status: "succeeded" }, output };
} };
const xService = new AppHostXService(process.env, registry, () => account, async () => { throw new Error("relocation must not confirm a write"); }, Date.now, runtime);
try {
  const prepared = await xService.handle({ action: "x.action.prepare", intent: { action: "like", postId: "42" }, ...actor });
  if (prepared.kind !== "x-action" || prepared.state !== "prepared" || prepared.digest === null || prepared.preparationId === null) throw new Error("X preparation failed");
  const runId = crypto.randomUUID(), at = new Date().toISOString();
  const initial = initialRunJournal({ runId, planDigest: prepared.digest, adapter: { id: manifest.value.id, version: manifest.value.version, hash: "c".repeat(64) }, operation: "likes.set", risk: "R2", inputHash: "d".repeat(64), auth: { id: account.id, kind: "cookie-source", hash: "e".repeat(64) }, contract: { transport: "web-session-api", hash: "f".repeat(64) }, plannedDispatches: 1, hasPlanAssets: false, owner: { pid: 2147483647, token: crypto.randomUUID(), bootId: "1".repeat(64), processStartId: "2".repeat(64), leaseUntil: at }, startedAt: at, dedupeExpiresAt: at });
  const terminal = transitionRunJournal(transitionRunJournal(initial, { type: "confirmation-consumed", at }), { type: "finished", status: "failed", finalOrigin: null, error: "synthetic owner stopped before dispatch", at });
  createRunJournal(terminal, process.env);
  const repaired = repairInterruptedRunJournals(process.env);
  if (repaired.invalid !== 0 || repaired.issues.length !== 0 || repaired.projected < 1) throw new Error("X journal projection failed");
  if (readRunReceipt(runId, process.env).status !== "failed" || !listRunReceipts(process.env).some(receipt => !("invalid" in receipt) && receipt.runId === runId)) throw new Error("X receipt parsing failed");
  const status = await xService.handle({ action: "x.action.status", runId: "plan-" + prepared.digest, ...actor });
  if (status.kind !== "x-action" || status.state !== "uncertain") throw new Error("mismatched X receipt must remain uncertain");
  const cancelled = await xService.handle({ action: "x.action.cancel", preparationId: prepared.preparationId, ...actor });
  if (cancelled.kind !== "x-action" || cancelled.state !== "uncertain") throw new Error("X cancellation must retain journal evidence");
  const unused = await xService.handle({ action: "x.action.prepare", intent: { action: "like", postId: "43" }, ...actor });
  if (unused.kind !== "x-action" || unused.state !== "prepared" || unused.digest === null) throw new Error("unused X preparation failed");
  const unusedHandle = "plan-" + unused.digest;
  const denied = await xService.handle({ action: "x.action.cancel", preparationId: unusedHandle, ...actor });
  const deniedStatus = await xService.handle({ action: "x.action.status", runId: unusedHandle, ...actor });
  if (denied.kind !== "x-action" || denied.state !== "denied" || deniedStatus.kind !== "x-action" || deniedStatus.state !== "denied") throw new Error("unused X cancellation failed");
  if (process.env.FULL_GATEWAY === "1") {
  const capabilities = await xService.handle({ action: "x.capabilities", ...actor });
  if (capabilities.kind !== "x-capabilities") throw new Error("X capabilities failed");
  const supported = name => capabilities.capabilities.some(item => item.name === name && item.supported);
  await xService.handle({ action: "x.profile.get", profile: null, ...actor });
  await xService.handle({ action: "x.profile.get", profile: "@fixture", ...actor });
  await xService.handle({ action: "x.post.get", postId: "42", ...actor });
  for (const source of APP_HOST_X_FEEDS.filter(supported)) await xService.handle({ action: "x.feed.list", source, profile: null, cursor: null, limit: 20, ...actor });
  for (const source of ["trending", "today-news"].filter(supported)) await xService.handle({ action: "x.explore.list", source, target: null, cursor: null, limit: 20, ...actor });
  if (supported("notifications")) await xService.handle({ action: "x.notifications.list", cursor: null, limit: 20, ...actor });
  for (const action of APP_HOST_X_ACTIONS.filter(supported)) {
    const intent = action === "post" ? { action, text: "Synthetic relocation draft", media: [] }
      : action === "reply" || action === "quote" ? { action, text: "Synthetic relocation draft", postId: "42", media: [] }
      : action === "follow" || action === "unfollow" ? { action, subject: "456" }
      : { action, postId: "42" };
    const prepared = await xService.handle({ action: "x.action.prepare", intent, ...actor });
    if (prepared.kind !== "x-action" || prepared.state !== "prepared" || prepared.preparationId === null) throw new Error("gateway action preparation failed: " + action);
    await xService.handle({ action: "x.action.cancel", preparationId: prepared.preparationId, ...actor });
  }
  for (const operation of ["profiles.read", "posts.read", "feeds.read", "contacts.list", "explore.read", "notifications.list"]) if (!preparedReads.has(operation)) throw new Error("gateway preparation coverage missing: " + operation);
  const pngPath = process.cwd() + "/synthetic-relocation.png";
  writeFileSync(pngPath, minimalPngBytes(), { mode: 0o600 });
  const staged = await xService.handle({ action: "x.media.prepare", files: [{ path: pngPath, mediaType: "image/png" }], ...actor });
  if (staged.kind !== "x-media" || staged.media.length !== 1) throw new Error("gateway PNG staging failed");
  const attachment = staged.media[0];
  const mediaPlan = await xService.handle({ action: "x.action.prepare", intent: { action: "post", text: "Synthetic PNG relocation draft", media: [attachment.mediaId] }, ...actor });
  if (mediaPlan.kind !== "x-action" || mediaPlan.state !== "prepared" || mediaPlan.digest === null || mediaPlan.preparationId === null) throw new Error("gateway PNG preparation failed");
  const saved = appRuntime.loadInvocationPlan(mediaPlan.digest, process.env);
  if (!isPlanBoundFile(saved.plan.input.media)) throw new Error("gateway PNG plan did not bind its file bytes");
  const summary = summarizePlanFile(saved.plan.input.media);
  if (summary.sha256 !== attachment.sha256 || summary.bytes !== attachment.byteLength || summary.mediaType !== "image/png") throw new Error("gateway PNG plan changed staged bytes");
  const cancelledMedia = await xService.handle({ action: "x.action.cancel", preparationId: mediaPlan.preparationId, ...actor });
  if (cancelledMedia.kind !== "x-action" || cancelledMedia.state !== "denied") throw new Error("unused gateway PNG plan cancellation failed");
  }
} finally { xService.close(); }
const read = prepareReadInvocation(manifest.value.id, "feeds.read", { feed: "following", limit: 1 }, account.id, process.env, registry);
const result = await executeReadInvocation(read, { headed: false, environment: process.env, registry, executeWebSession: async () => ({ status: "succeeded", output: { posts: [] }, finalUrl: "https://x.com/home", dispatchStarted: false, dispatch: { planned: 0, started: 0, verified: 0 } }) });
if (result.receipt.status !== "succeeded" || readRunReceipt(result.receipt.runId, process.env).status !== "succeeded") throw new Error("X read execution failed");
console.log(JSON.stringify({ ...identity, manifests }));
`);
    const environment = { PATH: "/usr/bin:/bin", HOME: root, XDG_CONFIG_HOME: root, GHOSTGET_STATE_HOME: join(root, "state") };
    let runNumber = 0;
    const run = (mutate: string, isolated = true) => {
      const fullGateway = isolated && mutate === "0";
      return Bun.spawnSync([process.execPath, ...(isolated ? ["--config=/dev/null"] : []), "--no-env-file", "--no-install", "probe.ts"], { cwd: consumer, env: { ...environment, GHOSTGET_STATE_HOME: join(root, `state-${runNumber++}`), MUTATE: mutate, FULL_GATEWAY: fullGateway ? "1" : "0" }, timeout: fullGateway ? 30_000 : 20_000 });
    };
    const completeDefault = Bun.spawnSync([process.execPath, "--config=/dev/null", "--no-env-file", "--no-install", "--eval", 'const {providerPluginRegistry:registry}=await import("./src/provider-plugins.ts"); if (!Object.isFrozen(registry) || registry.get("x-web")?.id !== "x-web") throw new Error("trusted registry failed");'], { cwd: consumer, env: environment, timeout: 20_000 });
    expect(completeDefault.stderr.toString()).toBe(""); expect(completeDefault.exitCode).toBe(0);
    // Compare the exact registry-owned identity and lazy runtime before and
    // after dropping source assets. The bundler's static graph alone cannot
    // prove that implementationSources or runtime file URLs never use them.
    const complete = run("0", false);
    expect(complete.stderr.toString()).toBe(""); expect(complete.exitCode).toBe(0);
    expect(existsSync(join(consumer, "src/assets/messaging-runtime/imsg-darwin-arm64.gz"))).toBe(true);
    expect(existsSync(join(consumer, "src/assets/messaging-runtime/wacli-darwin-arm64.gz"))).toBe(true);
    for (const path of profile.sourceExclude) rmSync(join(consumer, path), { recursive: true });
    expect(existsSync(join(consumer, "src/assets/messaging-runtime"))).toBe(false);
    const ordinary = run("0", false);
    expect(ordinary.stderr.toString()).toBe(""); expect(ordinary.exitCode).toBe(0);
    expect(JSON.parse(ordinary.stdout.toString())).toEqual(JSON.parse(complete.stdout.toString()));
    writeFileSync(join(root, "ambient-preload.ts"), 'throw new Error("ambient Bun configuration executed");\n');
    writeFileSync(join(root, ".bunfig.toml"), `preload = [${JSON.stringify(join(root, "ambient-preload.ts"))}]\n`);
    const loaded = run("0");
    expect(loaded.stderr.toString()).toBe(""); expect(loaded.exitCode).toBe(0);
    const identity = JSON.parse(loaded.stdout.toString());
    expect(identity.manifests).toEqual(expectedManifests);
    expect(identity.contract).toBe(expectedContract); expect(identity.closure).toMatch(/^[a-f0-9]{64}$/);
    const ordinaryIdentity = JSON.parse(ordinary.stdout.toString());
    expect(identity.contract).toBe(ordinaryIdentity.contract);
    expect(identity.closure).toBe(ordinaryIdentity.closure);
    expect(identity.implementation).not.toBe(ordinaryIdentity.implementation);
    expect(run("1").exitCode).toBe(17);
    cpSync(join(repository, "src/providers/x-web-runtime.ts"), join(consumer, "src/providers/x-web-runtime.ts"));
    expect(run("package").exitCode).toBe(17);
    cpSync(join(repository, "node_modules/@hraness/wordcell/package.json"), join(consumer, "node_modules/@hraness/wordcell/package.json"));
    rmSync(join(consumer, "node_modules/typescript"), { recursive: true });
    expect(run("0").exitCode).not.toBe(0);
  } finally { rmSync(root, { recursive: true, force: true }); }
});
