/**
 * Differential tests for the Lean encoding and negotiation proofs.
 *
 * `bun run verify:lean` builds the Lean project, audits its theorems, and then
 * runs this file with `GHOSTGET_LEAN_LAKE` and `GHOSTGET_LEAN_PROJECT` naming
 * the pinned `lake` and the built project copy. Each property feeds the same
 * generated input to the production TypeScript and to the Lean definitions the
 * theorems are about, evaluated by `GhostgetVerification/Differential.lean`,
 * and requires the same answer. That ties each theorem to the code it
 * describes: a proof about a definition the TypeScript does not compute would
 * fail here.
 *
 * The example tests show that production rejects each seeded defect's
 * counterexample from `verification/lean/proofs.json`.
 */
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";

import {
  negotiateDocumentRepresentation,
  parseAcceptMediaRanges,
  type DocumentRepresentation,
} from "../edge/negotiation.js";
import { canonicalJson } from "../src/canonical-json.js";
import { localCliContractHash, type LocalCliContract } from "../src/local-cli-contracts.js";
import { providerContractHash, type ProviderContract } from "../src/provider-contracts.js";
import { providerPluginTransports } from "../src/provider-plugin.js";
import { isProviderPluginOperationName, isProviderPluginSurfaceId } from "../src/provider-plugin-identifiers.js";
import { operationKey, routeKey, updateLengthFramedHash, type ProviderPluginRegistry } from "../src/provider-plugin-registry.js";
import { intentLedgerPath } from "../src/runtime.js";
import { parseSessionSecretFileName, sessionSecretFileName } from "../src/session-secrets.js";
import { assertAsyncProperty, fc } from "../src/test-support.js";

const DIFFERENTIAL_MODULE = "GhostgetVerification/Differential.lean";

type Json = null | boolean | number | string | Json[] | { [key: string]: Json };

function requiredEnvironment(name: string): string {
  const value = process.env[name];
  if (value === undefined || value === "") {
    throw new Error(`${name} must name the Lean toolchain; run this file through bun run verify:lean`);
  }
  return value;
}

/** One `lean --run` process of the differential module, answering one query per line. */
class LeanReference {
  private buffer = "";
  private readonly decoder = new TextDecoder();
  private readonly child: ReturnType<typeof Bun.spawn<"pipe", "pipe", "pipe">>;
  private readonly chunks: AsyncIterator<Uint8Array>;
  private readonly stderr: Promise<string>;

  constructor() {
    this.child = Bun.spawn(
      [requiredEnvironment("GHOSTGET_LEAN_LAKE"), "env", "lean", "--run", DIFFERENTIAL_MODULE],
      {
        cwd: requiredEnvironment("GHOSTGET_LEAN_PROJECT"),
        env: { ...process.env },
        stdin: "pipe",
        stdout: "pipe",
        stderr: "pipe",
      },
    );
    this.chunks = this.child.stdout[Symbol.asyncIterator]();
    this.stderr = new Response(this.child.stderr).text();
  }

  async ask(query: string): Promise<string> {
    this.child.stdin.write(`${query}\n`);
    await this.child.stdin.flush();
    let newline = this.buffer.indexOf("\n");
    while (newline === -1) {
      const chunk = await this.chunks.next();
      if (chunk.done) {
        throw new Error(`the Lean reference exited before answering: ${(await this.stderr).slice(0, 2_000)}`);
      }
      this.buffer += this.decoder.decode(chunk.value, { stream: true });
      newline = this.buffer.indexOf("\n");
    }
    const reply = this.buffer.slice(0, newline);
    this.buffer = this.buffer.slice(newline + 1);
    if (reply === "error") throw new Error(`the Lean reference rejected the query ${query.slice(0, 200)}`);
    return reply;
  }

  async close(): Promise<void> {
    this.child.stdin.end();
    const exitCode = await this.child.exited;
    const stderr = await this.stderr;
    if (exitCode !== 0 || stderr !== "" || this.buffer !== "") {
      throw new Error(`the Lean reference did not finish cleanly (exit ${String(exitCode)}): ${stderr.slice(0, 2_000)}`);
    }
  }
}

