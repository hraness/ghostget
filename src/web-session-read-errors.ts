/** Typed metadata at the native HTTP boundary; legacy message bytes stay stable. */
export class WebSessionResponseRejectedError extends Error {
  constructor(message: string, readonly status: number, readonly contentType: string | null) { super(message); }
}

export class WebSessionReadTransportError extends Error {
  constructor(message: string, cause: unknown) { super(message, { cause }); }
}

export class WebSessionAuthStateError extends Error { }

/** Classify a locally owned auth-state validator without interpreting its text. */
export function validateWebSessionAuthState<A>(validate: () => A): A {
  try { return validate(); }
  catch (cause) {
    if (cause instanceof Error) throw new WebSessionAuthStateError(cause.message, { cause });
    throw cause;
  }
}
