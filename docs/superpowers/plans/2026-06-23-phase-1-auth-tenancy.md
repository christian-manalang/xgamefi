# Phase 1 — Auth & Tenancy Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the full authentication and multi-tenant authorization layer for xGameFi — username/password (argon2id) cookie sessions for admin/studio users, Freighter wallet-signature sessions for players, a central RBAC guard with `studioId` re-scoping, CSRF protection, Redis rate-limiting with login backoff, `AuditLog` writes, and a `proxy.ts` coarse gate (never the sole check).

**Architecture:** Pure auth primitives (session token gen/hash, CSRF token helpers, rate-limit keys) live in `@xgamefi/shared/auth` and are unit-tested first. The cookie/session/Redis I/O and the Next 16 `getPrincipal/requireRole/...` guards live in `apps/web/lib/auth` (they call `await cookies()` so they belong to the web app). Route handlers under `apps/web/app/api/v1/auth/` are thin: validate with Zod, call shared/lib functions, return mapped DTOs, write `AuditLog`. Player wallet auth uses a one-time time-boxed `AuthChallenge` row + server-side Freighter signature verification over the nonce. Sessions are an opaque random id in an httpOnly+Secure+SameSite=Lax cookie, mirrored in Redis (fast lookup + idle TTL) with a `Session` DB row (revocation/audit). `proxy.ts` does a coarse cookie-presence gate; every handler re-checks authZ (defense in depth).

**Tech Stack:** Next.js 16.2.x (App Router, async `cookies()/headers()`, `proxy.ts`), React 19.2.x, TypeScript 5.x strict, Prisma 7.x (pg adapter), `argon2` (argon2id), `jose` (signed CSRF tokens), `zod`, `ioredis` (Redis 7), `@stellar/stellar-sdk` 15.1.x (Ed25519 signature verify), vitest, Playwright.

## Global Constraints

- `next` **16.2.x** — App Router, `proxy.ts` replaces middleware, `cookies()`/`headers()`/`params`/`searchParams` are async (always `await`).
- `react` / `react-dom` **19.2.x**; `typescript` **5.x** with `strict: true`.
- `prisma` + `@prisma/client` **7.x** (≥7.8), ESM-only, pg driver adapter; single `PrismaClient` from `@xgamefi/db`.
- `argon2` latest — **argon2id for passwords** (never SHA/bcrypt/plaintext).
- `jose` latest — signed cookie tokens / JWS for the double-submit CSRF token.
- `zod` latest — **validate every input with Zod; return mapped DTOs**, never raw Prisma rows.
- `ioredis` + Redis **7.x** — sessions mirror, rate-limit counters, login-backoff counters.
- `@stellar/stellar-sdk` **15.1.x** — server-side Ed25519 verify of Freighter signatures.
- **Never trust the client for authZ — re-check in the handler/action, not just `proxy.ts`** (multiple proxy/middleware bypass CVEs).
- **Studio queries are always scoped by `studioId`** via `scopeToStudio` before the query.
- **Rate-limit auth endpoints** in Redis; exponential login backoff on repeated failures.
- **Secrets live in env** (`SESSION_SECRET` etc.); never in DB plaintext, repo, logs, or `NEXT_PUBLIC_*`.
- **AuditLog on sensitive auth actions** — never log passwords, password hashes, session tokens, or signatures.
- Money is out of scope this phase, but the `Prisma.Decimal` / `bignumber.js` rule still holds for any incidental value.

---

## File Structure

| File | Responsibility |
| --- | --- |
| `packages/shared/src/auth/tokens.ts` | Pure: generate opaque session id, SHA-256 `hashToken`, constant-time `safeEqual`. No I/O. |
| `packages/shared/src/auth/csrf.ts` | Pure: `issueCsrfToken` (jose JWS), `verifyCsrfToken`, `isSameOrigin(origin\|referer, appBaseUrl)`. |
| `packages/shared/src/auth/wallet.ts` | Pure: `generateNonce`, `verifyWalletSignature` (Ed25519 over nonce via stellar-sdk Keypair). |
| `packages/shared/src/auth/ratelimit-keys.ts` | Pure: deterministic Redis key builders + backoff delay math. |
| `packages/shared/src/auth/index.ts` | Re-export of the above. Also home of `Principal` type. |
| `packages/shared/src/zod/auth.ts` | `LoginInput`, `WalletChallengeInput`, `WalletVerifyInput` Zod schemas. |
| `packages/shared/src/dto/auth.ts` | `toPrincipalDto`, `MeDto` mappers (pure). |
| `apps/web/lib/auth/password.ts` | `hashPassword` / `verifyPassword` (argon2id wrappers). |
| `apps/web/lib/auth/redis.ts` | ioredis client singleton for the web app. |
| `apps/web/lib/auth/session.ts` | Create/read/revoke session: cookie + Redis mirror + `Session` row; sliding refresh. |
| `apps/web/lib/auth/ratelimit.ts` | `rateLimit(key, limit, windowSec)` + `loginBackoff` (register failure/success, gate). |
| `apps/web/lib/auth/guards.ts` | `getPrincipal/requirePrincipal/requireRole/requireStudio/scopeToStudio` (+ `AuthError`). |
| `apps/web/lib/auth/csrf.ts` | Request-level CSRF enforcement: `assertCsrf(req)` (Origin/Referer + double-submit). |
| `apps/web/lib/auth/audit.ts` | `writeAudit(...)` helper that strips secrets. |
| `apps/web/lib/http.ts` | `jsonError(status, code)` / `jsonOk(data)` — never leaks Prisma/stack. |
| `apps/web/app/api/v1/auth/login/route.ts` | POST `/auth/login`. |
| `apps/web/app/api/v1/auth/logout/route.ts` | POST `/auth/logout`. |
| `apps/web/app/api/v1/auth/me/route.ts` | GET `/auth/me`. |
| `apps/web/app/api/v1/auth/wallet/challenge/route.ts` | POST `/auth/wallet/challenge`. |
| `apps/web/app/api/v1/auth/wallet/verify/route.ts` | POST `/auth/wallet/verify`. |
| `apps/web/proxy.ts` | Coarse cookie-presence auth gate + security headers. NOT the sole check. |
| `apps/web/app/(auth)/login/page.tsx` | `/login` page (BRAND.md styling) for admin & studio users. |
| `apps/web/app/(auth)/login/login-form.tsx` | Client island: terminal-style login form posting to `/auth/login`. |
| `packages/db/prisma/migrations/*_auth_indexes/migration.sql` | Indexes/constraints needed for auth lookups (idempotent additive migration). |
| Test files | Co-located `*.test.ts` for shared units; `apps/web/app/api/v1/auth/**/route.test.ts` integration tests against disposable Postgres + Redis. |

**Note on integration tests:** Tests under `apps/web/app/api/v1/auth/**/*.test.ts` run against a **disposable Postgres** (Testcontainers or `docker compose up postgres redis`) with `prisma migrate deploy` applied, plus a real/ephemeral Redis. They import route handlers directly and invoke them with a constructed `Request`, asserting on the returned `Response` and DB/Redis state. Unit tests under `packages/shared` need no services.

---

### Task 1: Session token primitives (`@xgamefi/shared/auth/tokens`)

**Files:**
- Create: `packages/shared/src/auth/tokens.ts`
- Create: `packages/shared/src/auth/index.ts`
- Test: `packages/shared/src/auth/tokens.test.ts`

**Interfaces:**
- Consumes: nothing (pure, Node `crypto`).
- Produces:
  ```ts
  function generateSessionId(): string                 // 32 random bytes, base64url, ~43 chars
  function hashToken(token: string): string            // sha256 hex of token (what we store in DB/Redis key)
  function safeEqual(a: string, b: string): boolean    // constant-time compare; false on length mismatch
  ```

- [ ] **Step 1: Write the failing test**

```ts
// packages/shared/src/auth/tokens.test.ts
import { describe, it, expect } from "vitest";
import { generateSessionId, hashToken, safeEqual } from "./tokens";

describe("session tokens", () => {
  it("generates unique high-entropy ids", () => {
    const a = generateSessionId();
    const b = generateSessionId();
    expect(a).not.toEqual(b);
    expect(a).toMatch(/^[A-Za-z0-9_-]{40,}$/); // base64url, no padding
  });

  it("hashes deterministically to 64 hex chars", () => {
    expect(hashToken("abc")).toEqual(hashToken("abc"));
    expect(hashToken("abc")).toMatch(/^[0-9a-f]{64}$/);
    expect(hashToken("abc")).not.toEqual(hashToken("abd"));
  });

  it("safeEqual is true only for identical strings", () => {
    expect(safeEqual("token", "token")).toBe(true);
    expect(safeEqual("token", "tokeN")).toBe(false);
    expect(safeEqual("token", "tok")).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @xgamefi/shared test src/auth/tokens.test.ts`
Expected: FAIL — `Cannot find module './tokens'`.

- [ ] **Step 3: Write minimal implementation**

```ts
// packages/shared/src/auth/tokens.ts
import { randomBytes, createHash, timingSafeEqual } from "node:crypto";

export function generateSessionId(): string {
  return randomBytes(32).toString("base64url");
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

export function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a, "utf8");
  const bb = Buffer.from(b, "utf8");
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}
```

```ts
// packages/shared/src/auth/index.ts
export * from "./tokens";
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @xgamefi/shared test src/auth/tokens.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/shared/src/auth/tokens.ts packages/shared/src/auth/tokens.test.ts packages/shared/src/auth/index.ts
git commit -m "feat(shared): session token primitives (gen/hash/safeEqual)"
```

---

### Task 2: Wallet nonce + Freighter signature verification (`@xgamefi/shared/auth/wallet`)

**Files:**
- Create: `packages/shared/src/auth/wallet.ts`
- Modify: `packages/shared/src/auth/index.ts` (add export)
- Test: `packages/shared/src/auth/wallet.test.ts`

**Interfaces:**
- Consumes: `@stellar/stellar-sdk` `Keypair`.
- Produces:
  ```ts
  function generateNonce(): string   // unguessable; embedded in a signable message
  function challengeMessage(walletAddress: string, nonce: string): string  // canonical bytes the wallet signs
  function verifyWalletSignature(args: { walletAddress: string; nonce: string; signatureBase64: string }): boolean
  ```
- The message format is canonical and shared by client + server; the client signs `challengeMessage(addr, nonce)`, the server re-derives and verifies.

- [ ] **Step 1: Write the failing test**

