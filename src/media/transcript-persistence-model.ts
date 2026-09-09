import * as Data from "effect/Data";
import type { LocalTranscriptionResult } from "./local-transcription";
import type { MediaArtifact, MediaTranscript } from "./manifest";

export type LocalTranscriptToPersist = Extract<LocalTranscriptionResult, { status: "transcribed" }>;

export interface TranscriptArtifactsResult {
  readonly transcript: MediaTranscript;
  readonly artifacts: readonly MediaArtifact[];
}

/** Internal transport retains the original failure, including falsey values. */
export class TranscriptPersistenceFailure extends Data.TaggedError("TranscriptPersistenceFailure")<{
  readonly cause: unknown;
}> {}
