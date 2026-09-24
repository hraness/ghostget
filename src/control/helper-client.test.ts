import { expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import fc from "fast-check";
import { decodeHelperFrames, parseHelperEnvelope, spawnHelper } from "./helper-client";
import { CONTROL_PROTOCOL } from "./protocol";
import { assertProperty } from "../test-support";

test("helper rejects malformed envelopes and nested contract drift", () => {
  const valid = { id: "request-1", protocol: CONTROL_PROTOCOL, ok: true, data: { kind: "success", message: "saved" } } as const;
  expect(parseHelperEnvelope(JSON.stringify(valid))).toEqual(valid);
  for (const value of [null, [], { ...valid, extra: 1 }, { ...valid, ok: "yes" }, { ...valid, data: { kind: "snapshot", snapshot: {} } }, { ...valid, data: { kind: "success", message: 1 } }, { ...valid, data: { kind: "success", message: "saved", extra: true } }]) expect(() => parseHelperEnvelope(JSON.stringify(value))).toThrow();
  assertProperty(fc.property(fc.jsonValue(), value => {
    let frame: ReturnType<typeof parseHelperEnvelope>;
    try { frame = parseHelperEnvelope(JSON.stringify(value)); } catch { return; }
    expect(typeof frame.ok).toBe("boolean"); expect(frame.protocol).toBe(CONTROL_PROTOCOL);
  }));
});

test("helper framing accepts coalesced large messages and rejects oversized or malformed frames", () => {
  const approval = { id: "a", digest: "d", kind: "provider", title: "Review", account: null, effect: "write", preview: "x".repeat(400_000), expiresAt: "2030-01-01T00:00:00.000Z" } as const;
  const envelope = { id: "request-1", protocol: CONTROL_PROTOCOL, ok: true, data: { kind: "approvals", approvals: Array.from({ length: 9 }, () => approval) } } as const;
  const line = Buffer.from(`${JSON.stringify(envelope)}\n`);
  const first = decodeHelperFrames(line.subarray(0, line.length - 7));
  expect(first.frames).toHaveLength(0);
  const decoded = decodeHelperFrames(Buffer.concat([first.remainder, line.subarray(line.length - 7), line]));
  expect(decoded.frames).toEqual([envelope, envelope]);
  expect(decoded.remainder.length).toBe(0);
  for (const bytes of [Buffer.alloc(4_194_305, 32), Buffer.concat([Buffer.alloc(4_194_305, 32), Buffer.from("\n")]), Buffer.from([0xc3, 10])]) expect(() => decodeHelperFrames(bytes)).toThrow();
});

test("a second controller gets recovery guidance while the first keeps custody", async () => {
  const root = mkdtempSync(join(tmpdir(), "gg-client-"));
  const environment = { ...process.env, GHOSTGET_STATE_HOME: join(root, "state"), WRENCH_STATE_HOME: undefined, OH_STATE_HOME: undefined, IO_HOME: undefined };
  const first = spawnHelper(environment);
  try {
    const state = await first.request({ action: "snapshot", accountId: null }); expect(state.ok).toBe(true);
    const second = spawnHelper(environment);
    try { const result = await second.request({ action: "snapshot", accountId: null }); expect(result).toMatchObject({ ok: false, code: "CONTROL_ALREADY_RUNNING" }); if (!result.ok) expect(result.message).toContain("ghostget menubar stop"); }
    finally { await second.close(); }
    expect((await first.request({ action: "snapshot", accountId: null })).ok).toBe(true);
  } finally { await first.close(); rmSync(root, { recursive: true, force: true }); }
});
