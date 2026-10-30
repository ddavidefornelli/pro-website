import { ApiError, MAX_REQUEST_BYTES, readLimited } from "./http.ts";
export interface Identity {
  userId: string;
  email: string;
}
export interface GatewayDependencies {
  authenticate(request: Request): Promise<Identity>;
  planner(
    identity: Identity,
    action: string,
    args: Record<string, unknown>,
    timezone: string,
  ): Promise<unknown>;
  review(
    request: Request,
    identity: Identity,
    args: Record<string, unknown>,
  ): Promise<Response>;
  allowedOrigins: Set<string>;
}
const object = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === "object" && !Array.isArray(value);

/** No caller-supplied owner ID or token claims are used to select an account. */
export function createPlannerHandler(deps: GatewayDependencies) {
  return async (request: Request): Promise<Response> => {
    const headers = {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    };
    const reply = (status: number, value: unknown) =>
      new Response(JSON.stringify(value), { status, headers });
    try {
      if (request.method !== "POST")
        return reply(405, { code: "method_not_allowed" });
      const origin = request.headers.get("Origin");
      if (origin && !deps.allowedOrigins.has(origin))
        throw new ApiError(
          403,
          "origin_not_allowed",
          "This origin is not allowed.",
        );
      if (
        request.headers.get("Content-Type")?.split(";")[0].trim() !==
        "application/json"
      )
        return reply(415, { code: "invalid_content_type" });
      let body: unknown;
      try {
        body = JSON.parse(await readLimited(request.body, MAX_REQUEST_BYTES));
      } catch (error) {
        if (error instanceof ApiError)
          return reply(error.status, { code: error.code });
        return reply(400, { code: "invalid_json" });
      }
      if (
        !object(body) ||
        Object.keys(body).some((key) => !["command", "args"].includes(key)) ||
        !object(body.args)
      )
        return reply(400, { code: "invalid_request" });
      if (
        !["auth_status", "planner_call", "generate_weekly_review"].includes(
          String(body.command),
        )
      )
        return reply(400, { code: "invalid_command" });
      const identity = await deps.authenticate(request);
      if (body.command === "auth_status") return reply(200, identity);
      if (body.command === "generate_weekly_review")
        return deps.review(request, identity, body.args);
      const args = body.args;
      if (
        typeof args.action !== "string" ||
        args.action.length > 100 ||
        !object(args.args) ||
        typeof args.timezone !== "string" ||
        args.timezone.length > 100
      )
        return reply(400, { code: "invalid_request" });
      return reply(
        200,
        await deps.planner(identity, args.action, args.args, args.timezone),
      );
    } catch (error) {
      if (error instanceof ApiError)
        return reply(error.status, {
          code: error.code,
          message: error.message,
        });
      // Never leak Clerk, database, provider or credential diagnostics.
      return reply(503, {
        code: "configuration",
        message:
          "The Clerk planner connection is not ready. Your saved data has not been changed. Ask the operator to complete the server configuration and database migration.",
      });
    }
  };
}
