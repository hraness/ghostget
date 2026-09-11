import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, isAbsolute, join, resolve, sep } from "node:path";
import { desktopRoot } from "./build.ts";

/** Optional local browser qualification; accepts an explicitly selected, immutable installed driver. */
async function verifyWebsite() {
  assert.equal(process.argv.length, 3, "Usage: bun desktop/scripts/verify-website.mjs /absolute/path/to/playwright/package.json");
  const driverPackage = process.argv[2];
  assert.ok(isAbsolute(driverPackage), "Select an absolute installed Playwright package manifest");
  const driverMetadata = JSON.parse(await readFile(driverPackage, "utf8"));
  assert.equal(driverMetadata.name, "playwright"); assert.equal(driverMetadata.version, "1.62.1");
  const requireDriver = createRequire(driverPackage); const { chromium } = requireDriver("playwright");
  const corePackage = requireDriver.resolve("playwright-core/package.json");
  const coreMetadata = JSON.parse(await readFile(corePackage, "utf8")); assert.equal(coreMetadata.version, "1.62.1");
  const driverSource = await readFile(join(dirname(corePackage), "lib/coreBundle.js"), "utf8");
  // This exact pinned driver diagnostic occurs before authored scripts in an already-denied opaque frame.
  const serviceWorkerBlockSource = "if (navigator.serviceWorker) navigator.serviceWorker.register = async () => { console.warn('Service Worker registration blocked by Playwright'); };";
  assert.ok(driverSource.includes(serviceWorkerBlockSource));
  const sandboxServiceWorkerError = "Failed to read the 'serviceWorker' property from 'Navigator': Service worker is disabled because the context is sandboxed and lacks the 'allow-same-origin' flag.";
  const repository = resolve(desktopRoot, "..");
  const build = Bun.spawn([process.execPath, join(repository, "website/build.ts")], { cwd: repository, stdin: "ignore", stdout: "inherit", stderr: "inherit" });
  assert.equal(await build.exited, 0, "Website build failed");
  const root = join(repository, "website/dist");
  const policyText = await readFile(join(repository, "vercel.json"), "utf8");
  const policy = JSON.parse(policyText);
  const controlFiles = (await readdir(join(root, "control"))).sort();
  assert.deepEqual(controlFiles, ["NebulaSans-Book.woff2", "accounts.html", "activity.html", "app.css", "approvals.html", "capabilities.html", "scenes.json"].sort());
  const font = await readFile(join(root, "control/NebulaSans-Book.woff2"));
  assert.ok(font.equals(await readFile(join(repository, "src/assets/fonts/nebula-sans/NebulaSans-Book.woff2"))));
  const served = []; const blockedRequests = []; const errors = []; const consoleMessages = []; const responses = [];
  const server = Bun.serve({ hostname: "127.0.0.1", port: 0, async fetch(request) {
    let pathname; try { pathname = decodeURIComponent(new URL(request.url).pathname); } catch { return new Response(null, { status: 400 }); }
    const target = resolve(root, `.${pathname.endsWith("/") ? `${pathname}index.html` : pathname}`);
    if (!target.startsWith(root + sep) || !["GET", "HEAD"].includes(request.method)) return new Response(null, { status: 404 });
    const file = Bun.file(target); const exists = await file.exists(); const headers = new Headers({ "Content-Type": file.type });
    for (const rule of policy.headers) if (new RegExp(`^${rule.source}$`, "u").test(pathname)) for (const header of rule.headers) headers.set(header.key, header.value);
    served.push({ path: pathname, origin: request.headers.get("Origin"), status: exists ? 200 : 404, allowOrigin: headers.get("Access-Control-Allow-Origin"), csp: headers.get("Content-Security-Policy") });
    return new Response(exists && request.method === "GET" ? file : null, { status: exists ? 200 : 404, headers });
  } });
  const origin = `http://127.0.0.1:${server.port}`;
  const artifact = join(desktopRoot, "out/website-verification", randomUUID()); await mkdir(artifact, { recursive: true });
  let browser; let closed = false; let failure; let cleanupFailure; let timedOut = false;
  const watchdog = setTimeout(() => { timedOut = true; void browser?.close(); }, 120000);
  const git = async args => { const child = Bun.spawn(["git", ...args], { cwd: repository, stdin: "ignore", stdout: "pipe", stderr: "pipe" }); const output = await new Response(child.stdout).text(); assert.equal(await child.exited, 0); return output.trim(); };
  try {
    browser = await chromium.launch({ headless: true, timeout: 30000, env: { PATH: process.env.PATH ?? "/usr/bin:/bin", HOME: process.env.HOME ?? "", TMPDIR: "/tmp" } });
    const browserVersion = browser.version();
    const context = await browser.newContext({ viewport: { width: 1400, height: 1100 }, serviceWorkers: "block", bypassCSP: false, acceptDownloads: false });
    context.setDefaultTimeout(12000);
    await context.route("**/*", async route => {
      const request = route.request(); const url = new URL(request.url());
      if (url.origin === origin && ["GET", "HEAD"].includes(request.method())) return route.continue();
      blockedRequests.push({ origin: url.origin, pathname: url.pathname, method: request.method() }); await route.abort("blockedbyclient");
    });
    await context.routeWebSocket("**/*", socket => { blockedRequests.push({ kind: "websocket", origin: new URL(socket.url()).origin }); socket.close(); });
    await context.addInitScript(() => { for (const name of ["RTCPeerConnection", "webkitRTCPeerConnection"]) if (name in globalThis) Object.defineProperty(globalThis, name, { configurable: false, writable: false, value: function () { throw new Error("WebRTC disabled in local website qualification"); } }); });
    const page = await context.newPage();
    context.on("page", extra => { if (extra !== page) { errors.push("Unexpected additional page"); void extra.close(); } });
    page.on("pageerror", error => errors.push({ name: error.name, message: error.message, stack: error.stack?.slice(0, 4000) ?? null }));
    page.on("console", message => consoleMessages.push({ type: message.type(), text: message.text().slice(0, 2000) }));
    page.on("response", response => { if (response.url().startsWith(`${origin}/control/`)) responses.push({ path: new URL(response.url()).pathname, status: response.status(), headers: response.headers() }); });
    await page.goto(origin, { waitUntil: "networkidle" });
    const scenes = [];
    for (const [index, scene] of ["accounts", "capabilities", "activity", "approvals"].entries()) {
      const details = page.locator(`.control-scenes details:nth-child(${index + 1})`);
      if (index > 0) await details.locator("summary").click();
      await details.scrollIntoViewIfNeeded();
      const frameElement = details.locator(`iframe[src="/control/${scene}.html"]`);
      await frameElement.scrollIntoViewIfNeeded();
      const frame = await (await frameElement.elementHandle()).contentFrame(); assert.ok(frame);
      await frame.waitForURL(`${origin}/control/${scene}.html`);
      const sample = await frameElement.evaluate(frame => {
        const bounds = frame.getBoundingClientRect(); let opaque = false;
        try { void frame.contentWindow.document; } catch (error) { opaque = error.name === "SecurityError"; }
        return { sandbox: frame.getAttribute("sandbox"), opaque, parentCannotReadDocument: frame.contentDocument === null, width: bounds.width, height: bounds.height, parentWidth: frame.parentElement.getBoundingClientRect().width, open: frame.closest("details").open };
      });
      assert.equal(sample.sandbox, ""); assert.equal(sample.opaque, true); assert.equal(sample.parentCannotReadDocument, true); assert.equal(sample.open, true); assert.equal(sample.height, 720); assert.ok(sample.width >= 700 && sample.width <= sample.parentWidth);
      // Debugger readback does not grant the parent page access or change the frame's sandbox/CSP.
      const rendering = await frame.locator("body").evaluate(async body => {
        await document.fonts.ready;
        let serviceWorkerDenied = false; try { void navigator.serviceWorker; } catch (error) { serviceWorkerDenied = error.name === "SecurityError"; }
        return { fonts: [...document.fonts].map(font => ({ family: font.family, status: font.status })), fontFamily: getComputedStyle(body).fontFamily, scripts: document.scripts.length, directBridge: "__direct" in globalThis, tauriBridge: "__TAURI_INTERNALS__" in globalThis, serviceWorkerDenied, horizontalOverflow: document.documentElement.scrollWidth > innerWidth, bodyWidth: body.getBoundingClientRect().width };
      });
      assert.equal(rendering.scripts, 0); assert.equal(rendering.directBridge, false); assert.equal(rendering.tauriBridge, false); assert.equal(rendering.serviceWorkerDenied, true); assert.equal(rendering.horizontalOverflow, false);
      assert.ok(rendering.fontFamily.includes("Nebula")); assert.ok(rendering.fonts.some(font => font.family.includes("Nebula") && font.status === "loaded"));
      await details.screenshot({ path: join(artifact, `${scene}.png`) }); scenes.push({ scene, sample, rendering });
    }
    assert.ok(served.some(row => row.path === "/control/NebulaSans-Book.woff2" && row.origin === "null" && row.status === 200 && row.allowOrigin === "*"), "Opaque frames must fetch the CORS-enabled real font");
    assert.ok(!served.some(row => row.path.startsWith("/control/") && row.status !== 200));
    const driverDiagnostics = errors.filter(error => error.name === "SecurityError" && error.message === sandboxServiceWorkerError);
    const pageErrors = errors.filter(error => !driverDiagnostics.includes(error));
    assert.equal(driverDiagnostics.length, 4, "The pinned driver touches the denied serviceWorker getter once in each opaque frame");
    assert.deepEqual(pageErrors, []); assert.deepEqual(consoleMessages.filter(message => message.type === "error"), []); assert.deepEqual(blockedRequests, []); assert.equal(context.pages().length, 1);
    const sourceHead = await git(["rev-parse", "HEAD"]); const dirty = await git(["status", "--porcelain"]);
    await context.close(); await browser.close(); assert.equal(browser.isConnected(), false); closed = true; assert.equal(timedOut, false);
    await writeFile(join(artifact, "receipt.json"), JSON.stringify({ schema: "ghostget.website-preview-verification/1", sourceHead, dirty: dirty.length > 0, driverVersion: driverMetadata.version, browserVersion, allowedOrigin: origin, custody: { browsers: 1, contexts: 1, pages: 1, wholeBrowserClosed: closed }, controls: { serviceWorkers: "block", websocket: "deny", webRTC: "constructor-deny", bypassCSP: false, requestMethods: ["GET", "HEAD"] }, controlFiles, scenes, controlRequests: served.filter(row => row.path.startsWith("/control/")), fontSha256: createHash("sha256").update(font).digest("hex"), headersSha256: createHash("sha256").update(policyText).digest("hex"), responses, pageErrors, driverDiagnostics: { reason: "The immutable Playwright service-worker blocking init script reads a getter already denied by each opaque sandbox. All four raw errors are retained; authored frame scripts are absent and denial is independently read back.", coreBundleSha256: createHash("sha256").update(driverSource).digest("hex"), source: serviceWorkerBlockSource, errors: driverDiagnostics }, consoleMessages, blockedRequests }, null, 2));
    process.stdout.write(`Website opaque iframe and local-font verification passed: ${artifact}\n`);
  } catch (error) { failure = error; throw error; }
  finally {
    clearTimeout(watchdog);
    try { if (browser && !closed) { try { await browser.close(); assert.equal(browser.isConnected(), false); closed = true; } catch (error) { cleanupFailure = error; } } }
    finally { server.stop(true); }
    if (failure || cleanupFailure) await writeFile(join(artifact, "failure.json"), JSON.stringify({ failure: String(failure), cleanupFailure: String(cleanupFailure), closed, served, errors, consoleMessages, blockedRequests, responses }, null, 2));
    if (cleanupFailure && !failure) throw cleanupFailure;
  }
}
await verifyWebsite();
