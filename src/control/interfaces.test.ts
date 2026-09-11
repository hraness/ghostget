import { afterEach, describe, expect, test } from "bun:test";
import { chmodSync, lstatSync, mkdtempSync, readFileSync, rmSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import fc from "fast-check";
import { assertProperty } from "../test-support";

import { canonicalJson, manifestHash, parseRuntimeManifest, type GhostgetManifest } from "../model";
import { providerPluginRegistry } from "../provider-plugins";
import { ghostgetStateHome, installManifest, loadInstalledManifestSnapshot } from "../storage";
import {
  activateInterface,
  exportInterfaces,
  interfaceDocumentForManifests,
  interfaceSources,
  listInterfaces,
  MAX_INTERFACE_DOCUMENT_BYTES,
  parseInterfaceDocument,
  saveInterface,
  type InterfaceContext,
} from "./interfaces";
import { readInterfaceJson } from "./interface-json";
import { inputFromInterfaceSchema, interfaceInputSchema } from "./interface-schema";

const roots: string[] = [];
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });

function context(): InterfaceContext & { readonly root: string } {
  const rawRoot = mkdtempSync(join(tmpdir(), "ghostget-interfaces-"));
  chmodSync(rawRoot, 0o700);
  roots.push(rawRoot);
  const environment = { ...process.env, GHOSTGET_STATE_HOME: rawRoot };
  return { root: ghostgetStateHome(environment), environment, registry: providerPluginRegistry };
}

function manifest(id = "my-x"): GhostgetManifest {
  const source: unknown = JSON.parse(readFileSync(new URL("../assets/adapters/x/wrench-adapter.json", import.meta.url), "utf8"));
  const parsed = parseRuntimeManifest({ ...(source as Record<string, unknown>), id }, providerPluginRegistry);
  if (!parsed.ok) throw new Error(parsed.issues.join("; "));
  return parsed.value;
}

function document(manifests = [manifest()]): string {
  return interfaceDocumentForManifests({ id: "my-interface", title: "My interface", manifests, registry: providerPluginRegistry });
}

function edit(text: string, change: (value: Record<string, unknown>) => void): string {
  const value = JSON.parse(text) as Record<string, unknown>;
  change(value);
  return JSON.stringify(value);
}

function inert(): string {
  return JSON.stringify({ openapi: "3.1.1", info: { title: "Future interface", version: "1.0.0" }, servers: [{ url: "https://example.com" }], paths: {
    "/items/{id}": { get: { operationId: "readItem", parameters: [{ in: "path", name: "id", required: true, schema: { type: "string", maxLength: 64 } }], responses: { "200": { description: "Item", content: { "application/json": { schema: { type: "object", additionalProperties: true } } } } } } },
  } });
}