```ts
// packages/shared/src/auth/wallet.test.ts
import { describe, it, expect } from "vitest";
import { Keypair } from "@stellar/stellar-sdk";
import { generateNonce, challengeMessage, verifyWalletSignature } from "./wallet";

describe("wallet signature verification", () => {
  it("nonce is high-entropy and unique", () => {
    expect(generateNonce()).not.toEqual(generateNonce());
    expect(generateNonce().length).toBeGreaterThanOrEqual(32);
  });

  it("verifies a valid Ed25519 signature over the challenge message", () => {
    const kp = Keypair.random();
    const nonce = generateNonce();
    const msg = challengeMessage(kp.publicKey(), nonce);
    const sig = kp.sign(Buffer.from(msg, "utf8")).toString("base64");
    expect(verifyWalletSignature({ walletAddress: kp.publicKey(), nonce, signatureBase64: sig })).toBe(true);
  });

  it("rejects a signature from a different key", () => {
    const signer = Keypair.random();
    const claimed = Keypair.random();
    const nonce = generateNonce();
    const msg = challengeMessage(claimed.publicKey(), nonce);
    const sig = signer.sign(Buffer.from(msg, "utf8")).toString("base64");
    expect(verifyWalletSignature({ walletAddress: claimed.publicKey(), nonce, signatureBase64: sig })).toBe(false);
  });

  it("rejects a tampered nonce", () => {
    const kp = Keypair.random();
    const nonce = generateNonce();
    const sig = kp.sign(Buffer.from(challengeMessage(kp.publicKey(), nonce), "utf8")).toString("base64");
    expect(verifyWalletSignature({ walletAddress: kp.publicKey(), nonce: nonce + "x", signatureBase64: sig })).toBe(false);
  });

  it("returns false (never throws) on malformed address or signature", () => {
    expect(verifyWalletSignature({ walletAddress: "not-a-key", nonce: "n", signatureBase64: "%%%" })).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @xgamefi/shared test src/auth/wallet.test.ts`
Expected: FAIL — `Cannot find module './wallet'`.

- [ ] **Step 3: Write minimal implementation**

```ts
// packages/shared/src/auth/wallet.ts
import { randomBytes } from "node:crypto";
import { Keypair } from "@stellar/stellar-sdk";

export function generateNonce(): string {
  return randomBytes(24).toString("base64url"); // 32 chars
}

export function challengeMessage(walletAddress: string, nonce: string): string {
  return `xGameFi login\naddress: ${walletAddress}\nnonce: ${nonce}`;
}

export function verifyWalletSignature(args: {
  walletAddress: string;
  nonce: string;
  signatureBase64: string;
}): boolean {
  try {
    const kp = Keypair.fromPublicKey(args.walletAddress);
    const msg = Buffer.from(challengeMessage(args.walletAddress, args.nonce), "utf8");
    const sig = Buffer.from(args.signatureBase64, "base64");
    return kp.verify(msg, sig);
  } catch {
    return false;
  }
}
```

```ts
// packages/shared/src/auth/index.ts  (append)
export * from "./wallet";
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @xgamefi/shared test src/auth/wallet.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/shared/src/auth/wallet.ts packages/shared/src/auth/wallet.test.ts packages/shared/src/auth/index.ts
git commit -m "feat(shared): wallet nonce + server-side Freighter signature verify"
```

---

### Task 3: CSRF primitives (`@xgamefi/shared/auth/csrf`)

**Files:**
- Create: `packages/shared/src/auth/csrf.ts`
- Modify: `packages/shared/src/auth/index.ts` (add export)
- Test: `packages/shared/src/auth/csrf.test.ts`

**Interfaces:**
- Consumes: `jose` (`SignJWT`, `jwtVerify`), `SESSION_SECRET` is passed in (pure — no env import here).
- Produces:
  ```ts
  function isSameOrigin(originOrReferer: string | null, appBaseUrl: string): boolean  // exact origin match
  function issueCsrfToken(secret: string, sessionId: string): Promise<string>          // JWS bound to session
  function verifyCsrfToken(secret: string, token: string, sessionId: string): Promise<boolean>
  ```

- [ ] **Step 1: Write the failing test**

```ts
// packages/shared/src/auth/csrf.test.ts
import { describe, it, expect } from "vitest";
import { isSameOrigin, issueCsrfToken, verifyCsrfToken } from "./csrf";

const SECRET = "x".repeat(32);

describe("csrf", () => {
  it("isSameOrigin matches scheme+host+port exactly", () => {
    expect(isSameOrigin("http://localhost:3000", "http://localhost:3000")).toBe(true);
    expect(isSameOrigin("http://localhost:3000/x", "http://localhost:3000")).toBe(true); // referer path ignored
    expect(isSameOrigin("https://evil.com", "http://localhost:3000")).toBe(false);
    expect(isSameOrigin(null, "http://localhost:3000")).toBe(false);
    expect(isSameOrigin("http://localhost:3001", "http://localhost:3000")).toBe(false);
  });

  it("issued token verifies against its own session", async () => {
    const t = await issueCsrfToken(SECRET, "sess-1");
    expect(await verifyCsrfToken(SECRET, t, "sess-1")).toBe(true);
  });

  it("rejects a token bound to a different session", async () => {
    const t = await issueCsrfToken(SECRET, "sess-1");
    expect(await verifyCsrfToken(SECRET, t, "sess-2")).toBe(false);
  });

  it("rejects a tampered/garbage token without throwing", async () => {
    expect(await verifyCsrfToken(SECRET, "garbage", "sess-1")).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @xgamefi/shared test src/auth/csrf.test.ts`
Expected: FAIL — `Cannot find module './csrf'`.

- [ ] **Step 3: Write minimal implementation**

```ts
// packages/shared/src/auth/csrf.ts
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
```

```ts
// packages/shared/src/auth/index.ts  (append)
export * from "./csrf";
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @xgamefi/shared test src/auth/csrf.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/shared/src/auth/csrf.ts packages/shared/src/auth/csrf.test.ts packages/shared/src/auth/index.ts
git commit -m "feat(shared): CSRF helpers (same-origin check + double-submit token)"
```

---

### Task 4: Rate-limit keys + backoff math (`@xgamefi/shared/auth/ratelimit-keys`)

**Files:**
- Create: `packages/shared/src/auth/ratelimit-keys.ts`
- Modify: `packages/shared/src/auth/index.ts` (add export)
- Test: `packages/shared/src/auth/ratelimit-keys.test.ts`

**Interfaces:**
- Consumes: nothing (pure).
- Produces:
  ```ts
  function rlKey(scope: string, identifier: string): string         // "rl:<scope>:<identifier>"
  function loginFailKey(username: string): string                   // "login:fail:<lowercased username>"
  function backoffDelaySec(failureCount: number): number            // 0,0,0 then exp: 2,4,8,16... capped 900
  ```

- [ ] **Step 1: Write the failing test**

```ts
// packages/shared/src/auth/ratelimit-keys.test.ts
import { describe, it, expect } from "vitest";
import { rlKey, loginFailKey, backoffDelaySec } from "./ratelimit-keys";

describe("rate-limit keys & backoff", () => {
  it("builds deterministic namespaced keys", () => {
    expect(rlKey("auth:login", "1.2.3.4")).toBe("rl:auth:login:1.2.3.4");
  });

  it("login fail key lowercases the username", () => {
    expect(loginFailKey("Admin")).toBe("login:fail:admin");
  });

  it("no backoff for the first 3 failures, then exponential, capped at 900s", () => {
    expect(backoffDelaySec(0)).toBe(0);
    expect(backoffDelaySec(3)).toBe(0);
    expect(backoffDelaySec(4)).toBe(2);
    expect(backoffDelaySec(5)).toBe(4);
    expect(backoffDelaySec(6)).toBe(8);
    expect(backoffDelaySec(100)).toBe(900);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @xgamefi/shared test src/auth/ratelimit-keys.test.ts`
Expected: FAIL — `Cannot find module './ratelimit-keys'`.

- [ ] **Step 3: Write minimal implementation**

```ts
// packages/shared/src/auth/ratelimit-keys.ts
export function rlKey(scope: string, identifier: string): string {
  return `rl:${scope}:${identifier}`;
}

export function loginFailKey(username: string): string {
  return `login:fail:${username.toLowerCase()}`;
}

export function backoffDelaySec(failureCount: number): number {
  if (failureCount <= 3) return 0;
  const delay = 2 ** (failureCount - 3); // 4→2, 5→4, 6→8...
  return Math.min(delay, 900);
}
```

```ts
// packages/shared/src/auth/index.ts  (append)
export * from "./ratelimit-keys";
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @xgamefi/shared test src/auth/ratelimit-keys.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/shared/src/auth/ratelimit-keys.ts packages/shared/src/auth/ratelimit-keys.test.ts packages/shared/src/auth/index.ts
git commit -m "feat(shared): rate-limit key builders + login backoff math"
```

---

### Task 5: Auth Zod schemas + DTOs + `Principal` type (`@xgamefi/shared/zod`, `/dto`, `/auth`)

**Files:**
- Create: `packages/shared/src/zod/auth.ts`
- Create: `packages/shared/src/dto/auth.ts`
- Modify: `packages/shared/src/auth/index.ts` (export `Principal` type)
- Test: `packages/shared/src/zod/auth.test.ts`, `packages/shared/src/dto/auth.test.ts`

**Interfaces:**
- Consumes: `zod`.
- Produces:
  ```ts
  // zod/auth.ts
  const LoginInput: z.ZodType<{ username: string; password: string }>
  const WalletChallengeInput: z.ZodType<{ walletAddress: string }>
  const WalletVerifyInput: z.ZodType<{ walletAddress: string; signature: string }>

  // auth/index.ts  — THE canonical Principal type (canonical-interfaces §Auth)
  type Principal =
    | { kind: "user"; userId: string; role: "ADMIN" | "STUDIO_OWNER" | "STUDIO_MEMBER"; studioId?: string }
    | { kind: "player"; playerId: string; walletAddress: string };

  // dto/auth.ts
  type MeDto =
    | { kind: "user"; userId: string; role: "ADMIN" | "STUDIO_OWNER" | "STUDIO_MEMBER"; studioId: string | null }
    | { kind: "player"; playerId: string; walletAddress: string };
  function toMeDto(p: Principal): MeDto
  ```
- `walletAddress` validated as a Stellar public key: starts with `G`, length 56, base32 charset.

- [ ] **Step 1: Write the failing test**

```ts
// packages/shared/src/zod/auth.test.ts
import { describe, it, expect } from "vitest";
import { LoginInput, WalletChallengeInput, WalletVerifyInput } from "./auth";

const G = "G" + "A".repeat(55); // 56 chars, valid charset

describe("auth zod schemas", () => {
  it("LoginInput accepts valid, rejects empty", () => {
    expect(LoginInput.safeParse({ username: "admin", password: "pw" }).success).toBe(true);
    expect(LoginInput.safeParse({ username: "", password: "pw" }).success).toBe(false);
    expect(LoginInput.safeParse({ username: "admin" }).success).toBe(false);
  });

  it("WalletChallengeInput validates Stellar G-address", () => {
    expect(WalletChallengeInput.safeParse({ walletAddress: G }).success).toBe(true);
    expect(WalletChallengeInput.safeParse({ walletAddress: "G123" }).success).toBe(false);
    expect(WalletChallengeInput.safeParse({ walletAddress: "M" + "A".repeat(55) }).success).toBe(false);
  });

  it("WalletVerifyInput requires address + signature", () => {
    expect(WalletVerifyInput.safeParse({ walletAddress: G, signature: "abc" }).success).toBe(true);
    expect(WalletVerifyInput.safeParse({ walletAddress: G }).success).toBe(false);
  });
});
```

