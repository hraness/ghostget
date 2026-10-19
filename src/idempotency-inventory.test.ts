import { describe, expect, test } from "bun:test";

import { generatedProviderPlugins } from "./provider-plugins.generated";
import { createProviderPluginRegistry } from "./provider-plugin-registry";

/**
 * Every bundled operation must satisfy the idempotency contract the parsers
 * enforce: R1 (read-only) is dispatch-free with no dedupe window, and R2/R3
 * (remote-mutating) declares `local-at-most-once` with a window of at least
 * 60 seconds. This enumerates the shipped surface so a contract edit that
 * weakens a mutating route fails here, not at the registry.
 */
describe("bundled operation idempotency inventory", () => {
  const registry = createProviderPluginRegistry(generatedProviderPlugins);
  const rows = registry.list().flatMap((plugin) =>
    plugin.bindings.flatMap((binding) =>
      binding.operations.map((operation) => ({
        plugin: plugin.id,
        surface: binding.surfaceId,
        transport: binding.transport,
        name: operation.name,
        risk: operation.risk,
        dispatch: operation.dispatch,
        idempotency: operation.idempotency,
        dedupeWindowMs: operation.dedupeWindowMs,
      }))));

  test("the bundled surface has mutating and read-only routes", () => {
    expect(rows.length).toBeGreaterThan(50);
    expect(rows.filter((row) => row.risk === "R2" || row.risk === "R3").length).toBeGreaterThan(10);
    expect(rows.filter((row) => row.risk === "R1").length).toBeGreaterThan(10);
  });

  test("every R2/R3 mutating operation is local-at-most-once with a bounded dedupe window", () => {
    // Mutating routes dispatch as `single`, `bounded-items`, or
    // `thread-items`; each kind is journaled, so the fence needs only that
    // the route dispatches at all and declares local at-most-once.
    const violations = rows
      .filter((row) => row.risk === "R2" || row.risk === "R3")
      .filter((row) =>
        row.dispatch === "none"
        || row.idempotency !== "local-at-most-once"
        || row.dedupeWindowMs < 60_000)
      .map((row) => `${row.plugin}/${row.surface}.${row.name}`);
    expect(violations).toEqual([]);
  });

  test("every R1 read-only operation is dispatch-free and never charges a provider", () => {
    const violations = rows
      .filter((row) => row.risk === "R1")
      .filter((row) =>
        row.dispatch !== "none"
        || row.idempotency !== "none"
        || row.dedupeWindowMs !== 0)
      .map((row) => `${row.plugin}/${row.surface}.${row.name}`);
    expect(violations).toEqual([]);
  });

  test("local-at-most-once is only ever declared with a dedupe window", () => {
    const violations = rows
      .filter((row) => row.idempotency === "local-at-most-once")
      .filter((row) => row.dedupeWindowMs < 60_000)
      .map((row) => `${row.plugin}/${row.surface}.${row.name}`);
    expect(violations).toEqual([]);
  });
});
