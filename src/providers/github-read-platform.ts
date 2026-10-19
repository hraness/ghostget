import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import type { WebSessionRecipe } from "../model";
import { OperationDeadlineError } from "../operation-deadline";
import { pinnedHttpsFetch, type PinnedHttpsFetch } from "../pinned-https";
import { readAttempt, ReadEffectFailure, withReadResource } from "../read-effect";
import type { WebSessionOperationDeadline } from "../web-session-execution";
import { parseJson } from "./github-read-model";
import {
  ProviderReadResponseRejectedError,
  ProviderReadThrottledError,
  ProviderReadTransportError
} from "./read-failure";

export type GitHubReadRequest = {
  readonly url: URL;
  readonly userAgent: string;
  readonly operationLabel: string;
  readonly apiLabel: string;
  readonly responseLabel: string;
  readonly pagination: boolean;
};

export type GitHubReadDependencies = { readonly fetch?: PinnedHttpsFetch; readonly now?: () => number; };

export class GitHubReadPlatform extends Context.Tag("wrench/GitHubReadPlatform/v1")<GitHubReadPlatform, {
  readonly request: (request: GitHubReadRequest) => Effect.Effect<{ readonly value: unknown; readonly link: string | null; }, ReadEffectFailure>;
  readonly observedAt: Effect.Effect<string, ReadEffectFailure>;
}>() { }

const native = <A>(work: () => Promise<A>): Effect.Effect<A, ReadEffectFailure> =>
  Effect.tryPromise({ try: work, catch: cause => new ReadEffectFailure({ cause }) });

export function GitHubReadPlatformLive(
  recipe: WebSessionRecipe,
  dependencies: GitHubReadDependencies | undefined,
  deadline: WebSessionOperationDeadline | undefined

): Layer.Layer<GitHubReadPlatform, ReadEffectFailure> {
  return Layer.scoped(
    GitHubReadPlatform,
    Effect.gen(function*() {
      const operation = yield* Effect.acquireRelease(
        readAttempt(() => {
          if (deadline !== undefined) return { signal: deadline.signal, dispose: () => { } };
          const controller = new AbortController();
          const timeout = setTimeout(() => controller.abort(), recipe.timeoutMs);
          return { signal: controller.signal, dispose: () => clearTimeout(timeout) };
        }),
        operation => Effect.sync(operation.dispose)
      );
      const fetch = dependencies?.fetch ?? pinnedHttpsFetch;
      const maximum = Math.min(recipe.maxOutputBytes, 2 * 1024 * 1024);
      return {
        observedAt: readAttempt(() => new Date(dependencies?.now?.() ?? Date.now()).toISOString()),
        request: (request: GitHubReadRequest) => Effect.gen(function*() {
          const timeout = yield* readAttempt(() => {
            deadline?.throwIfUnavailable(request.operationLabel);
            const remaining = Math.min(recipe.timeoutMs, deadline?.remainingTimeMs() ?? recipe.timeoutMs);
            if (remaining < 1_000) throw new OperationDeadlineError(request.operationLabel, "timed-out");
            return remaining;
          });
          const response = yield* native(() => fetch(
            request.url,
            {
              method: "GET",
              headers: {
                accept: "application/vnd.github+json",
                "user-agent": request.userAgent,
                "x-github-api-version": "2026-03-10"
              },
              redirect: "error",
              signal: operation.signal,
            },
            timeout
          )).pipe(Effect.mapError(error => {
            if (operation.signal.aborted) {
              try { deadline?.throwIfUnavailable(request.operationLabel); }
              catch (cause) { return new ReadEffectFailure({ cause }); }
              return new ReadEffectFailure({ cause: new OperationDeadlineError(request.operationLabel, "timed-out") });
            }
            return new ReadEffectFailure({ cause: new ProviderReadTransportError(error.cause) });
          }));
          const metadata = yield* readAttempt(() => {
            if (response.status !== 200) {
              const retryAfter = response.headers.get("retry-after");
              if (response.status === 403
                && (response.headers.get("x-ratelimit-remaining") === "0"
                  || (retryAfter !== null && /^(?:0|[1-9][0-9]{0,8})$/u.test(retryAfter)))) throw new ProviderReadThrottledError();
              throw new ProviderReadResponseRejectedError(response.status);
            }
            const type = response.headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase();
            if (type !== "application/json" && type?.endsWith("+json") !== true) throw new Error(`${request.apiLabel} returned an unreviewed content type`);
            const link = request.pagination ? response.headers.get("link") : null;
            if (link !== null && (link.length > 8 * 1024 || /[\0\r\n]/u.test(link))) throw new Error("GitHub organization repository pagination header exceeded its reviewed bounds");
            const declared = response.headers.get("content-length");
            if (declared !== null) {
              const length = Number(declared);
              if (!Number.isSafeInteger(length) || length < 0 || length > maximum) throw new Error(`${request.responseLabel} exceeded its byte limit`);
            }
            return link;
          }).pipe(Effect.catchTag(
            "ReadEffectFailure",
            primary => native(() => response.body?.cancel() ?? Promise.resolve()).pipe(
              Effect.timeoutFail({
                duration: 500,
                onTimeout: () => new ReadEffectFailure({ cause: new Error("GitHub response cleanup did not settle") })
              }),
              Effect.matchEffect({
                onFailure: cleanup => Effect.fail(new ReadEffectFailure({ cause: primary.cause, cleanupCause: cleanup.cause })),
                onSuccess: () => Effect.fail(primary)
              })
            )
          ));
          const bytes = response.body === null
            ? new Uint8Array()
            : yield* withReadResource(
              readAttempt(() => response.body!.getReader()),
              reader => Effect.gen(function*() {
                const chunks: Uint8Array[] = [];
                let length = 0;
                while (true) {
                  const result = yield* native(() => deadline === undefined
                    ? reader.read()
                    : deadline.run(() => reader.read(), request.responseLabel)).pipe(
                      Effect.mapError(error => error.cause instanceof OperationDeadlineError
                        ? error
                        : new ReadEffectFailure({ cause: new ProviderReadTransportError(error.cause) })),
                    );
                  if (result.done) break;
                  yield* readAttempt(() => {
                    if (!(result.value instanceof Uint8Array)) throw new Error(`${request.responseLabel} returned an unreviewed body chunk`);
                    length += result.value.byteLength;
                    if (length > maximum) throw new Error(`${request.responseLabel} exceeded its byte limit`);
                    chunks.push(result.value);
                  });
                }
                return yield* readAttempt(() => {
                  const joined = new Uint8Array(length);
                  let offset = 0;
                  for (const chunk of chunks) { joined.set(chunk, offset); offset += chunk.byteLength; }
                  return joined;
                });
              }).pipe(Effect.catchTag(
                "ReadEffectFailure",
                primary => native(() => reader.cancel()).pipe(
                  Effect.timeoutFail({
                    duration: 500,
                    onTimeout: () => new ReadEffectFailure({ cause: new Error("GitHub response cleanup did not settle") })
                  }),
                  Effect.matchEffect({
                    onFailure: cleanup => Effect.fail(new ReadEffectFailure({ cause: primary.cause, cleanupCause: cleanup.cause })),
                    onSuccess: () => Effect.fail(primary)
                  })
                )
              )),
              reader => readAttempt(() => reader.releaseLock()),
            );
          return { value: yield* readAttempt(() => parseJson(bytes, request.responseLabel)), link: metadata };
        }),
      };
    })
  );
}