let lean: LeanReference;
let stateRoot: string;

beforeAll(async () => {
  lean = new LeanReference();
  // The first query waits for Lean to load the library.
  expect(await lean.ask("cj 0")).toBe("110 117 108 108");
  stateRoot = await mkdtemp(join(tmpdir(), "ghostget-lean-differential-"));
});

afterAll(async () => {
  await lean.close();
  await rm(stateRoot, { recursive: true, force: true });
});

// Encodings of TypeScript values as the differential module reads them.

const codeUnits = (text: string): number[] => Array.from({ length: text.length }, (_, index) => text.charCodeAt(index));

const encodeUnits = (text: string): number[] => [text.length, ...codeUnits(text)];

const encodeBytes = (bytes: Uint8Array): number[] => [bytes.length, ...bytes];

function encodeJson(value: Json): number[] {
  if (value === null) return [0];
  if (value === false) return [1];
  if (value === true) return [2];
  if (typeof value === "number") {
    if (!Number.isSafeInteger(value)) throw new Error("the Lean model covers safe integers only");
    return [3, value < 0 ? 1 : 0, Math.abs(value)];
  }
  if (typeof value === "string") return [4, ...encodeUnits(value)];
  if (Array.isArray(value)) return [5, value.length, ...value.flatMap(encodeJson)];
  const members = Object.entries(value);
  return [6, members.length, ...members.flatMap(([key, member]) => [...encodeUnits(key), ...encodeJson(member)])];
}

const query = (mode: string, numbers: readonly number[]): string => [mode, ...numbers].join(" ");

const render = (numbers: readonly number[]): string => numbers.join(" ");

const renderUnits = (text: string): string => render(encodeUnits(text));

const sha256Hex = (bytes: readonly number[]): string => createHash("sha256").update(Uint8Array.from(bytes)).digest("hex");

const replyBytes = (reply: string): number[] => reply === "" ? [] : reply.split(" ").map(Number);

// Generators.

/** UTF-16 code units, weighted toward escapes, controls, NUL, and lone surrogates. */
const codeUnitText = fc.array(
  fc.oneof(
    fc.integer({ min: 0, max: 0xffff }),
    fc.constantFrom(0, 8, 9, 10, 12, 13, 0x1f, 0x22, 0x2f, 0x5c, 0x61, 0x6e, 0x75, 0x7f, 0x2028, 0xd800, 0xdbff, 0xdc00, 0xdfff),
  ),
  { maxLength: 8 },
).map((units) => String.fromCharCode(...units));

const text = fc.oneof(codeUnitText, fc.string({ unit: "binary", maxLength: 6 }), fc.string({ maxLength: 6 }));

const integer = fc.oneof(fc.integer({ min: -1_000, max: 1_000 }), fc.maxSafeInteger(), fc.constantFrom(Number.MAX_SAFE_INTEGER, Number.MIN_SAFE_INTEGER));

const members = <Value>(value: fc.Arbitrary<Value>): fc.Arbitrary<{ [key: string]: Value }> =>
  fc.array(fc.tuple(text, value), { maxLength: 4 }).map((entries) => Object.fromEntries(entries));

const { json } = fc.letrec<{ json: Json }>((tie) => ({
  json: fc.oneof(
    { depthSize: "small", withCrossShrink: true },
    fc.constant(null),
    fc.boolean(),
    integer,
    text,
    fc.array(tie("json"), { maxLength: 4 }),
    members(tie("json")),
  ),
}));

const jsonObject = members(json);

const bytes = fc.uint8Array({ maxLength: 12 });

const representations = fc.array(fc.constantFrom<DocumentRepresentation>("html", "markdown"), { minLength: 1, maxLength: 3 })
  .map((reps) => reps as unknown as readonly [DocumentRepresentation, ...DocumentRepresentation[]]);