```ts
// packages/shared/src/dto/auth.test.ts
import { describe, it, expect } from "vitest";
import { toMeDto } from "./auth";

describe("toMeDto", () => {
  it("maps a user principal, normalizing missing studioId to null", () => {
    expect(toMeDto({ kind: "user", userId: "u1", role: "ADMIN" })).toEqual({
      kind: "user", userId: "u1", role: "ADMIN", studioId: null,
    });
  });
  it("maps a player principal", () => {
    expect(toMeDto({ kind: "player", playerId: "p1", walletAddress: "G..." })).toEqual({
      kind: "player", playerId: "p1", walletAddress: "G...",
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @xgamefi/shared test src/zod/auth.test.ts src/dto/auth.test.ts`
Expected: FAIL — `Cannot find module './auth'`.

- [ ] **Step 3: Write minimal implementation**

```ts
// packages/shared/src/auth/index.ts  (append — canonical Principal type)
export type Principal =
  | { kind: "user"; userId: string; role: "ADMIN" | "STUDIO_OWNER" | "STUDIO_MEMBER"; studioId?: string }
  | { kind: "player"; playerId: string; walletAddress: string };
```

```ts
// packages/shared/src/zod/auth.ts
import { z } from "zod";

const stellarPublicKey = z
  .string()
  .regex(/^G[A-Z2-7]{55}$/, "must be a Stellar public key (G..., 56 chars)");

export const LoginInput = z.object({
  username: z.string().min(1).max(64),
  password: z.string().min(1).max(512),
});

export const WalletChallengeInput = z.object({
  walletAddress: stellarPublicKey,
});

export const WalletVerifyInput = z.object({
  walletAddress: stellarPublicKey,
  signature: z.string().min(1).max(2048),
});
```

```ts
// packages/shared/src/dto/auth.ts
import type { Principal } from "../auth";

export type MeDto =
  | { kind: "user"; userId: string; role: "ADMIN" | "STUDIO_OWNER" | "STUDIO_MEMBER"; studioId: string | null }
  | { kind: "player"; playerId: string; walletAddress: string };

export function toMeDto(p: Principal): MeDto {
  if (p.kind === "user") {
    return { kind: "user", userId: p.userId, role: p.role, studioId: p.studioId ?? null };
  }
  return { kind: "player", playerId: p.playerId, walletAddress: p.walletAddress };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @xgamefi/shared test src/zod/auth.test.ts src/dto/auth.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/shared/src/zod/auth.ts packages/shared/src/zod/auth.test.ts packages/shared/src/dto/auth.ts packages/shared/src/dto/auth.test.ts packages/shared/src/auth/index.ts
git commit -m "feat(shared): auth Zod schemas, Principal type, MeDto mapper"
```

---

### Task 6: Password hashing (`apps/web/lib/auth/password`)

**Files:**
- Create: `apps/web/lib/auth/password.ts`
- Test: `apps/web/lib/auth/password.test.ts`

**Interfaces:**
- Consumes: `argon2`.
- Produces:
  ```ts
  function hashPassword(plain: string): Promise<string>           // argon2id
  function verifyPassword(hash: string, plain: string): Promise<boolean>  // never throws
  ```

- [ ] **Step 1: Write the failing test**

```ts
// apps/web/lib/auth/password.test.ts
import { describe, it, expect } from "vitest";
import { hashPassword, verifyPassword } from "./password";

describe("password hashing (argon2id)", () => {
  it("produces an argon2id hash that verifies", async () => {
    const hash = await hashPassword("s3cret");
    expect(hash.startsWith("$argon2id$")).toBe(true);
    expect(await verifyPassword(hash, "s3cret")).toBe(true);
  });
  it("rejects a wrong password", async () => {
    const hash = await hashPassword("s3cret");
    expect(await verifyPassword(hash, "wrong")).toBe(false);
  });
  it("returns false (never throws) on a malformed hash", async () => {
    expect(await verifyPassword("not-a-hash", "x")).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @xgamefi/web test lib/auth/password.test.ts`
Expected: FAIL — `Cannot find module './password'`.

- [ ] **Step 3: Write minimal implementation**

```ts
// apps/web/lib/auth/password.ts
import argon2 from "argon2";

export function hashPassword(plain: string): Promise<string> {
  return argon2.hash(plain, { type: argon2.argon2id });
}

export async function verifyPassword(hash: string, plain: string): Promise<boolean> {
  try {
    return await argon2.verify(hash, plain);
  } catch {
    return false;
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @xgamefi/web test lib/auth/password.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/web/lib/auth/password.ts apps/web/lib/auth/password.test.ts
git commit -m "feat(web): argon2id password hash/verify"
```

---

### Task 7: Web Redis client + rate-limit/backoff (`apps/web/lib/auth/redis`, `/ratelimit`)

**Files:**
- Create: `apps/web/lib/auth/redis.ts`
- Create: `apps/web/lib/auth/ratelimit.ts`
- Test: `apps/web/lib/auth/ratelimit.test.ts` (integration — needs Redis)

**Interfaces:**
- Consumes: `ioredis`, `env.REDIS_URL` from `@xgamefi/config/env`, `rlKey`/`loginFailKey`/`backoffDelaySec` from `@xgamefi/shared/auth`.
- Produces:
  ```ts
  // redis.ts
  const redis: import("ioredis").Redis        // singleton
  // ratelimit.ts
  function rateLimit(args: { scope: string; identifier: string; limit: number; windowSec: number }): Promise<{ allowed: boolean; remaining: number }>
  function registerLoginFailure(username: string): Promise<number>   // returns new failure count
  function clearLoginFailures(username: string): Promise<void>
  function loginBackoffActive(username: string): Promise<boolean>    // true while in backoff window
  ```

- [ ] **Step 1: Write the failing test**

```ts
// apps/web/lib/auth/ratelimit.test.ts
import { describe, it, expect, beforeEach } from "vitest";
import { redis } from "./redis";
import { rateLimit, registerLoginFailure, clearLoginFailures, loginBackoffActive } from "./ratelimit";

describe("redis rate-limit + login backoff", () => {
  beforeEach(async () => { await redis.flushdb(); });

  it("allows up to the limit then blocks within the window", async () => {
    const args = { scope: "test:auth", identifier: "ip-1", limit: 2, windowSec: 60 };
    expect((await rateLimit(args)).allowed).toBe(true);
    expect((await rateLimit(args)).allowed).toBe(true);
    expect((await rateLimit(args)).allowed).toBe(false);
  });

  it("tracks login failures and engages backoff after 3", async () => {
    expect(await loginBackoffActive("admin")).toBe(false);
    await registerLoginFailure("admin");
    await registerLoginFailure("admin");
    await registerLoginFailure("admin");
    expect(await registerLoginFailure("admin")).toBe(4); // 4th failure
    expect(await loginBackoffActive("admin")).toBe(true);
  });

  it("clears failures on success", async () => {
    await registerLoginFailure("admin");
    await registerLoginFailure("admin");
    await registerLoginFailure("admin");
    await registerLoginFailure("admin");
    await clearLoginFailures("admin");
    expect(await loginBackoffActive("admin")).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @xgamefi/web test lib/auth/ratelimit.test.ts`
Expected: FAIL — `Cannot find module './redis'`.

- [ ] **Step 3: Write minimal implementation**

```ts
// apps/web/lib/auth/redis.ts
import Redis from "ioredis";
import { env } from "@xgamefi/config/env";

declare global {
  // eslint-disable-next-line no-var
  var __xgamefi_redis: Redis | undefined;
}

export const redis: Redis = globalThis.__xgamefi_redis ?? new Redis(env.REDIS_URL, { maxRetriesPerRequest: null });
if (process.env.NODE_ENV !== "production") globalThis.__xgamefi_redis = redis;
```

```ts
// apps/web/lib/auth/ratelimit.ts
import { redis } from "./redis";
import { rlKey, loginFailKey, backoffDelaySec } from "@xgamefi/shared/auth";

export async function rateLimit(args: {
  scope: string; identifier: string; limit: number; windowSec: number;
}): Promise<{ allowed: boolean; remaining: number }> {
  const key = rlKey(args.scope, args.identifier);
  const count = await redis.incr(key);
  if (count === 1) await redis.expire(key, args.windowSec);
  const remaining = Math.max(0, args.limit - count);
  return { allowed: count <= args.limit, remaining };
}

export async function registerLoginFailure(username: string): Promise<number> {
  const key = loginFailKey(username);
  const count = await redis.incr(key);
  if (count === 1) await redis.expire(key, 3600);
  else await redis.expire(key, Math.max(3600, backoffDelaySec(count)));
  return count;
}

export async function clearLoginFailures(username: string): Promise<void> {
  await redis.del(loginFailKey(username));
}

export async function loginBackoffActive(username: string): Promise<boolean> {
  const count = Number((await redis.get(loginFailKey(username))) ?? 0);
  return backoffDelaySec(count) > 0;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @xgamefi/web test lib/auth/ratelimit.test.ts` (requires `docker compose up -d redis`)
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/web/lib/auth/redis.ts apps/web/lib/auth/ratelimit.ts apps/web/lib/auth/ratelimit.test.ts
git commit -m "feat(web): Redis client + auth rate-limit and login backoff"
```

---

### Task 8: Session lifecycle (`apps/web/lib/auth/session`)

**Files:**
- Create: `apps/web/lib/auth/session.ts`
- Test: `apps/web/lib/auth/session.test.ts` (integration — needs Postgres + Redis)

**Interfaces:**
- Consumes: `prisma` from `@xgamefi/db`, `redis` from `./redis`, `generateSessionId`/`hashToken` from `@xgamefi/shared/auth`, `cookies()` from `next/headers`, `env`.
- Produces:
  ```ts
  const SESSION_COOKIE = "xgf_session";
  const IDLE_TTL_SEC = 1800;   // 30-min idle expiry
  // Redis-mirrored payload identifying who the session belongs to:
  type SessionSubject = { kind: "user"; userId: string } | { kind: "player"; playerId: string };
  function createSession(args: { subject: SessionSubject; userAgent: string; ip: string }): Promise<{ sessionId: string }>
  function readSession(sessionId: string): Promise<SessionSubject | null>   // null if missing/expired/revoked; slides TTL on hit
  function revokeSession(sessionId: string): Promise<void>                   // sets Session.revokedAt + deletes Redis mirror
  function setSessionCookie(sessionId: string): Promise<void>                // httpOnly+Secure+SameSite=Lax via await cookies()
  function clearSessionCookie(): Promise<void>
  function readSessionCookie(): Promise<string | null>
  ```
- Redis key is `sess:<hashToken(sessionId)>` storing JSON `SessionSubject`; DB `Session.tokenHash = hashToken(sessionId)`. The raw `sessionId` is only ever in the cookie.

- [ ] **Step 1: Write the failing test**

```ts
// apps/web/lib/auth/session.test.ts
import { describe, it, expect, beforeEach } from "vitest";
import { prisma } from "@xgamefi/db";
import { redis } from "./redis";
import { createSession, readSession, revokeSession } from "./session";

