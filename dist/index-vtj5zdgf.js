// @bun
// src/operation-deadline.ts
class OperationDeadlineError extends Error {
  failure;
  constructor(label, failure) {
    super(failure === "cancelled" ? `${label} was cancelled` : failure === "timed-out" ? `${label} timed out` : `${label} deadline is no longer active`);
    this.name = "OperationDeadlineError";
    this.failure = failure;
  }
}
var systemClock = Object.freeze({
  now: () => performance.now(),
  schedule: (callback, delayMs) => {
    const timer = setTimeout(callback, delayMs);
    let active = true;
    return () => {
      if (!active)
        return;
      active = false;
      clearTimeout(timer);
    };
  }
});

class OperationDeadline {
  #clock;
  #deadlineMs;
  #controller = new AbortController;
  #callerSignal;
  #callerAbort;
  #cancelTimer = null;
  #state = "active";
  constructor(timeoutMs, options = {}) {
    if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 0) {
      throw new Error("operation timeout must be a non-negative safe integer");
    }
    this.#clock = options.clock ?? systemClock;
    const startedAt = this.#clock.now();
    if (!Number.isFinite(startedAt)) {
      throw new Error("operation monotonic clock returned an invalid time");
    }
    this.#deadlineMs = startedAt + timeoutMs;
    if (!Number.isFinite(this.#deadlineMs)) {
      throw new Error("operation deadline exceeded the supported time range");
    }
    this.#callerSignal = options.signal;
    this.#callerAbort = options.signal === undefined ? undefined : () => this.#abort("cancelled");
    if (options.signal?.aborted === true) {
      this.#abort("cancelled");
      return;
    }
    if (this.#callerAbort !== undefined) {
      options.signal?.addEventListener("abort", this.#callerAbort, { once: true });
    }
    if (timeoutMs === 0) {
      this.#abort("timed-out");
      return;
    }
    const cancelTimer = this.#clock.schedule(() => {
      this.#cancelTimer = null;
      this.#abort("timed-out");
    }, timeoutMs);
    if (this.#state === "active")
      this.#cancelTimer = cancelTimer;
    else
      cancelTimer();
  }
  get signal() {
    return this.#controller.signal;
  }
  remainingTimeMs() {
    this.#refresh();
    if (this.#state !== "active")
      return 0;
    return Math.max(0, Math.ceil(this.#deadlineMs - this.#clock.now()));
  }
  throwIfUnavailable(label = "operation") {
    this.#refresh();
    if (this.#state !== "active") {
      throw new OperationDeadlineError(label, this.#state);
    }
  }
  async run(work, label = "operation") {
    this.throwIfUnavailable(label);
    let rejectForAbort;
    const aborted = new Promise((_resolve, reject) => {
      rejectForAbort = reject;
    });
    const onAbort = () => {
      rejectForAbort?.(this.#error(label));
    };
    this.signal.addEventListener("abort", onAbort, { once: true });
    try {
      if (this.signal.aborted)
        throw this.#error(label);
      const operation = work(this.signal);
      const value = await Promise.race([operation, aborted]);
      this.throwIfUnavailable(label);
      return value;
    } catch (error) {
      this.#refresh();
      if (this.#state !== "active")
        throw this.#error(label);
      throw error;
    } finally {
      this.signal.removeEventListener("abort", onAbort);
    }
  }
  dispose() {
    if (this.#state !== "active") {
      this.#clearTimer();
      this.#detachCaller();
      return;
    }
    this.#state = "disposed";
    this.#clearTimer();
    this.#detachCaller();
    this.#controller.abort();
  }
  #refresh() {
    if (this.#state !== "active")
      return;
    if (this.#callerSignal?.aborted === true) {
      this.#abort("cancelled");
      return;
    }
    const now = this.#clock.now();
    if (!Number.isFinite(now) || now >= this.#deadlineMs) {
      this.#abort("timed-out");
    }
  }
  #abort(failure) {
    if (this.#state !== "active")
      return;
    this.#state = failure;
    this.#clearTimer();
    this.#detachCaller();
    this.#controller.abort();
  }
  #error(label) {
    const failure = this.#state === "active" ? "timed-out" : this.#state;
    return new OperationDeadlineError(label, failure);
  }
  #clearTimer() {
    const cancel = this.#cancelTimer;
    this.#cancelTimer = null;
    cancel?.();
  }
  #detachCaller() {
    if (this.#callerAbort !== undefined) {
      this.#callerSignal?.removeEventListener("abort", this.#callerAbort);
    }
  }
}

export { OperationDeadlineError, OperationDeadline };
