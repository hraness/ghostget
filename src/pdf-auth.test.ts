import { describe, expect, test } from "bun:test";
import { chmodSync, existsSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import fc from "fast-check";
import { assertProperty } from "./test-support";

import type { StrictCookie } from "@hraness/wordcell/clip/cookies";

import {
  PdfAuthError,
  downloadSignedInPdf,
  hasPdfSignInOptions,
  pdfFilename,
  runSignedInPdf,
  runSignedInPdfCommand,
  runWordcellPdfWithDownload,
  splitPdfSignInArguments,
  type PdfDownloadedSource,
  type PdfFetch,
} from "./pdf-auth";
import { createClassifiedCookieRecordReader } from "./cookie-access";

const PDF = new TextEncoder().encode("%PDF-1.7\n1 0 obj\n<<>>\nendobj\n%%EOF\n");
const LOGIN = new TextEncoder().encode("<!DOCTYPE html><html><body>Sign in through your institution</body></html>");

function cookie(name: string, value: string, domain: string): StrictCookie {
  return { name, value, domain, path: "/", secure: true, httpOnly: true } as unknown as StrictCookie;
}

/** Cookie jar that behaves like the shared filter: only exact host matches. */
function jar(byHost: Record<string, readonly StrictCookie[]>) {
  const reads: string[] = [];
  return {
    reads,
    read: async (url: URL) => {
      reads.push(url.hostname);
      const cookies = byHost[url.hostname];
      if (cookies === undefined) throw new Error(`no matching cookies were found for ${url.hostname}`);
      return { cookies, warnings: [] };
    },
  };
}

type Recorded = { readonly url: string; readonly cookie: string | null; readonly init: RequestInit };

function server(routes: Record<string, () => Response>) {
  const requests: Recorded[] = [];
  const fetch: PdfFetch = async (url, init) => {
    requests.push({ url: url.href, cookie: new Headers(init.headers).get("cookie"), init });
    const route = routes[url.href];
    if (route === undefined) return new Response("missing", { status: 404 });
    return route();
  };
  return { requests, fetch };
}

function pdfResponse(bytes: Uint8Array = PDF, headers: Record<string, string> = { "content-type": "application/pdf" }): Response {
  return new Response(bytes, { status: 200, headers });
}

describe("splitPdfSignInArguments", () => {
  test("strips sign-in options and keeps Wordcell options in order", () => {
    const split = splitPdfSignInArguments([
      "https://example.org/paper.pdf",
      "--cookie-source",
      "chrome",
      "--root",
      "/notes",
      "--cookie-profile=Profile 1",
      "--json",
    ]);
    expect(split.signIn).toEqual({ kind: "browser", source: "chrome", profile: "Profile 1" });
    expect(split.remaining).toEqual(["https://example.org/paper.pdf", "--root", "/notes", "--json"]);
  });

  test("--browser-profile means a Chrome profile unless another browser is named", () => {
    expect(splitPdfSignInArguments(["u", "--browser-profile", "Work"]).signIn)
      .toEqual({ kind: "browser", source: "chrome", profile: "Work" });
    expect(splitPdfSignInArguments(["u", "--browser-profile", "Work", "--cookie-source", "brave"]).signIn)
      .toEqual({ kind: "browser", source: "brave", profile: "Work" });
  });

  test("--auth and --cookies-file are recognised; --mode is left for Wordcell to reject", () => {
    expect(splitPdfSignInArguments(["u", "--auth", "uni"]))
      .toEqual({ signIn: { kind: "auth", id: "uni" }, remaining: ["u"] });
    expect(hasPdfSignInOptions(["u", "--mode", "browser"])).toBe(false);
    expect(splitPdfSignInArguments(["u", "--mode", "browser"]))
      .toEqual({ signIn: null, remaining: ["u", "--mode", "browser"] });
    expect(splitPdfSignInArguments(["u", "--cookies-file=/c.json"]).signIn)
      .toEqual({ kind: "cookies-file", path: "/c.json" });
  });

  test("without sign-in options nothing changes", () => {
    const argv = ["https://example.org/a.pdf", "--root", "/n", "--json"];
    expect(splitPdfSignInArguments(argv)).toEqual({ signIn: null, remaining: argv });
    expect(hasPdfSignInOptions(argv)).toBe(false);
  });

  test("options after -- are not sign-in options", () => {
    expect(hasPdfSignInOptions(["--", "--cookie-source"])).toBe(false);
    expect(splitPdfSignInArguments(["--", "--cookie-source"]).signIn).toBeNull();
  });

  test("rejects unclear combinations before any browser is read", () => {
    const cases: readonly (readonly string[])[] = [
      ["u", "--cookie-source"],
      ["u", "--cookie-source", "netscape"],
      ["u", "--cookie-source", "chrome", "--cookie-source", "arc"],
      ["u", "--auth", "a", "--cookie-source", "chrome"],
      ["u", "--cookies-file", "/c", "--cookie-source", "chrome"],
      ["u", "--browser-profile", "A", "--cookie-profile", "B"],
      ["u", "--cookie-profile", "Default"],
    ];
    for (const argv of cases) {
      expect(() => splitPdfSignInArguments(argv)).toThrow(PdfAuthError);
    }
  });

  test("property: stripping never leaves a sign-in option and keeps every other argument", () => {
    const plain = fc.constantFrom("--json", "--quiet", "--root", "/notes", "https://e.org/a.pdf", "--slug", "x");
    const auth = fc.constantFrom(["--cookie-source", "chrome"], ["--cookie-profile", "Default"]);
    assertProperty(fc.property(fc.array(plain, { maxLength: 8 }), auth, fc.nat(8), (others, pair, at) => {
      const position = Math.min(at, others.length);
      const argv = [...others.slice(0, position), ...pair, ...others.slice(position)];
      const withSource = pair[0] === "--cookie-profile" ? [...argv, "--cookie-source", "chrome"] : argv;
      const split = splitPdfSignInArguments(withSource);
      expect(split.remaining).toEqual(others);
      expect(split.signIn?.kind).toBe("browser");
    }));
  });
});

describe("downloadSignedInPdf", () => {
  test("sends only the cookies that belong to each host across a redirect", async () => {
    const cookies = jar({
      "doi.example.org": [cookie("doi", "d1", "doi.example.org")],
      "publisher.example.com": [cookie("session", "p1", "publisher.example.com")],
    });
    const web = server({
      "https://doi.example.org/10.1/x": () => new Response(null, { status: 302, headers: { location: "https://publisher.example.com/pdf/x.pdf" } }),
      "https://publisher.example.com/pdf/x.pdf": () => pdfResponse(),
    });
    const result = await downloadSignedInPdf(new URL("https://doi.example.org/10.1/x"), {
      readCookies: cookies.read,
      fetch: web.fetch,
      browser: "Chrome",
    });
    expect(result.finalUrl.href).toBe("https://publisher.example.com/pdf/x.pdf");
    expect(Buffer.from(result.bytes).equals(Buffer.from(PDF))).toBe(true);
    expect(web.requests.map((request) => [request.url, request.cookie])).toEqual([
      ["https://doi.example.org/10.1/x", "doi=d1"],
      ["https://publisher.example.com/pdf/x.pdf", "session=p1"],
    ]);
    expect(cookies.reads).toEqual(["doi.example.org", "publisher.example.com"]);
    for (const request of web.requests) expect(request.init.redirect).toBe("error");
  });

  test("a host with no cookies gets no cookie header, not another host's", async () => {
    const cookies = jar({ "a.example.org": [cookie("sid", "secret", "a.example.org")] });
    const web = server({
      "https://a.example.org/x": () => new Response(null, { status: 301, headers: { location: "https://cdn.example.net/x.pdf" } }),
      "https://cdn.example.net/x.pdf": () => pdfResponse(),
    });
    const result = await downloadSignedInPdf(new URL("https://a.example.org/x"), {
      readCookies: cookies.read, fetch: web.fetch, browser: "Chrome",
    });
    expect(web.requests[1]?.cookie).toBeNull();
    expect(result.cookieHosts).toEqual(["a.example.org"]);
  });

  test("refuses to follow a redirect to plain http", async () => {
    const web = server({
      "https://a.example.org/x": () => new Response(null, { status: 302, headers: { location: "http://a.example.org/x.pdf" } }),
    });
    await expect(downloadSignedInPdf(new URL("https://a.example.org/x"), {
      readCookies: jar({}).read, fetch: web.fetch, browser: "Chrome",
    })).rejects.toThrow("only use https");
    expect(web.requests).toHaveLength(1);
  });

  test("stops after the redirect limit", async () => {
    const web = server({
      "https://a.example.org/loop": () => new Response(null, { status: 302, headers: { location: "/loop" } }),
    });
    await expect(downloadSignedInPdf(new URL("https://a.example.org/loop"), {
      readCookies: jar({}).read, fetch: web.fetch, browser: "Chrome", maxRedirects: 3,
    })).rejects.toThrow("more than 3 times");
    expect(web.requests).toHaveLength(4);
  });

  test("an HTML login page becomes a plain-language access error", async () => {
    const web = server({ "https://a.example.org/x.pdf": () => pdfResponse(LOGIN, { "content-type": "text/html; charset=utf-8" }) });
    const error = await downloadSignedInPdf(new URL("https://a.example.org/x.pdf"), {
      readCookies: jar({}).read, fetch: web.fetch, browser: "Chrome",
    }).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(PdfAuthError);
    expect((error as PdfAuthError).code).toBe("access");
    expect((error as PdfAuthError).message).toContain("Open the link in Chrome");
  });

  test("an HTML page mislabelled as a PDF is still caught", async () => {
    const web = server({ "https://a.example.org/x.pdf": () => pdfResponse(LOGIN) });
    await expect(downloadSignedInPdf(new URL("https://a.example.org/x.pdf"), {
      readCookies: jar({}).read, fetch: web.fetch, browser: "Chrome",
    })).rejects.toThrow("does not seem to have access");
  });

  test("403 is an access error", async () => {
    const web = server({ "https://a.example.org/x.pdf": () => new Response("no", { status: 403 }) });
    await expect(downloadSignedInPdf(new URL("https://a.example.org/x.pdf"), {
      readCookies: jar({}).read, fetch: web.fetch, browser: "Safari",
    })).rejects.toThrow("your Safari sign-in does not seem to have access");
  });

  test("a body over the size limit is refused while streaming", async () => {
    const big = new Uint8Array(4096);
    big.set(PDF);
    const web = server({ "https://a.example.org/x.pdf": () => new Response(new ReadableStream({
      start(controller) {
        controller.enqueue(big);
        controller.enqueue(big);
        controller.close();
      },
    }), { status: 200 }) });
    await expect(downloadSignedInPdf(new URL("https://a.example.org/x.pdf"), {
      readCookies: jar({}).read, fetch: web.fetch, browser: "Chrome", maxPdfBytes: 5000,
    })).rejects.toThrow("the PDF is larger than the 5 KB limit");
  });

  test("a declared length over the limit is refused before reading", async () => {
    const web = server({ "https://a.example.org/x.pdf": () => pdfResponse(PDF, { "content-length": "999999" }) });
    await expect(downloadSignedInPdf(new URL("https://a.example.org/x.pdf"), {
      readCookies: jar({}).read, fetch: web.fetch, browser: "Chrome", maxPdfBytes: 1000,
    })).rejects.toThrow("larger than the 1 KB limit");
  });

  test("a non-PDF, non-HTML body is refused", async () => {
    const web = server({ "https://a.example.org/x.pdf": () => pdfResponse(new Uint8Array([0x50, 0x4b, 3, 4, 0])) });
    await expect(downloadSignedInPdf(new URL("https://a.example.org/x.pdf"), {
      readCookies: jar({}).read, fetch: web.fetch, browser: "Chrome",
    })).rejects.toThrow("did not return a PDF");
  });

  test("times out", async () => {
    const fetch: PdfFetch = (_url, init) => new Promise((_resolve, reject) => {
      init.signal?.addEventListener("abort", () => reject(init.signal?.reason));
    });
    await expect(downloadSignedInPdf(new URL("https://a.example.org/x.pdf"), {
      readCookies: jar({}).read, fetch, browser: "Chrome", timeoutMs: 20,
    })).rejects.toThrow("did not finish within");
  });

  test("a failure other than 'no cookies' from the cookie reader stops the download", async () => {
    const web = server({ "https://a.example.org/x.pdf": () => pdfResponse() });
    await expect(downloadSignedInPdf(new URL("https://a.example.org/x.pdf"), {
      readCookies: async () => { throw new Error("keychain denied"); },
      fetch: web.fetch,
      browser: "Chrome",
    })).rejects.toThrow("keychain denied");
    expect(web.requests).toHaveLength(0);
  });
});

describe("downloadSignedInPdf: public hosts only", () => {
  test("a redirect to a private address is refused before that host's cookies are read", async () => {
    for (const target of ["https://10.0.0.1/x.pdf", "https://[::1]/x.pdf", "https://intranet.local/x.pdf", "https://printer/x.pdf"]) {
      const cookies = jar({ "a.example.org": [cookie("sid", "1", "a.example.org")] });
      const web = server({
        "https://a.example.org/x": () => new Response(null, { status: 302, headers: { location: target } }),
      });
      await expect(downloadSignedInPdf(new URL("https://a.example.org/x"), {
        readCookies: cookies.read, fetch: web.fetch, browser: "Chrome",
      })).rejects.toThrow("only go to public websites");
      expect(cookies.reads).toEqual(["a.example.org"]);
      expect(web.requests).toHaveLength(1);
    }
  });

  test("a private first link reads no cookies and sends nothing", async () => {
    const cookies = jar({});
    const web = server({});
    await expect(downloadSignedInPdf(new URL("https://192.168.1.4/x.pdf"), {
      readCookies: cookies.read, fetch: web.fetch, browser: "Chrome",
    })).rejects.toThrow("192.168.1.4 was not contacted and no sign-in was read for it");
    expect(cookies.reads).toEqual([]);
    expect(web.requests).toEqual([]);
  });

  test("sizes in messages are readable", async () => {
    const web = server({ "https://a.example.org/x.pdf": () => pdfResponse(PDF, { "content-length": String(64 * 1024 * 1024) }) });
    await expect(downloadSignedInPdf(new URL("https://a.example.org/x.pdf"), {
      readCookies: jar({}).read, fetch: web.fetch, browser: "Chrome", maxPdfBytes: 5 * 1024 * 1024,
    })).rejects.toThrow("the PDF is larger than the 5 MB limit. Pass a larger --max-pdf-bytes to allow it");
  });
});

describe("runSignedInPdf with a real cookie file", () => {
  test("a DOI link with no cookies redirects to the publisher, which alone gets its cookie", async () => {
    const parent = mkdtempSync(join(tmpdir(), "ghostget-pdf-test-"));
    try {
      const file = join(parent, "cookies.txt");
      writeFileSync(file, "# Netscape HTTP Cookie File\npublisher.example.com\tFALSE\t/\tTRUE\t4102444800\tsession\tp1\n");
      chmodSync(file, 0o600);
      const web = server({
        "https://doi.example.org/10.1/x": () => new Response(null, { status: 302, headers: { location: "https://publisher.example.com/pdf/x.pdf" } }),
        "https://publisher.example.com/pdf/x.pdf": () => pdfResponse(),
      });
      let imported = false;
      const code = await runSignedInPdf(["https://doi.example.org/10.1/x", "--cookies-file", file], {
        environment: {},
        fetch: web.fetch,
        makeTemporaryDirectory: () => mkdtempSync(join(parent, "run-")),
        runWordcellPdf: async (_argv, download) => {
          imported = download !== undefined;
          return 0;
        },
      });
      expect(code).toBe(0);
      expect(imported).toBe(true);
      expect(web.requests.map((request) => [request.url, request.cookie])).toEqual([
        ["https://doi.example.org/10.1/x", null],
        ["https://publisher.example.com/pdf/x.pdf", "session=p1"],
      ]);
    } finally {
      rmSync(parent, { recursive: true, force: true });
    }
  });

  test("a cookie file anyone can read is refused before any request", async () => {
    const parent = mkdtempSync(join(tmpdir(), "ghostget-pdf-test-"));
    try {
      const file = join(parent, "cookies.txt");
      writeFileSync(file, "publisher.example.com\tFALSE\t/\tTRUE\t4102444800\tsession\tp1\n");
      chmodSync(file, 0o644);
      await expect(runSignedInPdf(["https://publisher.example.com/x.pdf", "--cookies-file", file], {
        environment: {},
        fetch: async () => { throw new Error("must not fetch"); },
        runWordcellPdf: async () => 0,
      })).rejects.toThrow("must be readable only by you");
    } finally {
      rmSync(parent, { recursive: true, force: true });
    }
  });
});

describe("runWordcellPdfWithDownload", () => {
  test("records the web link as the note's source, as an anonymous download does", async () => {
    const seen: { inputPath: string; remoteSource: unknown }[] = [];
    const code = await runWordcellPdfWithDownload(
      ["https://a.example.org/x.pdf", "--output", "/notes", "--quiet"],
      { inputPath: "/private/copy/x.pdf", requestedUrl: "https://doi.example.org/10.1/x", finalUrl: "https://a.example.org/x.pdf" },
      {},
      { stdout: () => undefined, stderr: () => undefined },
      {
        runPdfCapture: async (options) => {
          seen.push({ inputPath: options.inputPath, remoteSource: options.remoteSource });
          throw new Error("stop after the source step");
        },
      },
    );
    expect(code).not.toBe(0);
    expect(seen).toEqual([{
      inputPath: "/private/copy/x.pdf",
      remoteSource: { requestedUrl: "https://doi.example.org/10.1/x", finalUrl: "https://a.example.org/x.pdf" },
    }]);
  });
});

describe("runSignedInPdf", () => {
  test("hands Wordcell a private local copy with the sign-in options removed, then deletes it", async () => {
    const parent = mkdtempSync(join(tmpdir(), "ghostget-pdf-test-"));
    let seen: readonly string[] = [];
    let copy = "";
    let mode = 0;
    let source: PdfDownloadedSource | undefined;
    const web = server({ "https://a.example.org/papers/Deep%20Sea.pdf": () => pdfResponse() });
    const code = await runSignedInPdf(
      ["https://a.example.org/papers/Deep%20Sea.pdf", "--cookie-source", "chrome", "--output", "/notes", "--json"],
      {
        environment: {},
        readCookies: async () => ({ cookies: [cookie("s", "1", "a.example.org")], warnings: [] }),
        fetch: web.fetch,
        makeTemporaryDirectory: () => mkdtempSync(join(parent, "run-")),
        runWordcellPdf: async (argv, download) => {
          seen = argv;
          source = download;
          copy = download?.inputPath ?? "";
          mode = statSync(copy).mode & 0o777;
          expect(readFileSync(copy).subarray(0, 5).toString()).toBe("%PDF-");
          return 0;
        },
      },
    );
    expect(code).toBe(0);
    expect(seen).toEqual(["https://a.example.org/papers/Deep%20Sea.pdf", "--output", "/notes", "--json"]);
    expect(source?.requestedUrl).toBe("https://a.example.org/papers/Deep%20Sea.pdf");
    expect(source?.finalUrl).toBe("https://a.example.org/papers/Deep%20Sea.pdf");
    expect(copy.endsWith("Deep-Sea.pdf")).toBe(true);
    expect(mode).toBe(0o600);
    expect(existsSync(copy)).toBe(false);
    rmSync(parent, { recursive: true, force: true });
  });

  test("deletes the copy when Wordcell fails", async () => {
    const parent = mkdtempSync(join(tmpdir(), "ghostget-pdf-test-"));
    let copy = "";
    const web = server({ "https://a.example.org/x.pdf": () => pdfResponse() });
    await expect(runSignedInPdf(["https://a.example.org/x.pdf", "--cookie-source", "chrome"], {
      environment: {},
      readCookies: async () => ({ cookies: [], warnings: [] }),
      fetch: web.fetch,
      makeTemporaryDirectory: () => mkdtempSync(join(parent, "run-")),
      runWordcellPdf: async (_argv, download) => {
        copy = download?.inputPath ?? "";
        throw new Error("import failed");
      },
    })).rejects.toThrow("import failed");
    expect(copy).not.toBe("");
    expect(existsSync(copy)).toBe(false);
    rmSync(parent, { recursive: true, force: true });
  });

  test("without sign-in options the arguments go to Wordcell unchanged and nothing is downloaded", async () => {
    const argv = ["https://a.example.org/x.pdf", "--root", "/n"];
    let seen: readonly string[] = [];
    const code = await runSignedInPdf(argv, {
      environment: {},
      fetch: async () => { throw new Error("must not fetch"); },
      readCookies: async () => { throw new Error("must not read cookies"); },
      runWordcellPdf: async (forwarded) => {
        seen = forwarded;
        return 7;
      },
    });
    expect(code).toBe(7);
    expect(seen).toEqual(argv);
  });

  test("sign-in options with a local file or http link are usage errors", async () => {
    const base = {
      environment: {},
      fetch: async () => { throw new Error("must not fetch"); },
      readCookies: async () => { throw new Error("must not read cookies"); },
      runWordcellPdf: async () => 0,
    };
    await expect(runSignedInPdf(["/tmp/a.pdf", "--cookie-source", "chrome"], base)).rejects.toThrow("only apply to web links");
    await expect(runSignedInPdf(["http://a.example.org/a.pdf", "--cookie-source", "chrome"], base)).rejects.toThrow("only use https");
  });

  test("a stored account without a browser cookie store is refused", async () => {
    await expect(runSignedInPdf(["https://a.example.org/x.pdf", "--auth", "p"], {
      environment: {},
      loadAuth: () => ({ schemaVersion: 1, id: "p", kind: "browser-profile", profile: "/p", trustUnfilteredEgress: true }),
      fetch: async () => { throw new Error("must not fetch"); },
      runWordcellPdf: async () => 0,
    })).rejects.toThrow("does not name a browser");
  });
});

describe("runSignedInPdfCommand", () => {
  test("agents get the keychain notice line before the browser store is read, even without a terminal", async () => {
    const state = mkdtempSync(join(tmpdir(), "ghostget-pdf-state-"));
    try {
      const errors: string[] = [];
      let beforeRead = "";
      const reader = createClassifiedCookieRecordReader(async () => {
        beforeRead = errors.join("");
        return { cookies: [], warnings: [] };
      }, { platform: "darwin" });
      const web = server({ "https://a.example.org/x.pdf": () => pdfResponse() });
      await runSignedInPdfCommand(["https://a.example.org/x.pdf", "--cookie-source", "chrome", "--quiet"], {
        stdout: () => undefined,
        stderr: (text) => errors.push(text),
      }, {
        environment: { CLAUDECODE: "1", GHOSTGET_STATE_HOME: state },
        stdinIsTTY: false,
        stderrIsTTY: false,
        runWordcellPdf: async () => 0,
        overrides: {
          fetch: web.fetch,
          readCookies: (_signIn, _auth, url, timeoutMs) => reader({
            cookieSources: ["chrome"], cookiesFile: undefined, cookieProfile: undefined, timeoutMs, requireExplicitCookieScope: true,
          }, url),
        },
      });
      const line = JSON.parse(beforeRead.trim().split("\n")[0] ?? "") as Record<string, unknown>;
      expect(line).toMatchObject({ type: "permission-notice", product: "Ghostget", kind: "keychain" });
    } finally {
      rmSync(state, { recursive: true, force: true });
    }
  });

  test("an unknown account name gets a plain sentence and the command that lists accounts", async () => {
    const errors: string[] = [];
    const code = await runSignedInPdfCommand(["https://a.example.org/x.pdf", "--auth", "nosuch"], {
      stdout: () => undefined,
      stderr: (text) => errors.push(text),
    }, {
      environment: { NO_COLOR: "1" },
      stderrIsTTY: false,
      runWordcellPdf: async () => 0,
      overrides: { loadAuth: () => { throw new Error("auth locator nosuch was not found."); } },
    });
    expect(code).toBe(2);
    const text = errors.join("");
    expect(text).toContain("There is no connected account named nosuch; ghostget auth list shows the ones you have.");
    expect(text).toContain("ghostget auth list");
    expect(text).not.toContain("auth locator");
  });

  test("an oversize PDF names its limit in MB", async () => {
    const lines: string[] = [];
    const web = server({ "https://a.example.org/x.pdf": () => pdfResponse(PDF, { "content-length": String(900 * 1024 * 1024) }) });
    const code = await runSignedInPdfCommand(["https://a.example.org/x.pdf", "--cookie-source", "chrome", "--json"], {
      stdout: (text) => lines.push(text),
      stderr: () => undefined,
    }, {
      environment: {},
      stderrIsTTY: false,
      runWordcellPdf: async () => 0,
      overrides: { fetch: web.fetch, readCookies: async () => ({ cookies: [], warnings: [] }) },
    });
    expect(code).toBe(1);
    expect(JSON.parse(lines.join(""))).toEqual({
      ok: false,
      error: {
        code: "download-failed",
        message: "The PDF is larger than the 512 MB limit. Pass a larger --max-pdf-bytes to allow it.",
        next: "ghostget pdf --help",
      },
    });
  });
  test("prints a plain-language error with a next step for a login page", async () => {
    const errors: string[] = [];
    const web = server({ "https://a.example.org/x.pdf": () => pdfResponse(LOGIN, { "content-type": "text/html" }) });
    const code = await runSignedInPdfCommand(["https://a.example.org/x.pdf", "--cookie-source", "chrome"], {
      stdout: () => undefined,
      stderr: (text) => errors.push(text),
    }, {
      environment: { NO_COLOR: "1" },
      stderrIsTTY: false,
      runWordcellPdf: async () => 0,
      overrides: { fetch: web.fetch, readCookies: async () => ({ cookies: [], warnings: [] }) },
    });
    expect(code).toBe(1);
    const text = errors.join("");
    expect(text).toContain("your Chrome sign-in does not seem to have access");
    expect(text).toContain("Open the link in your browser first");
    expect(text).not.toContain("<html");
  });

  test("--json reports errors as one JSON line", async () => {
    const lines: string[] = [];
    const code = await runSignedInPdfCommand(["https://a.example.org/x.pdf", "--cookie-source", "netscape", "--json"], {
      stdout: (text) => lines.push(text),
      stderr: () => undefined,
    }, { environment: {}, stderrIsTTY: false, runWordcellPdf: async () => 0 });
    expect(code).toBe(2);
    const parsed = JSON.parse(lines.join("")) as { ok: boolean; error: { code: string } };
    expect(parsed).toMatchObject({ ok: false, error: { code: "usage" } });
  });
});

describe("pdfFilename", () => {
  test("keeps a safe .pdf name", () => {
    expect(pdfFilename(new URL("https://e.org/a/Deep%20Sea.PDF"))).toBe("Deep-Sea.pdf");
    expect(pdfFilename(new URL("https://e.org/"))).toBe("source.pdf");
    expect(pdfFilename(new URL("https://e.org/..%2F..%2Fetc"))).toBe("etc.pdf");
  });

  test("property: never contains a path separator and always ends in .pdf", () => {
    assertProperty(fc.property(fc.string({ maxLength: 60 }), (segment) => {
      const name = pdfFilename(new URL(`https://e.org/${encodeURIComponent(segment)}`));
      expect(name.endsWith(".pdf")).toBe(true);
      expect(name.includes("/")).toBe(false);
      expect(name.startsWith(".")).toBe(false);
    }));
  });
});
