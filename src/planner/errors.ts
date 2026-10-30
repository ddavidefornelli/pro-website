/** Error codes may come from SDKs, transport adapters, or persisted sync state. */
export function errorCode(error: unknown): string {
  return typeof error === "object" && error !== null && "code" in error
    ? String(error.code)
    : "";
}

/** Preserve authored messages, with a context-specific fallback for unknown failures. */
export function errorMessage(
  error: unknown,
  fallback = "Something went wrong. Please try again.",
): string {
  return typeof error === "object" && error !== null && "message" in error
    ? String(error.message)
    : fallback;
}
