/**
 * The film's words and numbers, built from the site's launch facts module so
 * the film, the post, and the social kit never disagree. Change a number in
 * website/launch/facts.ts, not here.
 */
import { LAUNCH_MEASURED_READS, LAUNCH_RELEASE, LAUNCH_SERVICE_COUNT } from "../../website/launch/facts.ts";
import type { FilmCopy } from "./timeline.ts";

const wikipedia = LAUNCH_MEASURED_READS[0];
/** One decimal, as the post prints it. */
const wikiRatio = Math.round((wikipedia.htmlBytes / wikipedia.markdownBytes) * 10) / 10;

export const filmCopy: FilmCopy = {
  name: "GhostGet",
  promise: "wget for the ghost in the machine.",
  url: "ghostget.com",
  open: [
    "Your agent wants to use your accounts.",
    "It should not need your password to do it.",
  ],
  steps: [
    {
      heading: "Read",
      body: "Your agent asks for a page and gets clean Markdown back.",
      focus: "read",
      target: "read",
      highlight: "read",
    },
    {
      heading: "Act",
      body: "It calls one named action in an account you connected.",
      focus: "session",
      target: "session",
      highlight: "session",
    },
    {
      heading: "Confirm",
      body: "Nothing goes out until you confirm the exact preview.",
      focus: "preview",
      target: "confirm",
      highlight: "preview",
      after: "done",
    },
  ],
  proof: {
    caption: `Measured on a Wikipedia article; services in ${LAUNCH_RELEASE.status.replace("Latest release: ", "")}.`,
    items: [
      { value: wikiRatio, suffix: "×", label: "smaller than the raw HTML" },
      { value: LAUNCH_SERVICE_COUNT, suffix: "", label: "services with named actions" },
    ],
  },
  limits: {
    heading: "What it will not do",
    body: "Get past a sign-in, or send again when it does not know what happened.",
  },
  end: { line: `Free and open source. ${LAUNCH_RELEASE.status}.` },
};
