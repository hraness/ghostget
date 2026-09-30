/**
 * The GhostGet launch post as beats: each one a standalone claim with its
 * own visual, readable as one post in a thread. The post at
 * /blog/introducing-ghostget/, the social kit in kb/launch/social-kit.md, and the
 * launch film captions all come from this list.
 *
 * Authored text holds no digits; every number is a `{fact}` placeholder
 * filled from `facts.ts`.
 */
import { resolveLaunchBeats, type LaunchBeat } from "@hraness/design-kit/launch";
import { launchFacts } from "./facts.ts";

export const launchBeats = [
  {
    id: "meet-ghostget",
    part: "what",
    headline: "Meet GhostGet, wget for the ghost in the machine",
    post: "GhostGet is wget for the ghost in the machine. It gives the AI agent on your computer named web actions: read a page, save a media item, or use an account you connected, without giving it your password.",
    visual: { kind: "mockup", id: "agent-read", state: {} },
    alt: "A coding agent asks GhostGet to read a page and gets clean Markdown back, in an illustration.",
    detailHref: "/docs/tutorials/getting-started/",
  },
  {
    id: "read-the-page",
    part: "does",
    headline: "Your agent reads the page, not the HTML",
    post: "Ask for a page and your agent gets Markdown with its source attached. A Wikipedia article came back as {wikiMarkdownBytes} where the raw page served {wikiHtmlBytes} of HTML, {wikiRatio} smaller.",
    visual: { kind: "mockup", id: "measured", state: {} },
    alt: "Bars comparing Markdown bytes with raw HTML bytes for four pages measured {measuredOn}, drawn as an illustration.",
    facts: ["wikiMarkdownBytes", "wikiHtmlBytes", "wikiRatio", "measuredOn"],
    detailHref: "/#measured",
  },
  {
    id: "named-actions",
    part: "does",
    headline: "Named actions instead of a signed-in browser",
    post: "A signed-in browser lets an agent click anything you can. With GhostGet it asks for one named action, like listing your Gmail contacts, and gets the result. It never sees a cookie, token, or login.",
    visual: { kind: "mockup", id: "named-action", state: { mode: "ghostget" } },
    alt: "An agent steering a signed-in browser beside one calling a named GhostGet action, in an illustration with made-up names.",
    detailHref: "/docs/explanation/security-model/",
  },
  {
    id: "your-accounts",
    part: "does",
    headline: "Works with the accounts you already use",
    post: "GhostGet has actions for {serviceCount} services, including Gmail, Beeper, WhatsApp, LinkedIn, X, Reddit, GitHub, and YouTube. You connect each account yourself, on the service's own sign-in page.",
    visual: { kind: "mockup", id: "services", state: {} },
    alt: "The {serviceCount} services GhostGet has actions for, each with its action count, drawn as an illustration.",
    facts: ["serviceCount"],
    detailHref: "/docs/reference/provider-capabilities/",
  },
  {
    id: "no-double-posts",
    part: "does",
    headline: "A lost reply never turns into an automatic double post",
    post: "Sometimes a post goes through but the answer gets lost on the way back. GhostGet writes down every send before it leaves and never sends it again on its own until it knows what happened.",
    visual: { kind: "mockup", id: "no-resend", state: {} },
    alt: "A send is written down, goes out, loses its reply, and is held instead of sent twice, in an illustration.",
  },
  {
    id: "preview-then-confirm",
    part: "how",
    headline: "Nothing goes out until you say so",
    post: "Anything beyond a read starts as a preview that shows the service, the account, and exactly what will be sent. Your agent can prepare it. Nothing is sent until someone confirms that exact preview.",
    visual: { kind: "mockup", id: "preview", state: {} },
    alt: "A preview of one post with its account and exact text, waiting for confirmation, in an illustration with a made-up account.",
    detailHref: "/docs/explanation/security-model/",
  },
  {
    id: "who-its-for",
    part: "who",
    headline: "For people who run an agent on their own computer",
    post: "GhostGet is for Claude Code, Codex, Cursor, and other agents that run commands on your Mac or Linux machine. If you need an agent to click through any site or fill in any form, use browser automation.",
    socialPost: "GhostGet is for Claude Code, Codex, Cursor, and other agents that run commands on your Mac or Linux machine and need to read the web and use the accounts you already have.",
    visual: { kind: "mockup", id: "agent-session", state: {} },
    alt: "Someone asks a coding agent about an email and it calls one GhostGet action, in an illustration with made-up names.",
    detailHref: "/about/",
  },
  {
    id: "stay-small",
    part: "vision",
    headline: "A small, reviewed layer between agents and your accounts",
    post: "The plan is for GhostGet to stay small. Your agent does the thinking, and GhostGet runs only actions someone has reviewed. Each new service arrives as reviewed actions with their own previews.",
    visual: { kind: "mockup", id: "layers", state: {} },
    alt: "Your agent on top, GhostGet's reviewed actions in the middle, and your accounts underneath, drawn as an illustration.",
  },
  {
    id: "limits",
    part: "limits",
    headline: "What GhostGet will not do",
    post: "GhostGet does not get past sign-in, payment, access controls, or DRM. Some services need their own setup first, and not everything it stores is encrypted. Its claims register lists {claimsNotVerified} claims with no automated check yet.",
    visual: { kind: "mockup", id: "limits", state: {} },
    alt: "A short list of what GhostGet does not do and how many of its claims have no automated check, drawn as an illustration.",
    facts: ["claimsNotVerified"],
    detailHref: "/claims/",
  },
  {
    id: "status",
    part: "status",
    headline: "Free, open source, and on your machine",
    post: "GhostGet is free, MIT licensed, and runs on macOS and Linux. The first step reads a public page and needs no account. {status}.",
    visual: { kind: "mockup", id: "controls", state: {} },
    alt: "ghostget status in a terminal with two connected accounts and one approval waiting, in an illustration with made-up accounts.",
    facts: ["status"],
    detailHref: "/docs/tutorials/getting-started/",
  },
] as const satisfies readonly LaunchBeat[];

/** Beats with every `{fact}` filled from the facts module. */
export const resolvedLaunchBeats = resolveLaunchBeats(launchBeats, launchFacts, {
  allowNumerals: [],
});
