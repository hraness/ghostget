import { afterEach, expect, test } from "bun:test";
import { spawn } from "node:child_process";
import { chmodSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PassThrough } from "node:stream";
import fc from "fast-check";
import { assertAsyncProperty, assertProperty } from "./test-support";
import { APP_HOST_MAX_FRAME_BYTES, APP_HOST_PROTOCOL, type AppHostRequest } from "./app-host-protocol";
import { parseAppHostFrame } from "./app-host-validation";
import { serveAppHost } from "./app-host-transport";
import { admitAppHostState, appHostEnvironment } from "./app-host-state";

const roots: string[] = [];
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });
function root(): string {
  const path = realpathSync(mkdtempSync(join(tmpdir(), "ghostget-app-host-boundary-")));
  chmodSync(path, 0o700); roots.push(path); return path;
}
function frame(id: string, request: AppHostRequest): string { return JSON.stringify({ protocol: APP_HOST_PROTOCOL, id, request }); }

test("app-host parser rejects caller authority, arbitrary actions, paths and provider overrides", () => {
  const request = { action: "connection.commit", attemptId: "attempt-one", expectedSubject: "12345", expectedDigest: "a".repeat(64) };
  for (const extra of [{ confirmed: true }, { humanApproved: true }, { provider: "linkedin" }, { command: "/bin/sh" }, { confirmation: { kind: "native" } }]) {
    expect(() => parseAppHostFrame(JSON.stringify({ protocol: APP_HOST_PROTOCOL, id: "one", request: { ...request, ...extra } }))).toThrow();
  }
  for (const action of ["invoke", "policy.set", "approval.resolve", "vault.import", "posts.publish"]) {
    expect(() => parseAppHostFrame(JSON.stringify({ protocol: APP_HOST_PROTOCOL, id: "one", request: { action } }))).toThrow();
  }
  expect(() => parseAppHostFrame(frame("one", { action: "connection.begin", browser: "chrome", profile: "/tmp/profile", id: null, expectedRevision: null }))).toThrow();
});

test("generated unknown frame fields never extend the authority contract", () => {
  assertProperty(fc.property(fc.string({ minLength: 1, maxLength: 40 }).filter(key => !["protocol", "id", "request"].includes(key)), key => {
    expect(() => parseAppHostFrame(JSON.stringify({ protocol: APP_HOST_PROTOCOL, id: "one", request: { action: "hello" }, [key]: true }))).toThrow();
  }), { numRuns: 100 });
});

test("stdio handles fragmentation, rejects replay, and emits protocol-only frames", async () => {
  const input = new PassThrough();
  const output: string[] = [];
  const seen: string[] = [];
  const running = serveAppHost(input, line => output.push(line), {
    handle: async request => { seen.push(request.action); return { kind: "success" }; }, close: () => {},
  });
  const first = frame("one", { action: "hello" });
  input.write(first.slice(0, 15));
  input.write(`${first.slice(15)}\n${first}\n${frame("two", { action: "accounts.list" })}\n`);
  input.end();
  await running;
  expect(seen).toEqual(["hello", "accounts.list"]);
  const parsed = output.map(line => JSON.parse(line));
  expect(parsed.every(line => line.protocol === APP_HOST_PROTOCOL)).toBe(true);
  expect(parsed.find(line => line.code === "DUPLICATE_REQUEST")).toMatchObject({ id: "one", ok: false });
  expect(parsed.filter(line => line.ok)).toHaveLength(2);
});

test("oversized and incomplete frames never dispatch and close safely", async () => {
  for (const data of ["a".repeat(16_385), frame("one", { action: "hello" })]) {
    const input = new PassThrough(); let calls = 0; let closed = 0;
    const output: string[] = [];
    const running = serveAppHost(input, line => output.push(line), { handle: async () => { calls++; return { kind: "success" }; }, close: () => { closed++; } });
    input.end(data);
    await running;
    expect(calls).toBe(0); expect(closed).toBeGreaterThan(0);
    expect(JSON.parse(output[0]!)).toMatchObject({ ok: false, code: "INVALID_REQUEST" });
  }
});

