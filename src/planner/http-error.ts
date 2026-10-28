export class CloudError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = "CloudError";
    this.code = code;
  }
}

/** The outbox must distinguish definite SQL rejection from ambiguous network/server failure. */
export function httpError(
  status: number,
  value: unknown,
  review = false,
  preview = false,
): CloudError {
  const body =
    typeof value === "object" && value !== null
      ? (value as Record<string, unknown>)
      : {};
  const error =
    typeof body.error === "object" && body.error !== null
      ? (body.error as Record<string, unknown>)
      : {};
  if (status === 401 || body.code === "PT401")
    return new CloudError(
      "unauthorized",
      "Your session has expired. Please sign in again.",
    );
  if (body.code === "PT403")
    return new CloudError(
      "account_deleted",
      "This account has been marked for deletion and can no longer be used.",
    );
  if (review) {
    const known: Record<string, string> = {
      rate_limited: preview
        ? "Preview limit reached. Allow 10 minutes between requests; at most 3 attempts per UTC day. Failed attempts count."
        : "The review retry allowance has been reached. Please try later.",
      weekly_limit: "Your free weekly review allowance has been used.",
      running:
        "A review is already being generated. Please check again shortly.",
      global_limit:
        "The free AI allowance has been reached. Your planner is unaffected.",
      origin_not_allowed:
        "Weekly AI is not enabled for this website yet. The operator needs to add this domain to the function's ALLOWED_ORIGINS.",
    };
    if (typeof error.code === "string" && known[error.code])
      return new CloudError(error.code, known[error.code]!);
    return new CloudError(
      "ai",
      "Weekly AI is unavailable or its allowance has been reached. Your planner and saved reviews are unaffected.",
    );
  }
  if (status === 429)
    return new CloudError(
      "rate_limited",
      "Too many requests. Please try again later.",
    );
  if (
    ["PT400", "PT404", "PT409"].includes(String(body.code)) &&
    typeof body.message === "string" &&
    body.message.length < 300
  ) {
    return new CloudError("validation", body.message);
  }
  return new CloudError(
    "server",
    "Supabase could not complete the request. Your pending changes remain on this device and will retry.",
  );
}
