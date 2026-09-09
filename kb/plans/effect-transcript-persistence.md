---
type: plan
area: media
status: in-progress
---

# Join transcript persistence before archive recovery

Local transcript persistence must retain its admitted filesystem operations until they settle. A rejected sibling previously allowed direct capture to quarantine staging and release its item lock while a transcript write or open hash descriptor was still owned. The yt-dlp path released its lock while preserving staging for recovery. Both callers reached the same two concurrent batches in `persistLocalTranscript`.

## Scope and decision

The bounded Effect program owns transcript writes, relative-path and transcript projection, artifact hashes, and the final result. Its platform admits each three-operation phase synchronously, preserves native `Promise.all` rejection selection, and drains every admitted Promise before returning a failure. The Promise bridge unwraps the original raw cause. This follows the native-boundary and interpreter separation in [[plans/effect-read-lifecycle|the read lifecycle work]].

A small joined Promise batch could fix the immediate lifetime defect. The complete persistence program also gives the shared workload an enforced native boundary and one interpreter. Acquisition, transcription, provider captions, archive promotion, locking, cancellation selection and existing recovery stay with their current owners. No shared lifecycle package or whole-archive conversion is needed.

## Invariants

- Preserve VTT/TXT/JSON bytes, UTF-8, mode `0o600`, path and artifact order, language, provenance and the public result.
- Admit the three writes before the public Promise bridge returns, without a scheduling boundary between calls. Read each payload at its original call position, including repeated `result.transcript` access. Project language and provenance after successful writes and before admitting hashes.
- Preserve the first native aggregate rejection, including falsey values. A synchronous throw during later admission stops subsequent calls and wins over an earlier asynchronous rejection, after the earlier admitted work settles.
- Do not admit hashes after a failed write phase. Join each unchanged `createMediaArtifact` Promise through its descriptor finally before recovery can begin.
- Keep persistence uninterruptible while it owns native work. Do not introduce a cancellation signal or a new deadline into this previously signal-free boundary.
- Direct failures retain their existing discard policy; ordinary yt-dlp failures retain staging. Both release the existing token-qualified lock only after persistence returns.

## Implementation and verification

The program, platform, model and runtime live in `src/media/transcript-persistence-*.ts`. `archive.ts` delegates its former persistence function to the single bridge. The platform is the only new native adapter; the runtime is the only new interpreter. Package-file registration remains explicit.

Named bridge tests cover eager admission, payload and metadata getters, native rejection order, falsey failures and later synchronous throws. A bounded fast-check schedule exercises the same production program and adapter, checks output and failure selection, and proves all admitted callbacks settle before the result. It uses the repository's `WRENCH_PROPERTY_SEED` and `WRENCH_PROPERTY_PATH` replay support.

Native cases in `archive.test.ts` reuse the existing acquisition/transcription fixtures. They hold a real `writeFile` through an AsyncIterable or hold a read after acquiring a real descriptor; a sibling then rejects. All real hash helpers and native finalizers are retained, and imported module bindings restore after that drain. Temporary roots are retained if native close fails. The hash fixture proves descriptor ownership, not an in-flight kernel read.

Run the focused checks with the package's explicit runner policy:

```sh
bun test --no-orphans --timeout 180000 --max-concurrency 1 ./src/media/transcript-persistence.test.ts ./src/media/archive.test.ts ./src/media/archive.property.test.ts ./src/media/manifest.test.ts ./src/media/manifest.property.test.ts ./src/media/lock.test.ts
bun run typecheck
bun run check:effect
```

Then qualify the packaged runtime and the complete required current-candidate CI union. Preserve explicit native and release requirements; a focused pass is not final delivery admission.

## Execution evidence

The original native calibration passed its successful archive control and reproduced all three intended custody failures: 1 pass, 3 failures, 14 assertions. A corrected fixture retained every complete hash helper through native close. The earlier limited fixture run remains historical evidence with its cleanup limitation recorded.

The unchanged corrected fixture passes against the extracted owner: 4 passes, 19 assertions, with no early archive settlement, quarantine or lock release. All captured native helpers settled before private fixture cleanup.

The first permanent focused run passed 138 tests and failed the composed return-marker test, with 26,315 assertions. Layer provision deferred the whole first batch until after the public function returned. Direct service provision replaced that setup in the platform and runtime; the program, native operations and tests stayed unchanged. The same six-file command then passed all 139 tests and 26,323 assertions, including all four direct/yt-dlp write/hash cases and 100 generated native schedules. TypeScript and the architecture policy also passed on those same frozen inputs. Independent source review accepted the native boundary, raw-error projection and two-file timing repair. Final package and current-candidate CI qualification remain pending.

## Recovery

No durable format or identity changes. If the new owner fails qualification, keep the failing evidence and repair it before delivery. Native work is joined before the existing caller recovery runs; no fallback may release the lock or remove staging merely because the first sibling failed.

## Integration evidence