describe("session lifecycle", () => {
  let userId: string;
  beforeEach(async () => {
    await redis.flushdb();
    await prisma.session.deleteMany();
    await prisma.user.deleteMany();
    const u = await prisma.user.create({
      data: { username: "sess-user", passwordHash: "x", role: "ADMIN", isActive: true },
    });
    userId = u.id;
  });

  it("creates a session readable via its id, with DB row + Redis mirror", async () => {
    const { sessionId } = await createSession({
      subject: { kind: "user", userId }, userAgent: "vitest", ip: "127.0.0.1",
    });
    expect(await readSession(sessionId)).toEqual({ kind: "user", userId });
    const rows = await prisma.session.findMany({ where: { userId } });
    expect(rows.length).toBe(1);
    expect(rows[0].revokedAt).toBeNull();
  });

  it("returns null for an unknown session id", async () => {
    expect(await readSession("nope")).toBeNull();
  });

  it("revoking a session makes it unreadable and sets revokedAt", async () => {
    const { sessionId } = await createSession({
      subject: { kind: "user", userId }, userAgent: "vitest", ip: "127.0.0.1",
    });
    await revokeSession(sessionId);
    expect(await readSession(sessionId)).toBeNull();
    const row = await prisma.session.findFirst({ where: { userId } });
    expect(row?.revokedAt).not.toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @xgamefi/web test lib/auth/session.test.ts`
Expected: FAIL — `Cannot find module './session'`.

- [ ] **Step 3: Write minimal implementation**

```ts
// apps/web/lib/auth/session.ts
import { cookies } from "next/headers";
import { prisma } from "@xgamefi/db";
import { env } from "@xgamefi/config/env";
import { redis } from "./redis";
import { generateSessionId, hashToken } from "@xgamefi/shared/auth";

export const SESSION_COOKIE = "xgf_session";
export const IDLE_TTL_SEC = 1800;

export type SessionSubject = { kind: "user"; userId: string } | { kind: "player"; playerId: string };

function redisKey(sessionId: string): string {
  return `sess:${hashToken(sessionId)}`;
}

export async function createSession(args: {
  subject: SessionSubject; userAgent: string; ip: string;
}): Promise<{ sessionId: string }> {
  const sessionId = generateSessionId();
  const tokenHash = hashToken(sessionId);
  const expiresAt = new Date(Date.now() + IDLE_TTL_SEC * 1000);
  await prisma.session.create({
    data: {
      tokenHash,
      userAgent: args.userAgent,
      ip: args.ip,
      expiresAt,
      ...(args.subject.kind === "user" ? { userId: args.subject.userId } : { playerId: args.subject.playerId }),
    },
  });
  await redis.set(redisKey(sessionId), JSON.stringify(args.subject), "EX", IDLE_TTL_SEC);
  return { sessionId };
}

export async function readSession(sessionId: string): Promise<SessionSubject | null> {
  const raw = await redis.get(redisKey(sessionId));
  if (!raw) return null;
  // sliding refresh
  await redis.expire(redisKey(sessionId), IDLE_TTL_SEC);
  await prisma.session.updateMany({
    where: { tokenHash: hashToken(sessionId), revokedAt: null },
    data: { expiresAt: new Date(Date.now() + IDLE_TTL_SEC * 1000) },
  });
  return JSON.parse(raw) as SessionSubject;
}

export async function revokeSession(sessionId: string): Promise<void> {
  await redis.del(redisKey(sessionId));
  await prisma.session.updateMany({
    where: { tokenHash: hashToken(sessionId), revokedAt: null },
    data: { revokedAt: new Date() },
  });
}

export async function setSessionCookie(sessionId: string): Promise<void> {
  const jar = await cookies();
  jar.set(SESSION_COOKIE, sessionId, {
    httpOnly: true,
    secure: env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: IDLE_TTL_SEC,
  });
}

export async function clearSessionCookie(): Promise<void> {
  const jar = await cookies();
  jar.delete(SESSION_COOKIE);
}

export async function readSessionCookie(): Promise<string | null> {
  const jar = await cookies();
  return jar.get(SESSION_COOKIE)?.value ?? null;
}
```

> **Schema note:** `Session` in `SPEC.md §5` lists `userId`. Players also need sessions, so the Phase-0 schema's `Session` must allow `playerId?` alongside `userId?` (exactly one set). If Phase 0 did not add `playerId`, Task 14 adds the additive migration. The test above and the code assume `Session.playerId String?` exists.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @xgamefi/web test lib/auth/session.test.ts` (requires `docker compose up -d postgres redis` + `prisma migrate deploy`)
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/web/lib/auth/session.ts apps/web/lib/auth/session.test.ts
git commit -m "feat(web): opaque cookie sessions with Redis mirror + DB row + sliding refresh"
```

---

### Task 9: RBAC guards (`apps/web/lib/auth/guards`)

**Files:**
- Create: `apps/web/lib/auth/guards.ts`
- Create: `apps/web/lib/http.ts`
- Test: `apps/web/lib/auth/guards.test.ts` (integration — needs Postgres + Redis)

**Interfaces:**
- Consumes: `prisma`, `readSession`/`readSessionCookie` from `./session`, `Principal` from `@xgamefi/shared/auth`.
- Produces (exact signatures from canonical-interfaces §Auth):
  ```ts
  class AuthError extends Error { status: 401 | 403 }
  async function getPrincipal(): Promise<Principal | null>            // reads session cookie (await cookies())
  async function requirePrincipal(): Promise<Principal>               // throws AuthError 401
  async function requireRole(...roles: Array<"ADMIN" | "STUDIO_OWNER" | "STUDIO_MEMBER">): Promise<Principal>  // throws 403
  async function requireStudio(studioId: string): Promise<Principal>  // 403 unless ADMIN or member of studioId
  function scopeToStudio(principal: Principal, studioId: string): void // throws 403 unless allowed; call before every studio query
  ```
- `http.ts` produces: `function jsonError(status: number, code: string): Response`, `function jsonOk<T>(data: T, init?: ResponseInit): Response`, `function errorToResponse(e: unknown): Response` (maps `AuthError`→its status; everything else→500 `INTERNAL`, never leaks).

- [ ] **Step 1: Write the failing test**

```ts
// apps/web/lib/auth/guards.test.ts
import { describe, it, expect } from "vitest";
import { scopeToStudio, requireRole, AuthError } from "./guards";
import type { Principal } from "@xgamefi/shared/auth";

const admin: Principal = { kind: "user", userId: "a", role: "ADMIN" };
const owner: Principal = { kind: "user", userId: "o", role: "STUDIO_OWNER", studioId: "stu-1" };
const player: Principal = { kind: "player", playerId: "p", walletAddress: "G..." };

describe("RBAC guards (pure paths)", () => {
  it("scopeToStudio allows ADMIN for any studio", () => {
    expect(() => scopeToStudio(admin, "stu-9")).not.toThrow();
  });
  it("scopeToStudio allows a member of the same studio", () => {
    expect(() => scopeToStudio(owner, "stu-1")).not.toThrow();
  });
  it("scopeToStudio throws 403 for a member of a different studio", () => {
    expect(() => scopeToStudio(owner, "stu-2")).toThrow(AuthError);
    try { scopeToStudio(owner, "stu-2"); } catch (e) { expect((e as AuthError).status).toBe(403); }
  });
  it("scopeToStudio throws 403 for a player", () => {
    expect(() => scopeToStudio(player, "stu-1")).toThrow(AuthError);
  });
});
```

(`getPrincipal/requirePrincipal/requireRole/requireStudio` are exercised end-to-end in the route integration tests, Tasks 10–13, where a cookie/session exists.)

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @xgamefi/web test lib/auth/guards.test.ts`
Expected: FAIL — `Cannot find module './guards'`.

- [ ] **Step 3: Write minimal implementation**

```ts
// apps/web/lib/http.ts
export function jsonOk<T>(data: T, init?: ResponseInit): Response {
  return Response.json({ data }, { status: 200, ...init });
}

export function jsonError(status: number, code: string): Response {
  return Response.json({ error: { code } }, { status });
}
```

```ts
// apps/web/lib/auth/guards.ts
import { prisma } from "@xgamefi/db";
import type { Principal } from "@xgamefi/shared/auth";
import { readSession, readSessionCookie } from "./session";
import { jsonError } from "../http";

export class AuthError extends Error {
  constructor(public status: 401 | 403, public code: string) {
    super(code);
    this.name = "AuthError";
  }
}

export async function getPrincipal(): Promise<Principal | null> {
  const sessionId = await readSessionCookie();
  if (!sessionId) return null;
  const subject = await readSession(sessionId);
  if (!subject) return null;
  if (subject.kind === "user") {
    const u = await prisma.user.findFirst({ where: { id: subject.userId, isActive: true } });
    if (!u) return null;
    return {
      kind: "user",
      userId: u.id,
      role: u.role as "ADMIN" | "STUDIO_OWNER" | "STUDIO_MEMBER",
      studioId: u.studioId ?? undefined,
    };
  }
  const p = await prisma.player.findUnique({ where: { id: subject.playerId } });
  if (!p) return null;
  return { kind: "player", playerId: p.id, walletAddress: p.walletAddress };
}

export async function requirePrincipal(): Promise<Principal> {
  const p = await getPrincipal();
  if (!p) throw new AuthError(401, "UNAUTHENTICATED");
  return p;
}

export async function requireRole(
  ...roles: Array<"ADMIN" | "STUDIO_OWNER" | "STUDIO_MEMBER">
): Promise<Principal> {
  const p = await requirePrincipal();
  if (p.kind !== "user" || !roles.includes(p.role)) throw new AuthError(403, "FORBIDDEN");
  return p;
}

export async function requireStudio(studioId: string): Promise<Principal> {
  const p = await requirePrincipal();
  scopeToStudio(p, studioId);
  return p;
}

export function scopeToStudio(principal: Principal, studioId: string): void {
  if (principal.kind === "user" && principal.role === "ADMIN") return;
  if (principal.kind === "user" && principal.studioId === studioId) return;
  throw new AuthError(403, "FORBIDDEN");
}

export function errorToResponse(e: unknown): Response {
  if (e instanceof AuthError) return jsonError(e.status, e.code);
  return jsonError(500, "INTERNAL");
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @xgamefi/web test lib/auth/guards.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/web/lib/auth/guards.ts apps/web/lib/http.ts apps/web/lib/auth/guards.test.ts
git commit -m "feat(web): central RBAC guards (getPrincipal/requireRole/requireStudio/scopeToStudio) + safe http responses"
```

---

### Task 10: CSRF request enforcement + audit helper (`apps/web/lib/auth/csrf`, `/audit`)

**Files:**
- Create: `apps/web/lib/auth/csrf.ts`
- Create: `apps/web/lib/auth/audit.ts`
- Test: `apps/web/lib/auth/csrf.test.ts`

**Interfaces:**
- Consumes: `isSameOrigin` from `@xgamefi/shared/auth`, `env.APP_BASE_URL`, `prisma`.
- Produces:
  ```ts
  // csrf.ts — request-level guard for cookie-authenticated mutations + Server Actions
  function assertCsrf(req: Request): void   // throws AuthError(403,"CSRF") unless Origin OR Referer is same-origin
  // audit.ts
  function writeAudit(args: {
    actorType: "USER" | "PLAYER" | "ANON";
    actorUserId?: string;
    action: string;
    entityType: string;
    entityId: string;
    ip: string;
    metadata?: Record<string, unknown>;
  }): Promise<void>   // strips any password/secret/token/signature key from metadata
  ```

- [ ] **Step 1: Write the failing test**

```ts
// apps/web/lib/auth/csrf.test.ts
import { describe, it, expect, vi } from "vitest";

vi.mock("@xgamefi/config/env", () => ({ env: { APP_BASE_URL: "http://localhost:3000", NODE_ENV: "test" } }));

import { assertCsrf } from "./csrf";
import { AuthError } from "./guards";

function req(headers: Record<string, string>): Request {
  return new Request("http://localhost:3000/api/v1/auth/logout", { method: "POST", headers });
}

describe("assertCsrf", () => {
  it("passes when Origin is same-origin", () => {
    expect(() => assertCsrf(req({ origin: "http://localhost:3000" }))).not.toThrow();
  });
  it("passes when Referer is same-origin (no Origin)", () => {
    expect(() => assertCsrf(req({ referer: "http://localhost:3000/login" }))).not.toThrow();
  });
  it("throws 403 CSRF on cross-origin Origin", () => {
    try { assertCsrf(req({ origin: "https://evil.com" })); expect.fail(); }
    catch (e) { expect(e).toBeInstanceOf(AuthError); expect((e as AuthError).status).toBe(403); }
  });
  it("throws 403 when neither Origin nor Referer is present", () => {
    expect(() => assertCsrf(req({}))).toThrow(AuthError);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @xgamefi/web test lib/auth/csrf.test.ts`
Expected: FAIL — `Cannot find module './csrf'`.

- [ ] **Step 3: Write minimal implementation**

```ts
// apps/web/lib/auth/csrf.ts
import { isSameOrigin } from "@xgamefi/shared/auth";
import { env } from "@xgamefi/config/env";
import { AuthError } from "./guards";

export function assertCsrf(req: Request): void {
  const origin = req.headers.get("origin");
  const referer = req.headers.get("referer");
  if (isSameOrigin(origin, env.APP_BASE_URL)) return;
  if (isSameOrigin(referer, env.APP_BASE_URL)) return;
  throw new AuthError(403, "CSRF");
}
```

```ts
// apps/web/lib/auth/audit.ts
import { prisma } from "@xgamefi/db";

const REDACT = /pass|secret|token|signature|hash|nonce/i;

function sanitize(meta: Record<string, unknown> | undefined): Record<string, unknown> {
  if (!meta) return {};
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(meta)) out[k] = REDACT.test(k) ? "[redacted]" : v;
  return out;
}

export async function writeAudit(args: {
  actorType: "USER" | "PLAYER" | "ANON";
  actorUserId?: string;
  action: string;
  entityType: string;
  entityId: string;
  ip: string;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  await prisma.auditLog.create({
    data: {
      actorType: args.actorType,
      actorUserId: args.actorUserId,
      action: args.action,
      entityType: args.entityType,
      entityId: args.entityId,
      ip: args.ip,
      metadata: sanitize(args.metadata),
    },
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @xgamefi/web test lib/auth/csrf.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/web/lib/auth/csrf.ts apps/web/lib/auth/audit.ts apps/web/lib/auth/csrf.test.ts
git commit -m "feat(web): CSRF Origin/Referer guard + secret-stripping audit helper"
```

---

### Task 11: `POST /auth/login` + `POST /auth/logout`

**Files:**
- Create: `apps/web/app/api/v1/auth/login/route.ts`
- Create: `apps/web/app/api/v1/auth/logout/route.ts`
- Test: `apps/web/app/api/v1/auth/login/route.test.ts` (integration — Postgres + Redis)

**Interfaces:**
- Consumes: `LoginInput` (`@xgamefi/shared/zod/auth`), `verifyPassword` (`lib/auth/password`), `createSession`/`setSessionCookie`/`readSessionCookie`/`revokeSession`/`clearSessionCookie` (`lib/auth/session`), `rateLimit`/`registerLoginFailure`/`clearLoginFailures`/`loginBackoffActive` (`lib/auth/ratelimit`), `assertCsrf`, `writeAudit`, `getPrincipal`, `errorToResponse`/`jsonOk`/`jsonError`.
- Produces: HTTP endpoints. Login on success → 200 `{ data: { kind:"user", userId, role, studioId } }` + Set-Cookie. Logout → 200 `{ data: { ok: true } }`, cookie cleared. Generic `INVALID_CREDENTIALS` on any failure (no user/password distinction).

- [ ] **Step 1: Write the failing test**

```ts
// apps/web/app/api/v1/auth/login/route.test.ts
import { describe, it, expect, beforeEach } from "vitest";
import { prisma } from "@xgamefi/db";
import { redis } from "../../../../../lib/auth/redis";
import { hashPassword } from "../../../../../lib/auth/password";
import { POST as login } from "./route";

function post(body: unknown): Request {
  return new Request("http://localhost:3000/api/v1/auth/login", {
    method: "POST",
    headers: { "content-type": "application/json", origin: "http://localhost:3000" },
    body: JSON.stringify(body),
  });
}

describe("POST /auth/login", () => {
  beforeEach(async () => {
    await redis.flushdb();
    await prisma.session.deleteMany();
    await prisma.auditLog.deleteMany();
    await prisma.user.deleteMany();
    await prisma.user.create({
      data: { username: "admin", passwordHash: await hashPassword("correct-horse"), role: "ADMIN", isActive: true },
    });
  });

  it("logs in a valid admin and sets a session cookie", async () => {
    const res = await login(post({ username: "admin", password: "correct-horse" }));
    expect(res.status).toBe(200);
    expect(res.headers.get("set-cookie")).toMatch(/xgf_session=/);
    expect(res.headers.get("set-cookie")).toMatch(/HttpOnly/i);
    expect(res.headers.get("set-cookie")).toMatch(/SameSite=Lax/i);
    const body = await res.json();
    expect(body.data.role).toBe("ADMIN");
    const audits = await prisma.auditLog.findMany({ where: { action: "auth.login.success" } });
    expect(audits.length).toBe(1);
  });

  it("rejects a wrong password with generic INVALID_CREDENTIALS (no cookie)", async () => {
    const res = await login(post({ username: "admin", password: "nope" }));
    expect(res.status).toBe(401);
    expect((await res.json()).error.code).toBe("INVALID_CREDENTIALS");
    expect(res.headers.get("set-cookie")).toBeNull();
  });

  it("rejects an unknown user with the same generic error", async () => {
    const res = await login(post({ username: "ghost", password: "x" }));
    expect(res.status).toBe(401);
    expect((await res.json()).error.code).toBe("INVALID_CREDENTIALS");
  });

  it("returns 400 on a malformed body", async () => {
    const res = await login(post({ username: "" }));
    expect(res.status).toBe(400);
  });

  it("blocks cross-origin requests (CSRF)", async () => {
    const req = new Request("http://localhost:3000/api/v1/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json", origin: "https://evil.com" },
      body: JSON.stringify({ username: "admin", password: "correct-horse" }),
    });
    const res = await login(req);
    expect(res.status).toBe(403);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @xgamefi/web test app/api/v1/auth/login/route.test.ts`
Expected: FAIL — `Cannot find module './route'`.

- [ ] **Step 3: Write minimal implementation**

```ts
// apps/web/app/api/v1/auth/login/route.ts
import { LoginInput } from "@xgamefi/shared/zod/auth";
import { toMeDto } from "@xgamefi/shared/dto/auth";
import { prisma } from "@xgamefi/db";
import { verifyPassword } from "../../../../../lib/auth/password";
import { createSession, setSessionCookie } from "../../../../../lib/auth/session";
import { assertCsrf } from "../../../../../lib/auth/csrf";
import { rateLimit, registerLoginFailure, clearLoginFailures, loginBackoffActive } from "../../../../../lib/auth/ratelimit";
import { writeAudit } from "../../../../../lib/auth/audit";
import { jsonOk, jsonError, errorToResponse } from "../../../../../lib/http";

function clientIp(req: Request): string {
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "0.0.0.0";
}

export async function POST(req: Request): Promise<Response> {
  try {
    assertCsrf(req);
    const ip = clientIp(req);
    const rl = await rateLimit({ scope: "auth:login", identifier: ip, limit: 10, windowSec: 60 });
    if (!rl.allowed) return jsonError(429, "RATE_LIMITED");

    const parsed = LoginInput.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return jsonError(400, "INVALID_INPUT");
    const { username, password } = parsed.data;

    if (await loginBackoffActive(username)) return jsonError(429, "TOO_MANY_ATTEMPTS");

    const user = await prisma.user.findUnique({ where: { username } });
    const ok = user && user.isActive && (await verifyPassword(user.passwordHash, password));
    if (!user || !ok) {
      await registerLoginFailure(username);
      await writeAudit({ actorType: "ANON", action: "auth.login.failure", entityType: "User", entityId: username, ip });
      return jsonError(401, "INVALID_CREDENTIALS");
    }

    await clearLoginFailures(username);
    const { sessionId } = await createSession({
      subject: { kind: "user", userId: user.id },
      userAgent: req.headers.get("user-agent") ?? "",
      ip,
    });
    await setSessionCookie(sessionId);
    await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
    await writeAudit({ actorType: "USER", actorUserId: user.id, action: "auth.login.success", entityType: "User", entityId: user.id, ip });

    return jsonOk(
      toMeDto({ kind: "user", userId: user.id, role: user.role as "ADMIN" | "STUDIO_OWNER" | "STUDIO_MEMBER", studioId: user.studioId ?? undefined }),
    );
  } catch (e) {
    return errorToResponse(e);
  }
}
```

```ts
// apps/web/app/api/v1/auth/logout/route.ts
import { assertCsrf } from "../../../../../lib/auth/csrf";
import { readSessionCookie, revokeSession, clearSessionCookie } from "../../../../../lib/auth/session";
import { getPrincipal } from "../../../../../lib/auth/guards";
import { writeAudit } from "../../../../../lib/auth/audit";
import { jsonOk, errorToResponse } from "../../../../../lib/http";

export async function POST(req: Request): Promise<Response> {
  try {
    assertCsrf(req);
    const principal = await getPrincipal();
    const sessionId = await readSessionCookie();
    if (sessionId) await revokeSession(sessionId);
    await clearSessionCookie();
    if (principal) {
      const id = principal.kind === "user" ? principal.userId : principal.playerId;
      await writeAudit({
        actorType: principal.kind === "user" ? "USER" : "PLAYER",
        actorUserId: principal.kind === "user" ? principal.userId : undefined,
        action: "auth.logout",
        entityType: "Session",
        entityId: id,
        ip: req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "0.0.0.0",
      });
    }
    return jsonOk({ ok: true });
  } catch (e) {
    return errorToResponse(e);
  }
}
```

> Add `errorToResponse` to `apps/web/lib/http.ts` if not already present (it was defined in Task 9's `guards.ts`; move/re-export it from `http.ts` so handlers import it from one place):
> ```ts
> // apps/web/lib/http.ts (append)
> import { AuthError } from "./auth/guards";
> export function errorToResponse(e: unknown): Response {
>   if (e instanceof AuthError) return jsonError(e.status, e.code);
>   return jsonError(500, "INTERNAL");
> }
> ```
> and remove the duplicate `errorToResponse` from `guards.ts` to keep one definition (DRY).

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @xgamefi/web test app/api/v1/auth/login/route.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/web/app/api/v1/auth/login/route.ts apps/web/app/api/v1/auth/logout/route.ts apps/web/app/api/v1/auth/login/route.test.ts apps/web/lib/http.ts apps/web/lib/auth/guards.ts
git commit -m "feat(web): /auth/login + /auth/logout (rate-limit, backoff, CSRF, audit)"
```

---

### Task 12: `GET /auth/me`

**Files:**
- Create: `apps/web/app/api/v1/auth/me/route.ts`
- Test: `apps/web/app/api/v1/auth/me/route.test.ts` (integration)

**Interfaces:**
- Consumes: `requirePrincipal` (`lib/auth/guards`), `toMeDto` (`@xgamefi/shared/dto/auth`), `errorToResponse`/`jsonOk`.
- Produces: GET → 200 `{ data: MeDto }` for a valid session (user or player); 401 otherwise.

- [ ] **Step 1: Write the failing test**

```ts
// apps/web/app/api/v1/auth/me/route.test.ts
import { describe, it, expect, beforeEach, vi } from "vitest";
import { prisma } from "@xgamefi/db";
import { redis } from "../../../../../lib/auth/redis";
import { createSession } from "../../../../../lib/auth/session";

// Mock the cookie jar so getPrincipal reads our test session id.
let cookieValue: string | null = null;
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (n: string) => (n === "xgf_session" && cookieValue ? { value: cookieValue } : undefined),
    set: () => {}, delete: () => {},
  }),
}));

