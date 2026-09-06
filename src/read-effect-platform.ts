import * as Effect from "effect/Effect";
import { ReadEffectFailure } from "./read-effect";

/** Adapts a native operation. AbortSignal/native settlement rules belong to the
 * supplied product port, not to interruption of this Promise subscription. */
export const readNative = <A>(work: () => Promise<A>): Effect.Effect<A, ReadEffectFailure> =>
  Effect.tryPromise({ try: work, catch: cause => new ReadEffectFailure({ cause }) });
