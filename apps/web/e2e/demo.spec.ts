import { test, expect } from "@playwright/test";
import { Horizon, Keypair, TransactionBuilder, Operation, Asset, Memo, Networks, BASE_FEE } from "@stellar/stellar-sdk";

function challengeMessage(walletAddress: string, nonce: string): string {
  return `xGameFi login\naddress: ${walletAddress}\nnonce: ${nonce}`;
}

async function fundViaFriendbot(page: import("@playwright/test").Page, publicKey: string) {
  let lastErr: Error | undefined;
  for (let i = 0; i < 5; i++) {
    try {
      const res = await page.request.get(`https://friendbot.stellar.org/?addr=${publicKey}`);
      if (res.ok()) return;
      lastErr = new Error(`friendbot HTTP ${res.status()}`);
    } catch (err) {
      lastErr = err as Error;
    }
    await page.waitForTimeout(500);
  }
  throw lastErr ?? new Error("friendbot funding failed");
}

async function authenticatePlayer(page: import("@playwright/test").Page, keypair: Keypair) {
  const publicKey = keypair.publicKey();
  const headers = { "Content-Type": "application/json", Origin: "http://localhost:3000" };
  const challengeRes = await page.request.post("/api/v1/auth/wallet/challenge", {
    headers,
    data: { walletAddress: publicKey },
  });
  expect(challengeRes.ok(), `challenge failed: ${await challengeRes.text()}`).toBe(true);
  const { data } = await challengeRes.json() as { data: { nonce: string } };
  const { nonce } = data;

  const message = challengeMessage(publicKey, nonce);
  const signature = keypair.sign(Buffer.from(message, "utf8"));
  const signatureBase64 = signature.toString("base64");

  const verifyRes = await page.request.post("/api/v1/auth/wallet/verify", {
    headers,
    data: { walletAddress: publicKey, signature: signatureBase64 },
  });
  expect(verifyRes.ok(), `verify failed: ${await verifyRes.text()}`).toBe(true);
}

test("Phase 3 demo: scan QR, pay 1 XLM, see delivered via SSE", async ({ page }) => {
  test.setTimeout(120_000);

  page.on("console", (msg) => console.log("[browser]", msg.type(), msg.text()));

  // 1. Create and fund a throwaway testnet player wallet.
  const player = Keypair.random();
  await page.goto("/s/gridlock");
  await fundViaFriendbot(page, player.publicKey());
  await authenticatePlayer(page, player);

  // 2. Find Sword Skin on the storefront and open checkout in XLM.
  await expect(page.locator("article", { hasText: "Sword Skin" })).toBeVisible();
  const itemsRes = await page.request.get("/api/v1/shops/gridlock/items");
  expect(itemsRes.ok()).toBe(true);
  const { items } = await itemsRes.json() as { items: Array<{ id: string; name: string }> };
  const swordSkin = items.find((i) => i.name === "Sword Skin");
  expect(swordSkin).toBeDefined();

  const quoteRes = await page.request.post("/api/v1/checkout/quote", {
    headers: { "Content-Type": "application/json", Origin: "http://localhost:3000" },
    data: { itemId: swordSkin!.id, currency: "XLM" },
  });
  console.log("quote direct", quoteRes.status(), await quoteRes.text());

  await page.goto(`/s/gridlock/checkout?item=${swordSkin!.id}&currency=XLM`);

  // 3. Wait for checkout page and quote.
  await expect(page.getByText("Checkout")).toBeVisible();
  await expect(page.locator("img[alt='Payment QR']")).toBeVisible();

  // 4. Read the order id from the page data attribute.
  const orderId = await page.locator("[data-order-id]").getAttribute("data-order-id");
  expect(orderId).toMatch(/^[0-9a-f-]{36}$/);

  // 5. Submit a testnet XLM payment programmatically.
  const server = new Horizon.Server(process.env.STELLAR_HORIZON_URL!);
  const account = await server.loadAccount(player.publicKey());
  const tx = new TransactionBuilder(account, { fee: BASE_FEE, networkPassphrase: Networks.TESTNET })
    .addOperation(Operation.payment({ destination: process.env.STELLAR_RECEIVING_ACCOUNT!, asset: Asset.native(), amount: "1.0000000" }))
    .addMemo(Memo.text(orderId!))
    .setTimeout(180)
    .build();
  tx.sign(player);
  const submitRes = await server.submitTransaction(tx);
  expect(submitRes.successful).toBe(true);

  // 6. Assert SSE status reaches PAID / DELIVERED.
  await expect(page.getByText(/PAID/)).toBeVisible({ timeout: 60_000 });
  await expect(page.getByText(/DELIVERED/)).toBeVisible({ timeout: 60_000 });
});