import { GET as me } from "./route";

describe("GET /auth/me", () => {
  beforeEach(async () => {
    await redis.flushdb();
    await prisma.session.deleteMany();
    await prisma.user.deleteMany();
    cookieValue = null;
  });

  it("returns 401 with no session", async () => {
    const res = await me(new Request("http://localhost:3000/api/v1/auth/me"));
    expect(res.status).toBe(401);
  });

  it("returns the principal for a valid user session", async () => {
    const u = await prisma.user.create({ data: { username: "me-user", passwordHash: "x", role: "STUDIO_OWNER", studioId: "stu-1", isActive: true } });
    const { sessionId } = await createSession({ subject: { kind: "user", userId: u.id }, userAgent: "v", ip: "127.0.0.1" });
    cookieValue = sessionId;
    const res = await me(new Request("http://localhost:3000/api/v1/auth/me"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toEqual({ kind: "user", userId: u.id, role: "STUDIO_OWNER", studioId: "stu-1" });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @xgamefi/web test app/api/v1/auth/me/route.test.ts`
Expected: FAIL — `Cannot find module './route'`.

- [ ] **Step 3: Write minimal implementation**

```ts
// apps/web/app/api/v1/auth/me/route.ts
import { requirePrincipal } from "../../../../../lib/auth/guards";
import { toMeDto } from "@xgamefi/shared/dto/auth";
import { jsonOk, errorToResponse } from "../../../../../lib/http";

export async function GET(_req: Request): Promise<Response> {
  try {
    const principal = await requirePrincipal();
    return jsonOk(toMeDto(principal));
  } catch (e) {
    return errorToResponse(e);
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @xgamefi/web test app/api/v1/auth/me/route.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/web/app/api/v1/auth/me/route.ts apps/web/app/api/v1/auth/me/route.test.ts
git commit -m "feat(web): /auth/me current principal"
```

---

### Task 13: Wallet auth — `POST /auth/wallet/challenge` + `POST /auth/wallet/verify`

**Files:**
- Create: `apps/web/app/api/v1/auth/wallet/challenge/route.ts`
- Create: `apps/web/app/api/v1/auth/wallet/verify/route.ts`
- Test: `apps/web/app/api/v1/auth/wallet/verify/route.test.ts` (integration)

**Interfaces:**
- Consumes: `WalletChallengeInput`/`WalletVerifyInput` (`@xgamefi/shared/zod/auth`), `generateNonce`/`verifyWalletSignature` (`@xgamefi/shared/auth`), `prisma` (`AuthChallenge`, `Player`), `createSession`/`setSessionCookie`, `assertCsrf`, `rateLimit`, `writeAudit`, `toMeDto`.
- Produces:
  - challenge → 200 `{ data: { nonce } }`; creates a one-time, time-boxed (`expiresAt = now+5min`, `usedAt=null`) `AuthChallenge` for the wallet. Rate-limited per wallet+ip.
  - verify → verifies signature over `challengeMessage(walletAddress, nonce)`; the nonce must be the latest unused, unexpired challenge for that wallet; marks it `usedAt`; upserts `Player`; creates a player session; returns `{ data: MeDto(player) }` + cookie. Generic `INVALID_SIGNATURE` on any failure.

- [ ] **Step 1: Write the failing test**

```ts
// apps/web/app/api/v1/auth/wallet/verify/route.test.ts
import { describe, it, expect, beforeEach } from "vitest";
import { Keypair } from "@stellar/stellar-sdk";
import { prisma } from "@xgamefi/db";
import { redis } from "../../../../../../lib/auth/redis";
import { challengeMessage } from "@xgamefi/shared/auth";
import { POST as challenge } from "../challenge/route";
import { POST as verify } from "./route";

const HDRS = { "content-type": "application/json", origin: "http://localhost:3000" };
function post(path: string, body: unknown): Request {
  return new Request(`http://localhost:3000${path}`, { method: "POST", headers: HDRS, body: JSON.stringify(body) });
}

describe("wallet auth", () => {
  beforeEach(async () => {
    await redis.flushdb();
    await prisma.session.deleteMany();
    await prisma.authChallenge.deleteMany();
    await prisma.player.deleteMany();
  });

  it("issues a nonce then verifies a valid signature → player session + Player row", async () => {
    const kp = Keypair.random();
    const cRes = await challenge(post("/api/v1/auth/wallet/challenge", { walletAddress: kp.publicKey() }));
    expect(cRes.status).toBe(200);
    const { nonce } = (await cRes.json()).data;

    const sig = kp.sign(Buffer.from(challengeMessage(kp.publicKey(), nonce), "utf8")).toString("base64");
    const vRes = await verify(post("/api/v1/auth/wallet/verify", { walletAddress: kp.publicKey(), signature: sig }));
    expect(vRes.status).toBe(200);
    expect(vRes.headers.get("set-cookie")).toMatch(/xgf_session=/);
    const body = await vRes.json();
    expect(body.data.kind).toBe("player");
    expect(body.data.walletAddress).toBe(kp.publicKey());

    const player = await prisma.player.findUnique({ where: { walletAddress: kp.publicKey() } });
    expect(player).not.toBeNull();
    const used = await prisma.authChallenge.findFirst({ where: { walletAddress: kp.publicKey() } });
    expect(used?.usedAt).not.toBeNull();
  });

  it("rejects a bad signature with INVALID_SIGNATURE", async () => {
    const kp = Keypair.random();
    const cRes = await challenge(post("/api/v1/auth/wallet/challenge", { walletAddress: kp.publicKey() }));
    await cRes.json();
    const wrong = Keypair.random();
    const sig = wrong.sign(Buffer.from("x", "utf8")).toString("base64");
    const vRes = await verify(post("/api/v1/auth/wallet/verify", { walletAddress: kp.publicKey(), signature: sig }));
    expect(vRes.status).toBe(401);
    expect((await vRes.json()).error.code).toBe("INVALID_SIGNATURE");
  });

  it("rejects reuse of an already-used nonce", async () => {
    const kp = Keypair.random();
    const { nonce } = (await (await challenge(post("/api/v1/auth/wallet/challenge", { walletAddress: kp.publicKey() }))).json()).data;
    const sig = kp.sign(Buffer.from(challengeMessage(kp.publicKey(), nonce), "utf8")).toString("base64");
    await verify(post("/api/v1/auth/wallet/verify", { walletAddress: kp.publicKey(), signature: sig }));
    const second = await verify(post("/api/v1/auth/wallet/verify", { walletAddress: kp.publicKey(), signature: sig }));
    expect(second.status).toBe(401);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @xgamefi/web test app/api/v1/auth/wallet/verify/route.test.ts`
Expected: FAIL — `Cannot find module './route'` (and `../challenge/route`).

- [ ] **Step 3: Write minimal implementation**

```ts
// apps/web/app/api/v1/auth/wallet/challenge/route.ts
import { WalletChallengeInput } from "@xgamefi/shared/zod/auth";
import { generateNonce } from "@xgamefi/shared/auth";
import { prisma } from "@xgamefi/db";
import { assertCsrf } from "../../../../../../lib/auth/csrf";
import { rateLimit } from "../../../../../../lib/auth/ratelimit";
import { jsonOk, jsonError, errorToResponse } from "../../../../../../lib/http";

const CHALLENGE_TTL_MS = 5 * 60 * 1000;

export async function POST(req: Request): Promise<Response> {
  try {
    assertCsrf(req);
    const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "0.0.0.0";
    const rl = await rateLimit({ scope: "auth:wallet:challenge", identifier: ip, limit: 20, windowSec: 60 });
    if (!rl.allowed) return jsonError(429, "RATE_LIMITED");

    const parsed = WalletChallengeInput.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return jsonError(400, "INVALID_INPUT");

    const nonce = generateNonce();
    await prisma.authChallenge.create({
      data: {
        walletAddress: parsed.data.walletAddress,
        nonce,
        expiresAt: new Date(Date.now() + CHALLENGE_TTL_MS),
      },
    });
    return jsonOk({ nonce });
  } catch (e) {
    return errorToResponse(e);
  }
}
```

```ts
// apps/web/app/api/v1/auth/wallet/verify/route.ts
import { WalletVerifyInput } from "@xgamefi/shared/zod/auth";
import { verifyWalletSignature } from "@xgamefi/shared/auth";
import { toMeDto } from "@xgamefi/shared/dto/auth";
import { prisma } from "@xgamefi/db";
import { assertCsrf } from "../../../../../../lib/auth/csrf";
import { rateLimit } from "../../../../../../lib/auth/ratelimit";
import { createSession, setSessionCookie } from "../../../../../../lib/auth/session";
import { writeAudit } from "../../../../../../lib/auth/audit";
import { jsonOk, jsonError, errorToResponse } from "../../../../../../lib/http";

export async function POST(req: Request): Promise<Response> {
  try {
    assertCsrf(req);
    const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "0.0.0.0";
    const rl = await rateLimit({ scope: "auth:wallet:verify", identifier: ip, limit: 20, windowSec: 60 });
    if (!rl.allowed) return jsonError(429, "RATE_LIMITED");

    const parsed = WalletVerifyInput.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return jsonError(400, "INVALID_INPUT");
    const { walletAddress, signature } = parsed.data;

    const challenge = await prisma.authChallenge.findFirst({
      where: { walletAddress, usedAt: null, expiresAt: { gt: new Date() } },
      orderBy: { createdAt: "desc" },
    });
    if (!challenge) return jsonError(401, "INVALID_SIGNATURE");

    const valid = verifyWalletSignature({ walletAddress, nonce: challenge.nonce, signatureBase64: signature });
    if (!valid) {
      await writeAudit({ actorType: "ANON", action: "auth.wallet.failure", entityType: "Player", entityId: walletAddress, ip });
      return jsonError(401, "INVALID_SIGNATURE");
    }

    // Single-use: atomically claim the nonce; if 0 rows updated, it was already used.
    const claimed = await prisma.authChallenge.updateMany({
      where: { id: challenge.id, usedAt: null },
      data: { usedAt: new Date() },
    });
    if (claimed.count === 0) return jsonError(401, "INVALID_SIGNATURE");

    const player = await prisma.player.upsert({
      where: { walletAddress },
      update: {},
      create: { walletAddress },
    });

    const { sessionId } = await createSession({
      subject: { kind: "player", playerId: player.id },
      userAgent: req.headers.get("user-agent") ?? "",
      ip,
    });
    await setSessionCookie(sessionId);
    await writeAudit({ actorType: "PLAYER", action: "auth.wallet.success", entityType: "Player", entityId: player.id, ip });

    return jsonOk(toMeDto({ kind: "player", playerId: player.id, walletAddress: player.walletAddress }));
  } catch (e) {
    return errorToResponse(e);
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @xgamefi/web test app/api/v1/auth/wallet/verify/route.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/web/app/api/v1/auth/wallet/challenge/route.ts apps/web/app/api/v1/auth/wallet/verify/route.ts apps/web/app/api/v1/auth/wallet/verify/route.test.ts
git commit -m "feat(web): wallet challenge/verify (one-time nonce, server-side Freighter verify, player session)"
```

---

### Task 14: `Session.playerId` additive migration

**Files:**
- Create: `packages/db/prisma/migrations/<timestamp>_session_player_and_auth_indexes/migration.sql`
- Modify: `packages/db/prisma/schema.prisma` (add `playerId String?` + relation + index on `Session`; index `AuthChallenge(walletAddress, usedAt, expiresAt)`)
- Test: `packages/db/prisma/migrations/migration.test.ts` (smoke — applies and queries)

**Interfaces:**
- Consumes: existing Phase-0 schema.
- Produces: `Session.playerId` nullable FK to `Player`; supporting indexes. **No data loss; additive only.** If Phase 0 already added `Session.playerId`, this task reduces to the index-only migration.

- [ ] **Step 1: Write the failing test**

```ts
// packages/db/prisma/migrations/migration.test.ts
import { describe, it, expect } from "vitest";
import { prisma } from "../../src/index"; // @xgamefi/db client entry

describe("Session.playerId migration", () => {
  it("allows creating a player-bound session row", async () => {
    const player = await prisma.player.create({ data: { walletAddress: "G" + "B".repeat(55) } });
    const sess = await prisma.session.create({
      data: { tokenHash: "h-" + Date.now(), userAgent: "t", ip: "127.0.0.1", expiresAt: new Date(Date.now() + 1000), playerId: player.id },
    });
    expect(sess.playerId).toBe(player.id);
    expect(sess.userId).toBeNull();
    await prisma.session.delete({ where: { id: sess.id } });
    await prisma.player.delete({ where: { id: player.id } });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @xgamefi/db test prisma/migrations/migration.test.ts`
Expected: FAIL — `Unknown arg 'playerId' in data.playerId` (column does not exist).

- [ ] **Step 3: Write minimal implementation**

```prisma
// packages/db/prisma/schema.prisma — Session model (add playerId + relation + indexes)
model Session {
  id        String    @id @default(uuid())
  userId    String?
  user      User?     @relation(fields: [userId], references: [id])
  playerId  String?
  player    Player?   @relation(fields: [playerId], references: [id])
  tokenHash String    @unique
  userAgent String
  ip        String
  expiresAt DateTime
  revokedAt DateTime?
  createdAt DateTime  @default(now())

  @@index([userId])
  @@index([playerId])
}
```

Add the back-relation on `Player`:
```prisma
// in model Player { ... }
  sessions  Session[]
```

Generate the migration:
```bash
pnpm --filter @xgamefi/db prisma migrate dev --name session_player_and_auth_indexes --create-only
```

Then ensure the generated `migration.sql` includes (edit if Prisma omits the index):
```sql
-- AddColumn
ALTER TABLE "Session" ADD COLUMN "playerId" TEXT;
-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_playerId_fkey"
  FOREIGN KEY ("playerId") REFERENCES "Player"("id") ON DELETE SET NULL ON UPDATE CASCADE;
-- Indexes
CREATE INDEX "Session_playerId_idx" ON "Session"("playerId");
CREATE INDEX "AuthChallenge_lookup_idx" ON "AuthChallenge"("walletAddress", "usedAt", "expiresAt");
```

Apply + regenerate:
```bash
pnpm --filter @xgamefi/db prisma migrate deploy
pnpm --filter @xgamefi/db prisma generate
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @xgamefi/db test prisma/migrations/migration.test.ts`
Expected: PASS (1 test).

- [ ] **Step 5: Commit**

```bash
git add packages/db/prisma/schema.prisma packages/db/prisma/migrations packages/db/prisma/migrations/migration.test.ts
git commit -m "feat(db): Session.playerId for wallet sessions + auth lookup indexes"
```

---

### Task 15: `proxy.ts` coarse auth gate + security headers

**Files:**
- Create: `apps/web/proxy.ts`
- Test: `apps/web/proxy.test.ts`

**Interfaces:**
- Consumes: `SESSION_COOKIE` from `lib/auth/session` (constant only — no DB/Redis in proxy).
- Produces: a Next 16 proxy that (a) redirects unauthenticated requests for protected page prefixes (`/admin`, `/dashboard`) to `/login` based **only on cookie presence** (coarse), (b) sets security headers (CSP, HSTS, `X-Content-Type-Options`, `Referrer-Policy`, frame-ancestors) on responses. **Explicit comment that this is NOT the authoritative auth check** — every handler/action re-checks via guards.

- [ ] **Step 1: Write the failing test**

```ts
// apps/web/proxy.test.ts
import { describe, it, expect } from "vitest";
import { NextRequest } from "next/server";
import proxy from "./proxy";

function req(path: string, cookie?: string): NextRequest {
  const headers = new Headers();
  if (cookie) headers.set("cookie", cookie);
  return new NextRequest(new URL(`http://localhost:3000${path}`), { headers });
}

describe("proxy coarse auth gate", () => {
  it("redirects an unauthenticated /dashboard request to /login", () => {
    const res = proxy(req("/dashboard"));
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toContain("/login");
  });

  it("lets a cookie-bearing request through to /dashboard (coarse only)", () => {
    const res = proxy(req("/dashboard", "xgf_session=abc"));
    expect(res.status).toBe(200);
  });

  it("does not gate public storefront routes", () => {
    const res = proxy(req("/s/gridlock"));
    expect(res.status).toBe(200);
  });

  it("sets security headers", () => {
    const res = proxy(req("/s/gridlock"));
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
    expect(res.headers.get("referrer-policy")).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @xgamefi/web test proxy.test.ts`
Expected: FAIL — `Cannot find module './proxy'`.

- [ ] **Step 3: Write minimal implementation**

```ts
// apps/web/proxy.ts
// COARSE auth gate ONLY. This is defense-in-depth, NOT the authoritative check.
// Every route handler / Server Action MUST independently re-verify authZ via
// lib/auth/guards (Next has shipped middleware/proxy bypass CVEs — never trust this alone).
import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE } from "./lib/auth/session";

const PROTECTED_PREFIXES = ["/admin", "/dashboard"];

function withSecurityHeaders(res: NextResponse): NextResponse {
  res.headers.set("X-Content-Type-Options", "nosniff");
  res.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  res.headers.set("Strict-Transport-Security", "max-age=63072000; includeSubDomains; preload");
  res.headers.set("Content-Security-Policy", "frame-ancestors 'none'; default-src 'self'");
  return res;
}

export default function proxy(req: NextRequest): NextResponse {
  const { pathname } = req.nextUrl;
  const isProtected = PROTECTED_PREFIXES.some((p) => pathname === p || pathname.startsWith(p + "/"));
  if (isProtected && !req.cookies.get(SESSION_COOKIE)) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", pathname);
    return withSecurityHeaders(NextResponse.redirect(url));
  }
  return withSecurityHeaders(NextResponse.next());
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico).*)"],
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @xgamefi/web test proxy.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/web/proxy.ts apps/web/proxy.test.ts
git commit -m "feat(web): proxy.ts coarse auth gate + security headers (not the sole check)"
```

---

### Task 16: `/login` page (BRAND.md styling)

**Files:**
- Create: `apps/web/app/(auth)/login/page.tsx`
- Create: `apps/web/app/(auth)/login/login-form.tsx`
- Test: `apps/web/app/(auth)/login/login-form.test.tsx` (component test, vitest + @testing-library/react)

**Interfaces:**
- Consumes: `getPrincipal` (`lib/auth/guards`) for the server component redirect-if-already-authed; posts to `/auth/login`.
- Produces: a Server Component page that renders the client `LoginForm`. On successful login the form redirects to `?next` or `/dashboard` (admins land on `/admin`, studios on `/dashboard` — resolved from the `/auth/login` response `role`). Terminal-style inputs, lime CTA, mono uppercase labels (BRAND.md §7).

- [ ] **Step 1: Write the failing test**

```tsx
// apps/web/app/(auth)/login/login-form.test.tsx
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { LoginForm } from "./login-form";

describe("LoginForm", () => {
  beforeEach(() => { vi.restoreAllMocks(); });

  it("renders username + password fields and a submit button", () => {
    render(<LoginForm />);
    expect(screen.getByLabelText(/username/i)).toBeTruthy();
    expect(screen.getByLabelText(/password/i)).toBeTruthy();
    expect(screen.getByRole("button", { name: /sign in/i })).toBeTruthy();
  });

  it("shows an error message when /auth/login returns 401", async () => {
    vi.stubGlobal("fetch", vi.fn(async () =>
      new Response(JSON.stringify({ error: { code: "INVALID_CREDENTIALS" } }), { status: 401 })));
    render(<LoginForm />);
    fireEvent.change(screen.getByLabelText(/username/i), { target: { value: "admin" } });
    fireEvent.change(screen.getByLabelText(/password/i), { target: { value: "bad" } });
    fireEvent.click(screen.getByRole("button", { name: /sign in/i }));
    await waitFor(() => expect(screen.getByText(/incorrect username or password/i)).toBeTruthy());
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @xgamefi/web test app/(auth)/login/login-form.test.tsx`
Expected: FAIL — `Cannot find module './login-form'`.

- [ ] **Step 3: Write minimal implementation**

```tsx
// apps/web/app/(auth)/login/login-form.tsx
"use client";
import { useState } from "react";

export function LoginForm() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setPending(true);
    setError(null);
    const res = await fetch("/api/v1/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ username, password }),
    });
    setPending(false);
    if (!res.ok) {
      setError("Incorrect username or password.");
      return;
    }
    const { data } = await res.json();
    const next = new URLSearchParams(window.location.search).get("next");
    window.location.href = next ?? (data.role === "ADMIN" ? "/admin" : "/dashboard");
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-6">
      <label className="flex flex-col gap-1">
        <span className="font-mono text-xs uppercase tracking-[0.1em] text-on-surface-variant">Username</span>
        <input
          name="username" autoComplete="username" value={username}
          onChange={(e) => setUsername(e.target.value)}
          className="bg-transparent border-b-2 border-outline-variant focus:border-primary-fixed focus:outline-none py-2 text-on-surface font-mono"
        />
      </label>
      <label className="flex flex-col gap-1">
        <span className="font-mono text-xs uppercase tracking-[0.1em] text-on-surface-variant">Password</span>
        <input
          name="password" type="password" autoComplete="current-password" value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="bg-transparent border-b-2 border-outline-variant focus:border-primary-fixed focus:outline-none py-2 text-on-surface font-mono"
        />
      </label>
      {error && <p role="alert" className="text-error font-mono text-xs uppercase tracking-[0.1em]">{error}</p>}
      <button
        type="submit" disabled={pending}
        className="bg-primary-fixed text-on-primary-fixed font-mono text-xs uppercase tracking-[0.1em] py-3 active:scale-95 disabled:opacity-50"
      >
        {pending ? "Authenticating…" : "Sign in"}
      </button>
    </form>
  );
}
```

```tsx
// apps/web/app/(auth)/login/page.tsx
import { redirect } from "next/navigation";
import { getPrincipal } from "../../../lib/auth/guards";
import { LoginForm } from "./login-form";

export default async function LoginPage() {
  const principal = await getPrincipal();
  if (principal?.kind === "user") redirect(principal.role === "ADMIN" ? "/admin" : "/dashboard");

  return (
    <main className="min-h-screen flex items-center justify-center bg-background px-margin-mobile">
      <section className="w-full max-w-md border-2 border-outline-variant bg-surface-container-low p-8">
        <h1 className="font-display text-2xl font-semibold italic text-on-surface mb-1">xGameFi</h1>
        <p className="font-mono text-xs uppercase tracking-[0.1em] text-primary-fixed mb-8">Operator access</p>
        <LoginForm />
      </section>
    </main>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @xgamefi/web test app/(auth)/login/login-form.test.tsx`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add "apps/web/app/(auth)/login/page.tsx" "apps/web/app/(auth)/login/login-form.tsx" "apps/web/app/(auth)/login/login-form.test.tsx"
git commit -m "feat(web): /login page (BRAND styling) for admin & studio users"
```

---

### Task 17: Phase acceptance — full-suite + acceptance-gate integration test

**Files:**
- Create: `apps/web/app/api/v1/auth/acceptance.test.ts` (integration — Postgres + Redis)

**Interfaces:**
- Consumes: all auth route handlers + `challengeMessage`.
- Produces: the Phase-1 acceptance gate as an executable test: **admin logs in (cookie session); player signs Freighter challenge → player session.**

- [ ] **Step 1: Write the failing test**

```ts
// apps/web/app/api/v1/auth/acceptance.test.ts
import { describe, it, expect, beforeEach } from "vitest";
import { Keypair } from "@stellar/stellar-sdk";
import { prisma } from "@xgamefi/db";
import { redis } from "../../../../lib/auth/redis";
import { hashPassword } from "../../../../lib/auth/password";
import { challengeMessage } from "@xgamefi/shared/auth";
import { POST as login } from "./login/route";
import { POST as walletChallenge } from "./wallet/challenge/route";
import { POST as walletVerify } from "./wallet/verify/route";

const HDRS = { "content-type": "application/json", origin: "http://localhost:3000" };
const post = (path: string, body: unknown) =>
  new Request(`http://localhost:3000${path}`, { method: "POST", headers: HDRS, body: JSON.stringify(body) });

describe("Phase 1 acceptance gate", () => {
  beforeEach(async () => {
    await redis.flushdb();
    await prisma.session.deleteMany();
    await prisma.authChallenge.deleteMany();
    await prisma.player.deleteMany();
    await prisma.user.deleteMany();
    await prisma.user.create({ data: { username: "admin", passwordHash: await hashPassword("pw"), role: "ADMIN", isActive: true } });
  });

  it("admin logs in and receives a cookie session", async () => {
    const res = await login(post("/api/v1/auth/login", { username: "admin", password: "pw" }));
    expect(res.status).toBe(200);
    expect(res.headers.get("set-cookie")).toMatch(/xgf_session=.*HttpOnly/i);
  });

  it("player signs the Freighter challenge and receives a player session", async () => {
    const kp = Keypair.random();
    const { nonce } = (await (await walletChallenge(post("/api/v1/auth/wallet/challenge", { walletAddress: kp.publicKey() }))).json()).data;
    const sig = kp.sign(Buffer.from(challengeMessage(kp.publicKey(), nonce), "utf8")).toString("base64");
    const res = await walletVerify(post("/api/v1/auth/wallet/verify", { walletAddress: kp.publicKey(), signature: sig }));
    expect(res.status).toBe(200);
    expect(res.headers.get("set-cookie")).toMatch(/xgf_session=/);
    expect((await res.json()).data.kind).toBe("player");
  });
});
```

- [ ] **Step 2: Run test to verify it fails (then passes once services are up)**

Run: `pnpm --filter @xgamefi/web test app/api/v1/auth/acceptance.test.ts`
Expected: First run without services FAILS (connection error). With `docker compose up -d postgres redis` + `prisma migrate deploy`, it PASSES (2 tests). This is the acceptance proof.

- [ ] **Step 3: Run the full phase suite + typecheck + lint**

Run:
```bash
pnpm --filter @xgamefi/shared test
pnpm --filter @xgamefi/web test
pnpm -w exec tsc --noEmit
pnpm -w lint
```
Expected: all PASS / green. (No new code in this step — it is the gate.)

- [ ] **Step 4: Confirm acceptance criteria**

Verify: admin login returns a `HttpOnly; Secure(in prod); SameSite=Lax` cookie session; player challenge→verify returns a player session; `/auth/me` reflects each; `/auth/logout` revokes; cross-origin mutations are 403; repeated bad logins back off; `AuditLog` rows exist for success/failure with no secrets.

- [ ] **Step 5: Commit**

```bash
git add apps/web/app/api/v1/auth/acceptance.test.ts
git commit -m "test(web): Phase 1 acceptance gate — admin cookie session + player wallet session"
```

---

## Self-Review

**1. Spec coverage**

| Requirement (SPEC §2/§6/§7, AGENT §7, canonical-interfaces) | Task(s) |
| --- | --- |
| `POST /auth/login` (argon2id verify, rate-limited) | 6, 7, 11 |
| `POST /auth/logout` (revoke) | 11 |
| `GET /auth/me` (current principal, session/wallet) | 12 |
| `POST /auth/wallet/challenge` (`{walletAddress}`→`{nonce}`, one-time time-boxed `AuthChallenge`) | 2, 13 |
| `POST /auth/wallet/verify` (verify Freighter sig server-side over nonce → player session) | 2, 13 |
| Opaque session id, httpOnly+Secure+SameSite=Lax cookie | 8 |
| Redis mirror + `Session` DB row; revocation/audit | 8 |
| Short idle expiry + sliding refresh | 8 |
| `getPrincipal/requirePrincipal/requireRole/requireStudio/scopeToStudio` (exact signatures) | 5 (type), 9 |
| Central RBAC mapping ADMIN/STUDIO_OWNER/STUDIO_MEMBER/PLAYER → resources | 9 |
| Studio queries re-scoped by `studioId` | 9 (`scopeToStudio`/`requireStudio`) |
| CSRF: SameSite + Origin/Referer check; double-submit token helper | 3 (token helper), 10 (Origin/Referer enforcement) |
| Rate-limit auth endpoints in Redis | 4, 7, 11, 13 |
| Login backoff on repeated failures | 4, 7, 11 |
| `AuditLog` writes (no passwords/secrets) | 10 (redaction), 11, 13 |
| `proxy.ts` coarse gate + NOT-sole-check defense in depth | 15 |
| `/login` page (BRAND styling) for admin & studio | 16 |
| Acceptance gate (admin cookie session; player wallet session) | 17 |
| `Principal` canonical type / `MeDto` mapper | 5 |
| Schema support for player sessions (`Session.playerId`) | 14 |

No uncovered requirement remains.

**2. Placeholder scan** — No `TBD`/`TODO`/"add error handling"/"similar to Task N"/"write tests for the above". Every code step contains real code; every command has expected output. The double-submit CSRF token helper (`issueCsrfToken`/`verifyCsrfToken`, Task 3) is built and unit-tested; the request-level guard (Task 10) uses the Origin/Referer arm as the enforced check, with the token helper available for Server-Action forms that opt into double-submit (per AGENT.md §7 "or a double-submit token" — both are provided).

**3. Type consistency**
- `Principal` defined once in `@xgamefi/shared/auth/index.ts` (Task 5) with the exact union from canonical-interfaces; consumed unchanged by guards (9), DTO (5), me (12).
- `SessionSubject` (Task 8) is the Redis/session-internal shape; `getPrincipal` (Task 9) maps it to `Principal` by reloading the `User`/`Player` — names consistent across tasks.
- `errorToResponse` is defined once: introduced in Task 9's `guards.ts`, then Task 11 explicitly **moves it to `lib/http.ts`** and removes the duplicate (DRY) — handlers in Tasks 11–13 all import it from `../lib/http`. Consistent.
- `challengeMessage`/`verifyWalletSignature`/`generateNonce` names match between Task 2 (def) and Tasks 13/17 (use).
- Cookie name `xgf_session` / constant `SESSION_COOKIE` consistent across session (8), proxy (15), and tests.
- Guard signatures (`requireRole(...roles)`, `requireStudio(studioId)`, `scopeToStudio(principal, studioId)`) match canonical-interfaces exactly.

No inconsistencies found.
