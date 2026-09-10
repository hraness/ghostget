import * as Effect from "effect/Effect";
import { runReadEffect } from "../read-effect-runtime";
import { GitHubReadPlatformLive } from "./github-read-platform";
import { githubOrganizationReadProgram } from "./github-read-program";
import type { GhostgetAuth } from "../auth";
import type { OperationInput, WebSessionRecipe } from "../model";
import { OperationDeadlineError } from "../operation-deadline";
import { pinnedHttpsFetch, type PinnedHttpsFetch } from "../pinned-https";
import type {
  WebSessionExecution,
  WebSessionOperationDeadline,
} from "../web-session-execution";
import {
  failedProviderRead,
  ProviderReadResponseRejectedError,
  ProviderReadThrottledError,
  ProviderReadTransportError,
} from "./read-failure";
import {
  GITHUB_API_ORIGIN,
  GITHUB_WEB_OPERATIONS,
  githubOrganization,
  githubUsername,
  projectGitHubProfileStats,
} from "./github-web";

const MAX_RESPONSE_BYTES = 2 * 1024 * 1024;
const MAX_LINK_HEADER_BYTES = 8 * 1024;
const PROFILE_OPERATION_LABEL = "GitHub public profile read deadline";
const PROFILE_USER_AGENT = "wrench-github-profile-stats/1.0.0";

export type GitHubWebRuntimeDependencies = {
  readonly fetch?: PinnedHttpsFetch;
  readonly now?: () => number;
};

function remainingTimeoutMs(
  timeoutMs: number,
  deadline: WebSessionOperationDeadline | undefined,
  label: string,
): number {
  deadline?.throwIfUnavailable(label);
  const remaining = Math.min(
    timeoutMs,
    deadline?.remainingTimeMs() ?? timeoutMs,
  );
  if (remaining < 1_000) {
    throw new OperationDeadlineError(label, "timed-out");
  }
  return remaining;
}

function exactProfileInput(input: OperationInput): string {
  const keys = Object.keys(input);
  if (keys.length !== 1 || keys[0] !== "username") {
    throw new Error("GitHub profiles.read accepts only input.username");
  }
  return githubUsername(input.username, "input.username");
}

function exactOrganizationInput(input: OperationInput): string {
  const keys = Object.keys(input);
  if (keys.length !== 1 || keys[0] !== "organization") {
    throw new Error("GitHub organizations.read accepts only input.organization");
  }
  return githubOrganization(input.organization, "input.organization");
}

function jsonContentType(response: Response): boolean {
  const raw = response.headers.get("content-type");
  if (raw === null) return false;
  const type = raw.split(";", 1)[0]?.trim().toLowerCase();
  return type === "application/json" || type?.endsWith("+json") === true;
}

async function boundedBytes(
  response: Response,
  maximum: number,
  deadline: WebSessionOperationDeadline | undefined,
  label: string,
): Promise<Uint8Array> {
  const declared = response.headers.get("content-length");
  if (declared !== null) {
    const length = Number(declared);
    if (!Number.isSafeInteger(length) || length < 0 || length > maximum) {
      void response.body?.cancel().catch(() => undefined);
      throw new Error(`${label} exceeded its reviewed byte limit`);
    }
  }
  if (response.body === null) return new Uint8Array();
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    for (;;) {
      const item = await (async () => {
        try {
          return deadline === undefined
            ? await reader.read()
            : await deadline.run(() => reader.read(), label);
        } catch (error) {
          if (error instanceof OperationDeadlineError) throw error;
          throw new ProviderReadTransportError(error);
        }
      })();
      if (item.done) break;
      if (
        !(item.value instanceof Uint8Array)
        || item.value.byteLength > maximum - length
      ) {
        void reader.cancel().catch(() => undefined);
        throw new Error(`${label} exceeded its reviewed byte limit`);
      }
      chunks.push(item.value);
      length += item.value.byteLength;
    }
  } catch (error) {
    void reader.cancel().catch(() => undefined);
    throw error;
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

function parseJson(bytes: Uint8Array, label: string): unknown {
  if (bytes.byteLength === 0) {
    throw new Error(`${label} was empty`);
  }
  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    throw new Error(`${label} was not valid UTF-8`);
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new Error(`${label} was not valid JSON`);
  }
}

function githubHeaders(userAgent: string): Readonly<Record<string, string>> {
  return {
    accept: "application/vnd.github+json",
    "user-agent": userAgent,
    "x-github-api-version": "2026-03-10",
  };
}