The first PR candidate passed eight CI jobs, including the native browser shard and clean package installation. Its static gate rejected a stale hard-coded decompression-ceiling expectation. The reviewed source budget and actual gunzip rejection stayed enforced; the expectation now follows the measured archive's rounded bound.

A separate recurring native browser-startup failure has not been causally diagnosed. The existing command boundary now retains bounded, content-free wrapper and stream observations before forced stop and after settlement. The test fixture labels its initial CDP read and cleanup commands explicitly, since one retained stack did not map to the checked source line. These observations preserve the selected error and cleanup authority. The later join with main `4045057` retains PR195’s explicit fixture policy: a one-use 40-second owned cold launch, unchanged 10-second action and pin deadlines, and one non-sliding 30-second cleanup window. The diagnostics add no further deadline change. Two existing native controls and three fixture cleanup controls pass, including proof that a settled original process group does not establish escaped-descendant cleanup. The existing escaped-child teardown remains unchanged; no new post-kill exit proof or Linux root-cause claim is made.

The final package comparison joins main `4045057`, including its X Viewer/Bookmarks evidence, with the transcript owner and diagnostics. Two npm 11.19.0 archives per source are byte-identical: the candidate has 501 files, 2,252,267 compressed bytes and 12,416,444 payload bytes; the current-main baseline has 497 files, 2,249,250 compressed bytes and 12,407,079 payload bytes. All eleven generated SDK files remain unchanged. Limits retain zero compressed headroom and current main’s 315 payload bytes. Earlier source measurements are historical. The joined fixture passes 12 native tests and 313 assertions, covering all eight collection controls, both actual launch/confirmation cases and the two browser lifecycle controls. Its 772 source/config inputs and four binaries stayed fixed. Current-candidate CI and the coordinated canonical-release source join remain pending.

## Canonical release handoff

PR196 merged into protected main as `6e8f757a6aa70cd56a3a69805e80223beb10c183`, with its complete ten-job PR CI attempt passing. The native and transcript evidence above remains attributed to that reviewed source. PR193 now joins this implementation into the canonical GitHub `0.16.13` candidate while retaining its exact owner, diagnostics and current X evidence. The combined package is now measured below; current-candidate validation and independent final review remain pending. The transcript change is not yet released; this plan stays in progress until the canonical artifact and applicable release evidence exist.

The joined `0.16.13` candidate was built with Bun 1.3.14. After correcting the changelog’s canonical starting version to `0.16.13`, it was packed twice with npm 11.19.0 / Node 24.20.0; build inputs stayed unchanged. Both archives have SHA-256 `24af5d712ac7633931ecab576860819a5266eb2b1bc9b262bfa61069a77fd420`, 501 files, 2,252,656 packed bytes and 12,417,812 payload bytes. Every archive file and mode matches the combined Git source. Against the exact merged-main package, 492 files are unchanged; canonical documentation and version projections account for 389 packed and 1,368 payload bytes. The current main's 315 payload bytes of headroom and zero packed headroom are retained. Package admission, fresh complete current-candidate CI and actual canonical publication remain pending; these measurements alone do not complete the release.

## Canonical archive preparation recovery

The `v0.16.13` tag on `fbb6066` completed its full source, static, package, standalone, generated-tree and import checks in Release run `34375362383`, then failed while preparing the canonical npm archive. Its 2,255,037 compressed bytes exceeded the reviewed 2,252,656-byte maximum. No canonical assets were uploaded or published, so the transcript change remains release-pending. Keep the failed tag and evidence intact. The `0.16.14` candidate adds the actual npm packing operation and strict archive parser to required PR CI, pins matching Node 24.20.0 / npm 11.19.0, and retains all existing source and release gates. Compression and complete payload measurements, final review, current-candidate CI and actual publication remain required. Earlier measurements above remain attributed to their original source.

The new candidate was built once with Bun 1.3.14 and packed twice with Homebrew Node 24.20.0 / npm 11.19.0. Both archives are identical: SHA-256 `1bf550bba8f75aa0933fa9fcd9def7e446e1a60a5b3a3e12555ef934caf23969`, 2,252,826 compressed bytes, 12,418,306 payload bytes and 501 files. Every path, byte and mode matches the measured Git tree; 492 files are unchanged from `0.16.13`. Version and installation projections plus the recovery changelog add 494 payload bytes. Recompressing the same raw tar with the available Node zlib 1.3.2.1-motley build produces 2,255,206 bytes. The prior verified raw tar reproduces the failed run's exact 2,255,037-byte size under that compressor without any tar change. The failed runner's npm archive was not retained, so this explains the observed size difference without claiming recovered artifact identity. The bounded ceiling is 2,259,302 bytes: the measured maximum plus 4,096 bytes for compression portability, above the current 2,380-byte and documented historical 3,543-byte spreads. Payload headroom remains 315 bytes, counts remain exactly 501, and the derived raw-tar ceiling is 12,932,608 bytes. Fresh Linux CI must check its actual npm archive before this candidate can merge; compression measurements do not replace its source, installation, provenance or release gates.
