import { expect, test } from "bun:test";
import { parseCaptureArguments } from "@hraness/wordcell/capture";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { captureError, captureErrorCodes, captureErrorOutput, parseCaptureError } from "./capture-error";
import { assertProperty, fc } from "./test-support";
import { main } from "./ghostget";
import { CookieAccessSkippedError } from "./cookie-access";
import { PreservedBrowserArtifactsError } from "./browser";

function transformed(text: string) {
  let result = "";
  captureErrorOutput({ stdout: (value) => { result += value; } }).stdout(text);
  return result;
}
test("strict classification round trips and rejects unsafe retry or schema changes", () => {
  for (const code of captureErrorCodes) expect(parseCaptureError(captureError(code))).toEqual(captureError(code));
  for (const value of [null, [], {}, { ...captureError(), schemaVersion: 2 }, { ...captureError(), retryable: true }, { ...captureError(), message: "secret" }]) {
    expect(() => parseCaptureError(value)).toThrow();
  }
});
test("property: arbitrary messages cannot change error classification or legacy data", () => {
  assertProperty(fc.property(fc.string(), (message) => {
    const legacy = { ok: false, error: { code: "failed", message }, recoveryHandle: "opaque", status: "indeterminate" };
    expect(JSON.parse(transformed(JSON.stringify(legacy)))).toEqual({ ...legacy, captureError: captureError() });
  }));
});
test("success, partial success, malformed and oversized output preserve exact bytes", () => {
  for (const text of ['{"ok":true,"status":"partial"}\n', "# Markdown\n", "not JSON", JSON.stringify({ok:false,error:"x".repeat(1024*1024)})]) {
    expect(transformed(text)).toBe(text);
  }
});
test("preserves validated inner classification but rejects unsupported retry metadata", () => {
  expect(JSON.parse(transformed(JSON.stringify({ok:false,captureError:captureError("cleanup-pending")}))).captureError).toEqual(captureError("cleanup-pending"));
  expect(JSON.parse(transformed(JSON.stringify({ok:false,captureError:{schemaVersion:7,code:"transient",retryable:true}}))).captureError).toEqual(captureError());
});
test.each([
  [new Error("permission denied, timeout, HTTP 429; repair-auth"), "unknown", 3],
  [new CookieAccessSkippedError("Chrome"), "permission-required", 3],
  [new DOMException("private", "AbortError"), "cancelled", 3],
  [new DOMException("private", "TimeoutError"), "timeout", 3],
  [new PreservedBrowserArtifactsError("cleanup failed", "opaque", undefined), "cleanup-pending", 5],
] as const)("capture exceptions classify only typed evidence: %s", async (error, code, exitCode) => {
  const root = mkdtempSync(join(tmpdir(), "ghostget-classification-"));
  const lines: string[] = [];
  try {
    const result = await main(["read", "https://example.com/article", "--mode", "browser", "--scope", "page", "--media", "none", "--json"],
      { GHOSTGET_STATE_HOME: root }, {stdout: text => lines.push(text), stderr: () => undefined},
      { clipMain: async () => { throw error; } });
    expect(result).toBe(exitCode);
    expect(JSON.parse(lines.join("")).captureError).toEqual(captureError(code));
    if (code === "cleanup-pending") expect(JSON.parse(lines.join("")).recoveryHandle).toBe("opaque");
  } finally { rmSync(root, { recursive: true, force: true }); }
});
test("delegated legacy Wordcell failure receives unknown without prose inference", async () => {
  const root = mkdtempSync(join(tmpdir(), "ghostget-classification-"));
  const lines: string[] = [];
  try {
    const result = await main(["read", "https://example.com/article", "--mode", "browser", "--scope", "page", "--media", "none", "--json"],
      { GHOSTGET_STATE_HOME: root }, {stdout: text => lines.push(text), stderr: () => undefined},
      {clipMain: async (_args,_env,output) => { output!.stdout(JSON.stringify({ok:false,error:"HTTP 429"})); return 1; }});
    expect(result).toBe(1);
    expect(JSON.parse(lines.join(""))).toEqual({ok:false,error:"HTTP 429",captureError:captureError()});
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("cleanup evidence overrides an inner retryable result and inherited parser fields fail", () => {
  let text = "";
  captureErrorOutput({stdout: value => { text = value; }}, () => captureError("cleanup-pending"))
    .stdout(JSON.stringify({ok:false,captureError:captureError("timeout")}));
  expect(JSON.parse(text).captureError).toEqual(captureError("cleanup-pending"));
  expect(() => parseCaptureError(Object.assign(Object.create(captureError()), {a:1,b:2,c:3}))).toThrow();
});
test("raw read content resembling a failure is unchanged", async () => {
  const root = mkdtempSync(join(tmpdir(), "ghostget-classification-"));
  const lines: string[] = [], content = '{"ok":false,"error":"article example"}';
  try {
    await main(["read", "https://example.com/article", "--mode", "browser", "--scope", "page", "--media", "none"],
      {GHOSTGET_STATE_HOME:root}, {stdout: text => lines.push(text),stderr: () => undefined},
      {clipMain: async (_args,_env,output) => { output!.stdout(content); return 0; }});
    expect(lines.join("")).toBe(content);
  } finally { rmSync(root,{recursive:true,force:true}); }
});

test.each([
  [new DOMException("private", "AbortError"), "cancelled"],
  [new PreservedBrowserArtifactsError("cleanup failed", "opaque", undefined), "cleanup-pending"],
] as const)("typed error survives delegated capture conversion: %s", async (error, expected) => {
  const root = mkdtempSync(join(tmpdir(), "ghostget-classification-")), lines: string[] = [];
  try {
    await main(["read", "https://example.com/article", "--mode", "browser", "--scope", "page", "--media", "none", "--json"],
      {GHOSTGET_STATE_HOME:root}, {stdout: text => lines.push(text),stderr: () => undefined}, {
        runCapture: async () => { throw error; },
        clipMain: async (args, environment, output, dependencies) => {
          const parsed = parseCaptureArguments(args ?? [], environment);
          if (!parsed.ok || parsed.value.command !== "inspect") throw Error("invalid fixture");
          try { await dependencies!.runCapture!(parsed.value); } catch {
            output!.stdout(JSON.stringify({ok:false,error:"legacy failure"}));
          }
          return 1;
        },
      });
    expect(JSON.parse(lines.join("")).captureError).toEqual(captureError(expected));
  } finally { rmSync(root,{recursive:true,force:true}); }
});
