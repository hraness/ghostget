import * as Effect from "effect/Effect";
import type { MediaTranscript } from "./manifest";
import type { LocalTranscriptToPersist, TranscriptArtifactsResult, TranscriptPersistenceFailure } from "./transcript-persistence-model";
import { TranscriptPersistencePlatform } from "./transcript-persistence-platform";

/** Own both transcript phases before allowing archive recovery or publication. */
export const transcriptPersistenceProgram = (
  itemRoot: string,
  result: LocalTranscriptToPersist,
): Effect.Effect<TranscriptArtifactsResult, TranscriptPersistenceFailure, TranscriptPersistencePlatform> =>
  Effect.gen(function*() {
    const p = yield* TranscriptPersistencePlatform;
    const paths = yield* p.evaluate(() => p.paths(itemRoot));
    yield* p.batch([
      () => p.write(paths.timed, result.transcript.vtt),
      () => p.write(paths.text, result.transcript.text),
      () => p.write(paths.cues, result.transcript.json),
    ]).pipe(Effect.asVoid);
    const transcript = yield* p.evaluate((): Extract<MediaTranscript, { source: "local" }> => {
      const timedPath = p.relativePath(itemRoot, paths.timed);
      const textPath = p.relativePath(itemRoot, paths.text);
      const cuesPath = p.relativePath(itemRoot, paths.cues);
      return {
        status: "available",
        source: "local",
        language: result.language,
        timedPath,
        textPath,
        cuesPath,
        provenance: result.provenance,
      };
    });
    const artifacts = yield* p.batch([
      () => p.artifact(itemRoot, transcript.timedPath, "transcript_vtt"),
      () => p.artifact(itemRoot, transcript.textPath, "transcript_text"),
      () => p.artifact(itemRoot, transcript.cuesPath, "transcript_json"),
    ]);
    return { transcript, artifacts };
  }).pipe(Effect.uninterruptible);
