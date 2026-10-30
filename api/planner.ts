import type { IncomingMessage, ServerResponse } from "node:http";
import { Readable } from "node:stream";
import { plannerRuntime } from "../server/planner-runtime.ts";

export async function handlePlanner(
  request: IncomingMessage,
  response: ServerResponse,
  env: Record<string, string | undefined>,
): Promise<void> {
  response.setHeader("Cache-Control", "no-store");
  response.setHeader("X-Content-Type-Options", "nosniff");
  try {
    const headers = new Headers();
    for (const [name, value] of Object.entries(request.headers)) {
      if (Array.isArray(value))
        for (const entry of value) headers.append(name, entry);
      else if (value !== undefined) headers.set(name, value);
    }
    const body =
      request.method === "GET" || request.method === "HEAD"
        ? undefined
        : (Readable.toWeb(request) as ReadableStream<Uint8Array>);
    const input = new Request(
      `https://${request.headers.host || "www.prune.win"}/api/planner`,
      {
        method: request.method,
        headers,
        body,
        duplex: "half",
      } as RequestInit & { duplex: string },
    );
    const result = await plannerRuntime(env)(input);
    response.statusCode = result.status;
    result.headers.forEach((value, key) => response.setHeader(key, value));
    response.end(Buffer.from(await result.arrayBuffer()));
  } catch {
    response.statusCode = 503;
    response.setHeader("Content-Type", "application/json");
    response.end(
      JSON.stringify({
        code: "configuration",
        message: "The planner connection is not configured yet.",
      }),
    );
  }
}

export default async function handler(
  request: IncomingMessage,
  response: ServerResponse,
): Promise<void> {
  return handlePlanner(request, response, process.env);
}