const mediaRange = fc.tuple(
  fc.constantFrom(
    "text/html", "text/markdown", "text/*", "*/*", "TEXT/HTML", "Text/Markdown", "text/plain", "*/html",
    "application/json", " text/html ", "", "text", "text/html/x", "text/mark down",
  ),
  fc.array(
    fc.constantFrom(
      ";q=0", ";q=0.5", ";q=1", ";q=0.000", ";q=1.000", ";q=0.001", ";q=0.999", ";q=2", ";q=1.5", ";level=1",
      " ; q=0.8", ";Q=0.3", ";q=", ";q=abc", ";q=0.1234", ";=1", ";q",
    ),
    { maxLength: 3 },
  ),
).map(([media, parameters]) => media + parameters.join(""));

const acceptHeader = fc.oneof(
  fc.constant(null),
  fc.array(mediaRange, { maxLength: 5 }).map((ranges) => ranges.join(",")),
  fc.string({ maxLength: 24 }),
);

/** Session-secret name parts, heavy in the `-` and `.` that make names collide. */
const namePart = fc.oneof(
  fc.array(fc.constantFrom("a", "b", "z", "0", "9", "-", "-", "-", ".", "A", "_", "\n", "\u00e9"), { maxLength: 7 }).map((parts) => parts.join("")),
  fc.array(fc.constantFrom("a", "-"), { maxLength: 6 }).map((parts) => `a${parts.join("")}`),
  fc.constantFrom("a".repeat(48), "a".repeat(49), "a-".repeat(24), ""),
  fc.string({ maxLength: 6 }),
);

const secretFileName = fc.tuple(namePart, fc.constantFrom("--", ".", "-", "---", "----", ""), namePart, fc.constantFrom(".json", "", ".JSON", "json"))
  .map(([namespace, separator, authId, suffix]) => `${namespace}${separator}${authId}${suffix}`);

/** Identifier candidates, heavy in the separators the registry keys use and near the length bounds. */
const kebabSegment = fc.oneof(
  fc.array(fc.constantFrom("a", "b", "z", "0", "9", "-", "-", ".", ":", "/", "@", "A", "_", "\u00e9"), { maxLength: 8 }).map((parts) => parts.join("")),
  fc.array(fc.constantFrom("a", "0", "-"), { maxLength: 6 }).map((parts) => `a${parts.join("")}`),
  fc.array(fc.constantFrom("a", "b", "0", "-", ".", ":", "/", "@"), { maxLength: 6 }).map((parts) => `a${parts.join("")}`),
  fc.constantFrom("a".repeat(40), "a".repeat(41), "a".repeat(63), "a".repeat(64), "a-b", "a--b", "a-", "-a", ""),
);
/** Kebab-shaped runs joined by one separator each, so a grammar that admitted a separator would be exercised. */
const separated = fc.array(
  fc.tuple(fc.constantFrom("-", "-", ".", ".", "/", ":", "@", "--", "_"), fc.constantFrom("a", "b0", "z9", "0")),
  { minLength: 1, maxLength: 4 },
).map((parts) => `a${parts.flat().join("")}`);
const identifier = fc.oneof(
  { arbitrary: separated, weight: 4 },
  kebabSegment,
  fc.array(kebabSegment, { minLength: 1, maxLength: 5 }).map((segments) => segments.join(".")),
  fc.array(fc.constantFrom("a".repeat(40), "b".repeat(40)), { minLength: 4, maxLength: 5 }).map((segments) => segments.join(".")),
  fc.constantFrom("messaging.list", "conversations.read", "a.b.c.d", "a.b.c.d.e", "a-b.c0-d", "a.b@1", "a:b.c", "a/b.c"),
  fc.string({ maxLength: 8 }),
);
const validSurface = identifier.filter((value) => isProviderPluginSurfaceId(value));
const validOperation = identifier.filter((value) => isProviderPluginOperationName(value));
const transport = fc.constantFrom(...providerPluginTransports);
const contractVersion = fc.oneof(fc.integer({ min: 0, max: 20 }), fc.integer({ min: 0, max: Number.MAX_SAFE_INTEGER }));

