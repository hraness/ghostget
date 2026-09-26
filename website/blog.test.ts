import { describe, expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  articleAdmissionPasses,
  articleProvenanceSentence,
  assertArticleAdmissions,
  articleProvenanceFromAdmission,
  type ArticleAdmission,
} from "@hraness/design-kit";
import {
  BLOG_POSTS,
  BUILT_ON_RELATIONS,
  blogPostPath,
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

const websiteRoot = dirname(fileURLToPath(import.meta.url));
const site: BlogSite = {
  description: "Ghostget test site.",
  name: "Ghostget",
  origin: "https://ghostget.com",
  socialImageAlt: "Ghostget social card",
  title: "Ghostget",
};

function quarantine(post: BlogPost): BlogPost {
  const admission: ArticleAdmission = { ...post.admission, lifecycle: "quarantined" };
  return { ...post, admission };
}

describe("Ghostget blog admission", () => {
  test("every post carries a valid admission record for its own route", () => {
    const admissions = BLOG_POSTS.map((post) => post.admission);
    expect(() => assertArticleAdmissions(admissions)).not.toThrow();
    for (const post of BLOG_POSTS) {
      expect(post.admission.href).toBe(blogPostPath(post.slug));
      expect(post.admission.drafting).toBe("ai-from-source");
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
      expect(sentence).toBe(`Drafted with AI from the source code and reviewed by ${post.admission.review?.reviewer}.`);
      expect(sentence).toMatch(/\bClaude\b/u);
      expect(sentence).not.toMatch(/human/iu);
    }
  });

  test("every post body renders with the Hraness byline, provenance note, sources, and related products", async () => {
    for (const post of BLOG_POSTS) {
      const fragment = await readFile(join(websiteRoot, "source/blog", post.bodyFile), "utf8");
      expect(fragment).not.toContain("<h1");
      const main = renderBlogPostMain(post, fragment);
      expect(main).toContain(">By Hraness</span>");
      expect(main).toContain('class="plain-publication__provenance"');
      expect(main).toContain('class="plain-publication__sources"');
      expect(main).toContain('class="plain-publication__related"');
      expect(main.match(/\{\{[A-Z0-9_]+\}\}/gu) ?? []).toEqual(
        fragment.includes("{{GHOSTGET_RELEASE}}") ? expect.arrayContaining(["{{GHOSTGET_RELEASE}}"]) : [],
      );
      expect(main).not.toContain("{{BLOG_");
      for (const [, href] of main.matchAll(/href="([^"]+)"/gu)) {
        expect(href).toMatch(/^(?:https:\/\/|\/|#)/u);
        expect(href).not.toContain("hraness.com/reference/web-delivery/");
      }
    }
  });
});

describe("Ghostget blog discovery", () => {
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
    expect(feed).toContain("<author><name>Hraness</name></author>");
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

describe("Built on Ghostget hub", () => {
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

  test("stops the build on a relation nobody has reviewed for the hub", () => {
    expect(() => renderBuiltOnEntries([{
      href: "https://example.com/",
      mark: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg'/%3E",
      name: "Example",
      productId: "example" as never,
      relationId: "runtime:example:wrench:unreviewed",
      relationship: "Example uses Ghostget.",
      role: "Example product.",
    }])).toThrow(/Review the new Ghostget relation/u);
  });
});
