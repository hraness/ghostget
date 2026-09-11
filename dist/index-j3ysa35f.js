// @bun
// src/pinned-https.ts
import {
  createPinnedNetworkConnectionPool,
  requestPinnedNetworkAddress,
  resolveSafeNetworkTarget
} from "@hraness/kb/clip/network";
var defaultDependencies = {
  resolveTarget: resolveSafeNetworkTarget,
  request: requestPinnedNetworkAddress
};
function requestBody(value) {
  if (value === undefined || value === null)
    return null;
  if (typeof value === "string")
    return new TextEncoder().encode(value);
  if (value instanceof Uint8Array)
    return new Uint8Array(value);
  if (value instanceof ArrayBuffer)
    return new Uint8Array(value.slice(0));
  if (ArrayBuffer.isView(value)) {
    return new Uint8Array(value.buffer.slice(value.byteOffset, value.byteOffset + value.byteLength));
  }
  throw new Error("authenticated HTTPS request bodies must be an owned string or byte array");
}
function responseBody(response) {
  if (response.body === null)
    return null;
  const iterator = response.body[Symbol.asyncIterator]();
  return new ReadableStream({
    async pull(controller) {
      try {
        const next = await iterator.next();
        if (next.done) {
          controller.close();
          return;
        }
        if (!(next.value instanceof Uint8Array)) {
          response.cancel();
          controller.error(new Error("authenticated HTTPS response yielded a non-byte chunk"));
          return;
        }
        controller.enqueue(next.value);
      } catch (error) {
        response.cancel();
        controller.error(error);
      }
    },
    cancel() {
      response.cancel();
      iterator.return?.();
    }
  });
}
async function pinnedHttpsFetch(input, init, timeoutMs, dependencies = {}) {
  const url = new URL(input);
  if (url.protocol !== "https:" || url.username !== "" || url.password !== "" || url.hash !== "")
    throw new Error("authenticated requests require one credential-free HTTPS URL without a fragment");
  if (init.redirect !== "error")
    throw new Error("authenticated requests must reject redirects");
  if (init.signal === null || init.signal === undefined)
    throw new Error("authenticated requests require an abort signal");
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1000 || timeoutMs > 10 * 60000) {
    throw new Error("authenticated request timeout is invalid");
  }
  const resolved = { ...defaultDependencies, ...dependencies };
  init.signal.throwIfAborted();
  const addresses = await resolved.resolveTarget(url, {
    allowPrivateNetwork: false,
    timeoutMs
  });
  init.signal.throwIfAborted();
  const address = addresses[0];
  if (address === undefined)
    throw new Error("authenticated HTTPS origin did not resolve to a safe address");
  const headers = new Headers(init.headers);
  const body = requestBody(init.body);
  resolved.beforeRequest?.();
  init.signal.throwIfAborted();
  const response = await resolved.request({
    url,
    address,
    method: init.method ?? "GET",
    headers,
    body,
    signal: init.signal
  });
  if (!Number.isSafeInteger(response.status) || response.status < 200 || response.status > 599) {
    response.cancel();
    throw new Error("authenticated HTTPS response status is invalid");
  }
  return new Response(responseBody(response), {
    status: response.status,
    headers: response.headers
  });
}

export { pinnedHttpsFetch };
