/**
 * Differential tests between the shipped TypeScript and the independent Rust
 * oracle under `verification/oracles/`.
 *
 * - Canonical JSON: generated JSON values, the RFC 8785 examples, and the
 *   golden vectors in `verification/vectors/jcs.json` go through both
 *   `canonicalJson` and the oracle's RFC 8785 canonicalizer, which must agree
 *   byte for byte.
 * - Web gateway URLs: generated URL candidates and named examples go through
 *   both `publicUrl` over the runtime's WHATWG `URL` and the oracle's
 *   independent restatement of the same policy over the Rust `url` crate. The
 *   admission decisions must agree, and every URL both parsers accept must
 *   have the same components.
 *
 * Each comparison also runs against seeded defects that the oracle must catch.
 * `bun run ./scripts/verification-oracles.ts` builds the oracle first;
 * `bun run verify:oracles` runs both in order.
 */
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { access } from "node:fs/promises";
import { join } from "node:path";
import { isDeepStrictEqual } from "node:util";

import { canonicalJson, legacyCanonicalJson } from "../src/canonical-json.js";
import { publicUrl } from "../src/control/validation.js";
import { assertAsyncProperty, fc } from "../src/test-support.js";
import { ORACLE_VERSION_LINE } from "./verification-oracles.js";
import { REPOSITORY_ROOT, RUST_ORACLE } from "./verification-tools.js";

const ORACLE = join(REPOSITORY_ROOT, RUST_ORACLE.binary);
/** Values or URLs per oracle round trip inside one property run. */
const BATCH = 24;

// ---------------------------------------------------------------------------
// Oracle process
// ---------------------------------------------------------------------------

type OracleProcess = ReturnType<typeof Bun.spawn<"pipe", "pipe", "pipe">>;

const stdoutReader = (child: OracleProcess) => child.stdout.getReader();

/**
 * One long-lived oracle process. Each request is one line and each answer is
 * one line, in order, so a batch is written at once and read back in order.
 */
class Oracle {
  readonly #child: OracleProcess;
  readonly #reader: ReturnType<typeof stdoutReader>;
  readonly #decoder = new TextDecoder();
  #buffer = "";

  constructor(mode: "jcs" | "url") {
    this.#child = Bun.spawn([ORACLE, mode], { stdin: "pipe", stdout: "pipe", stderr: "pipe", env: { LANG: "C", LC_ALL: "C" } });
    this.#reader = stdoutReader(this.#child);
  }

