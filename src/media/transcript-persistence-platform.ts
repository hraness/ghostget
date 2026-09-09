import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { createMediaArtifact, relativeArtifactPath, type ArtifactRole, type MediaArtifact } from "./manifest";
import { TranscriptPersistenceFailure } from "./transcript-persistence-model";

type TranscriptPaths = {
  readonly timed: string;
  readonly text: string;
  readonly cues: string;
};

type ThreeNativeCalls<A> = readonly [() => Promise<A>, () => Promise<A>, () => Promise<A>];

type BatchOutcome<A> =
  | { readonly ok: true; readonly values: readonly A[] }
  | { readonly ok: false; readonly cause: unknown };

export interface TranscriptPersistenceNative {
  readonly paths: (itemRoot: string) => TranscriptPaths;
  readonly relativePath: (itemRoot: string, path: string) => string;
  readonly write: (path: string, contents: string) => Promise<void>;
  readonly artifact: (itemRoot: string, path: string, role: ArtifactRole) => Promise<MediaArtifact>;
}

const native: TranscriptPersistenceNative = {
  paths: itemRoot => {
    const captions = join(itemRoot, "data", "captions");
    return {
      timed: join(captions, "transcript.vtt"),
      text: join(captions, "transcript.txt"),
      cues: join(captions, "transcript.json"),
    };
  },
  relativePath: relativeArtifactPath,
  write: (path, contents) => writeFile(path, contents, { encoding: "utf8", mode: 0o600 }),
  artifact: (itemRoot, path, role) => createMediaArtifact(itemRoot, path, role),
};

/** Preserve native admission and rejection arbitration while retaining siblings. */
async function settleNativeBatch<A>(calls: ThreeNativeCalls<A>): Promise<readonly A[]> {
  const admitted: Promise<A>[] = [];
  try {
    for (const call of calls) {
      const task = call();
      admitted.push(task);
      // Observe rejection without substituting a chained Promise in arbitration.
      void task.then(() => undefined, () => undefined);
    }
  } catch (cause) {
    // Array evaluation originally stops on a synchronous throw, before creating
    // Promise.all. That throw still wins; earlier native calls must first settle.
    await Promise.allSettled(admitted);
    throw cause;
  }
  const selected: BatchOutcome<A> = await Promise.all(admitted).then(
    values => ({ ok: true as const, values }),
    cause => ({ ok: false as const, cause }),
  );
  await Promise.allSettled(admitted);
  if (!selected.ok) throw selected.cause;
  return selected.values;
}

function platform(ports: TranscriptPersistenceNative) {
  return {
    paths: ports.paths,
    relativePath: ports.relativePath,
    write: ports.write,
    artifact: ports.artifact,
    evaluate: <A>(work: () => A): Effect.Effect<A, TranscriptPersistenceFailure> =>
      Effect.try({ try: work, catch: cause => new TranscriptPersistenceFailure({ cause }) }),
    batch: <A>(calls: ThreeNativeCalls<A>): Effect.Effect<readonly A[], TranscriptPersistenceFailure> =>
      Effect.tryPromise({
        try: () => settleNativeBatch(calls),
        catch: cause => new TranscriptPersistenceFailure({ cause }),
      }).pipe(Effect.uninterruptible),
  };
}

export class TranscriptPersistencePlatform extends Context.Tag("wrench/TranscriptPersistencePlatform/v1")<
  TranscriptPersistencePlatform,
  ReturnType<typeof platform>
>() {}

export const makeTranscriptPersistencePlatform = (
  ports: TranscriptPersistenceNative = native,
): ReturnType<typeof platform> => platform(ports);