test("generated UTF-8 replies stay within the wire byte limit", async () => {
  await assertAsyncProperty(fc.asyncProperty(fc.integer({ min: 0, max: 10_000 }), async length => {
    const input = new PassThrough();
    const output: string[] = [];
    const running = serveAppHost(input, line => output.push(line), {
      handle: async () => ({ kind: "browsers", browsers: [{ key: "chrome-default", browser: "chrome", profile: "Default", label: "界".repeat(length) }] }),
      close: () => {},
    });
    input.end(`${frame("one", { action: "browsers.list" })}\n`);
    await running;
    expect(output).toHaveLength(1);
    expect(Buffer.byteLength(output[0]!)).toBeLessThanOrEqual(APP_HOST_MAX_FRAME_BYTES);
    const response = JSON.parse(output[0]!);
    if (!response.ok) expect(response.code).toBe("RESPONSE_TOO_LARGE");
    else expect(response.data.browsers[0].label).toBe("界".repeat(length));
  }), { numRuns: 40 });
});

test("closed response sinks abort owned work and settle without a rejected cleanup promise", async () => {
  const input = new PassThrough();
  let writes = 0;
  let closed = 0;
  const running = serveAppHost(input, () => { writes++; throw new Error("sink closed"); }, {
    handle: async () => ({ kind: "success" }), close: () => { closed++; },
  });
  input.end(`${frame("one", { action: "hello" })}\n${frame("two", { action: "accounts.list" })}\n`);
  await running;
  expect(writes).toBe(1);
  expect(closed).toBeGreaterThan(0);
  expect(input.destroyed).toBe(true);
});

test("a real closed stdout pipe drains the app host and releases its owner", async () => {
  if (process.platform !== "darwin") return;
  const path = root();
  const child = spawn(process.execPath, ["--no-env-file", "--no-install", new URL("./app-host.ts", import.meta.url).pathname, "--app-id", "com.example.product"], {
    env: { ...process.env, GHOSTGET_STATE_HOME: path, HRANESS_NO_UPDATE: "1" }, stdio: ["pipe", "pipe", "pipe"],
  });
  const exited = new Promise<number | null>((resolve, reject) => {
    child.once("close", resolve);
    child.once("error", reject);
  });
  let stderr = "";
  child.stderr.setEncoding("utf8");
  child.stderr.on("data", chunk => { stderr += String(chunk); });
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    child.stdout.destroy();
    child.stdin.write(`${frame("one", { action: "hello" })}\n`);
    const status = await Promise.race([exited, new Promise<never>((_resolve, reject) => {
      timeout = setTimeout(() => reject(new Error("App host did not settle after its output closed")), 10_000);
    })]);
    expect(status).toBe(0);
    expect(stderr).toBe("");
    const { existsSync } = await import("node:fs");
    expect(existsSync(join(path, "control", "owner.json"))).toBe(false);
  } finally {
    if (timeout !== undefined) clearTimeout(timeout);
    child.kill();
    await exited;
  }
});

test("state admission binds one app, refuses unmarked state, and supports isolated roots", () => {
  const path = root();
  const environment = appHostEnvironment("com.example.product", { GHOSTGET_STATE_HOME: path });
  admitAppHostState("com.example.product", environment);
  admitAppHostState("com.example.product", environment);
  expect(JSON.parse(readFileSync(join(path, "control", "app-host.json"), "utf8"))).toEqual({ schemaVersion: 1, appId: "com.example.product" });
  expect(() => admitAppHostState("com.example.other", environment)).toThrow("different app");
  const occupied = root(); writeFileSync(join(occupied, "existing"), "fixture", { mode: 0o600 });
  expect(() => admitAppHostState("com.example.product", { GHOSTGET_STATE_HOME: occupied })).toThrow();
  expect(() => appHostEnvironment("com.example.product", { GHOSTGET_STATE_HOME: "relative" })).toThrow("absolute");
  expect(() => appHostEnvironment("../../other", {})).toThrow("app ID");
});

test("importing the public entrypoint has no startup, prompt, state, or update effects", async () => {
  const path = root();
  const child = Bun.spawn([process.execPath, "--no-env-file", "--no-install", "-e", `await import(${JSON.stringify(new URL("./app-host.ts", import.meta.url).href)}); process.stdout.write('imported');`], {
    env: { ...process.env, GHOSTGET_STATE_HOME: path, HRANESS_NO_UPDATE: "1" }, stdin: "ignore", stdout: "pipe", stderr: "pipe",
  });
  const [status, stdout, stderr] = await Promise.all([child.exited, new Response(child.stdout).text(), new Response(child.stderr).text()]);
  expect(status).toBe(0); expect(stdout).toBe("imported"); expect(stderr).toBe("");
  const { readdirSync } = await import("node:fs");
  expect(readdirSync(path)).toEqual([]);
});
