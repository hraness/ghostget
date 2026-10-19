// @bun
// src/provider-plugin-cleanup-execution.ts
function startProviderPluginCleanupTrackedOperation(register, start) {
  if (register === undefined) {
    return start(undefined, Object.freeze({
      verified: () => {
        return;
      },
      unsafe: () => {
        return;
      }
    }));
  }
  let resolveCleanup;
  let rejectCleanup;
  let settled = false;
  const cleanupBarrier = new Promise((resolve, reject) => {
    resolveCleanup = resolve;
    rejectCleanup = reject;
  });
  cleanupBarrier.catch(() => {
    return;
  });
  const publishCleanupResource = register(cleanupBarrier);
  const cleanup = Object.freeze({
    verified: () => {
      if (settled)
        return;
      settled = true;
      resolveCleanup?.();
    },
    unsafe: (reason) => {
      if (settled)
        return;
      settled = true;
      rejectCleanup?.(reason instanceof Error ? reason : new Error("provider cleanup could not be verified"));
    }
  });
  try {
    return Promise.resolve(start(typeof publishCleanupResource === "function" ? publishCleanupResource : undefined, cleanup)).catch((error) => {
      cleanup.unsafe(error);
      throw error;
    });
  } catch (error) {
    cleanup.unsafe(error);
    throw error;
  }
}

export { startProviderPluginCleanupTrackedOperation };
