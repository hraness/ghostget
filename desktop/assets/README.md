# White ghost artwork

`ghost-source.png` is the selected 160-pixel emoji source. `ghost.png` is its
64-pixel transparent UI rendition, shared byte-for-byte with the website.
The native PNG and ICNS live in `../src-tauri/icons/`. The website's editable
social layout is `../../website/brand/og.svg`; render it at 1200 × 630 with the
checked Nebula Sans Book and Bold fonts.

[Provenance](ghost-provenance.json) records source and output hashes, renderer
versions, the rejected vector trace, and the source-resolution limit. Resize
with Sharp 0.35.3 and its `lanczos3` kernel. The social layout was rendered with
`@resvg/resvg-js` 2.6.2 and explicit fonts, without system-font fallback. Those
tools came from the verified immutable Slopcamera 3.2.6 distribution; they are
not Ghostget runtime dependencies. Native ICNS packaging uses `iconutil` with
16, 32, 64, 128, 256, 512, and 1024-pixel source renditions.

Keep the body white, the face black, and the tongue pink. Do not choose the
tongue's accent as the body's color. Only the compact UI image is copied into
the renderer and inert marketing output; source artwork stays build-time data.