  async ask(requests: readonly string[]): Promise<readonly string[]> {
    for (const request of requests) {
      if (request.includes("\n") || request.includes("\r")) throw new Error("an oracle request must be one line");
      this.#child.stdin.write(`${request}\n`);
    }
    await this.#child.stdin.flush();
    const answers: string[] = [];
    while (answers.length < requests.length) {
      const newline = this.#buffer.indexOf("\n");
      if (newline >= 0) {
        answers.push(this.#buffer.slice(0, newline));
        this.#buffer = this.#buffer.slice(newline + 1);
        continue;
      }
      const { done, value } = await this.#reader.read();
      if (done || value === undefined) throw new Error(`the oracle exited early: ${await new Response(this.#child.stderr).text()}`);
      this.#buffer += this.#decoder.decode(value, { stream: true });
    }
    return answers;
  }

  async close(): Promise<void> {
    await this.#child.stdin.end();
    const code = await this.#child.exited;
    if (code !== 0) throw new Error(`the oracle exited with ${String(code)}`);
  }
}

let jcsOracle: Oracle;
let urlOracle: Oracle;

beforeAll(async () => {
  try {
    await access(ORACLE);
  } catch {
    throw new Error("Build the oracle first: bun run ./scripts/verification-oracles.ts");
  }
  const version = Bun.spawnSync([ORACLE, "version"]);
  expect(version.stdout.toString().trim()).toBe(ORACLE_VERSION_LINE);
  jcsOracle = new Oracle("jcs");
  urlOracle = new Oracle("url");
});

afterAll(async () => {
  await jcsOracle.close();
  await urlOracle.close();
});

// ---------------------------------------------------------------------------
// Canonical JSON
// ---------------------------------------------------------------------------

type Canonicalizer = (value: unknown) => string;

/**
 * Member names that separate orderings: UTF-16 code-unit order (RFC 8785)
 * puts U+E000 through U+FFFF after the surrogate pairs of astral characters,
 * UTF-8 byte order does not, and locale collation reorders case, punctuation,
 * and combining marks.
 */
const MEMBER_NAMES = [
  "", "a", "b", "A", "B", "Z", "z", "_", "-", "aa", "a_b", "a-b", "1", "10", "2",
  "__proto__", "constructor", "\u{e4}", "a\u{308}", "\u{20ac}", "\u{1f600}", "\u{ffff}",
  "\u{e000}", "\u{d7ff}", "\u{2028}", "\u{0}", "\r", "\u{80}", "\u{fb33}", "<", ">",
];

/** A lone surrogate is outside I-JSON; with the u flag, paired halves match as one code point instead. */
const LONE_SURROGATE = /[\u{d800}-\u{dfff}]/u;
const wellFormedText = fc.string({ unit: "binary", maxLength: 12 }).filter((text) => !LONE_SURROGATE.test(text));

const numbers = fc.oneof(
  fc.double({ noNaN: true, noDefaultInfinity: true }),
  fc.integer({ min: -(2 ** 53), max: 2 ** 53 }),
  // At a power of two the shortest digits that parse back can lie on the far
  // side of the closest decimal of the same length.
  fc.integer({ min: -1074, max: 1023 }).map((exponent) => 2 ** exponent),
  fc.constantFrom(0, -0, 1e21, 1e-7, 1e-6, 123e-20, 2 ** 53 + 2, Number.MAX_VALUE, Number.MIN_VALUE, 5e-324, 1e23),
);

const memberName = fc.oneof(fc.constantFrom(...MEMBER_NAMES), wellFormedText);

const jsonValue: fc.Arbitrary<unknown> = fc.letrec<{ value: unknown }>((tie) => ({
  value: fc.oneof(
    { depthSize: "small", withCrossShrink: true },
    fc.constantFrom(null, true, false),
    numbers,
    fc.oneof(fc.constantFrom(...MEMBER_NAMES), wellFormedText),
    fc.array(tie("value"), { maxLength: 5 }),
    fc.uniqueArray(fc.tuple(memberName, tie("value")), { maxLength: 6, selector: ([name]) => name })
      .map((members) => Object.fromEntries(members)),
  ),
})).value;

/** The oracle's canonical form of JSON text, or its refusal. */
async function oracleCanonical(texts: readonly string[]): Promise<readonly string[]> {
  return (await jcsOracle.ask(texts)).map((answer) => {
    if (answer.startsWith("ok\t")) return answer.slice(3);
    return answer;
  });
}

/**
 * The differential property: for generated values, the oracle's canonical
 * form of the value's insertion-order JSON text equals `canonicalize(value)`.
 */
async function assertCanonicalAgreement(canonicalize: Canonicalizer, numRuns: number): Promise<void> {
  await assertAsyncProperty(fc.asyncProperty(fc.array(jsonValue, { minLength: 1, maxLength: BATCH }), async (values) => {
    const expected = await oracleCanonical(values.map((value) => JSON.stringify(value)));
    values.forEach((value, index) => {
      expect(canonicalize(value)).toBe(expected[index]!);
    });
  }), { numRuns });
}

describe("RFC 8785 canonical JSON against the Rust oracle", () => {
  test("canonicalJson agrees with the oracle on generated JSON values", async () => {
    await assertCanonicalAgreement(canonicalJson, 200);
  });

  test("canonicalJson agrees with the oracle on the RFC 8785 number samples and edges", async () => {
    const samples = [
      0, -0, 1, -1, 0.1, 1e21, 1e-7, 1e-6, 123e-20, 1e23, 9007199254740992, 9007199254740994,
      333333333.3333333, 4.5, 0.002, 1e-27, 5e-324, -5e-324, Number.MAX_VALUE, -Number.MAX_VALUE,
      2 ** 70, 295147905179352830000, 1.0000000000000001e23, 999999999999999900000, 1e+300, 1.7976931348623157e308,
    ];
    const expected = await oracleCanonical(samples.map((sample) => JSON.stringify(sample)));
    expect(samples.map((sample) => canonicalJson(sample))).toEqual([...expected]);
  });

  test("the oracle reproduces every golden canonical form and number text", async () => {
    const vectors = (await Bun.file(join(REPOSITORY_ROOT, "verification/vectors/jcs.json")).json()) as {
      cases: { name: string; input: string; canonical: string }[];
      numbers: { bits: string; text: string | null }[];
      rejected: { name: string; input: string }[];
    };
    // The golden inputs may span lines; the oracle takes one line per request.
    const inputs = vectors.cases.map(({ input }) => input.replace(/\r?\n/gu, " "));
    const canonical = await oracleCanonical(inputs);
    expect(canonical).toEqual(vectors.cases.map(({ canonical: text }) => text));
    // A null text marks a NaN or infinite bit pattern, which JSON cannot hold.
    const finite = vectors.numbers.filter((vector): vector is { bits: string; text: string } => vector.text !== null);
    expect(finite.length).toBeGreaterThan(300);
    const numberTexts = await oracleCanonical(finite.map(({ bits }) => {
      const view = new DataView(new ArrayBuffer(8));
      view.setBigUint64(0, BigInt(`0x${bits}`));
      return JSON.stringify(view.getFloat64(0));
    }));
    expect(numberTexts).toEqual(finite.map(({ text }) => text));
    const refusals = await jcsOracle.ask(vectors.rejected.map(({ input }) => input));
    expect(refusals.every((answer) => answer.startsWith("error\t"))).toBeTrue();
  });

  test("the oracle refuses text outside I-JSON", async () => {
    const answers = await jcsOracle.ask([
      "{\"a\":1,\"a\":2}", "\"\\ud800\"", "\"\\udc00\"", "1e400", "-1e309", "NaN", "[1,]", "{\"a\" 1}", "01", "\"\t\"", "",
    ]);
    expect(answers.map((answer) => answer.split("\t")[0])).toEqual(Array(11).fill("error"));
  });

  test("seeded defect: member order by locale collation is caught", async () => {
    await expect(assertCanonicalAgreement(legacyCanonicalJson, 200)).rejects.toThrow(/^Property failed after /u);
  });

  test("seeded defect: an exponent without its plus sign is caught", async () => {
    const droppedPlus: Canonicalizer = (value) => canonicalJson(value).replaceAll("e+", "e");
    await expect(assertCanonicalAgreement(droppedPlus, 200)).rejects.toThrow(/^Property failed after /u);
  });

  test("seeded defect: member order by UTF-8 bytes is caught", async () => {
    // RFC 8785 orders by UTF-16 code units, which differs from UTF-8 byte
    // order only between U+E000..U+FFFF and astral characters.
    const utf8Order: Canonicalizer = (value) => {
      const reorder = (item: unknown): unknown => {
        if (Array.isArray(item)) return item.map(reorder);
        if (item === null || typeof item !== "object") return item;
        return Object.fromEntries(Object.entries(item)
          .sort(([left], [right]) => Buffer.compare(Buffer.from(left), Buffer.from(right)))
          .map(([key, member]) => [key, reorder(member)]));
      };
      const encode = (item: unknown): string => {
        if (Array.isArray(item)) return `[${item.map(encode).join(",")}]`;
        if (item === null || typeof item !== "object") return canonicalJson(item);
        return `{${Object.entries(item).map(([key, member]) => `${JSON.stringify(key)}:${encode(member)}`).join(",")}}`;
      };
      return encode(reorder(value));
    };
    await expect(assertCanonicalAgreement(utf8Order, 200)).rejects.toThrow(/^Property failed after /u);
  });
});

// ---------------------------------------------------------------------------
// Web gateway URL admission
// ---------------------------------------------------------------------------

type OracleUrl = Readonly<{
  parsed: boolean;
  href?: string;
  protocol?: string;
  username?: string;
  password?: string;
  hostname?: string;
  port?: string;
  pathname?: string;
  search?: string;
  hash?: string;
  queryKeys?: readonly string[];
  admitted: boolean;
  reason?: string;
}>;

type Admission = (raw: string) => boolean;

const admits: Admission = (raw) => {
  try {
    publicUrl(raw);
    return true;
  } catch {
    return false;
  }
};

function runtimeComponents(raw: string): Omit<OracleUrl, "admitted" | "reason"> {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return { parsed: false };
  }
  return {
    parsed: true,
    href: url.href,
    protocol: url.protocol,
    username: url.username,
    password: url.password,
    hostname: url.hostname,
    port: url.port,
    pathname: url.pathname,
    search: url.search,
    hash: url.hash,
    queryKeys: [...url.searchParams.keys()],
  };
}

