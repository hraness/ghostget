import { describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import fc from "fast-check";

import type { StrictCookie } from "@hraness/wordcell/clip/cookies";

import {
  PdfAuthError,
  downloadSignedInPdf,
  hasPdfSignInOptions,
  pdfFilename,
  pdfInputIndex,
  runSignedInPdf,
  runSignedInPdfCommand,
  splitPdfSignInArguments,
  type PdfFetch,
} from "./pdf-auth";

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

  test("--auth, --cookies-file and --mode are recognised", () => {
    expect(splitPdfSignInArguments(["u", "--auth", "uni", "--mode", "browser"]))
      .toEqual({ signIn: { kind: "auth", id: "uni" }, remaining: ["u"] });
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
      ["u", "--mode", "browser"],
      ["u", "--mode", "turbo", "--cookie-source", "chrome"],
    ];
    for (const argv of cases) {
      expect(() => splitPdfSignInArguments(argv)).toThrow(PdfAuthError);
    }
  });

  test("property: stripping never leaves a sign-in option and keeps every other argument", () => {
    const plain = fc.constantFrom("--json", "--quiet", "--root", "/notes", "https://e.org/a.pdf", "--slug", "x");
    const auth = fc.constantFrom(["--cookie-source", "chrome"], ["--cookie-profile", "Default"]);
    fc.assert(fc.property(fc.array(plain, { maxLength: 8 }), auth, fc.nat(8), (others, pair, at) => {
      const position = Math.min(at, others.length);
      const argv = [...others.slice(0, position), ...pair, ...others.slice(position)];
      const withSource = pair[0] === "--cookie-profile" ? [...argv, "--cookie-source", "chrome"] : argv;
      const split = splitPdfSignInArguments(withSource);
      expect(split.remaining).toEqual(others);
      expect(split.signIn?.kind).toBe("browser");
    }));
  });
});

describe("pdfInputIndex", () => {
  test("skips option values and the capture verb", () => {
    expect(pdfInputIndex(["--output", "/n", "https://e.org/a.pdf"])).toBe(2);
    expect(pdfInputIndex(["save", "--slug", "s", "https://e.org/a.pdf"])).toBe(3);
    expect(pdfInputIndex(["--json", "--", "-odd.pdf"])).toBe(2);
    expect(pdfInputIndex(["--json"])).toBe(-1);
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
    })).rejects.toThrow("larger than the 5000-byte limit");
  });

  test("a declared length over the limit is refused before reading", async () => {
    const web = server({ "https://a.example.org/x.pdf": () => pdfResponse(PDF, { "content-length": "999999" }) });
    await expect(downloadSignedInPdf(new URL("https://a.example.org/x.pdf"), {
      readCookies: jar({}).read, fetch: web.fetch, browser: "Chrome", maxPdfBytes: 1000,
    })).rejects.toThrow("larger than the 1000-byte limit");
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

describe("runSignedInPdf", () => {
  test("hands Wordcell a private local copy with the sign-in options removed, then deletes it", async () => {
    const parent = mkdtempSync(join(tmpdir(), "ghostget-pdf-test-"));
    let seen: readonly string[] = [];
    let copy = "";
    let mode = 0;
    const web = server({ "https://a.example.org/papers/Deep%20Sea.pdf": () => pdfResponse() });
    const code = await runSignedInPdf(
      ["https://a.example.org/papers/Deep%20Sea.pdf", "--cookie-source", "chrome", "--output", "/notes", "--json"],
      {
        environment: {},
        readCookies: async () => ({ cookies: [cookie("s", "1", "a.example.org")], warnings: [] }),
        fetch: web.fetch,
        makeTemporaryDirectory: () => mkdtempSync(join(parent, "run-")),
        runWordcellPdf: async (argv) => {
          seen = argv;
          copy = argv[0] ?? "";
          mode = statSync(copy).mode & 0o777;
          expect(readFileSync(copy).subarray(0, 5).toString()).toBe("%PDF-");
          return 0;
        },
      },
    );
    expect(code).toBe(0);
    expect(seen.slice(1)).toEqual(["--output", "/notes", "--json"]);
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
      runWordcellPdf: async (argv) => {
        copy = argv[0] ?? "";
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
  test("prints a plain-language error with a next step for a login page", async () => {
    const errors: string[] = [];
    const web = server({ "https://a.example.org/x.pdf": () => pdfResponse(LOGIN, { "content-type": "text/html" }) });
    const code = await runSignedInPdfCommand(["https://a.example.org/x.pdf", "--cookie-source", "chrome"], {
      stdout: () => undefined,
      stderr: (text) => errors.push(text),
    }, {
      environment: { NO_COLOR: "1" },
      interactive: false,
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
    }, { environment: {}, interactive: false, runWordcellPdf: async () => 0 });
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
    fc.assert(fc.property(fc.string({ maxLength: 60 }), (segment) => {
      const name = pdfFilename(new URL(`https://e.org/${encodeURIComponent(segment)}`));
      expect(name.endsWith(".pdf")).toBe(true);
      expect(name.includes("/")).toBe(false);
      expect(name.startsWith(".")).toBe(false);
    }));
  });
});
