# macOS distribution

Ghostget's native download uses Developer ID signing, Apple's notarization service,
and a stapled ticket. The initial target is Apple Silicon on macOS 14.5 or newer.
It is distributed outside the Mac App Store. The unsigned/ad hoc local build is a
preview; it does not pass this distribution gate.

The **Desktop Release** workflow runs from reviewed `main`. Its only input is a
published canonical tag such as `v0.19.0`. The canonical tag, matching desktop tag,
workflow source, and current `main` must all identify the same commit. Movement
fails closed. This initial equality rule deliberately requires a fresh version
when `main` has advanced beyond an older release.

The existing stable release retains its exact five canonical CLI/SDK assets and
Latest status. The desktop download is a separate immutable prerelease:

- Tag: `desktop-v0.19.0-macos-arm64`
- Download page: <https://github.com/hraness/ghostget/releases/tag/desktop-v0.19.0-macos-arm64>
- Assets: `Ghostget-0.19.0-macos-arm64.zip`, `desktop-manifest.json`, `SHA256SUMS`,
  and `provenance.jsonl`

That URL is the intended coordinate, not a claim that this version has already
been published. A desktop release exists only after the workflow's signed app,
notarization, artifact, provenance, and immutable publication gates succeed.
Extract the published ZIP and move `Ghostget.app` into Applications. Gatekeeper
must admit the app normally. Do not remove quarantine or bypass a failed check.
There is no automatic updater in this version.

## One-time owner setup

An administrator must read back these controls before creating either release
tag. Workflows receive no Administration permission and cannot establish or
weaken these controls themselves.

1. Keep the canonical controls in [the publishing procedure](../../docs/publishing.md),
   including immutable Releases enabled and the existing `v*` tag rules.
2. Create two active tag rulesets scoped exactly to
   `refs/tags/desktop-v*-macos-arm64`. The creation ruleset contains the `creation`
   rule and only the existing repository owner User `894119` as an always bypass
   actor. The immutability ruleset contains `update` and `deletion` rules with no
   bypass actors. Do not add this prefix to a workflow App's tag authority.
3. Create the `desktop-signing` environment. Disable administrator bypass, set no
   required reviewers or wait timer, and admit only the custom **branch** policy
   `main`; admit no tag deployment policies. This preserves unattended routine
   delivery while restricting the signing environment to reviewed main source.
4. Register `Desktop Release` from the merged workflow. Read its numeric workflow
   ID, exact path `.github/workflows/desktop-release.yml`, and active state, then
   set the repository variable `DESKTOP_RELEASE_WORKFLOW_ID` to that ID.
5. Obtain an Apple Developer Program **Developer ID Application** certificate
   with its private key and an App Store Connect API key authorized for notarytool.
   Supply the following values to `desktop-signing`, using GitHub's secret input
   interface or an authorized private operator flow. Keep exported credentials
   out of the repository, shell history, receipts, and agent-visible output.

| Environment value | Kind | Meaning |
| --- | --- | --- |
| `APPLE_TEAM_ID` | Variable | Exact ten-character Developer ID team |
| `APPLE_SIGNING_IDENTITY_SHA1` | Variable | Exact 40-character leaf certificate SHA-1 fingerprint |
| `APPLE_API_KEY_ID` | Variable | Notary API key ID |
| `APPLE_API_ISSUER` | Variable | Notary API issuer UUID |
| `APPLE_CERTIFICATE_BASE64` | Secret | Base64 of the password-protected Developer ID certificate/private-key `.p12` |
| `APPLE_CERTIFICATE_PASSWORD` | Secret | Password for that `.p12` |
| `APPLE_API_PRIVATE_KEY` | Secret | Complete notary `.p8` private key |

Read back the exact repository ID `1316443113`, public visibility, default branch,
immutable Release setting, both desktop rulesets including all bypass actors,
environment protection rules and branch policy inventory, variable names/values,
and secret **names only**. Do not read private key or password values as a check.
This readback is required again immediately before dispatch; a previous setup
receipt does not authorize drifted controls.

