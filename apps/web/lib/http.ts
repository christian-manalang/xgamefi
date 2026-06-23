import { AuthError } from "./auth/guards";

export function jsonOk<T>(data: T, init?: ResponseInit): Response {
  return Response.json({ data }, { status: 200, ...init });
}

export function jsonError(status: number, code: string): Response {
  return Response.json({ error: { code } }, { status });
}

export function errorToResponse(e: unknown): Response {
  if (e instanceof AuthError) return jsonError(e.status, e.code);
  return jsonError(500, "INTERNAL");
}