// Stand-ins for the registry: only the operation lookup and implementation hash matter to a contract hash.

function stubRegistry(transport: "provider-api" | "local-cli", implementationHash: string): ProviderPluginRegistry {
  return {
    resolveOperationDefinition: () => ({ binding: { transport }, operation: {} }),
    contractImplementationHash: () => implementationHash,
  } as unknown as ProviderPluginRegistry;
}

/** A hash that records the bytes it is fed, so the exact framed stream can be compared. */
function framedStream(sections: readonly (readonly [string, Uint8Array])[]): number[] {
  const recorded: number[] = [];
  const recorder = {
    update(chunk: Uint8Array) {
      recorded.push(...chunk);
      return recorder;
    },
  };
  for (const [label, payload] of sections) {
    updateLengthFramedHash(recorder as unknown as ReturnType<typeof createHash>, label, Buffer.from(payload));
  }
  return recorded;
}

const encodeSections = (sections: readonly (readonly [string, Uint8Array])[]): number[] => [
  sections.length,
  ...sections.flatMap(([label, payload]) => [...encodeBytes(Buffer.from(label, "utf8")), ...encodeBytes(payload)]),
];

function intentKey(fields: readonly [string, string, string, string, string | undefined]): string {
  const path = intentLedgerPath(fields[0], fields[1], fields[2], fields[3], { GHOSTGET_STATE_HOME: join(stateRoot, "state") }, fields[4]);
  const key = basename(path, ".json");
  expect(basename(dirname(path))).toBe(key.slice(0, 2));
  return key;
}

const encodeIntent = (fields: readonly [string, string, string, string, string | undefined]): number[] => [
  ...fields.slice(0, 4).flatMap((field) => encodeUnits(field as string)),
  ...(fields[4] === undefined ? [0] : [1, ...encodeUnits(fields[4])]),
];

function tsSessionSecretName(namespace: string, authId: string): string {
  try {
    return renderUnits(sessionSecretFileName(namespace, authId));
  } catch {
    return "none";
  }
}

function tsParsedName(name: string): string {
  const parsed = parseSessionSecretFileName(name);
  if (parsed === null) return "null";
  if (parsed.kind === "coordinate") return `c ${renderUnits(parsed.namespace)} ${renderUnits(parsed.authId)}`;
  return [
    `a ${String(parsed.candidates.length)}`,
    ...parsed.candidates.map((candidate) => `${renderUnits(candidate.namespace)} ${renderUnits(candidate.authId)}`),
  ].join(" ");
}

function encodeNegotiation(header: string | null, reps: readonly DocumentRepresentation[]): number[] {
  const ranges = parseAcceptMediaRanges(header);
  return [
    ranges.length,
    ...ranges.flatMap((range) => [range.index, range.q, range.specificity, ...encodeUnits(range.type), ...encodeUnits(range.subtype)]),
    reps.length,
    ...reps.map((rep) => rep === "html" ? 0 : 1),
  ];
}

const DECISIONS = { html: "0", markdown: "1", "not-acceptable": "2" } as const;

