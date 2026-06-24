import { SignJWT, jwtVerify } from "jose";

function key(secret: string): Uint8Array {
  return new TextEncoder().encode(secret);
}

export function isSameOrigin(originOrReferer: string | null, appBaseUrl: string): boolean {
  if (!originOrReferer) return false;
  try {
    return new URL(originOrReferer).origin === new URL(appBaseUrl).origin;
  } catch {
    return false;
  }
}

export async function issueCsrfToken(secret: string, sessionId: string): Promise<string> {
  return new SignJWT({ sid: sessionId })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("12h")
    .sign(key(secret));
}

export async function verifyCsrfToken(secret: string, token: string, sessionId: string): Promise<boolean> {
  try {
    const { payload } = await jwtVerify(token, key(secret));
    return payload.sid === sessionId;
  } catch {
    return false;
  }
}
