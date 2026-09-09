import * as Cause from "effect/Cause";
import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import * as Option from "effect/Option";
import type { LocalTranscriptToPersist, TranscriptArtifactsResult } from "./transcript-persistence-model";
import { makeTranscriptPersistencePlatform, TranscriptPersistencePlatform, type TranscriptPersistenceNative } from "./transcript-persistence-platform";
import { transcriptPersistenceProgram } from "./transcript-persistence-program";

/** The archive's Promise boundary interprets one closed persistence program. */
export async function persistLocalTranscript(
  itemRoot: string,
  result: LocalTranscriptToPersist,
  ports?: TranscriptPersistenceNative,
): Promise<TranscriptArtifactsResult> {
  const exit = await Effect.runPromiseExit(
    transcriptPersistenceProgram(itemRoot, result).pipe(
      Effect.provideService(TranscriptPersistencePlatform, makeTranscriptPersistencePlatform(ports)),
    ),
  );
  if (Exit.isSuccess(exit)) return exit.value;
  const failure = Cause.failureOption(exit.cause);
  if (Option.isSome(failure)) throw failure.value.cause;
  throw Cause.squash(exit.cause);
}
