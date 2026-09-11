# Ghostget native control panel

A macOS companion to the Ghostget CLI. The eight screens share production React
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
bun run desktop:package
bun desktop/scripts/native-smoke.ts
```

Native packaging requires the root owner's mac-native compute lane.
`desktop:package` stages resources, runs the pinned Tauri build with Cargo's lock
file enforced, and applies an outer ad hoc signature to the local `.app`. It
strips Apple and updater signing variables from that build and uses no signing
identity credentials or timestamp service. The bundled Bun signatures and all
runtime resource bytes must still match the staged inventory after sealing.
The final app must pass `codesign --verify --deep --strict`, the same check its
GUI runs before starting the control helper. `--stage-only` prepares resources;
it does not produce a runnable sealed app.

The local seal preserves Bun's existing signatures and JIT behavior; it adds no
hardened-runtime options and does not recursively re-sign resource binaries.
This ad hoc preview is not a public signed release or a notarized installer.
The [distribution workflow](distribution/README.md) builds its own unsigned input
and performs the separate Developer ID, nested signing, notarization, and public
artifact checks. The runtime manifest records exact input bytes; signatures
cover the final shipped resource tree.
The optional 1Password path uses the pinned SDK with a dedicated service-account
token; it does not use account-wide DesktopAuth or an external desktop IPC
library. No user vault data is bundled. See the [distribution guide](distribution/README.md)
for the Developer ID, notarization, immutable download, and owner setup gates.
Public signed macOS distribution remains pending those Apple gates.

`GHOSTGET_STATE_HOME` can select the same dedicated state home as the CLI. The
host otherwise inherits only HOME, TMPDIR, USER and LOGNAME and uses a fixed
system PATH. It strips runtime preloads, proxies and ambient credential variables.
The single private stdio channel admits eight bounded active requests, bounded 4 MiB frames,
matching request identifiers, categorical failures and bounded deadlines.
Renderer cancellation discards a stale reply; it does not imply a consequential
operation was rolled back. Explicit connection cancellation and host shutdown
have separate lifecycle semantics.

## Vault and credential use

Vault stores local passwords and tokens in the default macOS Keychain with a
native executable access policy and synchronization disabled. A short native
AppKit process collects each secret in a secure field. Vault administration sends
only metadata through the renderer. The isolated credential process can use a
secret for the exact grant configured by the human; Ghostget's agent API never
returns the value. Optional 1Password connections store their service-account token
in Keychain and retain exact linked item/field references. Read-only scope is a
human configuration requirement. SDK inventory checks prove the accessible
vault list contains only the chosen vault, not its complete permission scope.

The GUI host verifies its sealed bundle before starting the fixed control helper.
Native secret access requires that live host and both exact bundled helper
processes; launching the Bun executables with arbitrary scripts cannot recreate
that ancestry. Valid ad hoc local bundles are supported, while downloaded releases
require the separate Developer ID and notarization gates. An ad hoc rebuild can
change the Keychain code identity and lose access to earlier entries; local preview
builds do not promise credential continuity across rebuilds. This boundary assumes
trusted installed code and local policy files. It does not isolate credentials
from code injection, a debugger, modified app or policy files, or an attacker
controlling the same operating-system account.

The first executor supports Basic or Bearer authentication on one exact public
HTTPS GET contract, with 1–16 selected JSON pointers and an expiry no more than
30 days ahead. Matching Web access policy applies too. Only named scalar fields
are returned. The endpoint receives the credential and must be trusted; echo
checks cannot guarantee safety against a malicious server. No password form
automation, browser autofill, or unattended passkey flow is implemented.

```sh
ghostget vault use <grant-id>
```

The app must remain open and Vault unlocked. Its startup lock and **Lock vault**
control govern Ghostget use; they do not unlock or lock macOS Keychain. Keychain
must already allow native access. Locking 1Password does not revoke service-account
access. Revocation and removal withdraw local grants before secret cleanup; they
cannot undo a request already sent. Unknown native creation retains pending
metadata and requires reviewed manual Keychain recovery if a completed receipt
cannot be recovered after restart. Never force-clear its custody records.

See the [control panel guide](../docs/control-panel.md) for setup, grants,
revocation, cleanup, and historical imported-X-token compatibility. Live
1Password behavior remains separately unverified.

## Direct and product previews

Direct is development-only. Its ten strict worlds include empty and reconnect
accounts, policy, user/community interfaces, pending approval, local vault items,
1Password links, vault cancellation and cleanup, backend failure and a 10,000-row
activity history. `ControlPanelPort` is the seam:
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

The verifier uses agent-browser **0.32.3** in two sequential owned Chromium
batches of eight and two scenarios. Each scenario gets a fresh `window new`
context, and each whole browser must close before the next batch starts. The
driver can promote a queued
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
bootstrap remain in a batch until **required final whole-browser close**. This
is not proof of per-context closure or unmodified reference-skill compliance. Unexpected
network-control failures, browser replacements and final-close failures remain
fatal. The aggregate receipt binds all ten scenes and both whole-browser
closures, and records this policy deviation explicitly.

## Website iframe qualification

The optional `desktop/scripts/verify-website.mjs` check accepts the absolute
`package.json` path of an already installed Playwright **1.62.1**. It runs through
the browser-auth scheduler lane, builds the website, and serves its exact files
with the repository's production header rules. One owned browser and isolated
context allow only GET/HEAD requests to the exact loopback origin; WebSockets,
service workers and WebRTC construction are blocked. The five real parent
controls open the empty-sandbox scenes without changing their CSP. Debugger
readback verifies opaque-origin separation, absent scripts and authority bridges,
layout bounds and loaded Nebula FontFaces. The server records the font's
`Origin: null` request and CORS response, and the receipt retains screenshots,
source/header/font hashes and required whole-browser cleanup.

Playwright's pinned service-worker blocking init script reads
`navigator.serviceWorker` in each opaque frame, which the sandbox already denies.
The check retains exactly those five diagnostic errors, the exact driver source
and its hash, and independently verifies that each frame denies the getter. Any
other page error, console error or unexpected network request fails the check.
This local website proof is separate from Direct fixture and native acceptance.
