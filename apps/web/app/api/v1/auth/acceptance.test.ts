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
    // Clear rows that reference Player (FK) so the wipe is order-independent in the shared test DB.
    await prisma.ledgerEntry.deleteMany();
    await prisma.order.deleteMany();
    await prisma.referral.deleteMany();
    await prisma.itemOwnership.deleteMany();
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
