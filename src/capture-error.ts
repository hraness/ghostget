/** Additive JSON classification for capture clients. Human prose is never evidence. */
export const captureErrorCodes = [
  "unknown", "permission-required", "auth-required", "invalid-input", "cancelled",
  "timeout", "transient", "rate-limited", "unsupported", "cleanup-pending",
] as const;
export type CaptureErrorCode = typeof captureErrorCodes[number];
export type CaptureErrorV1 = Readonly<{
  schemaVersion: 1;
  code: CaptureErrorCode;
  retryable: boolean;
}>;
export function captureError(code: CaptureErrorCode = "unknown"): CaptureErrorV1 {
  return { schemaVersion: 1, code, retryable: code === "transient" || code === "rate-limited" || code === "timeout" };
}
export function parseCaptureError(value: unknown): CaptureErrorV1 {
  if (value === null || typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid capture error");
  const record = value as Record<string, unknown>;
  if (Object.keys(record).length !== 3 || !["schemaVersion", "code", "retryable"].every(key => Object.hasOwn(record, key)) || record.schemaVersion !== 1
    || !captureErrorCodes.some(code => code === record.code)
    || typeof record.retryable !== "boolean") throw new Error("Invalid capture error");
  const expected = captureError(record.code as CaptureErrorCode);
  if (record.retryable !== expected.retryable) throw new Error("Invalid capture retry policy");
  return expected;
}
/** Wordcell writes one JSON result per stdout call. Non-JSON and success bytes pass unchanged. */
export function captureErrorOutput<T extends { stdout: (text: string) => void }>(
  output: T,
  classification: () => CaptureErrorV1 = () => captureError(),
): T {
  return { ...output, stdout: (text: string) => {
    let value: unknown;
    // Bound work before parsing; this wrapper never accumulates streamed output.
    if (Buffer.byteLength(text) > 1024 * 1024) { output.stdout(text); return; }
    try { value = JSON.parse(text); } catch { output.stdout(text); return; }
    if (value === null || typeof value !== "object" || Array.isArray(value)
      || (value as Record<string, unknown>).ok !== false) { output.stdout(text); return; }
    const failure = value as Record<string, unknown>;
    let classified = classification();
    if (classified.code !== "cleanup-pending" && failure.captureError !== undefined) {
      try { classified = parseCaptureError(failure.captureError); } catch { /* Invalid upstream classification grants no retry. */ classified = captureError(); }
    }
    output.stdout(`${JSON.stringify({ ...failure, captureError: classified })}\n`);
  } };
}
