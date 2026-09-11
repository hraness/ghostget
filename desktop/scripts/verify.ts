import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { parseAgentBrowserEnvelope, readDirectBrowserContract, bindDirectBrowserContractEvidence, bindDirectScenarioCatalog, parseDirectNamedLayoutSample, parseDirectNamedLayoutContract, validateDirectNamedLayout } from "@hraness/direct/tooling/browser-verification";
import { parseDefinitionCoverageSnapshot, classifyCoverageEvidence } from "@hraness/direct/testing";
import { definition, SCENES, sectionFor } from "../direct/definition.ts";
import { serveDirect } from "./serve-direct.ts";
import { buildDesktop, desktopRoot } from "./build.ts";

/** Root browser lane only: owns each whole browser in two sequential bounded batches. */
async function verify() {
  const repository = resolve(desktopRoot, ".."); const browserPackage = JSON.parse(await readFile(join(repository, "node_modules/agent-browser/package.json"), "utf8")) as { version: string };
  const gitRead = (args: readonly string[]) => { const command = Bun.spawnSync(["git", ...args], { cwd: repository, stdin: "ignore", stdout: "pipe", stderr: "pipe" }); assert.equal(command.exitCode, 0, "Could not bind verification to repository state"); return command.stdout.toString().trim(); };
  const source = { head: gitRead(["rev-parse", "HEAD"]), dirty: gitRead(["status", "--porcelain"]).length > 0 };
  assert.equal(browserPackage.version, "0.32.3");
  const batches = [SCENES.slice(0, 8), SCENES.slice(8)];
  assert.deepEqual(batches.map(batch => batch.length), [8, 2], "Review browser batch ownership when the scenario catalog changes");
  assert.equal(new Set(SCENES).size, SCENES.length);
  const artifact = join(desktopRoot, "out", "verification", randomUUID()); await mkdir(artifact, { recursive: true });
  await buildDesktop("native"); const server = await serveDirect();
  const history: unknown[] = []; const manifests: Awaited<ReturnType<typeof readDirectBrowserContract>>["manifest"][] = []; const results: { scene: typeof SCENES[number]; [key: string]: unknown }[] = []; const exercised = new Set<string>(); const completedBatches: unknown[] = [];
  const runBatch = async (scenes: readonly typeof SCENES[number][], batchIndex: number) => {
    assert.ok(scenes.length > 0 && scenes.length <= 8);
    const scratch = await mkdtemp("/tmp/gg-direct-"); const socket = join(scratch, "socket"); await mkdir(socket); const config = join(scratch, "config.json"); await writeFile(config, "{}");
    const session = `gg-${randomUUID().slice(0, 12)}`; let closed = false; let primaryFailure: unknown; let browserLaunched = false; let ownershipLost = false;
    const env: Record<string, string> = { PATH: process.env.PATH ?? "/usr/bin:/bin", HOME: process.env.HOME ?? "", TMPDIR: "/tmp", AGENT_BROWSER_SOCKET_DIR: socket, AGENT_BROWSER_IDLE_TIMEOUT_MS: "60000" };
    const prefix = [process.execPath, join(repository, "node_modules/.bin/agent-browser"), "--config", config, "--allowed-domains", "127.0.0.1", "--session", session, "--json"];
    const run = async (args: readonly string[]): Promise<unknown> => {
      const child = Bun.spawn([...prefix, ...args], { cwd: repository, env, stdin: "ignore", stdout: "pipe", stderr: "pipe" });
      const timer = setTimeout(() => child.kill("SIGKILL"), 45000);
      try { const [output, error, exit] = await Promise.all([new Response(child.stdout).text(), new Response(child.stderr).text(), child.exited]); if (exit !== 0) { history.push({ batchIndex, session, args, exit, stdout: output.slice(-4000), stderr: error.slice(-2000) }); throw new Error(`Browser command failed: ${args[0]}`); } const data = parseAgentBrowserEnvelope(output); history.push({ batchIndex, session, args, exit, data });
        if (browserLaunched) {
          try {
            assert.ok(data && typeof data === "object" && "lifecycle" in data && data.lifecycle && typeof data.lifecycle === "object");
            const lifecycle = data.lifecycle as Record<string, unknown>;
            assert.equal(lifecycle.relaunchedBrowser, false, "Owned browser was unexpectedly relaunched");
            assert.equal(lifecycle.restartedBackground, false, "Owned browser daemon was unexpectedly restarted");
            assert.equal(lifecycle.launched, false, "Owned browser was unexpectedly replaced");
          } catch (error) { ownershipLost = true; throw error; }
        }
        return data; } catch (error) { if (browserLaunched) ownershipLost = true; throw error; } finally { clearTimeout(timer); }
    };
    const closeOwnedBrowser = async () => {
      const close = await run(["close"]);
      assert.ok(close && typeof close === "object" && "closed" in close && close.closed === true, "Whole-browser close was not confirmed");
      assert.ok("lifecycle" in close && close.lifecycle && typeof close.lifecycle === "object" && "effectiveLaunch" in close.lifecycle && close.lifecycle.effectiveLaunch && typeof close.lifecycle.effectiveLaunch === "object");
      assert.ok("browserLaunched" in close.lifecycle.effectiveLaunch && close.lifecycle.effectiveLaunch.browserLaunched === false, "Closed browser still reports an active launch");
      assert.equal(ownershipLost, false, "Cannot prove closure of the original browser after ownership loss");
      closed = true; return close;
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
      for (const [index, scene] of scenes.entries()) {
        const context = await run(["window", "new"]); await run(["set", "viewport", "1100", "780"]); await run(["open", `http://127.0.0.1:${server.port}/?__direct_scenario=${scene}`]);
        const initial = await settle(scene);
        const disposalNonce = await browser.evaluate('(()=>{const nonce=crypto.randomUUID();sessionStorage.setItem("ghostget.direct.disposal-nonce",nonce);return nonce})()');
        assert.equal(typeof disposalNonce, "string");
        assert.match(disposalNonce as string, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u);
        const initialText = await body(); manifests.push(initial.manifest); const captures: { name: string; viewport: { width: number; height: number }; geometry: unknown }[] = [];
        const capture = async (name: string) => {
          await settle(scene); const geometry = await browser.evaluate("({width:innerWidth,height:innerHeight,documentWidth:document.documentElement.scrollWidth,bodyWidth:document.body.scrollWidth,mainWidth:document.querySelector(\"main\").clientWidth,mainScrollWidth:document.querySelector(\"main\").scrollWidth})");
          assert.ok(geometry && typeof geometry === "object"); const g = geometry as Record<string, number>;
          assert.ok(g.documentWidth! <= g.width! && g.bodyWidth! <= g.width! && g.mainScrollWidth! <= g.mainWidth!, "Vault layout overflows horizontally");
          await run(["screenshot", join(artifact, name)]); captures.push({ name, viewport: { width: g.width!, height: g.height! }, geometry });
        };
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
        const localForm = ".screen-content > details.editor:first-of-type form";
        if (scene === "vault.cancelled") {
          assert.equal(await browser.evaluate("document.querySelectorAll('.vault-pending li').length"), 2);
          await run(["fill", `${localForm} input[name=title]`, "Cancelled local item"]); await run(["select", `${localForm} select[name=kind]`, "token"]);
          await click("Continue to secure entry"); await settle(scene);
          assert.ok((await body()).includes("Secure entry was cancelled. No item was added."));
          assert.equal(await browser.evaluate("document.querySelectorAll('.vault-item').length"), 0);
          assert.equal(await browser.evaluate("document.querySelectorAll('.vault-pending li').length"), 2);
          await capture("vault.cancelled.entry-cancelled.png");
          await click("Retry vault cleanup"); await settle(scene);
          assert.equal(await browser.evaluate("document.querySelectorAll('.vault-pending li').length"), 0);
          assert.ok(!(await body()).includes("Vault cleanup needs attention")); assert.ok((await body()).includes("Pending vault cleanup completed."));
        }
        if (scene === "vault.local") {
          assert.ok(initialText.includes("Reading service") && initialText.includes("Research account"));
          assert.equal(await browser.evaluate("document.querySelectorAll('.vault-item').length"), 2);
          await run(["click", ".vault-item:first-child > details > summary"]); await settle(scene);
          assert.ok((await body()).includes("Read profile") && (await body()).includes("GET https://api.example.com/profile"));
          await capture("vault.local.initial.png");
          await run(["fill", '[aria-label="Search vault items"]', "research"]); await settle(scene);
          assert.deepEqual(await browser.evaluate("Array.from(document.querySelectorAll('.vault-item > .row-heading strong')).map(el=>el.textContent)"), ["Research account"]);
          await run(["select", '[aria-label="Vault item source"]', "1password"]); await settle(scene); assert.ok((await body()).includes("No matching items"));
          await run(["select", '[aria-label="Vault item source"]', "local"]); await settle(scene); assert.equal(await browser.evaluate("document.querySelectorAll('.vault-item').length"), 1);
          await run(["click", '[aria-label="Search vault items"]']); await run(["press", "Home"]); await run(["press", "Shift+End"]); await run(["press", "Backspace"]); await settle(scene); assert.equal(await browser.evaluate("document.querySelector('[aria-label=\"Search vault items\"]').value"), ""); assert.equal(await browser.evaluate("document.querySelectorAll('.vault-item').length"), 2);
          await run(["find", "text", "Add a local item", "click", "--exact"]); await click("Lock vault"); await settle(scene);
          assert.ok((await body()).includes("Vault locked"));
          assert.equal(await browser.evaluate("Array.from(document.querySelectorAll('button')).find(el=>el.textContent==='Continue to secure entry').disabled"), true);
          await click("Unlock vault"); await settle(scene);
          assert.equal(await browser.evaluate("Array.from(document.querySelectorAll('button')).find(el=>el.textContent==='Continue to secure entry').disabled"), false);
          await run(["fill", `${localForm} input[name=title]`, "Fixture archive token"]); await run(["select", `${localForm} select[name=kind]`, "token"]);
          await click("Continue to secure entry"); await settle(scene);
          assert.ok((await body()).includes("Local item added. Secret entry is simulated in this fixture."));
          assert.equal(await browser.evaluate("document.querySelectorAll('.vault-item').length"), 3);
          await run(["click", ".vault-item:last-child > details > summary"]); await run(["click", ".vault-item:last-child .vault-access-heading button"]); await settle(scene);
          await run(["fill", ".vault-grant-editor input[name=title]", "Read archive status"]);
          await run(["fill", ".vault-grant-editor input[name=url]", "https://api.example.com/archive"]);
          await run(["fill", ".vault-grant-editor textarea[name=fields]", "/archive/title\n/archive/status"]);
          await run(["select", ".vault-grant-editor select[name=decision]", "ask"]);
          await run(["check", ".vault-grant-editor input[type=checkbox]"]); await settle(scene);
          assert.equal(await browser.evaluate("document.querySelectorAll('input[type=password],input[name=secret],input[name=token]').length"), 0);
          await capture("vault.local.grant-1100.png");
          await run(["set", "viewport", "700", "560"]); await run(["click", ".vault-grant-editor input[name=title]"]); await settle(scene);
          await capture("vault.local.grant-700.png"); await run(["set", "viewport", "1100", "780"]); await settle(scene);
          await click("Save access grant"); await settle(scene);
          assert.ok((await body()).includes("Access grant saved. Matching Web access rules still apply."));
          assert.equal(await browser.evaluate("document.querySelectorAll('.vault-item:last-child .vault-grant').length"), 1);
          assert.ok((await body()).includes("Read archive status"));
          if (!await browser.evaluate("document.querySelector('.vault-item:first-child > details').open")) await run(["click", ".vault-item:first-child > details > summary"]);
          await run(["click", ".vault-item:first-child .vault-grant .button-row button:last-child"]); await settle(scene);
          assert.ok((await body()).includes("Access grant revoked."));
          assert.equal(await browser.evaluate("document.querySelectorAll('.vault-item:first-child .vault-grant').length"), 0);
          assert.equal(await browser.evaluate("document.querySelectorAll('.vault-item:last-child .vault-grant').length"), 1);
          assert.equal(await browser.evaluate("document.querySelectorAll('.vault-item').length"), 3);
        }
        if (scene === "vault.connected") {
          assert.equal(await browser.evaluate("document.querySelectorAll('.vault-item').length"), 3);
          await run(["select", '[aria-label="Vault item source"]', "1password"]); await settle(scene);
          assert.deepEqual(await browser.evaluate("Array.from(document.querySelectorAll('.vault-item > .row-heading strong')).map(el=>el.textContent)"), ["Archive token"]);
          await run(["click", ".vault-item:first-child > details > summary"]); await settle(scene);
          assert.ok((await body()).includes("bbbbbbbbbbbbbbbbbbbbbbbbbb") && (await body()).includes("credential") && (await body()).includes("Research vault"));
          await capture("vault.connected.initial.png");
          await run(["find", "text", "Approvals", "click", "--exact"]); await settle(scene);
          assert.ok((await body()).includes("Read profile") && (await body()).includes("Bearer (secret kept private)"));
          await capture("vault.connected.approval.png"); await click("Allow once"); await settle(scene);
          assert.ok((await body()).includes("Nothing needs your approval"));
          await click("Vault"); await settle(scene); assert.equal(await browser.evaluate("document.querySelectorAll('.vault-item').length"), 3);
          await click("Disconnect…"); await click("Disconnect 1Password"); await settle(scene);
          assert.ok((await body()).includes("1Password disconnected. Remote items are unchanged."));
          assert.equal(await browser.evaluate("document.querySelectorAll('.vault-connection').length"), 0);
          assert.deepEqual(await browser.evaluate("Array.from(document.querySelectorAll('.vault-item > .row-heading strong')).map(el=>el.textContent)"), ["Reading service", "Research account"]);
          assert.equal(await browser.evaluate("document.querySelectorAll('.vault-grant').length"), 1);
        }
        if (scene === "backend.failure") assert.ok(initialText.includes("control service is unavailable"));
        if (scene === "activity.history") {
          assert.ok(initialText.includes("10,000 matching requests")); const count = Number(await browser.evaluate("document.querySelectorAll('[data-activity-row]').length")); assert.ok(count > 0 && count < 45);
          await browser.evaluate("(()=>{const el=document.querySelector('[data-testid=activity-scroll]');el.scrollTop=el.scrollHeight;return true})()"); await settle(scene); assert.ok(Number(await browser.evaluate("document.querySelectorAll('[data-activity-row]').length")) < 45);
          await run(["find", "label", "Search activity", "fill", "installation"]); await click("Search"); await settle(scene); assert.ok(!(await body()).includes("10,000 matching requests"));
          await click("Accounts"); await settle(scene); assert.ok((await body()).includes("river-stone")); await click("Web access"); await settle(scene); assert.ok((await body()).includes("Gateway-only mode")); await run(["uncheck", ".switch-label input"]); await click("Save web access"); await settle(scene); assert.ok((await body()).includes("Web access saved")); await click("Agent setup"); await run(["click", ".setup-row:first-child button"]); await settle(scene); assert.ok((await body()).includes("Ready for your agent")); await click("Activity");
        }
        await browser.evaluate("(()=>{document.querySelector('main').scrollTop=0;window.scrollTo(0,0);return true})()");
        const final = await settle(scene); bindDirectBrowserContractEvidence(initial, final);
        const first = await layout(); await new Promise(resolve => setTimeout(resolve, 100)); const second = await layout();
        const contract = parseDirectNamedLayoutContract({ schema: "direct.named-layout-contract/v1", rules: [{ id: "navigation-separated", kind: "no-overlap", first: "sidebar", second: "main", tolerance: 0 }, { id: "header-contained", kind: "inside", inner: "header", outer: "main", tolerance: 1 }, { id: "header-settled", kind: "stable", box: "header", tolerance: 1 }] }); assert.ok(contract.ok); const geometry = validateDirectNamedLayout(contract.value, [first, second]); assert.equal(geometry.violations.length, 0);
        await capture(`${scene}.png`);
        const errors = await run(["errors"]); const consoleMessages = await run(["console"]); const network = await run(["network", "requests"]);
        assert.ok(!JSON.stringify(consoleMessages).includes('"type":"error"')); assert.ok(!JSON.stringify(errors).includes('"message":'));
        assert.ok(network && typeof network === "object" && "requests" in network && Array.isArray(network.requests), "Invalid network inventory");
        for (const request of network.requests as unknown[]) {
          assert.ok(request && typeof request === "object"); const entry = request as Record<string, unknown>;
          assert.equal(entry.method, "GET"); assert.ok(typeof entry.status === "number" && entry.status >= 200 && entry.status < 400, "Unexpected failed or incomplete network call");
          assert.ok(!entry.error && !entry.errorText && !entry.failureText && !entry.failed, "Network failure recorded"); assert.equal(typeof entry.url, "string");
          const url = new URL(entry.url as string);
          if (url.protocol === "data:") { assert.ok((entry.url as string).startsWith("data:image/svg+xml;base64,"), "Unexpected embedded resource"); assert.equal(entry.resourceType, "Image"); }
          else { assert.equal(url.origin, `http://127.0.0.1:${server.port}`); assert.ok(["/", "/app.js", "/app.css", "/NebulaSans-Book.woff2", "/__direct_disposed"].includes(url.pathname), "Unmapped fixture resource"); }
        }
        const inventory = await run(["tab"]); assert.equal(tabs(inventory).length, index + 2);
        // Reviewed 0.32.3 driver exception: closing tabs promotes stale target events.
        // Retain only inert documents in <=8 scenario contexts until whole-browser close.
        const disposalUrl = `http://127.0.0.1:${server.port}/__direct_disposed`;
        const disposalNavigation = await run(["open", disposalUrl]);
        const disposal = await browser.evaluate(`(()=>{const receipt=JSON.parse(sessionStorage.getItem("ghostget.direct.disposal-receipt"));sessionStorage.removeItem("ghostget.direct.disposal-receipt");return{receipt,bridgeAbsent:typeof window.__direct==="undefined",scripts:document.scripts.length,url:location.href}})()`);
        assert.deepEqual(disposal, { receipt: { schema: "ghostget.direct-disposal/1", nonce: disposalNonce, activationHash: final.manifest.active.activationHash, disposed: true, errors: 0 }, bridgeAbsent: true, scripts: 0, url: disposalUrl });
        const after = await run(["tab"]); const retained = tabs(after); assert.equal(retained.length, index + 2); assert.ok(retained.every(tab => tab.tabId === bootstrapId ? tab.url === "about:blank" : tab.url === disposalUrl));
        exercised.add(scene); results.push({ scene, contextLabel: `batch-${batchIndex}-scenario-${index + 1}`, batchIndex, scenarioIndex: index + 1, batchSize: scenes.length, session, context, initial, final, identity, geometry, captures, errors, consoleMessages, network, inventory, closeAttempts: [], tabCleanupPolicy: "retain-inert-until-whole-browser-close", disposalNavigation, disposal, after });
      }
      const finalInventory = await run(["tab"]); assert.equal(tabs(finalInventory).length, scenes.length + 1);
      const close = await closeOwnedBrowser();
      return { batchIndex, batchSize: scenes.length, scenes, session, bootstrap, finalInventory, close, closed };
    } catch (error) { primaryFailure = error; throw error; }
    finally {
      let cleanupFailure: unknown;
      try { if (!closed) { try { await closeOwnedBrowser(); } catch (error) { cleanupFailure = error; } } }
      finally { if (closed) await rm(scratch, { recursive: true, force: true }); }
      if (primaryFailure || cleanupFailure) await writeFile(join(artifact, `failed-batch-${batchIndex}.json`), JSON.stringify({ source, batchIndex, session, primaryFailure: String(primaryFailure ?? "none"), cleanupFailure: String(cleanupFailure ?? "none"), closed, ownershipLost, scratch, commands: history }, null, 2));
      if (cleanupFailure && !primaryFailure) throw cleanupFailure;
    }
  };
  try {
    for (const [index, scenes] of batches.entries()) completedBatches.push(await runBatch(scenes, index + 1));
    assert.equal(completedBatches.length, 2); assert.deepEqual(results.map(result => result.scene), [...SCENES]); assert.deepEqual([...exercised].sort(), [...SCENES].sort());
    bindDirectScenarioCatalog(manifests);
    await writeFile(join(artifact, "receipt.json"), JSON.stringify({ schema: "ghostget.direct-verification/2", source, productionSurfaces: ["desktop/out/native/*.js", "desktop/out/native/*.js.map", "desktop/out/native/index.html"], driverVersion: browserPackage.version, backend: "local-chromium", allowedHosts: ["127.0.0.1"], executionMode: "two-sequential-browser-batches-with-fresh-contexts", policyDeviation: "agent-browser-0.32.3-dead-target: retain at most eight disposed scenario tabs plus bootstrap per batch; no per-context closure claimed; each whole browser must close before the next batch starts", batches: completedBatches, results, coverage: definition.coverage.list().map(entry => ({ key: entry.key, status: classifyCoverageEvidence(entry, { exercisedScenarios: exercised }) })), commands: history }, null, 2));
    process.stdout.write(`Direct verification passed: ${artifact}\n`);
  } catch (error) {
    await writeFile(join(artifact, "failed-commands.json"), JSON.stringify({ source, failure: String(error), completedBatches, results, commands: history }, null, 2)); throw error;
  } finally { server.stop(true); }
}
if (import.meta.main) await verify();
