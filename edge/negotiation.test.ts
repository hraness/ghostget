import { describe, expect, test } from "bun:test";
import fc from "fast-check";

import { assertAsyncProperty, assertProperty } from "../src/test-support";
import {
  handleDocumentNegotiation,
  isHtmlOnlyDocumentPath,
  markdownAssetPath,
  negotiateDocumentRepresentation,
  notAcceptableBody,
  parseAcceptMediaRanges,
} from "./negotiation";

function request(path: string, accept?: string, method = "GET"): Request {
  return new Request(`https://wrench.rip${path}`, accept === undefined
    ? { method }
    : { headers: { Accept: accept }, method });
}

describe("document Accept negotiation", () => {
  test("serves HTML when Accept is absent, empty, or unrestricted", () => {
    expect(negotiateDocumentRepresentation(null)).toEqual({ kind: "html" });
    expect(negotiateDocumentRepresentation("")).toEqual({ kind: "html" });
    expect(negotiateDocumentRepresentation("*/*")).toEqual({ kind: "html" });
    expect(negotiateDocumentRepresentation("text/*")).toEqual({ kind: "html" });
  });

  test("honors q-values, specificity, client order, and q=0", () => {
    expect(negotiateDocumentRepresentation("text/markdown")).toEqual({ kind: "markdown" });
    expect(negotiateDocumentRepresentation("text/html")).toEqual({ kind: "html" });
    expect(negotiateDocumentRepresentation("text/markdown, text/html")).toEqual({
      kind: "markdown",
    });
    expect(negotiateDocumentRepresentation("text/html, text/markdown")).toEqual({ kind: "html" });
    expect(negotiateDocumentRepresentation("text/markdown;q=0.8, text/html;q=0.9")).toEqual({
      kind: "html",
    });
    expect(negotiateDocumentRepresentation("text/html;q=0.1, text/markdown;q=1")).toEqual({
      kind: "markdown",
    });
    expect(negotiateDocumentRepresentation("text/html;q=0, text/markdown")).toEqual({
      kind: "markdown",
    });
    expect(negotiateDocumentRepresentation("text/html;q=0, */*")).toEqual({ kind: "markdown" });
    expect(negotiateDocumentRepresentation("text/markdown;charset=utf-8")).toEqual({
      kind: "markdown",
    });
  });

  test("returns 406 only when every owned representation is rejected", () => {
    expect(negotiateDocumentRepresentation("application/pdf")).toEqual({
      accept: "application/pdf",
      kind: "not-acceptable",
    });
    expect(negotiateDocumentRepresentation("text/markdown;q=0, text/html;q=0")).toEqual({
      accept: "text/markdown;q=0, text/html;q=0",
      kind: "not-acceptable",
    });
    expect(notAcceptableBody("application/pdf")).toContain("- text/html");
    expect(notAcceptableBody("application/pdf")).toContain("- text/markdown");
    expect(notAcceptableBody("application/pdf")).toContain("You requested: application/pdf");
  });

  test("negotiates an HTML-only document against only its owned representation", () => {
    expect(negotiateDocumentRepresentation("text/html", ["html"]))
      .toEqual({ kind: "html" });
    expect(negotiateDocumentRepresentation("text/html;q=0.5, text/markdown", ["html"]))
      .toEqual({ kind: "html" });
    expect(negotiateDocumentRepresentation("text/markdown", ["html"]))
      .toEqual({ accept: "text/markdown", kind: "not-acceptable" });
    expect(negotiateDocumentRepresentation("text/html;q=0, text/markdown", ["html"]))
      .toEqual({
        accept: "text/html;q=0, text/markdown",
        kind: "not-acceptable",
      });
    expect(notAcceptableBody("text/markdown", ["html"]))
      .toBe("This resource is available in:\n- text/html\n\nYou requested: text/markdown\n");
  });

  test("property: arbitrary Accept values stay inside the documented decision set", () => {
    assertProperty(
      fc.property(fc.option(fc.string(), { nil: null }), (header) => {
        const decision = negotiateDocumentRepresentation(header);
        expect(["html", "markdown", "not-acceptable"]).toContain(decision.kind);
        if (decision.kind === "not-acceptable") {
          expect(decision.accept).toBe(header ?? "");
          expect(parseAcceptMediaRanges(header).some((range) => range.q > 0 && (
            (range.type === "*" && range.subtype === "*")
            || (range.type === "text" && (range.subtype === "*" || range.subtype === "html" || range.subtype === "markdown"))
          ))).toBe(false);
        }
      }),
      { numRuns: 100 },
    );
  });
});

