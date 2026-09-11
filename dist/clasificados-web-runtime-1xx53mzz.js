// @bun
import {
  CLASIFICADOS_MAX_RESPONSE_BYTES,
  CLASIFICADOS_ORIGIN,
  CLASIFICADOS_WEB_OPERATIONS,
  clasificadosListUrl,
  clasificadosPueblosForLocation,
  clasificadosSearchTargetUrl,
  parseRentalListingsSearchInput,
  projectClasificadosListingsSearch
} from "./index-xf199sky.js";
import {
  ProviderReadResponseRejectedError,
  ProviderReadThrottledError,
  ProviderReadTransportError,
  failedProviderRead
} from "./index-4smh9n9x.js";
import {
  pinnedHttpsFetch
} from "./index-j3ysa35f.js";
import"./index-aka7rgdj.js";
import {
  OperationDeadlineError
} from "./index-vtj5zdgf.js";
import"./index-n4szk3nw.js";
import"./index-z1w83f81.js";

// src/providers/clasificados-web-runtime.ts
var OPERATION_LABEL = "Clasificados public listings.search deadline";
var USER_AGENT = "Mozilla/5.0 (compatible; Ghostget/1.0; +https://ghostget.com)";
function remainingTimeoutMs(timeoutMs, deadline, label) {
  deadline?.throwIfUnavailable(label);
  const remaining = Math.min(timeoutMs, deadline?.remainingTimeMs() ?? timeoutMs);
  if (remaining < 1000) {
    throw new OperationDeadlineError(label, "timed-out");
  }
  return remaining;
}
function htmlContentType(response) {
  const raw = response.headers.get("content-type");
  if (raw === null)
    return false;
  const type = raw.split(";", 1)[0]?.trim().toLowerCase();
  return type === "text/html" || type === "application/xhtml+xml";
}
function decodeLatin1(bytes, label) {
  if (bytes.byteLength === 0) {
    throw new Error(`${label} was empty`);
  }
  return Buffer.from(bytes).toString("latin1");
}
async function boundedBytes(response, maximum, deadline, label) {
  const declared = response.headers.get("content-length");
  if (declared !== null) {
    const length2 = Number(declared);
    if (!Number.isSafeInteger(length2) || length2 < 0 || length2 > maximum) {
      response.body?.cancel().catch(() => {
        return;
      });
      throw new Error(`${label} exceeded its reviewed byte limit`);
    }
  }
  if (response.body === null)
    return new Uint8Array;
  const reader = response.body.getReader();
  const chunks = [];
  let length = 0;
  try {
    for (;; ) {
      const item = await (async () => {
        try {
          return deadline === undefined ? await reader.read() : await deadline.run(() => reader.read(), label);
        } catch (error) {
          if (error instanceof OperationDeadlineError)
            throw error;
          throw new ProviderReadTransportError(error);
        }
      })();
      if (item.done)
        break;
      if (!(item.value instanceof Uint8Array) || item.value.byteLength > maximum - length) {
        reader.cancel().catch(() => {
          return;
        });
        throw new Error(`${label} exceeded its reviewed byte limit`);
      }
      chunks.push(item.value);
      length += item.value.byteLength;
    }
  } catch (error) {
    reader.cancel().catch(() => {
      return;
    });
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
function clasificadosHeaders() {
  return {
    accept: "text/html,application/xhtml+xml;q=0.9",
    "accept-language": "en-US,en;q=0.9,es;q=0.8",
    "user-agent": USER_AGENT
  };
}
async function requestClasificadosHtml(url, maximum, fetch, signal, timeoutMs, deadline) {
  let response;
  try {
    response = await fetch(url, {
      method: "GET",
      headers: clasificadosHeaders(),
      redirect: "error",
      signal
    }, remainingTimeoutMs(timeoutMs, deadline, OPERATION_LABEL));
  } catch (error) {
    if (signal.aborted) {
      if (deadline !== undefined)
        deadline.throwIfUnavailable(OPERATION_LABEL);
      throw new OperationDeadlineError(OPERATION_LABEL, "timed-out");
    }
    throw new ProviderReadTransportError(error);
  }
  if (response.status !== 200) {
    response.body?.cancel().catch(() => {
      return;
    });
    if (response.status === 429 || response.status === 503) {
      throw new ProviderReadThrottledError;
    }
    throw new ProviderReadResponseRejectedError(response.status);
  }
  if (!htmlContentType(response)) {
    response.body?.cancel().catch(() => {
      return;
    });
    throw new Error("Clasificados rental list returned an unreviewed content type");
  }
  return decodeLatin1(await boundedBytes(response, maximum, deadline, "Clasificados rental list"), "Clasificados rental list");
}
function signalForOperation(recipe, deadline) {
  if (deadline !== undefined) {
    return Object.freeze({ signal: deadline.signal, dispose: () => {
      return;
    } });
  }
  const controller = new AbortController;
  const timeout = setTimeout(() => controller.abort(), recipe.timeoutMs);
  return Object.freeze({
    signal: controller.signal,
    dispose: () => clearTimeout(timeout)
  });
}
async function executeClasificadosPublicListingsSearch(recipe, input, dependencies, operationDeadline) {
  if (recipe.site !== "clasificados" || recipe.action !== "listings.search" || recipe.contractVersion !== 1 || CLASIFICADOS_WEB_OPERATIONS["listings.search"].state !== "observed") {
    throw new Error("Clasificados public listings.search contract is not installed");
  }
  const search = parseRentalListingsSearchInput(input);
  const pueblos = clasificadosPueblosForLocation(search.location);
  const fetch = dependencies?.fetch ?? pinnedHttpsFetch;
  const operation = signalForOperation(recipe, operationDeadline);
  const targetUrl = clasificadosSearchTargetUrl(search.location, search);
  try {
    const pages = [];
    for (const pueblo of pueblos) {
      const html = await requestClasificadosHtml(clasificadosListUrl(pueblo, search), Math.min(recipe.maxOutputBytes, CLASIFICADOS_MAX_RESPONSE_BYTES), fetch, operation.signal, recipe.timeoutMs, operationDeadline);
      pages.push({ pueblo, html });
    }
    const output = projectClasificadosListingsSearch(pages, search, new Date(dependencies?.now?.() ?? Date.now()).toISOString());
    return {
      status: "succeeded",
      output,
      finalUrl: output.target.url,
      dispatchStarted: false,
      dispatch: { planned: 0, started: 0, verified: 0 }
    };
  } catch (error) {
    return failedProviderRead("Clasificados listings", error, targetUrl, {
      stage: "target",
      authenticated: false,
      targetStatusUnavailable: true
    });
  } finally {
    operation.dispose();
  }
}
function probeClasificadosWebSubject(_auth) {
  return Promise.reject(new Error("Clasificados public rental searches do not use an auth realm"));
}
function executeClasificadosAuthenticatedOperation() {
  return Promise.reject(new Error("Clasificados has no installed authenticated web operations"));
}
var CLASIFICADOS_PUBLIC_USER_AGENT = USER_AGENT;
var CLASIFICADOS_PUBLIC_ORIGIN = CLASIFICADOS_ORIGIN;
export {
  probeClasificadosWebSubject,
  executeClasificadosPublicListingsSearch,
  executeClasificadosAuthenticatedOperation,
  CLASIFICADOS_PUBLIC_USER_AGENT,
  CLASIFICADOS_PUBLIC_ORIGIN
};
