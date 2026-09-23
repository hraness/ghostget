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
  WEBMCP_MAX_MCP_RESPONSE_BYTES,
  WEBMCP_MAX_SITE_RESPONSE_BYTES,
  WEBMCP_MAX_SITES_RESPONSE_BYTES,
  parseWebmcpSitesGetInput,
  parseWebmcpSitesGetResponse,
  parseWebmcpSitesSearchInput,
  parseWebmcpSitesSearchResponse,
  parseWebmcpToolsCallInput,
  parseWebmcpToolsCallResponse,
  webmcpMcpCallBody,
  webmcpMcpUrl,
  webmcpSitesGetUrl,
  webmcpSitesSearchUrl,
} from "./webmcp";

const OPERATION_LABEL = "WebMCP Registry public operation deadline";
const USER_AGENT = "Mozilla/5.0 (compatible; Ghostget/1.0; +https://ghostget.com)";

export type WebmcpRuntimeDependencies = {
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

function jsonContentType(response: Response): boolean {
  const raw = response.headers.get("content-type");
  if (raw === null) return false;
  const type = raw.split(";", 1)[0]?.trim().toLowerCase();
  return type === "application/json";
}

function eventStreamContentType(response: Response): boolean {
  const raw = response.headers.get("content-type");
  if (raw === null) return false;
  const type = raw.split(";", 1)[0]?.trim().toLowerCase();
  return type === "text/event-stream";
}

function decodeUtf8(bytes: Uint8Array, label: string): string {
  if (bytes.byteLength === 0) {
    throw new Error(`${label} was empty`);
  }
  return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
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

function registryHeaders(): Readonly<Record<string, string>> {
  return {
    accept: "application/json",
    "user-agent": USER_AGENT,
  };
}

function mcpHeaders(): Readonly<Record<string, string>> {
  return {
    accept: "application/json, text/event-stream",
    "content-type": "application/json",
    "user-agent": USER_AGENT,
  };
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

async function requestRegistryJson(
  url: URL,
  maximum: number,
  fetch: PinnedHttpsFetch,
  signal: AbortSignal,
  timeoutMs: number,
  deadline: WebSessionOperationDeadline | undefined,
): Promise<unknown> {
  let response: Response;
  try {
    response = await fetch(url, {
      method: "GET",
      headers: registryHeaders(),
      redirect: "error",
      signal,
    }, remainingTimeoutMs(timeoutMs, deadline, OPERATION_LABEL));
  } catch (error) {
    if (signal.aborted) {
      if (deadline !== undefined) deadline.throwIfUnavailable(OPERATION_LABEL);
      throw new OperationDeadlineError(OPERATION_LABEL, "timed-out");
    }
    throw new ProviderReadTransportError(error);
  }
  if (response.status === 429 || response.status === 503) {
    void response.body?.cancel().catch(() => undefined);
    throw new ProviderReadThrottledError();
  }
  if (response.status !== 200) {
    void response.body?.cancel().catch(() => undefined);
    throw new ProviderReadResponseRejectedError(response.status);
  }
  if (!jsonContentType(response)) {
    void response.body?.cancel().catch(() => undefined);
    throw new Error("WebMCP Registry returned an unreviewed content type");
  }
  const body = decodeUtf8(
    await boundedBytes(response, maximum, deadline, "WebMCP Registry response"),
    "WebMCP Registry response",
  );
  try {
    return JSON.parse(body);
  } catch {
    throw new Error("WebMCP Registry response was not reviewed JSON");
  }
}

async function requestMcpEventStream(
  body: string,
  maximum: number,
  fetch: PinnedHttpsFetch,
  signal: AbortSignal,
  timeoutMs: number,
  deadline: WebSessionOperationDeadline | undefined,
): Promise<string> {
  let response: Response;
  try {
    response = await fetch(webmcpMcpUrl(), {
      method: "POST",
      headers: mcpHeaders(),
      body,
      redirect: "error",
      signal,
    }, remainingTimeoutMs(timeoutMs, deadline, OPERATION_LABEL));
  } catch (error) {
    if (signal.aborted) {
      if (deadline !== undefined) deadline.throwIfUnavailable(OPERATION_LABEL);
      throw new OperationDeadlineError(OPERATION_LABEL, "timed-out");
    }
    throw new ProviderReadTransportError(error);
  }
  if (response.status === 429 || response.status === 503) {
    void response.body?.cancel().catch(() => undefined);
    throw new ProviderReadThrottledError();
  }
  if (response.status !== 200) {
    void response.body?.cancel().catch(() => undefined);
    throw new ProviderReadResponseRejectedError(response.status);
  }
  if (!eventStreamContentType(response) && !jsonContentType(response)) {
    void response.body?.cancel().catch(() => undefined);
    throw new Error("WebMCP Registry MCP endpoint returned an unreviewed content type");
  }
  return decodeUtf8(
    await boundedBytes(response, maximum, deadline, "WebMCP Registry MCP response"),
    "WebMCP Registry MCP response",
  );
}

function succeeded(output: unknown, finalUrl: string | null): WebSessionExecution {
  return {
    status: "succeeded",
    output,
    finalUrl,
    dispatchStarted: false,
    dispatch: { planned: 0, started: 0, verified: 0 },
  };
}

async function executeSitesSearch(
  recipe: WebSessionRecipe,
  input: OperationInput,
  fetch: PinnedHttpsFetch,
  signal: AbortSignal,
  deadline: WebSessionOperationDeadline | undefined,
): Promise<WebSessionExecution> {
  const search = parseWebmcpSitesSearchInput(input);
  const url = webmcpSitesSearchUrl(search);
  const body = await requestRegistryJson(
    url,
    Math.min(recipe.maxOutputBytes, WEBMCP_MAX_SITES_RESPONSE_BYTES),
    fetch,
    signal,
    recipe.timeoutMs,
    deadline,
  );
  return succeeded(parseWebmcpSitesSearchResponse(body), url.toString());
}

async function executeSitesGet(
  recipe: WebSessionRecipe,
  input: OperationInput,
  fetch: PinnedHttpsFetch,
  signal: AbortSignal,
  deadline: WebSessionOperationDeadline | undefined,
): Promise<WebSessionExecution> {
  const domain = parseWebmcpSitesGetInput(input);
  const url = webmcpSitesGetUrl(domain);
  try {
    const body = await requestRegistryJson(
      url,
      Math.min(recipe.maxOutputBytes, WEBMCP_MAX_SITE_RESPONSE_BYTES),
      fetch,
      signal,
      recipe.timeoutMs,
      deadline,
    );
    return succeeded(parseWebmcpSitesGetResponse(body), url.toString());
  } catch (error) {
    if (
      error instanceof ProviderReadResponseRejectedError
      && error.status === 404
    ) {
      return failedProviderRead("WebMCP Registry", error, url.toString(), {
        stage: "target",
        authenticated: false,
        targetStatusUnavailable: true,
      });
    }
    throw error;
  }
}

async function executeToolsCall(
  recipe: WebSessionRecipe,
  input: OperationInput,
  fetch: PinnedHttpsFetch,
  signal: AbortSignal,
  deadline: WebSessionOperationDeadline | undefined,
): Promise<WebSessionExecution> {
  const request = parseWebmcpToolsCallInput(input);
  const body = await requestMcpEventStream(
    webmcpMcpCallBody(request),
    Math.min(recipe.maxOutputBytes, WEBMCP_MAX_MCP_RESPONSE_BYTES),
    fetch,
    signal,
    recipe.timeoutMs,
    deadline,
  );
  return succeeded(
    parseWebmcpToolsCallResponse(body, request),
    webmcpMcpUrl().toString(),
  );
}

export async function executeWebmcpPublicOperation(
  recipe: WebSessionRecipe,
  input: OperationInput,
  dependencies: WebmcpRuntimeDependencies | undefined,
  operationDeadline: WebSessionOperationDeadline | undefined,
): Promise<WebSessionExecution> {
  if (recipe.site !== "webmcp" || recipe.contractVersion !== 1) {
    throw new Error("WebMCP Registry public contract is not installed");
  }
  const fetch = dependencies?.fetch ?? pinnedHttpsFetch;
  const operation = signalForOperation(recipe, operationDeadline);
  try {
    switch (recipe.action) {
      case "sites.search":
        return await executeSitesSearch(
          recipe,
          input,
          fetch,
          operation.signal,
          operationDeadline,
        );
      case "sites.get":
        return await executeSitesGet(
          recipe,
          input,
          fetch,
          operation.signal,
          operationDeadline,
        );
      case "tools.call":
        return await executeToolsCall(
          recipe,
          input,
          fetch,
          operation.signal,
          operationDeadline,
        );
      default:
        throw new Error("WebMCP Registry public operation is not installed");
    }
  } catch (error) {
    return failedProviderRead("WebMCP Registry", error, null, {
      stage: "target",
      authenticated: false,
    });
  } finally {
    operation.dispose();
  }
}

export function probeWebmcpSubject(_auth: GhostgetAuth): Promise<string> {
  return Promise.reject(
    new Error("WebMCP Registry public operations do not use an auth realm"),
  );
}

export function executeWebmcpAuthenticatedOperation(): Promise<WebSessionExecution> {
  return Promise.reject(
    new Error("WebMCP Registry has no installed authenticated web operations"),
  );
}

export const WEBMCP_PUBLIC_USER_AGENT = USER_AGENT;