describe("document negotiation runtime", () => {
  test("maps canonical document paths to sibling markdown assets", () => {
    expect(markdownAssetPath("/")).toBe("/index.md");
    expect(markdownAssetPath("/docs/tutorials/getting-started/")).toBe("/docs/tutorials/getting-started.md");
    expect(markdownAssetPath("/docs/tutorials/getting-started")).toBe("/docs/tutorials/getting-started.md");
    expect(markdownAssetPath("/about/")).toBe("/about.md");
    expect(markdownAssetPath("/preview")).toBeNull();
    expect(markdownAssetPath("/preview/")).toBeNull();
    expect(markdownAssetPath("/preview/index.html")).toBeNull();
    expect(markdownAssetPath("/llms.txt")).toBeNull();
    expect(markdownAssetPath("/../secret")).toBeNull();
  });

  test("keeps the preview HTML-only for GET and HEAD", async () => {
    const retrieve = async (): Promise<Response> => {
      throw new Error("the HTML-only preview must not resolve a markdown asset");
    };
    for (const path of ["/preview", "/preview/", "/preview/index.html"]) {
      expect(isHtmlOnlyDocumentPath(path)).toBe(true);
      expect(await handleDocumentNegotiation(request(path, "text/html"), retrieve)).toBeNull();

      const rejected = await handleDocumentNegotiation(
        request(path, "text/markdown"),
        retrieve,
      );
      expect(rejected?.status).toBe(406);
      expect(rejected?.headers.get("content-type")).toBe("text/plain; charset=utf-8");
      expect(rejected?.headers.get("vary")).toBe("Accept");
      expect(await rejected?.text()).toBe(
        "This resource is available in:\n- text/html\n\nYou requested: text/markdown\n",
      );

      const head = await handleDocumentNegotiation(
        request(path, "application/xml", "HEAD"),
        retrieve,
      );
      expect(head?.status).toBe(406);
      expect(await head?.text()).toBe("");
    }
  });

  test("leaves HTML and static assets to the static origin", async () => {
    const retrieve = async (): Promise<Response> => {
      throw new Error("static HTML and assets must not be fetched by the negotiator");
    };
    expect(await handleDocumentNegotiation(request("/docs/tutorials/getting-started/", "text/html"), retrieve))
      .toBeNull();
    expect(await handleDocumentNegotiation(request("/llms.txt", "text/markdown"), retrieve))
      .toBeNull();
    expect(await handleDocumentNegotiation(request("/assets/styles.css", "text/markdown"), retrieve))
      .toBeNull();
  });

  test("serves markdown, 406, and markdown 404 bodies from sibling assets", async () => {
    const files = new Map([
      ["/index.md", "# Wrench\n"],
      ["/404.md", "# Missing\n"],
    ]);
    const retrieve = async (url: URL): Promise<Response> => {
      const body = files.get(url.pathname);
      return body === undefined
        ? new Response("missing", { status: 404 })
        : new Response(body, { status: 200 });
    };

    const markdown = await handleDocumentNegotiation(request("/", "text/markdown"), retrieve);
    expect(markdown?.status).toBe(200);
    expect(markdown?.headers.get("content-type")).toBe("text/markdown; charset=utf-8");
    expect(markdown?.headers.get("vary")).toBe("Accept");
    expect(markdown?.headers.get("link")).toBe(
      '<https://ghostget.com/>; rel="canonical", </index.md>; rel="alternate"; type="text/markdown"',
    );
    expect(await markdown?.text()).toBe("# Wrench\n");

    const missing = await handleDocumentNegotiation(
      request("/no-such-page/", "text/markdown"),
      retrieve,
    );
    expect(missing?.status).toBe(404);
    expect(missing?.headers.get("content-type")).toBe("text/markdown; charset=utf-8");
    expect(missing?.headers.get("vary")).toBe("Accept");
    expect(missing?.headers.get("x-robots-tag")).toBe("noindex, nofollow");
    expect(await missing?.text()).toBe("# Missing\n");

    const rejected = await handleDocumentNegotiation(request("/", "application/pdf"), retrieve);
    expect(rejected?.status).toBe(406);
    expect(rejected?.headers.get("content-type")).toBe("text/plain; charset=utf-8");
    expect(rejected?.headers.get("vary")).toBe("Accept");
    expect(rejected?.headers.get("cache-control")).toBe("no-store");
    expect(await rejected?.text()).toContain("You requested: application/pdf");

    const head = await handleDocumentNegotiation(request("/", "text/markdown", "HEAD"), retrieve);
    expect(head?.status).toBe(200);
    expect(head?.headers.get("link")).toContain('rel="canonical"');
    expect(await head?.text()).toBe("");
  });

  test("serves direct markdown requests with canonical and alternate links", async () => {
    const files = new Map([
      ["/docs/tutorials/getting-started.md", "# Install\n"],
      ["/docs/how-to/connect-beeper.md", "# Beeper\n"],
      ["/404.md", "# Missing\n"],
    ]);
    const retrieve = async (url: URL): Promise<Response> => {
      const body = files.get(url.pathname);
      return body === undefined
        ? new Response("missing", { status: 404 })
        : new Response(body, { status: 200 });
    };

    for (const [path, canonical] of [
      ["/docs/tutorials/getting-started.md", "https://ghostget.com/docs/tutorials/getting-started/"],
      ["/docs/how-to/connect-beeper.md", "https://ghostget.com/docs/how-to/connect-beeper/"],
    ] as const) {
      const direct = await handleDocumentNegotiation(request(path), retrieve);
      expect(direct?.status).toBe(200);
      expect(direct?.headers.get("content-type")).toBe("text/markdown; charset=utf-8");
      expect(direct?.headers.get("vary")).toBe("Accept");
      expect(direct?.headers.get("link")).toBe(
        `<${canonical}>; rel="canonical", <${path}>; rel="alternate"; type="text/markdown"`,
      );
      expect(await direct?.text()).toBe(files.get(path));
    }

    const notFoundDocument = await handleDocumentNegotiation(request("/404.md"), retrieve);
    expect(notFoundDocument?.status).toBe(200);
    expect(notFoundDocument?.headers.get("x-robots-tag")).toBe("noindex, nofollow");
    expect(notFoundDocument?.headers.get("link")).toBeNull();
    expect(await notFoundDocument?.text()).toBe("# Missing\n");

    const missingMirror = await handleDocumentNegotiation(request("/no-such-page.md"), retrieve);
    expect(missingMirror?.status).toBe(404);
    expect(missingMirror?.headers.get("x-robots-tag")).toBe("noindex, nofollow");
    expect(await missingMirror?.text()).toBe("# Missing\n");

    const headMirror = await handleDocumentNegotiation(
      request("/docs/tutorials/getting-started.md", undefined, "HEAD"),
      retrieve,
    );
    expect(headMirror?.status).toBe(200);
    expect(headMirror?.headers.get("link")).toContain('rel="canonical"');
    expect(await headMirror?.text()).toBe("");
  });

  test("D12: direct markdown requests never retrieve off the request origin", async () => {
    const origin = "https://ghostget.com";
    for (const raw of [`${origin}//evil.example/x.md`, `${origin}/\\evil.example/x.md`]) {
      const seen: URL[] = [];
      const retrieve = async (url: URL): Promise<Response> => {
        seen.push(url);
        return url.origin === origin && url.pathname === "/404.md"
          ? new Response("# Missing\n", { status: 200 })
          : new Response("off-origin body", { status: 200 });
      };
      const response = await handleDocumentNegotiation(new Request(raw), retrieve);
      expect(seen.map((url) => url.origin)).toEqual(seen.map(() => origin));
      expect(response?.status).toBe(404);
      expect(response?.headers.get("x-robots-tag")).toBe("noindex, nofollow");
      expect(await response?.text()).toBe("# Missing\n");
    }
  });

  test("property: every retrieved URL keeps the request origin", async () => {
    const origin = "https://ghostget.com";
    const path = fc.oneof(
      fc.string(),
      fc.tuple(fc.constantFrom("/", "\\", "/\\", "\\/", "%2F"), fc.string())
        .map(([prefix, rest]) => `${prefix}${rest}`),
    );
    await assertAsyncProperty(fc.asyncProperty(
      path,
      fc.boolean(),
      fc.constantFrom(undefined, "text/markdown", "text/markdown, text/html;q=0.5", "*/*"),
      fc.constantFrom("GET", "HEAD"),
      async (rest, direct, accept, method) => {
        const raw = `${origin}/${rest}${direct ? ".md" : ""}`;
        const seen: URL[] = [];
        const retrieve = async (url: URL): Promise<Response> => {
          seen.push(url);
          return new Response("# Body\n", { status: url.pathname === "/404.md" ? 200 : 404 });
        };
        await handleDocumentNegotiation(
          new Request(raw, accept === undefined ? { method } : { headers: { Accept: accept }, method }),
          retrieve,
        );
        for (const url of seen) expect(url.origin).toBe(origin);
      },
    ));
  });
});