const SCHEMES = ["https://", "https://", "https://", "http://", "HTTPS://", "ftp://", "https:", "https:///", "wss://", ""];
const USERINFO = ["", "", "", "", "user@", "user:pass@", ":@", "@"];
const HOSTS = [
  "example.com", "a.com", "docs.ghostget.com", "a-b.co", "ab.cd.ef.org", "x1.io", "A.com", "EXAMPLE.ORG",
  "-a.com", "a-.com", "a..com", ".a.com", "a.com.", "a.c", "a.c0", "a_b.com", "a.b-c", "com",
  "xn--nxasmq6b.com", "b\u{fc}cher.de", "\u{3b2}\u{3b5}\u{3b2}.gr", "a\u{3002}com", "\u{ff41}.com", "a\u{ad}b.com",
  "1.2.3.4", "0x7f.1", "127.1", "999.999.999.999", "[::1]", "[::ffff:127.0.0.1]", "[fe80::1]",
  "localhost", "a.localhost", "a.local", "a.internal", "a.test", "a.invalid", "a.example", "a.onion",
  "a.testing", "example.co.uk", "xn--.com", "a%2e.com", "a%41.com", "",
  `${"a".repeat(63)}.com`, `${"a".repeat(64)}.com`, `a.${"b".repeat(63)}`, `a.${"b".repeat(64)}`,
];
const PORTS = ["", "", "", "", ":443", ":8443", ":", ":0443", ":80"];
const PATHS = [
  "", "/", "/", "/a", "/a/b", "/a/b/", "/a//b", "//a", "/a;b", "/%41", "/./a", "/../a", "/a/./b", "/a/../b",
  "/a b", "/\u{e4}", "/a%2eb", "/~u", "/A", "/a.b", "/a:b", "/a@b", "/a|b", "/a^b", "/a`b", "/a{b}", "/a\"b",
];
const QUERIES = [
  "", "", "", "?", "?a=1", "?a=1&a=2", "?a=1&b=2", "?a", "?a&b", "?a=%2e", "?%61=1&a=2", "?a+b=1&a%20b=2",
  "?q=\u{e4}", "?a=1&&b=2", "?=1", "?=1&=2", "?a=b=c", "?%2F=1", "?a=%25", "?a=%zz", "?a;b=1",
];
const FRAGMENTS = ["", "", "", "", "#", "#x", "#%2e", "##"];
const INSERTS = [
  " ", "\t", "\n", "\\", "%00", "%0a", "%0D", "%2F", "%5c", "%25", "\u{7f}", "\u{1}", "\u{a0}", "\u{2028}",
  "\u{feff}", "\u{3000}", "\u{200b}", "@", "#", "?", ":", "/", ".", "%", "\u{1f600}",
];