describe("OpenAPI semantic interface profile", () => {
  test("round-trips a real executable manifest with standard input and exact recipe bindings", () => {
    const original = manifest();
    const text = document([original]);
    const parsed = parseInterfaceDocument(text, providerPluginRegistry);
    expect(parsed.issues).toEqual([]);
    expect(parsed.adapters[0]?.manifest).toEqual(original);
    expect(parsed.operationCount).toBe(Object.keys(original.operations).length);
    expect(parseInterfaceDocument(parsed.text, providerPluginRegistry)).toEqual(parsed);
    const raw = JSON.parse(text) as { paths: Record<string, { post: { operationId: string; requestBody: unknown } }> };
    expect(raw.paths["/adapters/my-x/operations/feeds.read"]?.post.operationId).toBe("my-x:feeds.read");
    expect(raw.paths["/adapters/my-x/operations/feeds.read"]?.post.requestBody).toBeDefined();
  });

  test("composes deterministic namespaced documents without silently rewriting ownership", () => {
    const first = manifest("first-x");
    const second = manifest("second-x");
    expect(document([first, second])).toBe(document([second, first]));
    expect(() => document([first, first])).toThrow("duplicate adapter");
    expect(parseInterfaceDocument(document([first, second]), providerPluginRegistry).adapters.map((entry) => entry.id)).toEqual(["first-x", "second-x"]);
  });

  test("retains an unsupported executor as an inert visible draft and never fetches its server", () => {
    const state = context();
    const originalFetch = globalThis.fetch;
    let calls = 0;
    globalThis.fetch = Object.assign(() => { calls++; throw new Error("network must not execute"); }, { preconnect: originalFetch.preconnect });
    try {
      const saved = saveInterface({ ...state, document: inert(), source: "imported", expectedDigest: null });
      expect(saved.state).toBe("needs-executor");
      expect(saved.operationCount).toBe(1);
      expect(saved.activationTargets).toEqual([]);
      expect(saved.issues[0]).toContain("needs a trusted Ghostget executor");
      expect(listInterfaces(state)[0]).toEqual(saved);
      expect(calls).toBe(0);
    } finally { globalThis.fetch = originalFetch; }
  });

  test("rejects remote references, cycles, server variables, behavioral extensions and unknown schema constraints", () => {
    const remote = edit(inert(), (raw) => { raw.paths = { "/items": { get: { operationId: "read", responses: { "200": { $ref: "https://example.com/private" } } } } }; });
    expect(() => parseInterfaceDocument(remote, providerPluginRegistry)).toThrow("references");
    for (const key of ["callbacks", "webhooks", "x-run-script", "components"]) {
      expect(() => parseInterfaceDocument(edit(inert(), (raw) => { raw[key] = {}; }), providerPluginRegistry)).toThrow("unsupported fields");
    }
    expect(() => parseInterfaceDocument(edit(inert(), (raw) => { raw.servers = [{ url: "https://{host}", variables: { host: { default: "example.com" } } }]; }), providerPluginRegistry)).toThrow();
    expect(() => parseInterfaceDocument(inert().replace('"maxLength":64', '"pattern":".*"'), providerPluginRegistry)).toThrow("unsupported fields");
    expect(() => readInterfaceJson('{"x":{"$ref":"#/x"}}', 1024)).toThrow("references");
  });

  test("rejects duplicate JSON keys, prototype keys, excessive depth and nonfinite numbers", () => {
    expect(() => readInterfaceJson('{"info":1,"\\u0069nfo":2}', 1024)).toThrow("repeats");
    expect(() => readInterfaceJson('{"__proto__":{}}', 1024)).toThrow("reserved");
    expect(() => readInterfaceJson("[".repeat(26) + "0" + "]".repeat(26), 1024)).toThrow("structural limit");
    expect(() => readInterfaceJson("1e9999", 1024)).toThrow("malformed");
    expect(() => parseInterfaceDocument(" ".repeat(MAX_INTERFACE_DOCUMENT_BYTES + 1), providerPluginRegistry)).toThrow("byte limit");
  });

  test("rejects operation and templated path collisions", () => {
    const sameOperation = edit(inert(), (raw) => { const paths = raw.paths as Record<string, unknown>; paths["/other"] = paths["/items/{id}"]; });
    expect(() => parseInterfaceDocument(sameOperation, providerPluginRegistry)).toThrow("operation ownership");
    const samePath = edit(inert(), (raw) => { const paths = raw.paths as Record<string, unknown>; paths["/items/{other}"] = paths["/items/{id}"]; });
    expect(() => parseInterfaceDocument(samePath, providerPluginRegistry)).toThrow("ambiguous ownership");
  });

  test("a changed known contract is inert and cannot weaken runtime validation", () => {
    const text = document();
    const changed = edit(text, (raw) => {
      const paths = raw.paths as Record<string, { post: { "x-ghostget": { definition: { sideEffect: string } } } }>;
      const first = Object.values(paths)[0];
      if (first === undefined) throw new Error("missing fixture operation");
      first.post["x-ghostget"].definition.sideEffect = "unreviewed side effect";
    });
    const state = context();
    const saved = saveInterface({ ...state, document: changed, source: "user", expectedDigest: null });
    expect(saved.state).toBe("needs-executor");
    expect(() => activateInterface({ ...state, id: saved.id, digest: saved.digest, adapterId: "my-x", expectedInstalledDigest: null })).toThrow("matching trusted executor");
    expect(loadInstalledManifestSnapshot("my-x", state.environment, state.registry).availability).toBe("absent");
  });

  test("scalar input conversion preserves arbitrary bounded values", () => {
    assertProperty(fc.property(fc.string({ minLength: 1, maxLength: 40 }).filter((value) => !/[\u0000-\u001f\u007f]/u.test(value)), fc.integer({ min: 1, max: 1000 }), (description, maximum) => {
      const input = { properties: { query: { type: "string" as const, description, minLength: 1, maxLength: maximum }, count: { type: "number" as const, description, minimum: 0, maximum } }, required: ["query"] };
      expect(inputFromInterfaceSchema(interfaceInputSchema(input))).toEqual(input);
    }), { numRuns: 75 });
  });

  test("the bounded JSON reader preserves JSON values under canonical round trips", () => {
    assertProperty(fc.property(fc.jsonValue({ maxDepth: 4 }).filter((value) => !/"(?:__proto__|constructor|prototype|\$ref|\$dynamicRef|\$id|\$schema)"\s*:/u.test(JSON.stringify(value))), (value) => {
      const text = canonicalJson(value);
      expect(canonicalJson(readInterfaceJson(text, MAX_INTERFACE_DOCUMENT_BYTES))).toBe(text);
    }), { numRuns: 100 });
  });
});

