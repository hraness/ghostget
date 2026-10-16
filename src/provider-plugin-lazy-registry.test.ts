import { expect, test } from "bun:test";
import { createLazyProviderPluginRegistry } from "./provider-plugin-lazy-registry";
import type { ProviderPluginRegistry } from "./provider-plugin-registry";

const methods = [
  "list", "get", "resolveRoute", "requireRoute", "resolveSessionRoute", "requireSessionRoute",
  "resolveAccountRoute", "requireAccountRoute", "resolveOperation", "requireOperation",
  "resolveOperationDefinition", "requireOperationDefinition", "implementationHash",
  "contractImplementationHash", "legacyContractImplementationHashes", "implementationClosureHash",
  "artifactSha256", "listOwnedManifests", "resolveOwnedManifest",
] as const satisfies readonly (keyof ProviderPluginRegistry)[];

function thrownBy(action: () => unknown): unknown {
  try { action(); } catch (error) { return error; }
  throw new Error("expected a synchronous failure");
}

test("lazy registry is frozen, enumerable and defers its single initialization until a method call", () => {
  let calls = 0;
  const argumentsSeen: unknown[][] = [];
  const values = new Map(methods.map(method => [method, Object.freeze({ method })]));
  const target = Object.fromEntries(methods.map(method => [method, function (this: unknown, ...args: unknown[]) {
    expect(this).toBe(target);
    argumentsSeen.push(args);
    return values.get(method);
  }])) as unknown as ProviderPluginRegistry;
  const lazy = createLazyProviderPluginRegistry(() => { calls++; return target; });
  expect(Object.isFrozen(lazy)).toBe(true);
  expect(Object.keys(lazy)).toEqual([...methods]);
  const copied = { ...lazy };
  expect(Object.keys(copied)).toEqual([...methods]);
  expect(calls).toBe(0);
  const args = Object.freeze([Object.freeze({ binding: true }), "x", "posts.publish", 1]);
  for (const method of methods) {
    const invoke = copied[method] as (...args: readonly unknown[]) => unknown;
    expect(invoke(...args)).toBe(values.get(method));
  }
  expect(calls).toBe(1);
  expect(argumentsSeen).toEqual(methods.map(() => [...args]));
});

test("lazy registry permanently caches initialization failure including non-Error throws", () => {
  for (const failure of [new Error("fixed failure"), undefined, null, false, 0, "failure"]) {
    let calls = 0;
    const lazy = createLazyProviderPluginRegistry(() => { calls++; throw failure; });
    expect(thrownBy(() => lazy.list())).toBe(failure);
    expect(thrownBy(() => lazy.get("x"))).toBe(failure);
    expect(calls).toBe(1);
  }
});

test("lazy registry refuses reentrant initialization and cannot recover through a caught inner error", () => {
  for (const catchReentry of [false, true]) {
    let calls = 0;
    let innerFailure: unknown;
    const lazy = createLazyProviderPluginRegistry(() => {
      calls++;
      if (catchReentry) innerFailure = thrownBy(() => lazy.list());
      else lazy.list();
      return {} as ProviderPluginRegistry;
    });
    const failure = thrownBy(() => lazy.list());
    expect(failure).toBeInstanceOf(Error);
    expect(String(failure)).toContain("initialization reentered");
    if (catchReentry) expect(failure).toBe(innerFailure);
    expect(thrownBy(() => lazy.get("x"))).toBe(failure);
    expect(calls).toBe(1);
  }
});
