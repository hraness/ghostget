import { chmodSync, existsSync, lstatSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, test } from "bun:test";

import {
  MAX_REPAIR_SIGNALS,
  REPAIR_SIGNAL_TTL_MS,
  cacheContractRepairSignal,
  readContractRepairInbox,
  reduceContractRepairInbox,
} from "./contract-repair-inbox";
import { contractRepairBinding, createContractRepairSignal } from "./contracts-repair";
import type { ContractCatalogAdapter } from "./contracts-catalog";
import { exampleCatalog } from "./contracts.test-support";
import { assertProperty, fc } from "./test-support";

const NOW = new Date("2026-09-22T12:00:00.000Z");
function signal(version = 1) {
  const adapter = exampleCatalog().adapters[0] as ContractCatalogAdapter;
  return createContractRepairSignal("capture-required", {
    ...contractRepairBinding(adapter, adapter.operations[1]!), contractVersion: version,
  });
}
function state() {
  const root = mkdtempSync(join(tmpdir(), "ghostget-repair-inbox-"));
  chmodSync(root, 0o700);
  return { root, environment: { HOME: root, GHOSTGET_STATE_HOME: join(root, "state") }, dispose: () => rmSync(root, { recursive: true, force: true }) };
}

describe("bounded contract repair inbox", () => {
  test("listing an absent inbox is read-only, and disabling collection touches no state", () => {
    const s = state();
    try {
      expect(readContractRepairInbox(s.environment, NOW)).toEqual({ status: "ready", entries: [], capacityReached: false });
      expect(cacheContractRepairSignal(signal(), { ...s.environment, GHOSTGET_REPAIR_SIGNALS: "off" }, NOW)).toBe("disabled");
      expect(existsSync(s.environment.GHOSTGET_STATE_HOME)).toBeFalse();
    } finally { s.dispose(); }
  });

  test("stores one private, content-bound signal and never rewrites an identical delivery", () => {
    const s = state();
    try {
      const value = signal();
      expect(cacheContractRepairSignal(value, s.environment, NOW)).toBe("stored");
      const path = join(s.environment.GHOSTGET_STATE_HOME, "repair-signals", "inbox.json");
      const before = lstatSync(path, { bigint: true });
      expect(Number(before.mode & 0o777n)).toBe(0o600);
      expect(cacheContractRepairSignal(value, s.environment, new Date(NOW.getTime() + 1000))).toBe("duplicate");
      expect(lstatSync(path, { bigint: true }).mtimeNs).toBe(before.mtimeNs);
      expect(readContractRepairInbox(s.environment, NOW).entries).toEqual([{ signal: value, recordedAt: NOW.toISOString() }]);
      const later = new Date(NOW.getTime() + REPAIR_SIGNAL_TTL_MS);
      expect(readContractRepairInbox(s.environment, later).entries).toEqual([]);
      expect(cacheContractRepairSignal(value, s.environment, later)).toBe("stored");
      expect(readContractRepairInbox(s.environment, later).entries[0]?.recordedAt).toBe(later.toISOString());
    } finally { s.dispose(); }
  });

  test("fails diagnostic caching closed without replacing malformed private state", () => {
    const s = state();
    try {
      expect(cacheContractRepairSignal(signal(), s.environment, NOW)).toBe("stored");
      const path = join(s.environment.GHOSTGET_STATE_HOME, "repair-signals", "inbox.json");
      const malformed = '{"schemaVersion":1,"private":"do not copy into output"}';
      writeFileSync(path, malformed, { mode: 0o600 });
      expect(cacheContractRepairSignal(signal(2), s.environment, NOW)).toBe("unavailable");
      expect(readContractRepairInbox(s.environment, NOW)).toEqual({ status: "unavailable", entries: [], capacityReached: false });
      expect(readFileSync(path, "utf8")).toBe(malformed);
    } finally { s.dispose(); }
  });

  test("refuses symlinked storage without reading or changing the target", () => {
    const s = state();
    try {
      expect(cacheContractRepairSignal(signal(), s.environment, NOW)).toBe("stored");
      const path = join(s.environment.GHOSTGET_STATE_HOME, "repair-signals", "inbox.json");
      const target = join(s.root, "private-target");
      writeFileSync(target, "unchanged", { mode: 0o600 });
      rmSync(path);
      symlinkSync(target, path);
      expect(cacheContractRepairSignal(signal(2), s.environment, NOW)).toBe("unavailable");
      expect(readFileSync(target, "utf8")).toBe("unchanged");
    } finally { s.dispose(); }
  });

  test("property: bounded delivery permutations converge and replay never amplifies evidence", () => {
    assertProperty(fc.property(fc.array(fc.integer({ min: 1, max: 24 }), { maxLength: 48 }), versions => {
      const apply = (order: readonly number[]) => order.reduce<ReturnType<typeof readContractRepairInbox>["entries"]>(
        (entries, version) => reduceContractRepairInbox(entries, signal(version), NOW).entries, [],
      );
      const first = apply(versions);
      expect(apply([...versions].reverse())).toEqual(first);
      expect(apply([...versions, ...versions])).toEqual(first);
      expect(first.length).toBe(new Set(versions).size);
      expect(first.length).toBeLessThanOrEqual(MAX_REPAIR_SIGNALS);
    }));
  });

  test("caps cardinality, does not evict live leads, and prunes only expired entries on a write", () => {
    let entries: ReturnType<typeof readContractRepairInbox>["entries"] = [];
    for (let index = 0; index < MAX_REPAIR_SIGNALS; index += 1) {
      entries = reduceContractRepairInbox(entries, signal(index + 1), NOW).entries;
    }
    const full = reduceContractRepairInbox(entries, signal(MAX_REPAIR_SIGNALS + 1), NOW);
    expect(full.status).toBe("full");
    expect(full.entries).toEqual(entries);
    expect(reduceContractRepairInbox(entries, signal(), NOW).status).toBe("duplicate");
    const fresh = reduceContractRepairInbox(entries, signal(MAX_REPAIR_SIGNALS + 1), new Date(NOW.getTime() + REPAIR_SIGNAL_TTL_MS));
    expect(fresh.status).toBe("stored");
    expect(fresh.entries).toHaveLength(1);
  });
});
