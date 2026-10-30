export const MAX_REQUEST_BYTES = 65_536;
const READ_TIMEOUT_MS = 10_000;

/** Only explicitly authored API errors may be returned to a caller. */
export class ApiError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

/** Bounded streaming read, even if Content-Length is missing or dishonest. */
export async function readLimited(
  stream: ReadableStream<Uint8Array> | null,
  max: number,
  timeoutMs = READ_TIMEOUT_MS,
): Promise<string> {
  if (!stream)
    throw new ApiError(400, "invalid_json", "A JSON body is required.");
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      reject(
        new ApiError(408, "read_timeout", "The request or response timed out."),
      );
      void reader.cancel().catch(() => {});
    }, timeoutMs);
  });
  try {
    while (true) {
      const { value, done } = await Promise.race([reader.read(), deadline]);
      if (done) break;
      size += value.byteLength;
      if (size > max) {
        // An untrusted stream's cancel hook may hang or reject.
        void reader.cancel().catch(() => {});
        throw new ApiError(
          413,
          "payload_too_large",
          "The request or response exceeds the review size limit.",
        );
      }
      chunks.push(value);
    }
  } finally {
    clearTimeout(timer);
    reader.releaseLock();
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
}
