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
