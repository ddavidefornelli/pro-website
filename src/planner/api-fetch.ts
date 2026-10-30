import { HTTP_LIMITS, SUPABASE_ROUTES } from "../shared/api-routes.ts";
import { CloudError } from "./http-error.ts";

/** Bounded requests and response bodies. Never send cookies or a referrer. */
export async function apiFetch(
  input: RequestInfo | URL,
  init?: RequestInit,
  timeoutMs?: number,
): Promise<Response> {
  const controller = new AbortController();
  const abort = () => controller.abort();
  const url = input instanceof Request ? input.url : String(input);
  const timeout = setTimeout(
    abort,
    timeoutMs ??
      (url.includes("/functions/")
        ? HTTP_LIMITS.reviewMs
        : url.includes(SUPABASE_ROUTES.signOut)
          ? HTTP_LIMITS.signOutMs
          : HTTP_LIMITS.requestMs),
  );
  const signal =
    init?.signal ?? (input instanceof Request ? input.signal : undefined);
  if (signal?.aborted) abort();
  signal?.addEventListener("abort", abort, { once: true });
  try {
    const response = await fetch(input, {
      ...init,
      signal: controller.signal,
      credentials: "omit",
      cache: "no-store",
      redirect: "error",
      referrerPolicy: "no-referrer",
    });
    const reader = response.body?.getReader();
    if (!reader) return response;
    const chunks: Uint8Array[] = [];
    let length = 0;
    let rejectRead!: (reason: unknown) => void;
    const interrupted = new Promise<never>((_, reject) => {
      rejectRead = reject;
    });
    const interrupt = () => {
      rejectRead(controller.signal.reason);
      void reader.cancel().catch(() => {});
    };
    controller.signal.addEventListener("abort", interrupt, { once: true });
    if (controller.signal.aborted) interrupt();
    try {
      while (true) {
        const { value, done } = await Promise.race([
          reader.read(),
          interrupted,
        ]);
        if (done) break;
        length += value.byteLength;
        if (length > HTTP_LIMITS.responseBytes) {
          // Cancellation is best-effort; a broken stream must not delay failure.
          void reader.cancel().catch(() => {});
          throw new CloudError(
            "size",
            "The server response is too large. Please contact support.",
          );
        }
        chunks.push(value);
      }
    } finally {
      controller.signal.removeEventListener("abort", interrupt);
      reader.releaseLock();
    }
    const bytes = new Uint8Array(length);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }
    const headers = new Headers(response.headers);
    headers.delete("Content-Encoding");
    headers.delete("Content-Length");
    return new Response(bytes, {
      status: response.status,
      statusText: response.statusText,
      headers,
    });
  } finally {
    clearTimeout(timeout);
    signal?.removeEventListener("abort", abort);
  }
}