describe("Lean encoding proofs agree with the TypeScript", () => {
  test("canonicalJson matches the Lean canonicalJson on generated values", async () => {
    await assertAsyncProperty(fc.asyncProperty(json, async (value) => {
      expect(await lean.ask(query("cj", encodeJson(value)))).toBe(render(codeUnits(canonicalJson(value))));
    }));
  });

  test("provider and local CLI contract hashes are SHA-256 of the Lean contractHashPreimage", async () => {
    await assertAsyncProperty(fc.asyncProperty(jsonObject, text, async (contract, implementation) => {
      const preimage = replyBytes(await lean.ask(query("cpre", [...encodeJson(contract), ...encodeBytes(Buffer.from(implementation, "utf8"))])));
      expect(providerContractHash(contract as unknown as ProviderContract, stubRegistry("provider-api", implementation))).toBe(sha256Hex(preimage));
      expect(localCliContractHash(contract as unknown as LocalCliContract, stubRegistry("local-cli", implementation))).toBe(sha256Hex(preimage));
    }));
  });

  test("updateLengthFramedHash feeds the hash exactly the Lean frames stream", async () => {
    const sections = fc.array(fc.tuple(text, bytes), { maxLength: 4 });
    await assertAsyncProperty(fc.asyncProperty(sections, async (value) => {
      expect(await lean.ask(query("frames", encodeSections(value)))).toBe(render(framedStream(value)));
    }));
  });

  test("intentLedgerPath names SHA-256 of the Lean intentKeyPreimage", async () => {
    const hex = fc.stringMatching(/^[0-9a-f]{64}$/u);
    const identifier = fc.stringMatching(/^[a-z][a-z0-9._-]{0,12}$/u);
    const field = fc.oneof(identifier, hex, text);
    const fields = fc.tuple(field, field, field, fc.oneof(hex, text), fc.option(fc.oneof(hex, text), { nil: undefined }));
    await assertAsyncProperty(fc.asyncProperty(fields, async (value) => {
      expect(intentKey(value)).toBe(sha256Hex(replyBytes(await lean.ask(query("intent", encodeIntent(value))))));
    }));
  });

  test("sessionSecretFileName matches the Lean fileName, including where it throws", async () => {
    await assertAsyncProperty(fc.asyncProperty(namePart, namePart, async (namespace, authId) => {
      expect(await lean.ask(query("ssname", [...encodeUnits(namespace), ...encodeUnits(authId)]))).toBe(tsSessionSecretName(namespace, authId));
    }));
  });

  test("parseSessionSecretFileName matches the Lean parse on generated names", async () => {
    const written = fc.tuple(namePart, namePart).chain(([namespace, authId]) => {
      try {
        return fc.constant(sessionSecretFileName(namespace, authId));
      } catch {
        return fc.constant(`${namespace}.${authId}.json`);
      }
    });
    await assertAsyncProperty(fc.asyncProperty(fc.oneof(secretFileName, written), async (name) => {
      expect(await lean.ask(query("ssparse", encodeUnits(name)))).toBe(tsParsedName(name));
    }));
  });

  test("the surface ID and operation name grammars match the Lean validSurface and validOperation", async () => {
    await assertAsyncProperty(fc.asyncProperty(identifier, async (value) => {
      expect(await lean.ask(query("rsurf", encodeUnits(value)))).toBe(isProviderPluginSurfaceId(value) ? "1" : "0");
      expect(await lean.ask(query("rop", encodeUnits(value)))).toBe(isProviderPluginOperationName(value) ? "1" : "0");
    }));
  });

  test("routeKey and operationKey match the Lean routeKey and operationKey on valid parts", async () => {
    await assertAsyncProperty(fc.asyncProperty(transport, validSurface, validOperation, contractVersion, async (t, surface, operation, version) => {
      expect(await lean.ask(query("rkey", [...encodeUnits(t), ...encodeUnits(surface)]))).toBe(renderUnits(routeKey(t, surface)));
      expect(await lean.ask(query("okey", [...encodeUnits(t), ...encodeUnits(surface), ...encodeUnits(operation), version])))
        .toBe(renderUnits(operationKey(t, surface, operation, version)));
    }));
  });

  test("negotiateDocumentRepresentation matches the Lean negotiate over the parsed ranges", async () => {
    await assertAsyncProperty(fc.asyncProperty(acceptHeader, representations, async (header, reps) => {
      const decision = negotiateDocumentRepresentation(header, reps).kind;
      expect(await lean.ask(query("neg", encodeNegotiation(header, reps)))).toBe(DECISIONS[decision]);
    }));
  });
});

