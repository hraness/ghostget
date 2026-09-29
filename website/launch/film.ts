/**
 * The published launch film, or null until a render is delivered to
 * website/public/launch/. The post embeds it only when this record exists, and
 * `film.test.ts` checks that every file it names is on disk.
 */
import type { ArticleVideoRecord } from "@hraness/design-kit";

export const LAUNCH_FILM: ArticleVideoRecord | null = null;
