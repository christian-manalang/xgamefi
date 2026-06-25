import { test, expect } from "@playwright/test";
import { Horizon, Keypair, TransactionBuilder, Operation, Asset, Memo, Networks, BASE_FEE } from "@stellar/stellar-sdk";

test("Phase 3 demo: scan QR, pay 1 USDT, see delivered via SSE", async ({ page }) => {
  test.setTimeout(120_000);

  // 1. Load the storefront item page
  await page.goto("/s/gridlock");
  await page.locator("article", { hasText: "Sword Skin" }).getByRole("button", { name: /quick view/i }).click();
  const modal = page.getByTestId("item-modal");
  await expect(modal).toBeVisible();
  await modal.getByRole("link", { name: /buy now/i }).click();

  // 2. Wait for checkout page and quote
  await expect(page.getByText("Checkout")).toBeVisible();
  await expect(page.locator("img[alt='Payment QR']")).toBeVisible();

  // 3. Read the order id from the page data attribute
  const orderId = await page.locator("[data-order-id]").getAttribute("data-order-id");
  expect(orderId).toMatch(/^[0-9a-f-]{36}$/);

  // 4. Submit a testnet payment programmatically
  const server = new Horizon.Server(process.env.STELLAR_HORIZON_URL!);
  const payer = Keypair.fromSecret(process.env.E2E_PAYER_SECRET!);
  const asset = new Asset(process.env.STELLAR_USD_ASSET_CODE!, process.env.STELLAR_USD_ASSET_ISSUER!);
  const account = await server.loadAccount(payer.publicKey());
  const tx = new TransactionBuilder(account, { fee: BASE_FEE, networkPassphrase: Networks.TESTNET })
    .addOperation(Operation.payment({ destination: process.env.STELLAR_RECEIVING_ACCOUNT!, asset, amount: "1.0000000" }))
    .addMemo(Memo.text(orderId!))
    .setTimeout(180)
    .build();
  tx.sign(payer);
  const submitRes = await server.submitTransaction(tx);
  expect(submitRes.successful).toBe(true);

  // 5. Assert SSE status reaches PAID / DELIVERED
  await expect(page.getByText(/PAID/)).toBeVisible({ timeout: 60_000 });
  await expect(page.getByText(/DELIVERED/)).toBeVisible({ timeout: 60_000 });
});
