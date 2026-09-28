import { describe, expect, test } from "bun:test";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import fc from "fast-check";
import { assertProperty } from "./test-support";

import type { StrictCookie } from "@hraness/wordcell/clip/cookies";

import {
  PdfAuthError,
  downloadSignedInPdf,
  hasPdfSignInOptions,
  isSameSiteHop,
  pdfFilename,
  resolveProfilePath,
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

function cookie(name: string, value: string, domain: string, sameSite: StrictCookie["sameSite"] = null): StrictCookie {
  return { name, value, domain, path: "/", secure: true, httpOnly: true, sameSite } as unknown as StrictCookie;
}

/** A jar where the only host with a sign-in is `host`. */
function signedIn(host: string) {
  return jar({ [host]: [cookie("sid", "1", host)] });
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

  test("read's --trust-profile-egress and --mode are accepted and dropped next to a sign-in option", () => {
    expect(splitPdfSignInArguments(["u", "--browser-profile", "Default", "--trust-profile-egress", "--json"]))
      .toEqual({ signIn: { kind: "browser", source: "chrome", profile: "Default" }, remaining: ["u", "--json"] });
    expect(splitPdfSignInArguments(["u", "--cookie-source", "chrome", "--mode", "browser"]))
      .toEqual({ signIn: { kind: "browser", source: "chrome", profile: undefined }, remaining: ["u"] });
    expect(splitPdfSignInArguments(["u", "--cookie-source", "chrome", "--mode=http"]).remaining).toEqual(["u"]);
    expect(() => splitPdfSignInArguments(["u", "--cookie-source", "chrome", "--mode", "fast"]))
      .toThrow("a signed-in PDF download needs neither");
    const without = ["u", "--trust-profile-egress", "--mode", "fast"];
    expect(splitPdfSignInArguments(without)).toEqual({ signIn: null, remaining: without });
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
    expect(readFileSync(result.path).equals(Buffer.from(PDF))).toBe(true);
    expect(statSync(result.path).mode & 0o777).toBe(0o600);
    expect(statSync(dirname(result.path)).mode & 0o777).toBe(0o700);
    expect(result.byteLength).toBe(PDF.byteLength);
    rmSync(dirname(result.path), { recursive: true, force: true });
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
    rmSync(dirname(result.path), { recursive: true, force: true });
  });

  test("refuses to follow a redirect to plain http", async () => {
    const web = server({
      "https://a.example.org/x": () => new Response(null, { status: 302, headers: { location: "http://a.example.org/x.pdf" } }),
    });
    await expect(downloadSignedInPdf(new URL("https://a.example.org/x"), {
      readCookies: jar({}).read, fetch: web.fetch, browser: "Chrome",
    })).rejects.toThrow("a.example.org redirected to an unencrypted http link");
    expect(web.requests).toHaveLength(1);
  });

  test("a plain http link says how to fix it", async () => {
    await expect(downloadSignedInPdf(new URL("http://dx.doi.org/10.1/x"), {
      readCookies: jar({}).read, fetch: server({}).fetch, browser: "Chrome",
    })).rejects.toThrow("Change the start of the link from http:// to https://");
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
      readCookies: signedIn("a.example.org").read, fetch: web.fetch, browser: "Chrome",
    }).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(PdfAuthError);
    expect((error as PdfAuthError).code).toBe("access");
    expect((error as PdfAuthError).message).toContain("Open the link in Chrome");
  });

  test("an HTML page mislabelled as a PDF is still caught", async () => {
    const web = server({ "https://a.example.org/x.pdf": () => pdfResponse(LOGIN) });
    await expect(downloadSignedInPdf(new URL("https://a.example.org/x.pdf"), {
      readCookies: signedIn("a.example.org").read, fetch: web.fetch, browser: "Chrome",
    })).rejects.toThrow("does not seem to have access");
  });

  test("403 is an access error", async () => {
    const web = server({ "https://a.example.org/x.pdf": () => new Response("no", { status: 403 }) });
    await expect(downloadSignedInPdf(new URL("https://a.example.org/x.pdf"), {
      readCookies: signedIn("a.example.org").read, fetch: web.fetch, browser: "Safari",
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

  test("no sign-in anywhere and a login page is reported as a missing sign-in, not missing access", async () => {
    const cookies = jar({});
    const web = server({
      "https://doi.example.org/10.1/x": () => new Response(null, { status: 302, headers: { location: "https://pub.example.com/x" } }),
      "https://pub.example.com/x": () => pdfResponse(LOGIN, { "content-type": "text/html" }),
    });
    const error = await downloadSignedInPdf(new URL("https://doi.example.org/10.1/x"), {
      readCookies: cookies.read, fetch: web.fetch, browser: "Chrome",
    }).catch((caught: unknown) => caught);
    expect(cookies.reads).toEqual(["doi.example.org", "pub.example.com"]);
    expect(web.requests.map((request) => request.cookie)).toEqual([null, null]);
    expect((error as PdfAuthError).code).toBe("no-sign-in");
    expect((error as PdfAuthError).message).toContain("no Chrome sign-in was found for pub.example.com");
    expect((error as PdfAuthError).message).toContain("ghostget browsers");
    expect((error as PdfAuthError).message).not.toContain("does not seem to have access");
  });

  test("a sign-in only for the DOI host still counts as missing for the publisher that refused", async () => {
    const web = server({
      "https://doi.example.org/10.1/x": () => new Response(null, { status: 302, headers: { location: "https://pub.example.com/x" } }),
      "https://pub.example.com/x": () => new Response("no", { status: 401 }),
    });
    await expect(downloadSignedInPdf(new URL("https://doi.example.org/10.1/x"), {
      readCookies: signedIn("doi.example.org").read, fetch: web.fetch, browser: "Chrome",
    })).rejects.toThrow("no Chrome sign-in was found for pub.example.com");
  });

  test("a redirect to another site holds back SameSite=Strict cookies; the link's own site keeps them", async () => {
    const cookies = jar({
      "www.uni.example.edu": [cookie("strict", "s0", "www.uni.example.edu", "Strict")],
      "uni.example.edu": [cookie("strict", "s1", "uni.example.edu", "Strict"), cookie("lax", "l1", "uni.example.edu", "Lax")],
      "bank.example.com": [
        cookie("strict", "s2", "bank.example.com", "Strict"),
        cookie("lax", "l2", "bank.example.com", "Lax"),
        cookie("none", "n2", "bank.example.com", "None"),
        cookie("unset", "u2", "bank.example.com"),
      ],
    });
    const web = server({
      "https://www.uni.example.edu/a": () => new Response(null, { status: 302, headers: { location: "https://uni.example.edu/b" } }),
      "https://uni.example.edu/b": () => new Response(null, { status: 302, headers: { location: "https://bank.example.com/statement.pdf" } }),
      "https://bank.example.com/statement.pdf": () => pdfResponse(),
    });
    const result = await downloadSignedInPdf(new URL("https://www.uni.example.edu/a"), {
      readCookies: cookies.read, fetch: web.fetch, browser: "Chrome",
    });
    expect(web.requests.map((request) => request.cookie)).toEqual([
      "strict=s0",
      "strict=s1; lax=l1",
      "lax=l2; none=n2; unset=u2",
    ]);
    rmSync(dirname(result.path), { recursive: true, force: true });
  });

  test("property: same-site hops are symmetric and never join unrelated hosts", () => {
    expect(isSameSiteHop("doi.org", "doi.org")).toBe(true);
    expect(isSameSiteHop("www.pub.example", "pub.example")).toBe(true);
    expect(isSameSiteHop("a.pub.example", "b.pub.example")).toBe(false);
    expect(isSameSiteHop("evilpub.example", "pub.example")).toBe(false);
    expect(isSameSiteHop("1.2.3.4", "2.3.4")).toBe(false);
    const label = fc.stringMatching(/^[a-z][a-z0-9]{0,8}$/u);
    assertProperty(fc.property(label, label, label, (a, b, tld) => {
      const x = `${a}.${tld}`;
      const y = `${b}.${tld}`;
      expect(isSameSiteHop(x, y)).toBe(isSameSiteHop(y, x));
      expect(isSameSiteHop(x, y)).toBe(a === b);
      expect(isSameSiteHop(`www.${x}`, x)).toBe(true);
    }));
  });

  test("a slow cookie read counts against the download deadline", async () => {
    const timeouts: number[] = [];
    const started = Date.now();
    await expect(downloadSignedInPdf(new URL("https://a.example.org/x.pdf"), {
      readCookies: (_url, timeoutMs) => {
        timeouts.push(timeoutMs);
        return new Promise(() => undefined);
      },
      fetch: server({}).fetch,
      browser: "Chrome",
      timeoutMs: 30,
    })).rejects.toThrow("did not finish within");
    expect(Date.now() - started).toBeLessThan(5_000);
    expect(timeouts).toHaveLength(1);
    expect(timeouts[0]).toBeLessThanOrEqual(30);
  });

  test("a body that is not a PDF never creates a file", async () => {
    const directory = mkdtempSync(join(tmpdir(), "ghostget-pdf-test-"));
    try {
      const web = server({ "https://a.example.org/x.pdf": () => pdfResponse(LOGIN, { "content-type": "text/html" }) });
      await expect(downloadSignedInPdf(new URL("https://a.example.org/x.pdf"), {
        readCookies: signedIn("a.example.org").read, fetch: web.fetch, browser: "Chrome", directory,
      })).rejects.toThrow("does not seem to have access");
      expect(readdirSync(directory)).toEqual([]);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  test("an oversize body that started as a PDF leaves no partial file", async () => {
    const directory = mkdtempSync(join(tmpdir(), "ghostget-pdf-test-"));
    try {
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
        readCookies: jar({}).read, fetch: web.fetch, browser: "Chrome", maxPdfBytes: 6000, directory,
      })).rejects.toThrow("larger than");
      expect(readdirSync(directory)).toEqual([]);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
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

  test("a browser data folder resolves to its Default profile; a folder without a sign-in is refused", () => {
    const root = mkdtempSync(join(tmpdir(), "ghostget-pdf-profile-"));
    try {
      const data = join(root, "data");
      mkdirSync(join(data, "Default", "Network"), { recursive: true });
      writeFileSync(join(data, "Default", "Network", "Cookies"), "");
      const profile = join(root, "profile");
      mkdirSync(profile);
      writeFileSync(join(profile, "Cookies"), "");
      const browser = (value: string) => ({ kind: "browser", source: "chrome", profile: value }) as const;
      expect(resolveProfilePath(browser(data))).toEqual(browser(join(data, "Default")));
      expect(resolveProfilePath(browser(profile))).toEqual(browser(profile));
      expect(resolveProfilePath(browser("~/data"), root)).toEqual(browser(join(data, "Default")));
      expect(resolveProfilePath(browser("Work"))).toEqual(browser("Work"));
      expect(() => resolveProfilePath(browser(join(root, "empty")))).toThrow("has no saved sign-in");
      const firefox = { kind: "browser", source: "firefox", profile: join(root, "empty") } as const;
      expect(resolveProfilePath(firefox)).toEqual(firefox);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
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
      overrides: { fetch: web.fetch, readCookies: async () => ({ cookies: [cookie("s", "1", "a.example.org")], warnings: [] }) },
    });
    expect(code).toBe(1);
    const text = errors.join("");
    expect(text).toContain("your Chrome sign-in does not seem to have access");
    expect(text).toContain("Open the link in your browser first");
    expect(text).not.toContain("<html");
  });

  test("a wrong browser or profile is reported as a missing sign-in with the command that lists profiles", async () => {
    const lines: string[] = [];
    const web = server({ "https://a.example.org/x.pdf": () => pdfResponse(LOGIN, { "content-type": "text/html" }) });
    const code = await runSignedInPdfCommand(["https://a.example.org/x.pdf", "--browser-profile", "Work", "--json"], {
      stdout: (text) => lines.push(text),
      stderr: () => undefined,
    }, {
      environment: {},
      stderrIsTTY: false,
      runWordcellPdf: async () => 0,
      overrides: {
        fetch: web.fetch,
        readCookies: async () => { throw new Error("no matching cookies were found in the selected browser store"); },
      },
    });
    expect(code).toBe(1);
    const parsed = JSON.parse(lines.join("")) as { error: { code: string; message: string; next: string } };
    expect(parsed.error.code).toBe("no-sign-in");
    expect(parsed.error.message).toContain("No Chrome sign-in was found for a.example.org");
    expect(parsed.error.next).toBe("ghostget browsers");
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
