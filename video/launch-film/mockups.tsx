/**
 * The film's product surfaces, built from the same components the homepage
 * and the launch post render (website/launch/mockups.tsx), so the film shows
 * exactly what the site shows. `data-film` names are what copy.ts steps point
 * at.
 *
 * Illustration only: accounts, names, and message text are made up.
 */
import { AgentReadMockup, AgentSessionMockup, PreviewMockup } from "../../website/launch/mockups.tsx";

/** Three GhostGet surfaces side by side: a read, an account action, and a preview waiting for you. */
export function ProductMockup() {
  return (
    <div className="gg-film" role="img" aria-label="Illustration: a coding agent reading a page, calling a named account action, and a preview waiting for confirmation">
      <div className="gg-film-panel" data-film="read"><AgentReadMockup theme="dark" /></div>
      <div className="gg-film-panel" data-film="session"><AgentSessionMockup theme="dark" /></div>
      <div className="gg-film-panel" data-film="preview">
        <div data-film="confirm"><PreviewMockup theme="dark" /></div>
      </div>
    </div>
  );
}

/** Snippets of the problem for the cold open: what agents are asked to hold today. Made up. */
const OPEN_SNIPPETS = [
  ["Paste your session cookie", "sessionid=•••••••••••••"],
  ["Share your password", "so the agent can sign in"],
  ["API key required", "sk-•••••••••••••••••"],
  ["Agent opened Settings", "it can click anything you can"],
  ["Did it post twice?", "the reply never came back"],
  ["Allow full browser access", "every tab, every account"],
] as const;

/** A small card used in the cold open collage. */
export function OpenCard({ index }: { index: number }) {
  const [title, detail] = OPEN_SNIPPETS[index % OPEN_SNIPPETS.length]!;
  return (
    <div className="gg-open-card">
      <b>{title}</b>
      <p>{detail}</p>
    </div>
  );
}
