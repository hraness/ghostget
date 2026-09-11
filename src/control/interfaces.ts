import { join } from "node:path";

import { canonicalJson, manifestHash, parseRuntimeManifest, sha256, type GhostgetManifest } from "../model";
import type { ProviderPluginRegistry } from "../provider-plugin-registry";
import {
  createPrivateJsonIfAbsent,
  ensurePrivateStateDirectory,
  ghostgetStateHome,
  installManifest,
  listInstalledManifests,
  loadInstalledManifestSnapshot,
  readPrivateStateFileIfPresent,
  snapshotPrivateStateDirectory,
  writePrivateJsonIfUnchanged,
} from "../storage";
import { interfaceId, interfaceKeys, interfaceRecord, interfaceText, readInterfaceJson } from "./interface-json";
import { inputFromInterfaceSchema, interfaceInputSchema, validateInertInterfaceSchema } from "./interface-schema";
import type { InterfaceView } from "./protocol";

export const MAX_INTERFACE_DOCUMENT_BYTES = 512 * 1024;
const MAX_INTERFACE_RECORD_BYTES = 1024 * 1024;
const MAX_INTERFACE_ADAPTERS = 64;
const MAX_INTERFACE_OPERATIONS = 512;
const MAX_INTERFACE_DRAFTS = 128;
const methods = ["get", "head", "post", "put", "patch", "delete", "options"] as const;
const digestPattern = /^[0-9a-f]{64}$/u;
type ObjectValue = Record<string, unknown>;

export interface InterfaceContext {
  readonly environment: Readonly<Record<string, string | undefined>>;
  readonly registry: ProviderPluginRegistry;
}

interface AdapterProjection {
  readonly id: string;
  readonly mode: "editable" | "reference";
  readonly manifest: GhostgetManifest | null;
  readonly issues: readonly string[];
}

export interface ParsedInterfaceDocument {
  readonly id: string;
  readonly title: string;
  readonly digest: string;
  readonly text: string;
  readonly operationCount: number;
  readonly adapters: readonly AdapterProjection[];
  readonly issues: readonly string[];
}

interface ActiveProjection {
  readonly adapterId: string;
  readonly documentDigest: string;
  readonly manifestDigest: string;
}

interface InterfaceRecord {
  readonly schemaVersion: 1;
  readonly source: "user" | "imported";
  readonly document: string;
  readonly active: readonly ActiveProjection[];
}

interface StoredInterface {
  readonly record: InterfaceRecord;
  readonly parsed: ParsedInterfaceDocument;
  readonly contentDigest: string;
}

function digest(value: unknown, label: string): string {
  if (typeof value !== "string" || !digestPattern.test(value)) throw new Error(`${label} is invalid`);
  return value;
}

function operationId(value: unknown): string {
  const id = interfaceText(value, "operation identifier", 128);
  if (!/^[a-z][a-z0-9]*(?:[.-][a-z0-9]+)*$/u.test(id)) throw new Error("operation identifier is invalid");
  return id;
}

function semanticPath(adapterId: string, operation: string): string {
  return `/adapters/${adapterId}/operations/${operation}`;
}

function responseEnvelope(): ObjectValue {
  return {
    type: "object",
    description: "Bounded Ghostget result envelope. Provider output has no narrower portable schema and remains untrusted data.",
    properties: { output: {}, status: { type: "string" } },
    additionalProperties: true,
  };
}

function jsonContent(schema: ObjectValue): ObjectValue {
  return { "application/json": { schema } };
}

function readContent(value: unknown): unknown {
  const content = interfaceRecord(value, "OpenAPI content");
  interfaceKeys(content, ["application/json"], [], "OpenAPI content");
  const media = interfaceRecord(content["application/json"], "OpenAPI media type");
  interfaceKeys(media, ["schema"], [], "OpenAPI media type");
  validateInertInterfaceSchema(media.schema);
  return media.schema;
}

