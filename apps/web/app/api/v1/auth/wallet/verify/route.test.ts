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
