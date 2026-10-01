import { describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  articleAdmissionPasses,
  articleProvenanceSentence,
  assertArticleAdmissions,
  articleProvenanceFromAdmission,
  escapeArticleHtml,
  type ArticleAdmission,
} from "@hraness/design-kit";
import {
  BLOG_POSTS,
  BUILT_ON_RELATIONS,
  blogPostPath,
  blogPostJsonLd,
  blogSitemapPaths,
  fillBlogShell,
  ghostgetRelations,
  indexablePosts,
  renderBlogAtomFeed,
  renderBlogIndexMain,
  renderBlogLlmsEntries,
  renderBlogPostMain,
  renderBuiltOnEntries,
  type BlogPost,
  type BlogSite,
} from "./blog";

import { editorialImages, editorialImage, editorialImageUrl, editorialImageSrcSet } from "./editorial-images";

const websiteRoot = dirname(fileURLToPath(import.meta.url));
const site: BlogSite = {
  description: "GhostGet test site.",
  name: "GhostGet",
  origin: "https://ghostget.com",
  socialImageAlt: "GhostGet social card",
  title: "GhostGet",
};

function quarantine(post: BlogPost): BlogPost {
  const admission: ArticleAdmission = { ...post.admission, lifecycle: "quarantined" };
  return { ...post, admission };
}