const ldhLabel = fc.stringMatching(/^[a-z0-9](?:[a-z0-9-]{0,8}[a-z0-9])?$/u);
const generatedHost = fc.tuple(fc.array(ldhLabel, { minLength: 1, maxLength: 3 }), fc.stringMatching(/^[a-z]{2,4}$/u))
  .map(([labels, top]) => [...labels, top].join("."));

const urlCandidate: fc.Arbitrary<string> = fc.tuple(
  fc.constantFrom(...SCHEMES),
  fc.constantFrom(...USERINFO),
  fc.oneof(fc.constantFrom(...HOSTS), generatedHost),
  fc.constantFrom(...PORTS),
  fc.constantFrom(...PATHS),
  fc.constantFrom(...QUERIES),
  fc.constantFrom(...FRAGMENTS),
  fc.option(fc.tuple(fc.constantFrom(...INSERTS), fc.nat()), { freq: 3 }),
).map(([scheme, userinfo, host, port, path, query, fragment, insert]) => {
  const url = `${scheme}${userinfo}${host}${port}${path}${query}${fragment}`;
  if (insert === null) return url;
  const [text, at] = insert;
  const position = at % (url.length + 1);
  return `${url.slice(0, position)}${text}${url.slice(position)}`;
});

/**
 * Candidates one step from admission: an admissible URL with at most one
 * perturbation, so the rules that only matter for otherwise admissible input,
 * such as exact serialization, the escape checks, and the fragment rule, are
 * exercised on most runs.
 */