Missing Apple credentials block the signed workflow. Source validation and the
local preview remain runnable without them. Never substitute an ad hoc signature,
a skipped notarization check, or a Gatekeeper bypass to obtain a green release.

## Release sequence

Complete the repository's current-candidate PR, merge, main CI, CodeQL, and
canonical release admission first. Version fields must already agree. The owner
creates the canonical and desktop tags as direct lightweight refs to that exact
current main commit. For a new version, the two refs can be pushed atomically:

```sh
# SOURCE_SHA is the exact fully admitted current main SHA. No existing ref is replaced.
git update-ref refs/tags/v0.19.0 "$SOURCE_SHA" ''
git update-ref refs/tags/desktop-v0.19.0-macos-arm64 "$SOURCE_SHA" ''
git push --atomic origin refs/tags/v0.19.0 refs/tags/desktop-v0.19.0-macos-arm64
```

If the canonical tag already exists at that same current main commit, create and
push only the new matching desktop tag. Preserve all existing tags and Releases.
Wait for the canonical release and its required admission. Recheck the controls
above, exact current main, both tag objects, and immutable canonical five-file
release before dispatching:

```sh
gh workflow run desktop-release.yml --repo hraness/ghostget --ref main -f tag=v0.19.0
```

The workflow verifies source CI through the existing release admission function
and downloads the canonical five-file release through its existing cryptographic
verifier. It then uses the standard `macos-15` Apple Silicon GitHub runner, pinned
Bun 1.3.14 and Rust 1.97.1, frozen dependency installation, native checks, and a
locked Tauri build. Build, signing and executable verification use three fresh
GitHub-hosted macOS runners. The build runner never receives Apple credentials;
the signing runner never installs project dependencies or runs the supplied app.
Each runner checks out the admitted source SHA with checkout credentials disabled.

The build hands off an unsigned ZIP and a strict receipt through a numeric Actions
artifact ID. The receipt binds the repository, source commit/tree, workflow and
lock hashes, run/attempt, and exact archive name/size/SHA-256. Before any signing
secrets enter a step, a Python stdlib parser checks every local and central ZIP
record, CRC, file type, path, parent and byte/count limit. It rejects links,
traversal, duplicate or case-alias paths, ZIP64, arbitrary extras and AppleDouble
entries. It extracts only real `Ghostget.app` files/directories beneath runner
scratch, outside checkout. The signer rechecks the receipt and extracted file
inventory. Archive content is never imported as signing-job code.

The signer uses a fresh temporary keychain with the selected Developer ID identity.
It never changes the login/default keychain or search list. It enumerates every
Mach-O file by its header, including binaries in unusual resource locations,
signs nested code first, rebuilds the signed runtime byte inventory, and seals
the outer app last. The original staged runtime inventory remains inside the
sealed app as `runtime-input-manifest.json`.

Notary submission returns an exact ID which is recorded before waiting. Only
`Accepted` for that ID permits stapling. After exact temporary-keychain cleanup,
the clean signer creates the final ZIP and a signed handoff receipt. The separate
credential-free verifier validates this receipt and the ZIP's bounded layout
before extracting with `ditto` outside checkout. This signed format admits only
bounded timestamp/UID extras and AppleDouble companions that map to existing app
entries, preserving stapled metadata. The archive is copied unchanged into the
final assets; verification cannot replace it with a new digest. The extracted app
must pass strict code signature verification,
exact Developer ID leaf/team and entitlement checks, ticket validation,
Gatekeeper, and `syspolicy_check distribution`. The final extracted Bun runtimes
must execute JIT, WebAssembly, SQLite and FFI probes. The extracted packaged helper
must return a valid empty-account snapshot and release its socket/owner on orderly
shutdown, using a disposable state directory. No personal account or vault is
opened by this check.

