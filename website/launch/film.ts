/**
 * The published launch film, delivered to website/public/launch/ from
 * video/story (story.config.ts). The post embeds it only when this record
 * exists, and `film.test.ts` checks that every file it names is on disk.
 */
import type { ArticleVideoRecord } from "@hraness/design-kit";

export const LAUNCH_FILM: ArticleVideoRecord | null = {
  name: "Introducing GhostGet",
  description:
    "A 29-second captioned film about GhostGet: a signed-in browser lets an agent click anything you can; GhostGet gives it named actions instead, returns a page as Markdown with its source, previews anything beyond a read, never resends on its own, and ends with asking your agent to install GhostGet.",
  sources: [
    { src: "/launch/ghostget-launch.webm", type: "video/webm" },
    { src: "/launch/ghostget-launch.mp4", type: "video/mp4" },
  ],
  poster: "/launch/ghostget-launch-poster.jpg",
  captions: "/launch/ghostget-launch.vtt",
  captionsLanguage: "en",
  width: 1920,
  height: 1080,
  duration: "PT29.1S",
  uploadDate: "2026-10-04",
};
