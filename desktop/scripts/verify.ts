import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { parseAgentBrowserEnvelope, readDirectBrowserContract, bindDirectBrowserContractEvidence, bindDirectScenarioCatalog, parseDirectNamedLayoutSample, parseDirectNamedLayoutContract, validateDirectNamedLayout } from "@hraness/direct/tooling/browser-verification";
import { parseDefinitionCoverageSnapshot, classifyCoverageEvidence } from "@hraness/direct/testing";
import { definition, SCENES, sectionFor } from "../direct/definition.ts";
import { serveDirect } from "./serve-direct.ts";
import { buildDesktop, desktopRoot } from "./build.ts";

/** Run only under the root owner's admitted browser lane. Owns its whole browser. */
async function verify() {
  const repository = resolve(desktopRoot, ".."); const browserPackage = JSON.parse(await readFile(join(repository, "node_modules/agent-browser/package.json"), "utf8")) as { version: string };
  const gitRead = (args: readonly string[]) => { const command = Bun.spawnSync(["git", ...args], { cwd: repository, stdin: "ignore", stdout: "pipe", stderr: "pipe" }); assert.equal(command.exitCode, 0, "Could not bind verification to repository state"); return command.stdout.toString().trim(); };
  const source = { head: gitRead(["rev-parse", "HEAD"]), dirty: gitRead(["status", "--porcelain"]).length > 0 };
  assert.equal(browserPackage.version, "0.32.3"); assert.ok(SCENES.length <= 8);
  await buildDesktop("native"); const server = await serveDirect();
  const scratch = await mkdtemp("/tmp/gg-direct-"); const socket = join(scratch, "socket"); await mkdir(socket); const config = join(scratch, "config.json"); await writeFile(config, "{}");
  const artifact = join(desktopRoot, "out", "verification", randomUUID()); await mkdir(artifact, { recursive: true });
  const session = `gg-${randomUUID().slice(0, 12)}`; const history: unknown[] = []; const manifests: Awaited<ReturnType<typeof readDirectBrowserContract>>["manifest"][] = []; const results: unknown[] = []; const exercised = new Set<string>(); let closed = false; let primaryFailure: unknown; let browserLaunched = false;
  const env: Record<string, string> = { PATH: process.env.PATH ?? "/usr/bin:/bin", HOME: process.env.HOME ?? "", TMPDIR: "/tmp", AGENT_BROWSER_SOCKET_DIR: socket, AGENT_BROWSER_IDLE_TIMEOUT_MS: "60000" };
  const prefix = [process.execPath, join(repository, "node_modules/.bin/agent-browser"), "--config", config, "--allowed-domains", "127.0.0.1", "--session", session, "--json"];
  const run = async (args: readonly string[]): Promise<unknown> => {
    const child = Bun.spawn([...prefix, ...args], { cwd: repository, env, stdin: "ignore", stdout: "pipe", stderr: "pipe" });
    const timer = setTimeout(() => child.kill(), 45000);
    try { const [output, error, exit] = await Promise.all([new Response(child.stdout).text(), new Response(child.stderr).text(), child.exited]); if (exit !== 0) { history.push({ args, exit, stdout: output.slice(-4000), stderr: error.slice(-2000) }); throw new Error(`Browser command failed: ${args[0]}`); } const data = parseAgentBrowserEnvelope(output); history.push({ args, exit, data });
      if (browserLaunched && args[0] !== "close") {
        assert.ok(data && typeof data === "object" && "lifecycle" in data && data.lifecycle && typeof data.lifecycle === "object");
        const lifecycle = data.lifecycle as Record<string, unknown>;
        assert.equal(lifecycle.relaunchedBrowser, false, "Owned browser was unexpectedly relaunched");
        assert.equal(lifecycle.restartedBackground, false, "Owned browser daemon was unexpectedly restarted");
        assert.equal(lifecycle.launched, false, "Owned browser was unexpectedly replaced");
      }
      return data; } finally { clearTimeout(timer); }
  };
  const browser = { evaluate: async (expression: string): Promise<unknown> => { const data = await run(["eval", expression]); if (!data || typeof data !== "object" || !("result" in data)) throw new Error("Invalid browser evaluation"); return data.result; } };
  const body = async () => String(await browser.evaluate("document.body.innerText"));
  const click = async (name: string) => { await run(["find", "role", "button", "click", "--name", name, "--exact"]); };
  const settle = async (scene: typeof SCENES[number]) => {
    const expected = { source: "scenario" as const, scenario: scene, route: sectionFor(scene) }; const deadline = Date.now() + 12000;
    let previous: Awaited<ReturnType<typeof readDirectBrowserContract>> | null = null;
    while (Date.now() < deadline) {
      const sample = await readDirectBrowserContract(browser, expected);
      assert.ok(parseDefinitionCoverageSnapshot(sample.manifest.coverage, definition).ok);
      if (sample.probe.isQuiescent && Object.values(sample.probe.pending).every(value => value === 0) && Object.values(sample.probe.violations).every(value => value === 0)) {
        if (previous && JSON.stringify(previous.probe) === JSON.stringify(sample.probe)) return sample;
        previous = sample;
      } else previous = null;
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    throw new Error(`Direct did not reach stable quiescence: ${scene}`);
  };
  const tabs = (value: unknown): { tabId: string; url: string }[] => {
    if (!value || typeof value !== "object" || !("tabs" in value) || !Array.isArray(value.tabs)) throw new Error("Invalid tab inventory");
    return value.tabs.map((tab: unknown) => { if (!tab || typeof tab !== "object" || !("tabId" in tab) || typeof tab.tabId !== "string" || !/^t[0-9]+$/u.test(tab.tabId) || !("url" in tab) || typeof tab.url !== "string") throw new Error("Invalid tab entry"); return { tabId: tab.tabId, url: tab.url }; });
  };
  const layout = async () => { const parsed = parseDirectNamedLayoutSample(await browser.evaluate(`({schema:"direct.named-layout-sample/v1",viewport:{width:innerWidth,height:innerHeight},boxes:[["sidebar",".sidebar"],["main","main"],["header",".page-header"]].map(([name,selector])=>{const r=document.querySelector(selector).getBoundingClientRect();return{name,x:r.x,y:r.y,width:r.width,height:r.height}})})`)); assert.ok(parsed.ok); return parsed.value; };
  try {
    await run(["--engine", "chrome", "open"]); browserLaunched = true; const bootstrap = await run(["tab"]); const bootstrapTabs = tabs(bootstrap); assert.equal(bootstrapTabs.length, 1); assert.equal(bootstrapTabs[0]!.url, "about:blank"); const bootstrapId = bootstrapTabs[0]!.tabId;
    for (const [index, scene] of SCENES.entries()) {
      const context = await run(["window", "new"]); await run(["set", "viewport", "1100", "780"]); await run(["open", `http://127.0.0.1:${server.port}/?__direct_scenario=${scene}`]);
      const initial = await settle(scene);
      const disposalNonce = await browser.evaluate('(()=>{const nonce=crypto.randomUUID();sessionStorage.setItem("ghostget.direct.disposal-nonce",nonce);return nonce})()');
      assert.equal(typeof disposalNonce, "string");
      assert.match(disposalNonce as string, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u);
      const initialText = await body(); manifests.push(initial.manifest);
      const identity = await browser.evaluate("({userAgent:navigator.userAgent,platform:navigator.platform})");
      assert.equal(await browser.evaluate("document.querySelectorAll('nav [aria-current=page]').length"), 1);
      if (scene === "accounts.empty") { assert.ok(initialText.includes("Connect your first account")); await run(["find", "label", "Connection name", "fill", "test-account"]); await click("Open sign-in"); await settle(scene); assert.ok((await body()).includes("Finish signing in")); await click("Verify account"); await settle(scene); assert.ok((await body()).includes("Confirm this account")); await click("Save connection"); await settle(scene); assert.ok((await body()).includes("test-account")); }
      if (scene === "accounts.reconnect") {
        assert.ok(initialText.includes("reconnect required")); await click("Reconnect");
        assert.equal(await browser.evaluate("document.querySelector('.editor select').value"), "");
        assert.equal(await browser.evaluate("document.querySelector('.editor input[name=id]').readOnly"), true);
        await run(["select", "select[name=provider]", "github"]); await click("Reconnect account"); await settle(scene);
        await click("Verify account"); await settle(scene); await click("Save connection"); await settle(scene);
        assert.ok((await body()).includes("Connection saved")); assert.equal(await browser.evaluate("document.querySelectorAll('.account-row').length"), 2);
      }
      if (scene === "capabilities.policy") { assert.ok(initialText.includes("create-issue")); await run(["select", '[aria-label="Permission for github-web create-issue"]', "deny"]); await settle(scene); assert.equal(await browser.evaluate("document.querySelector('[aria-label=\"Permission for github-web create-issue\"]').value"), "deny"); }
      if (scene === "integrations.community") { assert.ok(initialText.includes("Community reading list") && initialText.includes("imported")); await click("Activate research-library"); await settle(scene); assert.ok((await body()).includes("Interface activated")); await click("Activate research-archive"); await settle(scene); assert.equal(await browser.evaluate("Array.from(document.querySelectorAll('.integration-row:first-child button')).every(button => button.disabled)"), true); }
      if (scene === "approvals.pending") { assert.ok(initialText.includes("Publish a post")); await click("Allow once"); await settle(scene); assert.ok((await body()).includes("Nothing needs your approval")); }
      if (scene === "vault.cancelled") { await run(["find", "text", "Import an X token from 1Password", "click", "--exact"]); const form = "document.querySelectorAll('.editor form')[1]"; await browser.evaluate(`(()=>{const form=${form};for(const [name,value] of Object.entries({id:"x-token",account:"fictional",reference:"op://demo/token/value",subject:"123456789012345678",scopes:"tweet.read users.read"})){const input=form.elements.namedItem(name);input.value=value;}form.elements.namedItem("retain").checked=true;form.requestSubmit();return true})()`); await settle(scene); assert.ok((await body()).includes("authorization was cancelled")); }
      if (scene === "backend.failure") assert.ok(initialText.includes("control service is unavailable"));
      if (scene === "activity.history") {
        assert.ok(initialText.includes("10,000 matching requests")); const count = Number(await browser.evaluate("document.querySelectorAll('[data-activity-row]').length")); assert.ok(count > 0 && count < 45);
        await browser.evaluate("(()=>{const el=document.querySelector('[data-testid=activity-scroll]');el.scrollTop=el.scrollHeight;return true})()"); await settle(scene); assert.ok(Number(await browser.evaluate("document.querySelectorAll('[data-activity-row]').length")) < 45);
        await run(["find", "label", "Search activity", "fill", "installation"]); await click("Search"); await settle(scene); assert.ok(!(await body()).includes("10,000 matching requests"));
        await click("Accounts"); await settle(scene); assert.ok((await body()).includes("river-stone")); await click("Web access"); await settle(scene); assert.ok((await body()).includes("Gateway-only mode")); await run(["uncheck", ".switch-label input"]); await click("Save web access"); await settle(scene); assert.ok((await body()).includes("Web access saved")); await click("Agent setup"); await run(["click", ".setup-row:first-child button"]); await settle(scene); assert.ok((await body()).includes("Ready for your agent")); await click("Activity");
      }
      const final = await settle(scene); bindDirectBrowserContractEvidence(initial, final);
      const first = await layout(); await new Promise(resolve => setTimeout(resolve, 100)); const second = await layout();
      const contract = parseDirectNamedLayoutContract({ schema: "direct.named-layout-contract/v1", rules: [{ id: "navigation-separated", kind: "no-overlap", first: "sidebar", second: "main", tolerance: 0 }, { id: "header-contained", kind: "inside", inner: "header", outer: "main", tolerance: 1 }, { id: "header-settled", kind: "stable", box: "header", tolerance: 1 }] }); assert.ok(contract.ok); const geometry = validateDirectNamedLayout(contract.value, [first, second]); assert.equal(geometry.violations.length, 0);
      await run(["screenshot", join(artifact, `${scene}.png`)]);
      const errors = await run(["errors"]); const consoleMessages = await run(["console"]); const network = await run(["network", "requests"]);
      assert.ok(!JSON.stringify(consoleMessages).includes('"type":"error"')); assert.ok(!JSON.stringify(errors).includes('"message":'));
      const inventory = await run(["tab"]); assert.equal(tabs(inventory).length, index + 2);
      // Reviewed 0.32.3 driver exception: closing tabs promotes stale target events.
      // Retain only inert documents in <=8 scenario contexts until whole-browser close.
      const disposalUrl = `http://127.0.0.1:${server.port}/__direct_disposed`;
      const disposalNavigation = await run(["open", disposalUrl]);
      const disposal = await browser.evaluate(`(()=>{const receipt=JSON.parse(sessionStorage.getItem("ghostget.direct.disposal-receipt"));sessionStorage.removeItem("ghostget.direct.disposal-receipt");return{receipt,bridgeAbsent:typeof window.__direct==="undefined",scripts:document.scripts.length,url:location.href}})()`);
      assert.deepEqual(disposal, { receipt: { schema: "ghostget.direct-disposal/1", nonce: disposalNonce, activationHash: final.manifest.active.activationHash, disposed: true, errors: 0 }, bridgeAbsent: true, scripts: 0, url: disposalUrl });
      const after = await run(["tab"]); const retained = tabs(after); assert.equal(retained.length, index + 2); assert.ok(retained.every(tab => tab.tabId === bootstrapId ? tab.url === "about:blank" : tab.url === disposalUrl));
      exercised.add(scene); results.push({ scene, contextLabel: `scenario-${index + 1}`, batchIndex: index + 1, batchSize: SCENES.length, context, initial, final, identity, geometry, errors, consoleMessages, network, inventory, closeAttempts: [], tabCleanupPolicy: "retain-inert-until-whole-browser-close", disposalNavigation, disposal, after });
    }
    bindDirectScenarioCatalog(manifests); const finalInventory = await run(["tab"]); const close = await run(["close"]); closed = true;
    await writeFile(join(artifact, "receipt.json"), JSON.stringify({ schema: "ghostget.direct-verification/1", source, productionSurfaces: ["desktop/out/native/*.js", "desktop/out/native/*.js.map", "desktop/out/native/index.html"], driverVersion: browserPackage.version, backend: "local-chromium", allowedHosts: ["127.0.0.1"], executionMode: "sequential-fresh-contexts", policyDeviation: "agent-browser-0.32.3-dead-target: retain at most eight disposed scenario tabs plus bootstrap; no per-context closure claimed; final whole-browser close required", bootstrap, results, finalInventory, close, coverage: definition.coverage.list().map(entry => ({ key: entry.key, status: classifyCoverageEvidence(entry, { exercisedScenarios: exercised }) })), commands: history }, null, 2));
    process.stdout.write(`Direct verification passed: ${artifact}\n`);
  } catch (error) { primaryFailure = error; throw error; }
  finally {
    let cleanupFailure: unknown;
    try { if (!closed) { try { await run(["close"]); closed = true; } catch (error) { cleanupFailure = error; } } }
    finally { server.stop(true); if (closed) await rm(scratch, { recursive: true, force: true }); }
    if (primaryFailure || cleanupFailure) await writeFile(join(artifact, "failed-commands.json"), JSON.stringify({ source, primaryFailure: String(primaryFailure ?? "none"), cleanupFailure: String(cleanupFailure ?? "none"), closed, scratch, commands: history }, null, 2));
    if (cleanupFailure && !primaryFailure) throw cleanupFailure;
  }
}
if (import.meta.main) await verify();