function validateResponses(value: unknown): void {
  const responses = interfaceRecord(value, "OpenAPI responses");
  if (Object.keys(responses).length < 1 || Object.keys(responses).length > 16) throw new Error("OpenAPI responses exceed their bound");
  for (const [status, raw] of Object.entries(responses)) {
    if (!/^(?:[1-5][0-9]{2}|default)$/u.test(status)) throw new Error("OpenAPI response status is invalid");
    const response = interfaceRecord(raw, "OpenAPI response");
    interfaceKeys(response, ["description"], ["content"], "OpenAPI response");
    interfaceText(response.description, "response description", 4_096);
    if (response.content !== undefined) readContent(response.content);
  }
}

function validateParameters(value: unknown): void {
  if (!Array.isArray(value) || value.length > 64) throw new Error("OpenAPI parameters exceed their bound");
  const names = new Set<string>();
  for (const raw of value) {
    const parameter = interfaceRecord(raw, "OpenAPI parameter");
    interfaceKeys(parameter, ["name", "in", "schema"], ["description", "required"], "OpenAPI parameter");
    const name = interfaceText(parameter.name, "parameter name", 128);
    if (parameter.in !== "path" && parameter.in !== "query") throw new Error("only inert path/query parameters are supported");
    const coordinate = `${parameter.in}:${name}`;
    if (names.has(coordinate)) throw new Error("OpenAPI parameters repeat ownership");
    names.add(coordinate);
    if (parameter.required !== undefined && typeof parameter.required !== "boolean") throw new Error("parameter required must be boolean");
    if (parameter.in === "path" && parameter.required !== true) throw new Error("path parameters must be required");
    if (parameter.description !== undefined) interfaceText(parameter.description, "parameter description", 4_096);
    validateInertInterfaceSchema(parameter.schema);
  }
}

function validateServers(value: unknown): void {
  if (!Array.isArray(value) || value.length > 8) throw new Error("OpenAPI servers exceed their bound");
  for (const raw of value) {
    const server = interfaceRecord(raw, "OpenAPI server");
    interfaceKeys(server, ["url"], ["description"], "OpenAPI server");
    const address = interfaceText(server.url, "server URL", 2_048);
    let url: URL;
    try { url = new URL(address); } catch { throw new Error("OpenAPI server URL is invalid"); }
    if (url.protocol !== "https:" || url.username !== "" || url.password !== "" || url.search !== "" || url.hash !== "" || /[{}]/u.test(address)) throw new Error("OpenAPI servers must be fixed credential-free HTTPS URLs");
    if (server.description !== undefined) interfaceText(server.description, "server description", 4_096);
  }
}

function extensionMetadata(value: unknown): { readonly id: string; readonly metadata: readonly { mode: "editable" | "reference"; manifest: ObjectValue }[] } {
  const extension = interfaceRecord(value, "Ghostget interface extension");
  interfaceKeys(extension, ["schemaVersion", "id", "adapters"], [], "Ghostget interface extension");
  if (extension.schemaVersion !== 1) throw new Error("Ghostget interface extension version is unsupported");
  if (!Array.isArray(extension.adapters) || extension.adapters.length > MAX_INTERFACE_ADAPTERS) throw new Error("interface adapters exceed their bound");
  const ids = new Set<string>();
  const metadata = extension.adapters.map((raw) => {
    const adapter = interfaceRecord(raw, "interface adapter");
    interfaceKeys(adapter, ["mode", "manifest"], [], "interface adapter");
    if (adapter.mode !== "editable" && adapter.mode !== "reference") throw new Error("interface adapter mode is unsupported");
    const manifest = interfaceRecord(adapter.manifest, "interface adapter manifest");
    interfaceKeys(manifest, ["schemaVersion", "id", "version", "displayName", "origins", "browserDomains"], ["surfaceId"], "interface adapter manifest");
    const id = interfaceId(manifest.id);
    if (ids.has(id)) throw new Error("interface repeats adapter ownership");
    ids.add(id);
    return { mode: adapter.mode as "editable" | "reference", manifest };
  });
  return { id: interfaceId(extension.id), metadata };
}