describe("production rejects each seeded defect's counterexample", () => {
  test("canonicalJsonKeepingBackslash: a backslash-n and a newline stay distinct", async () => {
    const backslashN = "\\n";
    const newline = "\n";
    expect(canonicalJson(backslashN)).not.toBe(canonicalJson(newline));
    for (const value of [backslashN, newline]) {
      expect(await lean.ask(query("cj", encodeJson(value)))).toBe(render(codeUnits(canonicalJson(value))));
    }
  });

  test("canonicalJsonInsertionOrder: member order does not change the encoding", () => {
    expect(canonicalJson({ a: 1, b: 2 })).toBe(canonicalJson({ b: 2, a: 1 }));
    expect(canonicalJson({ b: [{ d: null, c: true }], a: "x" })).toBe('{"a":"x","b":[{"c":true,"d":null}]}');
  });

  test("canonicalJsonRawNul: a NUL code unit is escaped, never written", () => {
    expect(canonicalJson("\0")).toBe('"\\u0000"');
    expect(canonicalJson({ "\0": "\0" }).includes("\0")).toBeFalse();
  });

  test("contractHashPreimageUnseparated: the NUL separator keeps 1 + \"2\" apart from 12 + \"\"", async () => {
    const one = replyBytes(await lean.ask(query("cpre", [...encodeJson(1), ...encodeBytes(Buffer.from("2"))])));
    const twelve = replyBytes(await lean.ask(query("cpre", [...encodeJson(12), ...encodeBytes(Buffer.from(""))])));
    expect(one).toEqual([49, 0, 50]);
    expect(twelve).toEqual([49, 50, 0]);
    const contract = { provider: "p", operation: "o", contractVersion: 1 };
    expect(providerContractHash(contract as unknown as ProviderContract, stubRegistry("provider-api", "2")))
      .toBe(sha256Hex([...Buffer.from(canonicalJson(contract)), 0, 50]));
  });

  test("framesUnprefixed: label ab with no payload differs from label a with payload b", () => {
    const joined = framedStream([["ab", new Uint8Array()]]);
    const split = framedStream([["a", Uint8Array.of(98)]]);
    expect(joined).not.toEqual(split);
    expect(joined).toEqual([0, 0, 0, 2, 0, 0, 0, 0, 0, 0, 0, 0, 97, 98]);
    expect(split).toEqual([0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 97, 98]);
  });

  test("intentKeyPreimagePlain: adapter ab with auth c differs from adapter a with auth bc", () => {
    expect(intentKey(["ab", "c", "d", "e", undefined])).not.toBe(intentKey(["a", "bc", "d", "e", undefined]));
  });

  test("fileNameHistorical: a + b--c and a--b + c get distinct names that parse back", () => {
    const first = sessionSecretFileName("a", "b--c");
    const second = sessionSecretFileName("a--b", "c");
    expect(first).not.toBe(second);
    expect(parseSessionSecretFileName(first)).toEqual({ kind: "coordinate", namespace: "a", authId: "b--c" });
    expect(parseSessionSecretFileName(second)).toEqual({ kind: "coordinate", namespace: "a--b", authId: "c" });
    expect(parseSessionSecretFileName("a--b--c.json")?.kind).toBe("ambiguous-historical");
  });

  test("operationKeyUnseparated: surface a with operation bx.c differs from surface ab with operation x.c", () => {
    expect(isProviderPluginSurfaceId("a") && isProviderPluginSurfaceId("ab")).toBeTrue();
    expect(isProviderPluginOperationName("bx.c") && isProviderPluginOperationName("x.c")).toBeTrue();
    expect(operationKey("local-cli", "a", "bx.c", 1)).not.toBe(operationKey("local-cli", "ab", "x.c", 1));
    expect(operationKey("local-cli", "a", "bx.c", 1)).toBe("local-cli:a/bx.c@1");
  });

  test("negotiateIgnoringQZero: text/html;q=0 refuses the only representation", () => {
    expect(negotiateDocumentRepresentation("text/html;q=0", ["html"])).toEqual({ kind: "not-acceptable", accept: "text/html;q=0" });
  });

  test("negotiateFirstMatch: a higher q wins over server order", () => {
    expect(negotiateDocumentRepresentation("text/html;q=0.5, text/markdown", ["html", "markdown"])).toEqual({ kind: "markdown" });
  });
});