describe("GhostGet blog admission", () => {
  test("every post carries a valid admission record for its own route", () => {
    const admissions = BLOG_POSTS.map((post) => post.admission);
    expect(() => assertArticleAdmissions(admissions)).not.toThrow();
    for (const post of BLOG_POSTS) {
      expect(post.admission.href).toBe(blogPostPath(post.slug));
      expect(post.admission.drafting).toBe("ai");
      expect(post.admission.review?.reviewerType).toBe("ai");
      expect(post.admission.humanReview).toBeNull();
      if (post.admission.lifecycle === "indexable") {
        expect(articleAdmissionPasses(post.admission.scores)).toBe(true);
      }
    }
    expect(new Set(BLOG_POSTS.map((post) => post.slug)).size).toBe(BLOG_POSTS.length);
  });

  test("an AI review is disclosed as AI and never called human", () => {
    for (const post of BLOG_POSTS) {
      const sentence = articleProvenanceSentence(articleProvenanceFromAdmission(post.admission));
      expect(sentence).toBe(`Drafted with AI and reviewed by ${post.admission.review?.reviewer}.`);
      expect(sentence).toMatch(/\bAI\b/u);
      expect(sentence).not.toMatch(/human/iu);
    }
  });

  test("every post body renders with the Hraness byline, provenance note, sources, and the article image", async () => {
    for (const post of BLOG_POSTS) {
      const fragment = await readFile(join(websiteRoot, "source/blog", post.bodyFile), "utf8");
      expect(fragment).not.toContain("<h1");
      const main = renderBlogPostMain(post, fragment);
      expect(main).toContain('By <a href="https://hraness.com" rel="author">Hraness</a>');
      expect(main).toContain('class="plain-publication__provenance"');
      expect(main).toContain('class="plain-publication__sources"');
      expect(main).toContain('class="editorial-figure"');
      expect(main).not.toMatch(/(?:Published|Updated|Checked) <time/u);
      for (const placeholder of main.match(/\{\{[A-Z0-9_]+\}\}/gu) ?? []) {
        expect(["{{GHOSTGET_RELEASE}}", "{{LAUNCH_FILM}}"] ).toContain(placeholder);
      }
      expect(main).not.toContain("{{BLOG_");
      for (const [, href] of main.matchAll(/href="([^"]+)"/gu)) {
        expect(href).toMatch(/^(?:https:\/\/|\/|#)/u);
        expect(href).not.toContain("hraness.com/reference/web-delivery/");
      }
    }
  });
});

describe("GhostGet blog discovery", () => {
  test("a quarantined post leaves the index, sitemap, feed, and llms.txt and renders noindex", async () => {
    const [first, ...rest] = BLOG_POSTS;
    const posts = [quarantine(first!), ...rest];
    const path = blogPostPath(first!.slug);
    expect(indexablePosts(posts).map((post) => post.slug)).not.toContain(first!.slug);
    expect(blogSitemapPaths(site, posts).map((entry) => entry.path)).not.toContain(path);
    expect(renderBlogAtomFeed(site, posts)).not.toContain(`${site.origin}${path}`);
    expect(renderBlogLlmsEntries(site, posts)).not.toContain(`${site.origin}${path}`);
    expect(renderBlogIndexMain(posts)).not.toContain(`href="${path}"`);

    const shell = await readFile(join(websiteRoot, "source/blog.html"), "utf8");
    const page = fillBlogShell(shell, site, {
      canonicalPath: path,
      description: first!.dek,
      indexable: false,
      ogType: "article",
      title: first!.title,
    }, "<p>Body</p>");
    expect(page).toContain('<meta name="robots" content="noindex">');
    expect(page).not.toContain("{{JSON_LD}}");
    expect(page).not.toContain("{{MARKDOWN_ALTERNATE}}");
    expect(page).not.toContain("{{BLOG_");
  });

  test("indexable posts enter every discovery surface with a lastmod", () => {
    const listed = indexablePosts();
    const sitemap = blogSitemapPaths(site);
    expect(sitemap.map((entry) => entry.path)).toEqual(["/blog/", ...listed.map((post) => blogPostPath(post.slug))]);
    for (const entry of sitemap) expect(entry.lastModified).toMatch(/^\d{4}-\d{2}-\d{2}T00:00:00\.000Z$/u);
    const feed = renderBlogAtomFeed(site);
    const llms = renderBlogLlmsEntries(site);
    for (const post of listed) {
      expect(feed).toContain(`<id>${site.origin}${blogPostPath(post.slug)}</id>`);
      expect(llms).toContain(`[${post.title}](${site.origin}${blogPostPath(post.slug)})`);
    }
    expect(feed).toContain("<author><name>Hraness</name><uri>https://hraness.com</uri></author>");
  });

  test("keeps shell examples with dollar signs literal", async () => {
    const shell = await readFile(join(websiteRoot, "source/blog.html"), "utf8");
    const page = fillBlogShell(shell, site, {
      canonicalPath: "/blog/",
      description: "d",
      indexable: true,
      ogType: "website",
      title: "t",
    }, "<pre><code>echo \"$`\" $& $'</code></pre>");
    expect(page).toContain("<pre><code>echo \"$`\" $& $'</code></pre>");
  });
});

describe("Built on GhostGet hub", () => {
  test("renders every registered relation from the portfolio registry", () => {
    const relations = ghostgetRelations();
    expect(relations.length).toBeGreaterThan(0);
    const entries = renderBuiltOnEntries();
    for (const relation of relations) {
      expect(Object.keys(BUILT_ON_RELATIONS)).toContain(relation.relationId);
      const post = BUILT_ON_RELATIONS[relation.relationId];
      if (post === null || post === undefined) continue;
      expect(entries).toContain(`>${relation.name}</h3>`);
      expect(entries).toContain(`href="${post.href}"`);
    }
  });

  test("lists Sponge with its registry relationship sentence", () => {
    const sponge = ghostgetRelations().find((item) => item.relationId === "runtime:sponge:wrench:captures-signed-in-pages-through");
    expect(sponge).toBeDefined();
    expect(BUILT_ON_RELATIONS[sponge!.relationId]).not.toBeNull();
    const entries = renderBuiltOnEntries();
    expect(entries).toContain('<h3 id="sponge">Sponge</h3>');
    expect(entries).toContain(escapeArticleHtml(sponge!.relationship));
  });

  test("stops the build on a relation nobody has reviewed for the hub", () => {
    expect(() => renderBuiltOnEntries([{
      href: "https://example.com/",
      mark: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg'/%3E",
      name: "Example",
      productId: "example" as never,
      relationId: "runtime:example:wrench:unreviewed",
      relationship: "Example uses GhostGet.",
      role: "Example product.",
    }])).toThrow(/Review the new GhostGet relation/u);
  });
});


describe("Editorial image delivery", () => {
  test("every promoted image matches its completed SlopCamera receipt and responsive files", async () => {
    expect(editorialImages).toHaveLength(10);
    for (const image of editorialImages) {
      const bytes = await readFile(join(websiteRoot, "public", image.src));
      expect(createHash("sha256").update(bytes).digest("hex")).toBe(image.imageSha256);
      const receipt = JSON.parse(await readFile(join(websiteRoot, image.provenance.receipt), "utf8"));
      const job = JSON.parse(await readFile(join(websiteRoot, image.provenance.job), "utf8"));
      const prompt = await readFile(join(websiteRoot, image.provenance.prompt), "utf8");
      expect(receipt.outputs[0].sha256).toBe(image.imageSha256);
      expect(receipt.localValidation.status).toBe("decode-passed");
      expect(job.state).toBe("completed");
      expect(job.noSlopcameraRetry).toBe(true);
      expect(job.clientMaxRetries).toBe(0);
      expect(createHash("sha256").update(prompt.trim()).digest("hex")).toBe(image.provenance.promptSha256);
      expect(job.request.promptSha256).toBe(image.provenance.promptSha256);
      for (const derivative of image.derivatives) {
        const derived = await readFile(join(websiteRoot, "public", derivative.src));
        expect(createHash("sha256").update(derived).digest("hex")).toBe(derivative.sha256);
        expect(derived.byteLength).toBeLessThan(bytes.byteLength);
      }
    }
  });

  test("blog cards, figures, social metadata, and schema use each article's own image", async () => {
    const shell = await readFile(join(websiteRoot, "source/blog.html"), "utf8");
    const index = renderBlogIndexMain();
    expect(index).not.toContain("<time");
    expect(index.match(/class="blog-entry-image"/gu)).toHaveLength(BLOG_POSTS.length);
    for (const post of BLOG_POSTS) {
      const image = editorialImage(blogPostPath(post.slug));
      expect(image).toBeDefined();
      const body = await readFile(join(websiteRoot, "source/blog", post.bodyFile), "utf8");
      const main = renderBlogPostMain(post, body);
      const page = fillBlogShell(shell, site, { canonicalPath: blogPostPath(post.slug), description: post.dek, indexable: true, ogType: "article", title: post.title }, main);
      expect(main).toContain(`srcset="${editorialImageSrcSet(image!)}"`);
      expect(index).toContain(`srcset="${editorialImageSrcSet(image!)}"`);
      expect(main).toContain('href="https://slopcamera.com">SlopCamera</a>');
      expect(main).not.toContain("editorial-provenance/");
      expect(page).toContain(`property="og:image" content="${editorialImageUrl(image!)}"`);
      expect(page).toContain(`name="twitter:image" content="${editorialImageUrl(image!)}"`);
      const graph = blogPostJsonLd(post, site, [], "#organization")["@graph"] as Array<Record<string, unknown>>;
      const article = graph.find(entry => entry["@type"] === "BlogPosting");
      expect(article?.image).toMatchObject({ contentUrl: editorialImageUrl(image!), creditText: image!.credit, width: 1536, height: 864 });
      expect(article?.datePublished).toBe(`${post.published}T00:00:00.000Z`);
      expect(article?.dateModified).toBe(`${post.updated}T00:00:00.000Z`);
    }
  });
});