const nearAdmissible: fc.Arbitrary<string> = fc.tuple(
  fc.oneof(generatedHost, fc.constantFrom("example.com", "docs.ghostget.com", "a-b.co", "xn--nxasmq6b.com")),
  fc.constantFrom("/", "/a", "/a/b", "/a/b/", "/a.b", "/~u", "/a-b_c"),
  fc.constantFrom("", "", "?a=1", "?a=1&b=2", "?q=x", "?"),
  fc.constantFrom(
    (url: string) => url,
    (url: string) => url.replace("https://", "HTTPS://"),
    (url: string) => url.replace(/\/\/([a-z])/u, (_match, first: string) => `//${first.toUpperCase()}`),
    (url: string) => `${url}${url.includes("?") ? "&" : "?"}x=%2e`,
    (url: string) => `${url}${url.includes("?") ? "&" : "?"}x=%2E1`,
    (url: string) => `${url}#frag`,
    (url: string) => `${url}${url.includes("?") ? "&" : "?"}a=1&a=2`,
    (url: string) => url.replace(/(\/\/[^/]+)/u, "$1:8443"),
    (url: string) => url.replace(/(\/\/[^/]+)/u, "$1."),
  ),
).map(([host, path, query, perturb]) => perturb(`https://${host}${path}${query}`));

const urlInput = fc.oneof(urlCandidate, nearAdmissible);

async function oracleUrls(raws: readonly string[]): Promise<readonly OracleUrl[]> {
  return (await urlOracle.ask(raws.map((raw) => JSON.stringify(raw)))).map((line) => JSON.parse(line) as OracleUrl);
}

/**
 * The one known parser difference: the runtime's WHATWG `URL`, like Node's,
 * percent-encodes "^" in a path as `%5E`, and the `url` crate 2.5.8 keeps it
 * literal. The gateway then refuses such an input, because its serialization
 * no longer equals it, while the oracle's reading admits it. This returns
 * true only when that encoding is the whole difference between the parses.
 */
function caretDivergence(runtime: Omit<OracleUrl, "admitted" | "reason">, oracle: OracleUrl): boolean {
  if (!runtime.parsed || !oracle.parsed || oracle.pathname?.includes("^") !== true) return false;
  const encodedPath = oracle.pathname.replaceAll("^", "%5E");
  const { admitted: _admitted, reason: _reason, ...oracleParts } = oracle;
  const hrefPrefix = `${oracle.protocol ?? ""}//`;
  return isDeepStrictEqual(runtime, {
    ...oracleParts,
    pathname: encodedPath,
    href: oracle.href?.startsWith(hrefPrefix) === true
      ? oracle.href.replace(oracle.pathname, encodedPath)
      : oracle.href,
  });
}

/**
 * Inputs whose parses the property compares when neither side admits them:
 * https: URLs without an IPv6 literal or a Windows drive-letter path segment.
 * Outside them the parsers have known differences, and each such input is
 * refused on both sides on scheme, host form, or exact serialization:
 *
 * - The runtime's `URL`, unlike the `url` crate and Node's parser, accepts an
 *   IPv6 literal with a trailing single colon, such as `[::1:]`, and drops
 *   the leading "/." from the pathname of a non-special URL such as `m:/.a`.
 * - The `url` crate 2.5.8 keeps a drive-letter segment such as `c:` when a
 *   later ".." segment would remove it in an https: path; the URL Standard
 *   keeps it only for file: URLs. A dot segment already makes the gateway
 *   refuse the input, because its serialization differs from it.
 */