async function requestGitHubJson(
  url: URL,
  userAgent: string,
  maximum: number,
  fetch: PinnedHttpsFetch,
  signal: AbortSignal,
  timeoutMs: number,
  deadline: WebSessionOperationDeadline | undefined,
  operationLabel: string,
  apiLabel: string,
  responseLabel: string,
  readPaginationLink: boolean,
): Promise<{ readonly value: unknown; readonly link: string | null }> {
  let response: Response;
  try {
    response = await fetch(url, {
      method: "GET",
      headers: githubHeaders(userAgent),
      redirect: "error",
      signal,
    }, remainingTimeoutMs(timeoutMs, deadline, operationLabel));
  } catch (error) {
    if (signal.aborted) {
      if (deadline !== undefined) deadline.throwIfUnavailable(operationLabel);
      throw new OperationDeadlineError(operationLabel, "timed-out");
    }
    throw new ProviderReadTransportError(error);
  }
  if (response.status !== 200) {
    void response.body?.cancel().catch(() => undefined);
    const retryAfter = response.headers.get("retry-after");
    if (
      response.status === 403
      && (
        response.headers.get("x-ratelimit-remaining") === "0"
        || (
          retryAfter !== null
          && /^(?:0|[1-9][0-9]{0,8})$/u.test(retryAfter)
        )
      )
    ) throw new ProviderReadThrottledError();
    throw new ProviderReadResponseRejectedError(response.status);
  }
  if (!jsonContentType(response)) {
    void response.body?.cancel().catch(() => undefined);
    throw new Error(`${apiLabel} returned an unreviewed content type`);
  }
  const link = readPaginationLink ? response.headers.get("link") : null;
  if (link !== null && (
    link.length > MAX_LINK_HEADER_BYTES || /[\0\r\n]/u.test(link)
  )) {
    void response.body?.cancel().catch(() => undefined);
    throw new Error("GitHub organization repository pagination header exceeded its reviewed bounds");
  }
  return Object.freeze({
    value: parseJson(
      await boundedBytes(response, maximum, deadline, responseLabel),
      responseLabel,
    ),
    link,
  });
}

function signalForOperation(
  recipe: WebSessionRecipe,
  deadline: WebSessionOperationDeadline | undefined,
): { readonly signal: AbortSignal; readonly dispose: () => void } {
  if (deadline !== undefined) {
    return Object.freeze({ signal: deadline.signal, dispose: () => undefined });
  }
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), recipe.timeoutMs);
  return Object.freeze({
    signal: controller.signal,
    dispose: () => clearTimeout(timeout),
  });
}

export async function executeGitHubPublicProfileRead(
  recipe: WebSessionRecipe,
  input: OperationInput,
  dependencies: GitHubWebRuntimeDependencies | undefined,
  operationDeadline: WebSessionOperationDeadline | undefined,
): Promise<WebSessionExecution> {
  if (
    recipe.site !== "github"
    || recipe.action !== "profiles.read"
    || recipe.contractVersion !== 1
    || GITHUB_WEB_OPERATIONS["profiles.read"].state !== "observed"
  ) {
    throw new Error("GitHub public profiles.read contract is not installed");
  }
  const username = exactProfileInput(input);
  const url = new URL(`/users/${username}`, GITHUB_API_ORIGIN);
  const fetch = dependencies?.fetch ?? pinnedHttpsFetch;
  const operation = signalForOperation(recipe, operationDeadline);
  try {
    const response = await requestGitHubJson(
      url,
      PROFILE_USER_AGENT,
      Math.min(recipe.maxOutputBytes, MAX_RESPONSE_BYTES),
      fetch,
      operation.signal,
      recipe.timeoutMs,
      operationDeadline,
      PROFILE_OPERATION_LABEL,
      "GitHub public profile API",
      "GitHub profile response",
      false,
    );
    const output = projectGitHubProfileStats(
      response.value,
      username,
      new Date(dependencies?.now?.() ?? Date.now()).toISOString(),
    );
    return {
      status: "succeeded",
      output,
      finalUrl: output.target.url,
      dispatchStarted: false,
      dispatch: { planned: 0, started: 0, verified: 0 },
    };
  } catch (error) {
    return failedProviderRead("GitHub profile", error, `https://github.com/${username}`, {
      stage: "target",
      authenticated: false,
      targetStatusUnavailable: true,
    });
  } finally {
    operation.dispose();
  }
}

export async function executeGitHubPublicOrganizationRead(
  recipe: WebSessionRecipe,
  input: OperationInput,
  dependencies: GitHubWebRuntimeDependencies | undefined,
  operationDeadline: WebSessionOperationDeadline | undefined,
): Promise<WebSessionExecution> {
  if (
    recipe.site !== "github"
    || recipe.action !== "organizations.read"
    || recipe.contractVersion !== 1
    || GITHUB_WEB_OPERATIONS["organizations.read"].state !== "observed"
  ) {
    throw new Error("GitHub public organizations.read contract is not installed");
  }
  const requestedOrganization = exactOrganizationInput(input);
  return runReadEffect(githubOrganizationReadProgram(requestedOrganization).pipe(
    Effect.provide(GitHubReadPlatformLive(recipe, dependencies, operationDeadline)),
  ));
}

export function probeGitHubWebSubject(_auth: GhostgetAuth): Promise<string> {
  return Promise.reject(
    new Error("GitHub public statistics reads do not use an auth realm"),
  );
}

export function executeGitHubAuthenticatedOperation(): Promise<WebSessionExecution> {
  return Promise.reject(
    new Error("GitHub has no installed authenticated web operations"),
  );
}
