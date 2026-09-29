# GhostGet launch film

The film embedded in `/blog/introducing-ghostget/`. A code-built product film for a launch post. Every frame is HTML and CSS drawn from a timeline, so the film renders the same way each time and you can change a word without re-cutting anything.

The film has six acts:

1. Cold open: a collage of the problem and two lines of copy.
2. Title: the product name and its one-line promise.
3. Product walk: your product in a browser frame, with a camera that moves between surfaces, a cursor and a drawn highlight. One step per entry in `film.json`.
4. Proof: numbers counted up from your facts file.
5. Limits: what the product does not do.
6. End card: name, address and one line.

## Files

| File | What it holds |
| --- | --- |
| `copy.ts` | Every word and number on screen, built from `website/launch/facts.ts`. Start here. |
| `film.json` | Aspect, frame rate, colors and product CSS (`website/launch/mockups.css` plus `gg-film.css`). |
| `mockups.tsx` | The film's surfaces: the same `AgentReadMockup`, `AgentSessionMockup` and `PreviewMockup` the homepage and post render. Illustration only; accounts are made up. |
| `gg-film.css` | Film-only layout for those surfaces and the cold-open cards. |
| `timeline.ts` | Act order and length. `film.js`, captions and per-beat clips all read it. |
| `film.html` | The stage, with `{{SLOT}}` placeholders that `build.ts` fills. |
| `film.css` | Canvas, scenes, masks, grain and the placeholder product styles. |
| `film.js` | The choreography. Each frame is a pure function of time. |
| `build.ts` | Writes `out/film.html`, `out/scene.json`, `out/captions.vtt` and `out/beats.json`. |

The motion helpers come from `@hraness/slopcamera/local/html-film` and are bundled into `out/film.html` at build time.

## Status

Not rendered yet. The source builds (`bun run build`) and stills render, but the full render has not run, so the post's `website/launch/film.ts` record stays `null` and the post embeds no video. After a render, copy the delivered files to `website/source/media/launch/` and fill in that record; the launch test then checks every file it names exists.

## Make the film

```sh
bun install
bun run build                # add -- --aspect 9:16 for a vertical cut
slopcamera html still --input out/scene.json --at 3,12.5 --output out/stills
slopcamera html render --input out/scene.json --json > out/export.json
slopcamera html deliver out/export.json --basename ghostget-launch --poster-at 11 --social-at 24 \
  --cuts 1:1 --beats out/beats.json --per-beat-clips --output out/deliver
bun run build:portrait       # native 9:16 film; render and deliver it the same way
```

Run each command from this directory. Look at the stills before rendering the full film.

## Rules for the copy

- Take every number in `film.json` from a facts file or release record. Do not type numbers by hand.
- Keep the placeholder illustration note in `mockups.tsx` until the surfaces show your real product.
- Use sentence case and plain words. One idea per act.

## Swap in your product

1. Replace `ProductMockup` and `OpenCard` in `mockups.tsx`. Keep the `data-film` names that `film.json` steps point at (`list`, `detail-body`, `row-2`, `action`), or change both together. Each step names a `focus` for the camera, a `target` for the cursor click, an optional `highlight`, and an optional `after` state that the target gets once clicked (styled with `[data-film-state="done"]` in `film.css`).
2. If your site uses `@hraness/design-kit`, its `mockups.css` is inlined automatically. List any other product stylesheets in `film.json` under `productCss`.
3. List your fonts in `film.json` under `fonts` as `{ "name", "family", "weight", "file" }`. Without them the film uses the Nebula Sans files that ship with SlopCamera.