function comparedParse(raw: string): boolean {
  return /^https:/iu.test(raw) && !raw.includes("[") && !/\/[A-Za-z][:|](?:[/?#]|$)/u.test(raw);
}

/**
 * The differential property: `admit` and the oracle make the same admission
 * decision, and every URL either side admits parses to the same WHATWG
 * components on both sides, as does every compared input both sides parse.
 * Where the parses differ only by the known "^" encoding, the gateway must
 * refuse the input instead.
 */
async function assertUrlAgreement(admit: Admission, raws: readonly string[]): Promise<void> {
  const answers = await oracleUrls(raws);
  raws.forEach((raw, index) => {
    const answer = answers[index]!;
    const runtime = runtimeComponents(raw);
    const context = { raw, oracle: answer, runtime };
    if (caretDivergence(runtime, answer)) {
      expect({ ...context, admitted: admit(raw) }).toEqual({ ...context, admitted: false });
      return;
    }
    const admitted = admit(raw);
    expect({ ...context, admitted }).toEqual({ ...context, admitted: answer.admitted });
    if (admitted || answer.admitted || comparedParse(raw)) {
      const { admitted: _admitted, reason: _reason, ...oracleParts } = answer;
      expect({ raw, parts: runtime }).toEqual({ raw, parts: oracleParts });
    }
  });
}

async function assertGeneratedUrlAgreement(admit: Admission, numRuns: number): Promise<void> {
  await assertAsyncProperty(fc.asyncProperty(fc.array(urlInput, { minLength: 1, maxLength: BATCH }), async (raws) => {
    await assertUrlAgreement(admit, raws);
  }), { numRuns });
}

/** Named examples with the decision the gateway policy documents for each. */
const URL_EXAMPLES: readonly (readonly [raw: string, admitted: boolean])[] = [
  ["https://example.com/", true],
  ["https://docs.ghostget.com/a/b?x=1&y=2", true],
  ["https://example.com/?", true],
  ["https://example.com/#", true],
  ["https://example.com", false],
  ["http://example.com/", false],
  ["https://Example.com/", false],
  ["https://example.com:443/", false],
  ["https://example.com:8443/", false],
  ["https://user@example.com/", false],
  ["https://example.com/#top", false],
  ["https://example.com./", false],
  ["https://1.2.3.4/", false],
  ["https://[::1]/", false],
  ["https://localhost/", false],
  ["https://printer.local/", false],
  ["https://service.internal/", false],
  ["https://a.onion/", false],
  ["https://a.example/", false],
  ["https://example.com/a//b", false],
  ["https://example.com/a;b", false],
  ["https://example.com/%41", false],
  ["https://example.com/a/../b", false],
  ["https://example.com/?a=1&a=2", false],
  ["https://example.com/?%61=1&a=2", false],
  ["https://example.com/?a+b=1&a%20b=2", false],
  ["https://example.com/?a=%2e", false],
  ["https://example.com/?a=%25", false],
  ["https://example.com/ a", false],
  ["https://example.com/\\a", false],
  ["https://xn--nxasmq6b.com/", true],
  ["https://b\u{fc}cher.de/", false],
  ["https://a\u{3002}com/", false],
  ["https://example.com/\u{2028}", false],
  [`https://${"a".repeat(63)}.com/`, true],
  [`https://${"a".repeat(64)}.com/`, false],
];

describe("web gateway URL admission against the Rust url crate", () => {
  test("publicUrl agrees with the oracle on every named example", async () => {
    const raws = URL_EXAMPLES.map(([raw]) => raw);
    await assertUrlAgreement(admits, raws);
    expect(raws.map(admits)).toEqual(URL_EXAMPLES.map(([, admitted]) => admitted));
  });

  test("the known caret difference is exactly the path encoding, and the gateway refuses it", async () => {
    const raw = "https://example.com/a^b";
    const [answer] = await oracleUrls([raw]);
    expect(answer).toMatchObject({ parsed: true, pathname: "/a^b", href: raw, admitted: true });
    expect(runtimeComponents(raw)).toMatchObject({ pathname: "/a%5Eb", href: "https://example.com/a%5Eb" });
    expect(caretDivergence(runtimeComponents(raw), answer!)).toBeTrue();
    expect(admits(raw)).toBeFalse();
    expect(admits("https://example.com/a%5Eb")).toBeFalse();
  });

  test("the known drive-letter difference leaves both sides refusing the input", async () => {
    const raw = "https://example.com/c:/../b";
    const [answer] = await oracleUrls([raw]);
    expect(answer).toMatchObject({ parsed: true, pathname: "/c:/b", admitted: false });
    expect(runtimeComponents(raw)).toMatchObject({ pathname: "/b" });
    expect(comparedParse(raw)).toBeFalse();
    expect(admits(raw)).toBeFalse();
  });

  test("publicUrl agrees with the oracle on generated URL candidates", async () => {
    await assertGeneratedUrlAgreement(admits, 300);
  });

  test("seeded defect: comparing a lowercased input with its serialization is caught", async () => {
    await expect(assertGeneratedUrlAgreement((raw) => admits(raw.toLowerCase()), 300)).rejects.toThrow(/^Property failed after /u);
  });

  test("seeded defect: decoding %2e before the escape check is caught", async () => {
    await expect(assertGeneratedUrlAgreement((raw) => admits(raw.replace(/%2e/giu, ".")), 300)).rejects.toThrow(/^Property failed after /u);
  });

  test("seeded defect: dropping the fragment before the checks is caught", async () => {
    await expect(assertGeneratedUrlAgreement((raw) => admits(raw.replace(/#.*$/su, "")), 300)).rejects.toThrow(/^Property failed after /u);
  });
});
