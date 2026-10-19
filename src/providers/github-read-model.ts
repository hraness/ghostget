import { GITHUB_API_ORIGIN, GITHUB_REPOSITORIES_PER_PAGE } from "./github-web";

export function parseJson(
  bytes: Uint8Array,
  label: string

): unknown {
  if (bytes.byteLength === 0) {
    throw new Error(`${label} was empty`);
  }
  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    throw new Error(`${label} was not valid UTF-8`);
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new Error(`${label} was not valid JSON`);
  }
}

export function organizationRepositoriesUrl(
  organization: string,
  page: number

): URL {
  const url = new URL(`/orgs/${organization}/repos`, GITHUB_API_ORIGIN);
  url.searchParams.set("type", "public");
  url.searchParams.set("per_page", String(GITHUB_REPOSITORIES_PER_PAGE));
  url.searchParams.set("page", String(page));
  return url;
}

export function exactNextPageLink(
  raw: string | null,
  organization: string,
  expectedPage: number,

): boolean {
  if (raw === null) return false;
  let next = false;
  for (const segment of raw.split(",")) {
    const match = /^<([^<>]+)>;\s*rel="(first|last|next|prev)"$/u.exec(
      segment.trim(),
    );
    if (match === null) {
      throw new Error("GitHub organization repository pagination header drifted");
    }
    if (match[2] !== "next") continue;
    if (next) {
      throw new Error("GitHub organization repository pagination repeated next page");
    }
    const nextTarget = match[1];
    if (nextTarget === undefined) {
      throw new Error("GitHub organization repository pagination next link was invalid");
    }
    let url: URL;
    try {
      url = new URL(nextTarget);
    } catch {
      throw new Error("GitHub organization repository pagination next link was invalid");
    }
    const expected = organizationRepositoriesUrl(organization, expectedPage);
    const keys = [...url.searchParams.keys()].sort();
    if (
      url.origin !== expected.origin
      || url.pathname !== expected.pathname
      || url.username !== ""
      || url.password !== ""
      || url.hash !== ""
      || keys.join(",") !== "page,per_page,type"
      || url.searchParams.getAll("page").join(",") !== String(expectedPage)
      || url.searchParams.getAll("per_page").join(",")
      !== String(GITHUB_REPOSITORIES_PER_PAGE)
      || url.searchParams.getAll("type").join(",") !== "public"
    ) {
      throw new Error("GitHub organization repository pagination next link drifted");
    }
    next = true;
  }
  return next;
}

export function repositoryPage(value: unknown): readonly unknown[] {
  if (
    !Array.isArray(value)
    || value.length > GITHUB_REPOSITORIES_PER_PAGE
  ) {
    throw new Error("GitHub organization repository page was not one bounded array");
  }
  return Object.freeze([...value]);
}