A separate checkout-free OIDC job attests exactly the ZIP, manifest, and checksums.
Both attestation and publication independently compare the final archive and
manifest's signing/notarization coordinates with outputs from the clean signing
job. The runner that executes the supplied app cannot authorize replacement
archive bytes through its own verification outputs. The publisher verifies those signed subjects and certificate source/workflow/run/
attempt coordinates, then performs bounded draft creation, missing-asset upload,
exact remote byte readback, and immutable prerelease publication. It never sets
Latest, overwrites an asset, deletes a release, or creates a tag. Every effect is
preceded by fresh source/tag/run/canonical authority checks. An already published
exact result in the same run and attempt has a read-only completion path.

## Failure and recovery

A failed gate produces no downloadable release. Inspect its categorical failure
and preserve any draft or uncertain external result. A signing failure retains
`desktop-notary-submission-<run>-<attempt>` when an ID was obtained; this artifact
contains only the submission ID and source/run coordinates. Retrieve that ID and
reconcile its status with Apple's supported notarytool before considering another
submission. Cancellation before the receipt is uploaded may require Apple's
submission history to establish the outcome. Never blindly retry an uncertain
submission or upload.

The initial publisher binds a draft to one run and attempt. Another attempt cannot
overwrite or silently adopt it. Reconcile an existing draft/readback manually
through reviewed recovery work, or deliver a new patch version with newly admitted
source and tags. Published immutable releases remain untouched. Expired artifacts,
main movement, changed credentials, changed signing output, incomplete retained
release inventory, or mismatched bytes also require a fresh qualified delivery;
they are not reasons to relax a gate.

## Entitlements and verification limits

Both the control and dedicated credential Bun executables receive only
`com.apple.security.cs.allow-jit`. Service-account authentication uses the SDK
without DesktopAuth or an installed 1Password IPC library. All other native code,
including the Rust app, receives no additional entitlement. The native vault's
file-based Keychain ACL belongs to the Rust app's code identity; Bun does not
receive Keychain authority.

Bun's documented signing example grants more hardened-runtime exceptions. This
pipeline intentionally starts with the smaller explicit set and runs the actual
signed runtime probes; if pinned Bun fails them, investigate and independently
review the minimum necessary change. Do not automatically broaden entitlements.
The generic FFI probe qualifies the execution mechanism, not a live 1Password
service account. Keep the optional provider's separate live
acceptance claims scoped to actual evidence.

A successful unsigned local build or offline parser test does not prove notarized
distribution. The completed signed workflow and published artifact readback are
the required evidence. Additional architectures, a different bundle layout, or a
Mac App Store build need separate reviewed packaging and qualification.

## Local preview and offline checks

The integration owner runs native commands through the repository's mac-native
host scheduler. These commands require no distribution credentials:

```sh
bun run desktop:check-native
bun run desktop:package
```

Use the source-only preview exactly as documented in [the desktop README](../README.md).
Run the bounded distribution tests without Apple credentials or API calls:

```sh
bun test --timeout 180000 --max-concurrency 1 desktop/distribution/distribution.test.ts
```

The shared desktop typecheck and tests include this directory. The normal Required
PR gate qualifies changes to these scripts and the workflow; it does not publish.

## Primary references

- [Apple: Notarizing macOS software](https://developer.apple.com/documentation/security/notarizing-macos-software-before-distribution)
  requires Developer ID signing, hardened runtime, and a secure timestamp.
- [Apple: Customizing the notarization workflow](https://developer.apple.com/documentation/security/customizing-the-notarization-workflow)
  explains stapling the app before rebuilding its ZIP container.
- [Apple: Hardened runtime](https://developer.apple.com/documentation/security/hardened-runtime)
  documents the security exceptions and their purpose.
- [Tauri: macOS code signing](https://v2.tauri.app/distribute/sign/macos/)
  documents Developer ID, CI certificate setup, and notary API credentials.
- [Bun 1.3.14 entitlement source](https://raw.githubusercontent.com/oven-sh/bun/bun-v1.3.14/entitlements.plist)
  and [Bun executable signing documentation](https://bun.com/docs/bundler/executables)
  provide the upstream signing baseline.
- [GitHub-hosted runner specifications](https://docs.github.com/en/actions/reference/runners/github-hosted-runners)
  identify the standard `macos-15` ARM64 runner used here.
