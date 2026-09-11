# Ghostget native control panel

A macOS companion to the Ghostget CLI. The seven screens share production React
components and state. The renderer's only native capability is `control_request`.
The host starts one exact packaged Bun 1.3.14 binary with unchanged package source
and dependency files; it never searches PATH for a runtime or installs code.

From the repository root:

```sh
bunx tsc --noEmit -p desktop/tsconfig.json
bun test desktop
bun desktop/scripts/build.ts
bun desktop/scripts/build.ts --direct
bun desktop/scripts/serve-direct.ts
bun desktop/scripts/marketing.tsx
bun desktop/scripts/package.ts --stage-only
bun desktop/scripts/native-smoke.ts
```

Native packaging requires the root owner's mac-native compute lane. After staging
resources, invoke the pinned Tauri CLI from `desktop/src-tauri`. The default
bundle target is the `.app`. Signing and notarization are separate release gates;
a locally built unsigned bundle is not release-qualified. The runtime manifest
records exact input bytes; signatures cover the final shipped resource tree.
The installed 1Password app supplies its own IPC library. No vault data or
1Password library is copied into the app.

`GHOSTGET_STATE_HOME` can select the same dedicated state home as the CLI. The
host otherwise inherits only HOME, TMPDIR, USER and LOGNAME and uses a fixed
system PATH. It strips runtime preloads, proxies and ambient credential variables.
The single private stdio channel admits eight bounded active requests, bounded 4 MiB frames,
matching request identifiers, categorical failures and bounded deadlines.
Renderer cancellation discards a stale reply; it does not imply a consequential
operation was rolled back. Explicit connection cancellation and host shutdown
have separate lifecycle semantics.

Direct is development-only. Its eight strict worlds include empty and reconnect
accounts, policy, user/community interfaces, pending approval, vault cancellation,
backend failure and a 10,000-row activity history. `ControlPanelPort` is the seam:
fixture checks prove shared UI behavior, not the replaced native IPC, credential,
filesystem, authorization or real-provider implementation. `desktop/scripts/verify.ts`
drives the declared browser contract. Source-map checks prove both graph selection
and Direct exclusion from production output.

Marketing output is `desktop/out/marketing/`: fixed HTML scenes and the real app
CSS/font, with no script or hydration. The website owns accessible parent scene
and enlargement controls. Embed each closed scene URL in an iframe with an empty
sandbox and disclose fictional accounts. Never copy the Direct runtime into the
marketing site or ship a query-selected fixture mode in the native app.

## Direct driver disposal exception

The verifier uses agent-browser **0.32.3**, one owned Chromium process and no more
than eight fresh `window new` contexts. The driver can promote a queued
`Target.targetInfoChanged` for a closed page into a new target after `tab_close`
removes it from bookkeeping, then fail while attaching the destroyed target.
This was reproduced in multiple local verification attempts; the relevant event
handling is unchanged in 0.33.1. See the pinned upstream
[tab close](https://github.com/vercel-labs/agent-browser/blob/v0.32.3/cli/src/native/browser.rs#L1114)
and [event drain](https://github.com/vercel-labs/agent-browser/blob/v0.32.3/cli/src/native/actions.rs).

A reviewed local exception replaces the Direct 0.7.21 reference skill's
per-scenario tab-close attempts. After all live bridge, probe, semantic and visual
assertions, the verifier navigates to a script-free, no-store, CSP-restricted
local disposal document. The real `pagehide` handler disposes the Direct session
and writes a nonce-bound receipt with its canonical activation hash,
`isDisposed()` result and disposal-error count. The inert destination must match
that receipt, have no script or bridge, and join an exact inventory of retained
inert pages. No old context is reused. At most eight inert scenario tabs plus the
bootstrap remain until **required final whole-browser close**. This is not proof
of per-context closure or unmodified reference-skill compliance. Unexpected
network-control failures, browser replacements and final-close failures remain
fatal. Receipts record this policy deviation explicitly.

## Website iframe qualification

The optional `desktop/scripts/verify-website.mjs` check accepts the absolute
`package.json` path of an already installed Playwright **1.62.1**. It runs through
the browser-auth scheduler lane, builds the website, and serves its exact files
with the repository's production header rules. One owned browser and isolated
context allow only GET/HEAD requests to the exact loopback origin; WebSockets,
service workers and WebRTC construction are blocked. The four real parent
controls open the empty-sandbox scenes without changing their CSP. Debugger
readback verifies opaque-origin separation, absent scripts and authority bridges,
layout bounds and loaded Nebula FontFaces. The server records the font's
`Origin: null` request and CORS response, and the receipt retains screenshots,
source/header/font hashes and required whole-browser cleanup.

Playwright's pinned service-worker blocking init script reads
`navigator.serviceWorker` in each opaque frame, which the sandbox already denies.
The check retains exactly those four diagnostic errors, the exact driver source
and its hash, and independently verifies that each frame denies the getter. Any
other page error, console error or unexpected network request fails the check.
This local website proof is separate from Direct fixture and native acceptance.
