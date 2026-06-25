import { AuthError } from "./auth/guards";

export class HttpError extends Error {
  constructor(
    public status: number,
    public code: string,
  ) {
    super(code);
    this.name = "HttpError";
  }
}

function isZodError(e: unknown): e is Error {
  return e instanceof Error && e.name === "ZodError";
}

export function jsonOk<T>(data: T, init?: ResponseInit): Response {
  return Response.json({ data }, { status: 200, ...init });
}

export function jsonError(status: number, code: string): Response {
  return Response.json({ error: { code } }, { status });
}

export function errorToResponse(e: unknown): Response {
  if (e instanceof AuthError) return jsonError(e.status, e.code);
  if (e instanceof HttpError) return jsonError(e.status, e.code);
  if (isZodError(e)) return jsonError(400, "VALIDATION_ERROR");
  return jsonError(500, "INTERNAL");
}

export function handleError(e: unknown): Response {
  return errorToResponse(e);
}

export function getClientIp(req: Request): string {
  const headers = req.headers;
  const forwarded = headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0]?.trim() ?? "unknown";
  return headers.get("x-real-ip") ?? "unknown";
}
