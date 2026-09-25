// The website is a static Bun build, not a Next.js app. The source types of
// @hraness/web-discovery name Next's Metadata and MetadataRoute types, and
// importing the real "next" package would also load Next's global ProcessEnv
// and DOM augmentations into every Ghostget program. tsconfig.json maps "next"
// to this file so only the names web-discovery uses resolve.
export interface Metadata {
  readonly [key: string]: unknown;
}

export declare namespace MetadataRoute {
  type Sitemap = Array<{
    url: string;
    lastModified?: string | Date;
    changeFrequency?: "always" | "hourly" | "daily" | "weekly" | "monthly" | "yearly" | "never";
    priority?: number;
    images?: string[];
    [key: string]: unknown;
  }>;
  type Robots = Readonly<Record<string, unknown>>;
  type Manifest = Readonly<Record<string, unknown>>;
}