/** This compiles declarations only; it never loads an executor or follows a URL. */
export function parseInterfaceDocument(text: string, registry: ProviderPluginRegistry): ParsedInterfaceDocument {
  const document = interfaceRecord(readInterfaceJson(text, MAX_INTERFACE_DOCUMENT_BYTES), "OpenAPI document");
  interfaceKeys(document, ["openapi", "info", "paths"], ["servers", "x-ghostget"], "OpenAPI document");
  if (document.openapi !== "3.1.0" && document.openapi !== "3.1.1") throw new Error("interface requires OpenAPI 3.1.0 or 3.1.1");
  const info = interfaceRecord(document.info, "OpenAPI info");
  interfaceKeys(info, ["title", "version"], ["description"], "OpenAPI info");
  const title = interfaceText(info.title, "interface title", 100);
  interfaceText(info.version, "interface version", 64);
  if (info.description !== undefined) interfaceText(info.description, "interface description", 4_096);
  if (document.servers !== undefined) validateServers(document.servers);
  const extension = document["x-ghostget"] === undefined ? null : extensionMetadata(document["x-ghostget"]);
  const id = extension?.id ?? interfaceId(`import-${sha256(title).slice(0, 24)}`);
  const paths = interfaceRecord(document.paths, "OpenAPI paths");
  const definitions = new Map<string, Record<string, unknown>>();
  const metadata = new Map((extension?.metadata ?? []).map((entry) => [interfaceId(entry.manifest.id), entry]));
  const ownership = new Set<string>();
  const pathOwnership = new Set<string>();
  const issues: string[] = [];
  let operationCount = 0;
  for (const [path, rawPath] of Object.entries(paths)) {
    if (!path.startsWith("/") || path.length > 2_048 || /[\s?#\\]/u.test(path)) throw new Error("OpenAPI path is invalid");
    const normalized = path.replace(/\{[^{}]+\}/gu, "{}");
    if (pathOwnership.has(normalized)) throw new Error("OpenAPI paths have ambiguous ownership");
    pathOwnership.add(normalized);
    const item = interfaceRecord(rawPath, "OpenAPI path item");
    interfaceKeys(item, [], methods, "OpenAPI path item");
    for (const [method, rawOperation] of Object.entries(item)) {
      if (++operationCount > MAX_INTERFACE_OPERATIONS) throw new Error("interface operations exceed their bound");
      const operation = interfaceRecord(rawOperation, "OpenAPI operation");
      interfaceKeys(operation, ["operationId", "responses"], ["summary", "description", "requestBody", "parameters", "x-ghostget"], "OpenAPI operation");
      const publicId = interfaceText(operation.operationId, "OpenAPI operationId", 192);
      if (ownership.has(publicId)) throw new Error("interface repeats operation ownership");
      ownership.add(publicId);
      if (operation.summary !== undefined) interfaceText(operation.summary, "operation summary", 512);
      if (operation.description !== undefined) interfaceText(operation.description, "operation description", 4_096);
      if (operation.parameters !== undefined) validateParameters(operation.parameters);
      validateResponses(operation.responses);
      let inputSchema: unknown;
      if (operation.requestBody !== undefined) {
        const body = interfaceRecord(operation.requestBody, "OpenAPI request body");
        interfaceKeys(body, ["required", "content"], [], "OpenAPI request body");
        if (typeof body.required !== "boolean") throw new Error("request body required must be boolean");
        inputSchema = readContent(body.content);
      }
      if (operation["x-ghostget"] === undefined) {
        issues.push(`Operation ${publicId} needs a trusted Ghostget executor; its HTTP description is inert.`);
        continue;
      }
      const binding = interfaceRecord(operation["x-ghostget"], "operation Ghostget binding");
      interfaceKeys(binding, ["adapterId", "operationId", "definition"], [], "operation Ghostget binding");
      const adapterId = interfaceId(binding.adapterId);
      const boundOperationId = operationId(binding.operationId);
      if (!metadata.has(adapterId)) throw new Error("operation binding references an undeclared adapter");
      if (method !== "post" || path !== semanticPath(adapterId, boundOperationId) || publicId !== `${adapterId}:${boundOperationId}` || operation.parameters !== undefined || operation.summary !== undefined) throw new Error("bound operation changed its exact semantic route");
      const definition = interfaceRecord(binding.definition, "bound operation definition");
      interfaceKeys(definition, ["risk", "sideEffect", "idempotency", "dedupeWindowMs"], ["provider", "webSession", "localCli", "reviewedTemplate"], "bound operation definition");
      if (Object.keys(definition).filter((key) => ["provider", "webSession", "localCli", "reviewedTemplate"].includes(key)).length !== 1) throw new Error("bound operation must select exactly one semantic executor");
      const description = interfaceText(operation.description, "bound operation description", 4_096);
      const body = interfaceRecord(operation.requestBody, "bound request body");
      if (body.required !== true) throw new Error("bound operation requires its input object");
      const expectedResponses = { "200": { description: "Ghostget operation result", content: jsonContent(responseEnvelope()) } };
      if (canonicalJson(operation.responses) !== canonicalJson(expectedResponses)) throw new Error("bound operation changed its declared result envelope");
      const operations = definitions.get(adapterId) ?? {};
      if (Object.hasOwn(operations, boundOperationId)) throw new Error("interface repeats adapter operation ownership");
      operations[boundOperationId] = { ...definition, description, input: inputFromInterfaceSchema(inputSchema) };
      definitions.set(adapterId, operations);
    }
  }
  const adapters: AdapterProjection[] = [];
  for (const [adapterId, entry] of metadata) {
    const candidate = { ...entry.manifest, operations: definitions.get(adapterId) ?? {} };
    const parsed = parseRuntimeManifest(candidate, registry);
    const adapterIssues = parsed.ok ? [] : parsed.issues.map((issue) => `Adapter ${adapterId}: ${issue}`);
    if (parsed.ok && canonicalJson(parsed.value) !== canonicalJson(candidate)) throw new Error("interface binding contains non-canonical manifest state");
    adapters.push({ id: adapterId, mode: entry.mode, manifest: parsed.ok ? parsed.value : null, issues: adapterIssues });
    issues.push(...adapterIssues);
  }
  if (operationCount === 0) issues.push("This interface has no operations.");
  const canonical = canonicalJson(document);
  return Object.freeze({ id, title, digest: sha256(canonical), text: `${canonical}\n`, operationCount, adapters: Object.freeze(adapters), issues: Object.freeze(issues.slice(0, 64)) });
}

export function interfaceDocumentForManifests(options: { readonly id: string; readonly title: string; readonly manifests: readonly GhostgetManifest[]; readonly registry: ProviderPluginRegistry }): string {
  const paths: Record<string, unknown> = {};
  const ids = new Set<string>();
  const adapters = [...options.manifests].sort((left, right) => left.id.localeCompare(right.id)).map((candidate) => {
    const parsed = parseRuntimeManifest(candidate, options.registry);
    if (!parsed.ok) throw new Error("cannot export an invalid executable adapter");
    const manifest = parsed.value;
    if (ids.has(manifest.id)) throw new Error("cannot compose duplicate adapter ownership");
    ids.add(manifest.id);
    for (const [id, operation] of Object.entries(manifest.operations).sort(([left], [right]) => left.localeCompare(right))) {
      const { input, description, ...definition } = operation;
      paths[semanticPath(manifest.id, id)] = { post: {
        operationId: `${manifest.id}:${id}`, description,
        requestBody: { required: true, content: jsonContent(interfaceInputSchema(input)) },
        responses: { "200": { description: "Ghostget operation result", content: jsonContent(responseEnvelope()) } },
        "x-ghostget": { adapterId: manifest.id, operationId: id, definition },
      } };
    }
    const { operations: _operations, ...metadata } = manifest;
    return { mode: options.registry.resolveOwnedManifest(manifest.id) === undefined ? "editable" : "reference", manifest: metadata };
  });
  return parseInterfaceDocument(canonicalJson({
    openapi: "3.1.1", info: { title: options.title, version: "1.0.0" }, paths,
    "x-ghostget": { schemaVersion: 1, id: interfaceId(options.id), adapters },
  }), options.registry).text;
}

function directory(context: InterfaceContext): string {
  return join(ghostgetStateHome(context.environment), "control", "interfaces");
}

function recordPath(id: string, context: InterfaceContext): string {
  return join(directory(context), `${interfaceId(id)}.json`);
}

function readStored(id: string, context: InterfaceContext): StoredInterface | null {
  const bytes = readPrivateStateFileIfPresent(recordPath(id, context), MAX_INTERFACE_RECORD_BYTES, "interface draft", context.environment);
  if (bytes === null) return null;
  const raw = interfaceRecord(readInterfaceJson(bytes, MAX_INTERFACE_RECORD_BYTES), "interface record");
  interfaceKeys(raw, ["schemaVersion", "source", "document", "active"], [], "interface record");
  if (raw.schemaVersion !== 1 || (raw.source !== "user" && raw.source !== "imported") || typeof raw.document !== "string" || !Array.isArray(raw.active) || raw.active.length > MAX_INTERFACE_ADAPTERS) throw new Error("interface record is invalid");
  const parsed = parseInterfaceDocument(raw.document, context.registry);
  if (parsed.id !== id || raw.document !== parsed.text) throw new Error("interface record identity or canonical bytes changed");
  const active = raw.active.map((value) => {
    const item = interfaceRecord(value, "active interface projection");
    interfaceKeys(item, ["adapterId", "documentDigest", "manifestDigest"], [], "active interface projection");
    return { adapterId: interfaceId(item.adapterId), documentDigest: digest(item.documentDigest, "active document digest"), manifestDigest: digest(item.manifestDigest, "active manifest digest") };
  });
  if (new Set(active.map((entry) => entry.adapterId)).size !== active.length) throw new Error("interface record repeats active ownership");
  return { record: { schemaVersion: 1, source: raw.source, document: raw.document, active }, parsed, contentDigest: sha256(bytes) };
}

function view(stored: Pick<StoredInterface, "record" | "parsed">, context: InterfaceContext): InterfaceView {
  const { record, parsed } = stored;
  const issues = [...parsed.issues];
  const activationTargets: { adapterId: string; installedDigest: string | null }[] = [];
  let allActive = parsed.adapters.length > 0 && parsed.issues.length === 0;
  const knownActiveDigests = new Set<string>();
  for (const adapter of parsed.adapters) {
    const owned = context.registry.resolveOwnedManifest(adapter.id);
    const snapshot = owned === undefined ? loadInstalledManifestSnapshot(adapter.id, context.environment, context.registry) : null;
    if (snapshot?.availability === "unsafe" || (snapshot?.availability === "present" && !snapshot.result.ok)) throw new Error("installed interface adapter is unsafe; repair it before activation");
    const installed = owned ?? (snapshot?.result.ok ? snapshot.result.value : null);
    if (adapter.mode === "reference" || owned !== undefined) {
      issues.push(`Adapter ${adapter.id} belongs to its provider package; update it through that package lifecycle.`);
      allActive = false;
      continue;
    }
    if (adapter.manifest !== null) activationTargets.push({ adapterId: adapter.id, installedDigest: snapshot?.contentSha256 ?? null });
    const active = record.active.find((entry) => entry.adapterId === adapter.id);
    const matches = installed !== null && active !== undefined && active.manifestDigest === manifestHash(installed);
    if (matches) knownActiveDigests.add(active.documentDigest);
    if (!matches || active?.documentDigest !== parsed.digest || adapter.manifest === null || manifestHash(adapter.manifest) !== active.manifestDigest) allActive = false;
  }
  return Object.freeze({
    id: parsed.id, title: parsed.title, source: record.source, digest: parsed.digest,
    activeDigest: allActive ? parsed.digest : knownActiveDigests.size === 1 ? [...knownActiveDigests][0] ?? null : null,
    state: parsed.issues.length > 0 ? "needs-executor" : allActive ? "active" : "draft",
    operationCount: parsed.operationCount, adapterIds: parsed.adapters.map((entry) => entry.id), activationTargets, issues: issues.slice(0, 64),
  });
}

export function listInterfaces(context: InterfaceContext): readonly InterfaceView[] {
  const snapshot = snapshotPrivateStateDirectory(directory(context), context.environment);
  const files = snapshot.entries.filter((entry) => entry.name.endsWith(".json"));
  if (files.length > MAX_INTERFACE_DRAFTS) throw new Error("interface draft collection exceeds its bound");
  return files.sort((left, right) => left.name.localeCompare(right.name)).map((entry) => {
    if (entry.kind !== "file") throw new Error("interface draft entry is not a private file");
    const stored = readStored(interfaceId(entry.name.slice(0, -5)), context);
    if (stored === null) throw new Error("interface draft changed during listing; refresh");
    return view(stored, context);
  });
}

export function saveInterface(options: InterfaceContext & { readonly document: string; readonly source: "user" | "imported"; readonly expectedDigest: string | null }): InterfaceView {
  const parsed = parseInterfaceDocument(options.document, options.registry);
  if (options.source !== "user" && options.source !== "imported") throw new Error("interface source is unsupported");
  const previous = readStored(parsed.id, options);
  if (options.expectedDigest !== null) digest(options.expectedDigest, "expected interface digest");
  if ((previous?.parsed.digest ?? null) !== options.expectedDigest) throw new Error("interface draft changed; refresh before saving");
  if (previous !== null && previous.record.source !== options.source) throw new Error("interface provenance cannot be relabeled");
  const record: InterfaceRecord = { schemaVersion: 1, source: options.source, document: parsed.text, active: previous?.record.active ?? [] };
  if (Buffer.byteLength(canonicalJson(record)) > MAX_INTERFACE_RECORD_BYTES) throw new Error("interface record exceeds its storage limit");
  ensurePrivateStateDirectory(directory(options), options.environment);
  if (previous === null && snapshotPrivateStateDirectory(directory(options), options.environment).entries.filter((entry) => entry.name.endsWith(".json")).length >= MAX_INTERFACE_DRAFTS) throw new Error("interface draft collection is full");
  const changed = previous === null
    ? createPrivateJsonIfAbsent(recordPath(parsed.id, options), record, { privateParent: true, environment: options.environment }).created
    : writePrivateJsonIfUnchanged(recordPath(parsed.id, options), record, { expectedCurrentContentSha256: previous.contentDigest, privateParent: true });
  if (!changed) throw new Error("interface draft changed concurrently; refresh before saving");
  return view({ record, parsed }, options);
}

export function activateInterface(options: InterfaceContext & { readonly id: string; readonly digest: string; readonly adapterId: string; readonly expectedInstalledDigest: string | null }): InterfaceView {
  digest(options.digest, "interface digest");
  if (options.expectedInstalledDigest !== null) digest(options.expectedInstalledDigest, "installed adapter digest");
  const stored = readStored(interfaceId(options.id), options);
  if (stored === null || stored.parsed.digest !== options.digest) throw new Error("interface draft changed; refresh before activation");
  const adapter = stored.parsed.adapters.find((entry) => entry.id === options.adapterId);
  if (adapter?.manifest === null || adapter === undefined) throw new Error("selected adapter needs a matching trusted executor");
  if (adapter.mode === "reference" || options.registry.resolveOwnedManifest(adapter.id) !== undefined) throw new Error("portable-owned adapters must use their provider package lifecycle");
  const current = loadInstalledManifestSnapshot(adapter.id, options.environment, options.registry);
  if (current.availability === "unsafe" || (current.availability === "present" && !current.result.ok)) throw new Error("installed adapter is unsafe; activation refused");
  if (current.contentSha256 !== options.expectedInstalledDigest) throw new Error("installed adapter changed; refresh before activation");
  installManifest(adapter.manifest, {
    force: options.expectedInstalledDigest !== null,
    environment: options.environment,
    registry: options.registry,
    ...(options.expectedInstalledDigest === null ? {} : { expectedCurrentContentSha256: options.expectedInstalledDigest }),
  });
  // The installed manifest is the authority. This receipt records UI provenance only;
  // losing it cannot preserve a permission for an old manifest or roll back a commit.
  const active: ActiveProjection = { adapterId: adapter.id, documentDigest: stored.parsed.digest, manifestDigest: manifestHash(adapter.manifest) };
  const record: InterfaceRecord = { ...stored.record, active: [...stored.record.active.filter((entry) => entry.adapterId !== adapter.id), active].sort((left, right) => left.adapterId.localeCompare(right.adapterId)) };
  if (!writePrivateJsonIfUnchanged(recordPath(options.id, options), record, { expectedCurrentContentSha256: stored.contentDigest, privateParent: true })) throw new Error("adapter activated, but its draft changed concurrently; refresh to reconcile");
  return view({ record, parsed: stored.parsed }, options);
}

export function exportInterfaces(options: InterfaceContext & { readonly adapterId: string | null }): { readonly text: string; readonly filename: string } {
  const manifests = new Map<string, GhostgetManifest>();
  for (const { id, result } of listInstalledManifests(options.environment, options.registry)) {
    if (options.adapterId !== null && options.adapterId !== id) continue;
    if (!result.ok) throw new Error("cannot export an invalid installed adapter");
    manifests.set(id, result.value);
  }
  for (const owned of options.registry.listOwnedManifests()) {
    if (options.adapterId !== null && options.adapterId !== owned.id) continue;
    const existing = manifests.get(owned.id);
    if (existing !== undefined && manifestHash(existing) !== manifestHash(owned)) throw new Error("installed and portable-owned adapters conflict");
    manifests.set(owned.id, owned);
  }
  if (options.adapterId !== null && !manifests.has(options.adapterId)) throw new Error("adapter is not installed");
  const id = options.adapterId === null ? "ghostget-interfaces" : interfaceId(options.adapterId);
  return {
    text: interfaceDocumentForManifests({ id, title: options.adapterId === null ? "Ghostget interfaces" : manifests.get(id)?.displayName ?? id, manifests: [...manifests.values()], registry: options.registry }),
    filename: `${id}.openapi.json`,
  };
}

/** Projection used by catalog views; inactive edits never relabel an installed capability. */
export function interfaceSources(context: InterfaceContext): ReadonlyMap<string, { readonly manifestDigest: string; readonly source: "user" | "imported" }> {
  const snapshot = snapshotPrivateStateDirectory(directory(context), context.environment);
  const files = snapshot.entries.filter((entry) => entry.name.endsWith(".json"));
  if (files.length > MAX_INTERFACE_DRAFTS) throw new Error("interface draft collection exceeds its bound");
  const sources = new Map<string, { readonly manifestDigest: string; readonly source: "user" | "imported" }>();
  const conflicts = new Set<string>();
  for (const file of files.sort((left, right) => left.name.localeCompare(right.name))) {
    if (file.kind !== "file") throw new Error("interface draft entry is not a private file");
    const stored = readStored(interfaceId(file.name.slice(0, -5)), context);
    if (stored === null) throw new Error("interface draft changed during listing; refresh");
    for (const active of stored.record.active) {
      if (conflicts.has(active.adapterId)) continue;
      const previous = sources.get(active.adapterId);
      if (previous !== undefined && (previous.manifestDigest !== active.manifestDigest || previous.source !== stored.record.source)) {
        // Multiple historic owners cannot manufacture a current provenance label.
        sources.delete(active.adapterId);
        conflicts.add(active.adapterId);
        continue;
      }
      sources.set(active.adapterId, { manifestDigest: active.manifestDigest, source: stored.record.source });
    }
  }
  return sources;
}

// Middleware never executes while parsing, composing or activating an interface.
// Future hooks may narrow authority; changing an invocation must reauthorize it.
