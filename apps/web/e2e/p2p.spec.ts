import { test, expect } from "@playwright/test";
import { Horizon, Keypair, TransactionBuilder, Operation, Asset, Memo, Networks, BASE_FEE } from "@stellar/stellar-sdk";

// Testnet-gated end-to-end P2P trade. Requires a running app plus two funded,
// trustlined testnet wallets (seller listing is created via the API; the buyer
// pays escrow on-chain). Excluded from the unit suite (`*.spec.ts`, not `*.test.ts`).
test("P2P trade completes end-to-end: list -> escrow pay -> settle", async ({ page, request }) => {
  test.setTimeout(120_000);

  // 1. Seller lists an owned item via the API (player-authenticated session assumed seeded).
  const listRes = await request.post("/api/v1/p2p/listings", {
    headers: { "Content-Type": "application/json" },
    data: { itemId: process.env.E2E_P2P_ITEM_ID!, price: "2.5", currency: "USDT" },
  });
  expect(listRes.ok()).toBeTruthy();
  const { listing } = await listRes.json();

  // 2. Buyer opens the market listing and starts the buy flow.
  await page.goto(`/s/gridlock/market/listing/${listing.id}`);
  await page.getByRole("button", { name: /buy/i }).click();
  await expect(page.locator("img[alt='Payment QR']")).toBeVisible();

  // 3. Quote the trade to obtain the escrow memo (trade id) + amount.
  const quoteRes = await request.post("/api/v1/p2p/trades/quote", {
    headers: { "Content-Type": "application/json" },
    data: { listingId: listing.id },
  });
  const { trade, quote } = await quoteRes.json();
  expect(trade.id).toMatch(/^[0-9a-f-]{36}$/);

  // 4. Pay the escrow programmatically on testnet (memo = trade id).
  const server = new Horizon.Server(process.env.STELLAR_HORIZON_URL!);
  const payer = Keypair.fromSecret(process.env.E2E_PAYER_SECRET!);
  const asset = new Asset(process.env.STELLAR_USD_ASSET_CODE!, process.env.STELLAR_USD_ASSET_ISSUER!);
  const account = await server.loadAccount(payer.publicKey());
  const tx = new TransactionBuilder(account, { fee: BASE_FEE, networkPassphrase: Networks.TESTNET })
    .addOperation(Operation.payment({ destination: quote.destination, asset, amount: quote.amount }))
    .addMemo(Memo.text(trade.id))
    .setTimeout(180)
    .build();
  tx.sign(payer);
  const submitted = await server.submitTransaction(tx);

  // 5. Submit the escrow txHash; settlement advances the trade.
  const submitRes = await request.post("/api/v1/p2p/trades/submit", {
    headers: { "Content-Type": "application/json", "Idempotency-Key": crypto.randomUUID() },
    data: { tradeId: trade.id, txHash: submitted.hash },
  });
  expect(submitRes.ok()).toBeTruthy();
  const submitted2 = await submitRes.json();
  expect(["PAID", "ALREADY"]).toContain(submitted2.result.status);
});
