/**
 * Build-time rendering of the launch pieces into static HTML: mockup slots on
 * public pages, and the beats plus the launch film on the launch post. The
 * site ships no client JavaScript for any of it.
 */
import { LaunchBeats } from "@hraness/design-kit/react/server";
import { ArticleVideo } from "@hraness/design-kit/react/server";
import { renderToStaticMarkup } from "react-dom/server";
import { resolvedLaunchBeats } from "./beats.ts";
import { LAUNCH_FILM } from "./film.ts";
import { LaunchMockup, type LaunchService } from "./mockups.tsx";

/** `{{LAUNCH_MOCKUP:id}}` or `{{LAUNCH_MOCKUP:id?key=value&key=value}}`. */
const SLOT = /\{\{LAUNCH_MOCKUP:([a-z-]+)(?:\?([a-z0-9=&-]+))?\}\}/gu;

export function launchServicesFrom(entries: readonly Readonly<{ name: string; supportedActionCount: number }>[]): LaunchService[] {
  return entries
    .filter((entry) => entry.supportedActionCount > 0)
    .map((entry) => ({ name: entry.name, actions: entry.supportedActionCount }));
}

/** Replace every mockup slot with the rendered illustration. Unknown ids throw. */
export function renderLaunchMockupSlots(html: string, services: readonly LaunchService[]): string {
  return html.replace(SLOT, (_match, id: string, query: string | undefined) => {
    const state = Object.fromEntries(new URLSearchParams(query ?? ""));
    return renderToStaticMarkup(<LaunchMockup id={id} services={services} state={state} />);
  });
}

/** The launch post's beats, one section per beat with its mockup. */
export function renderLaunchBeatsHtml(services: readonly LaunchService[]): string {
  return renderToStaticMarkup(
    <LaunchBeats
      beats={resolvedLaunchBeats}
      detailLabel="Read more"
      renderVisual={(beat) => {
        if (beat.visual.kind !== "mockup") throw new RangeError(`Beat ${beat.id} needs a mockup visual.`);
        return <LaunchMockup id={beat.visual.id} services={services} state={beat.visual.state ?? {}} />;
      }}
    />,
  );
}

/** The launch film figure, or an empty string until a rendered film is published. */
export function renderLaunchFilmHtml(): string {
  if (LAUNCH_FILM === null) return "";
  return renderToStaticMarkup(
    <ArticleVideo
      caption="The GhostGet launch film: the same illustrations as this post, in motion, with captions."
      video={LAUNCH_FILM}
      width="wide"
    />,
  );
}

/** Fill `{{LAUNCH_BEATS}}` and `{{LAUNCH_FILM}}` in a post body, then any mockup slots. */
export function renderLaunchPostBody(fragment: string, services: readonly LaunchService[]): string {
  let body = fragment;
  if (body.includes("{{LAUNCH_BEATS}}")) body = body.replace("{{LAUNCH_BEATS}}", () => renderLaunchBeatsHtml(services));
  if (body.includes("{{LAUNCH_FILM}}")) body = body.replace("{{LAUNCH_FILM}}", () => renderLaunchFilmHtml());
  return renderLaunchMockupSlots(body, services);
}
