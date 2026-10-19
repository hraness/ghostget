# Native article drafts

Use `linkedin-web articles.draft.save` to create or replace one private native
Article draft. It is an R2 mutation with its own exact preview, confirmation,
dispatch record, and independently verified unpublished result. Inspect the
installed capability before preparing input; `articles.read` and
`articles.publish` remain unavailable until their own contracts are observed.

Capture or read source material separately. The caller owns translation,
abridgement, title, attribution, links, image placement, and alternative text.
GhostGet accepts the final reviewed content; it does not translate a source URL
or Markdown into provider copy.

## Build the document

Pass canonical `ArticleDraftDocument` schemaVersion 2 JSON as `document`.
The current LinkedIn contract supports paragraphs, H1/H2 headings, native
blockquotes, and native HTTPS links. Text styles, lists, proprietary embeds,
and publication remain unavailable. Put each paragraph in its own block and
keep its text free of newlines. Link ranges use UTF-16 offsets, are ordered and
non-overlapping, and bind one canonical absolute HTTPS URL.

An inline image uses an `image` block with `imageIndex`, non-empty descriptive
`altText`, and an optional `caption`. Indexes name the ordered outer
`inline_images` files, are contiguous from zero, and appear exactly once.
Use 1–20 ordered JPEG, PNG, or WebP files, at most 5 MiB each. GhostGet sniffs,
hashes, and copies the exact bytes into the private plan-asset bundle, removes
source paths from the preview, and verifies the bytes again before dispatch.
Do not substitute a URL, provider asset ID, video, HTML, or editor payload.

Keep the banner outside the body. A new draft requires one outer
`cover_image` JPEG, PNG, or WebP up to 5 MiB. On an exact `draft_id` replacement,
supply it only when replacing the banner; omit it to preserve the independently
read existing banner. It never implicitly becomes an inline image. Include the
same bytes in both places only when the reviewed content intentionally does so.
The current cover contract writes an empty cover caption.

For a source-post quotation, author native blockquotes and an attributed HTTPS
link as ordinary reviewed document content. Do not infer source text or copy
provider editor payloads.

Write the exact input to a private file. Add `draft_id` only to replace one
exact private draft owned by the bound account. Inspect the installed schema
for its current title, document, and attachment bounds.

## Save without publishing

```sh
ghostget capabilities linkedin-web --json
ghostget linkedin-web articles.draft.save \
  --input @/absolute/private/article-draft-input.json \
  --auth linkedin-main --preview --json
ghostget confirm <preview-digest> --json
```

Review the account, title, canonical document, separate cover hash, ordered
inline-image hashes, draft ID, R2 side effect, contract version, and complete
dispatch schedule. Create plans the title shell, cover, inline images, and
content. Replacement plans an optional cover, inline images, and one
conservative title/content replacement. Never switch provider or account after
preview.

The fixed reviewed registration, signed byte transfer, autosave, and
editor-response readback run in contained headed Chrome. The window may be
visible. GhostGet does not type into or read the editor DOM, and callers cannot
supply a URL, header, script, or selector. The reviewed upload proceeds directly
from its 201 response to autosave without an invented processing poll.

Require `articles.draft.save`, `published: false`, `mode: "draft"`, the private
draft identity, and exact cover/inline-image counts. Independent readback binds
the current author, private `DRAFT` lifecycle, title, separate cover asset,
text/link structure, inline-image order, alternative text, captions, and stable
asset URNs. LinkedIn owns an editor-only empty trailing paragraph after a final
image; GhostGet removes exactly that provider-added value during readback.

## Handle uncertainty

Do not retry a partial or indeterminate image save. An upload may have created
a provider asset before its stable identity entered the result. Preserve the
run and exact private draft. Do not search by title, guess an ID, repeat
uploads, switch transports, or publish as recovery. The image-capable contract
has no automated reconciliation path. Only already durable historical
text-only contracts retain exact confirmed replacement reconciliation; new
previews never select those historical routes.