describe("private draft and adapter activation lifecycle", () => {
  test("saving does not activate; activation uses one exact adapter and preserves provenance", () => {
    const state = context();
    const saved = saveInterface({ ...state, document: document(), source: "user", expectedDigest: null });
    expect(saved.state).toBe("draft");
    expect(saved.activationTargets).toEqual([{ adapterId: "my-x", installedDigest: null }]);
    expect(loadInstalledManifestSnapshot("my-x", state.environment, state.registry).availability).toBe("absent");
    const active = activateInterface({ ...state, id: saved.id, digest: saved.digest, adapterId: "my-x", expectedInstalledDigest: null });
    expect(active.state).toBe("active");
    expect(active.activeDigest).toBe(saved.digest);
    expect(interfaceSources(state).get("my-x")).toEqual({ manifestDigest: manifestHash(manifest()), source: "user" });
    expect(lstatSync(join(state.root, "control", "interfaces", "my-interface.json")).mode & 0o777).toBe(0o600);
    const exported = exportInterfaces({ ...state, adapterId: "my-x" });
    expect(parseInterfaceDocument(exported.text, state.registry).adapters[0]?.manifest).toEqual(manifest());
  });

  test("stale document and installed-manifest revisions cannot overwrite newer state", () => {
    const state = context();
    const saved = saveInterface({ ...state, document: document(), source: "imported", expectedDigest: null });
    const changedText = edit(document(), (raw) => { (raw.info as Record<string, unknown>).title = "Updated interface"; });
    const changed = saveInterface({ ...state, document: changedText, source: "imported", expectedDigest: saved.digest });
    expect(() => saveInterface({ ...state, document: document(), source: "imported", expectedDigest: saved.digest })).toThrow("changed");
    expect(() => activateInterface({ ...state, id: saved.id, digest: saved.digest, adapterId: "my-x", expectedInstalledDigest: null })).toThrow("changed");
    installManifest({ ...manifest(), version: "9.0.0" }, { force: false, environment: state.environment, registry: state.registry });
    expect(() => activateInterface({ ...state, id: changed.id, digest: changed.digest, adapterId: "my-x", expectedInstalledDigest: null })).toThrow("installed adapter changed");
    const installed = loadInstalledManifestSnapshot("my-x", state.environment, state.registry);
    expect(installed.result.ok && installed.result.value.version).toBe("9.0.0");
    const active = activateInterface({ ...state, id: changed.id, digest: changed.digest, adapterId: "my-x", expectedInstalledDigest: installed.contentSha256 });
    expect(active.state).toBe("active");
  });

  test("draft edits preserve the active snapshot until explicit activation", () => {
    const state = context();
    const saved = saveInterface({ ...state, document: document(), source: "user", expectedDigest: null });
    activateInterface({ ...state, id: saved.id, digest: saved.digest, adapterId: "my-x", expectedInstalledDigest: null });
    const next = document([{ ...manifest(), version: "2.0.0" }]);
    const draft = saveInterface({ ...state, document: next, source: "user", expectedDigest: saved.digest });
    expect(draft.state).toBe("draft");
    expect(draft.activeDigest).toBe(saved.digest);
    const installed = loadInstalledManifestSnapshot("my-x", state.environment, state.registry);
    expect(installed.result.ok && installed.result.value.version).toBe(manifest().version);
    expect(() => saveInterface({ ...state, document: next, source: "imported", expectedDigest: draft.digest })).toThrow("provenance");
  });

  test("compound activation never commits an unselected adapter", () => {
    const state = context();
    const saved = saveInterface({ ...state, document: document([manifest("first-x"), manifest("second-x")]), source: "user", expectedDigest: null });
    const result = activateInterface({ ...state, id: saved.id, digest: saved.digest, adapterId: "first-x", expectedInstalledDigest: null });
    expect(result.state).toBe("draft");
    expect(loadInstalledManifestSnapshot("first-x", state.environment, state.registry).availability).toBe("present");
    expect(loadInstalledManifestSnapshot("second-x", state.environment, state.registry).availability).toBe("absent");
  });

  test("portable ownership is authoritative even if a document changes its reference marker", () => {
    const state = context();
    const owned = manifest();
    const registry = { ...providerPluginRegistry, resolveOwnedManifest: (id: string) => id === owned.id ? owned : undefined, listOwnedManifests: () => [owned] };
    const options = { ...state, registry };
    const text = interfaceDocumentForManifests({ id: "my-interface", title: "Portable reference", manifests: [owned], registry });
    const tampered = edit(text, (raw) => { const extension = raw["x-ghostget"] as { adapters: { mode: string }[] }; if (extension.adapters[0]) extension.adapters[0].mode = "editable"; });
    const saved = saveInterface({ ...options, document: tampered, source: "imported", expectedDigest: null });
    expect(saved.activationTargets).toEqual([]);
    expect(() => activateInterface({ ...options, id: saved.id, digest: saved.digest, adapterId: owned.id, expectedInstalledDigest: null })).toThrow("package lifecycle");
    expect(loadInstalledManifestSnapshot(owned.id, state.environment, state.registry).availability).toBe("absent");
  });

  test("unsafe draft paths and identifiers cannot become filesystem operations", () => {
    const state = context();
    const saved = saveInterface({ ...state, document: document(), source: "user", expectedDigest: null });
    expect(() => activateInterface({ ...state, id: "../outside", digest: saved.digest, adapterId: "my-x", expectedInstalledDigest: null })).toThrow("identifier");
    const draftPath = join(state.root, "control", "interfaces", "my-interface.json");
    rmSync(draftPath);
    symlinkSync("/etc/hosts", draftPath);
    expect(() => listInterfaces(state)).toThrow();
  });
});
