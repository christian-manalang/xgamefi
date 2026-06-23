import { describe, it, expect } from "vitest";
import { Prisma } from "@xgamefi/db";
import { buildPaymentXdr, verifyPayment, type Asset } from "./stellar";

const DEST = "GBRPYHIL2CI3FNQ4BXLFMNDLFJUNPU2HY3ZMFSHONUCEOASW7QC7OX2H";
const SRC = "GA7QYNF7SOWQ3GLR2BGMZEHXAVIRZA4KVWLTJJFC7MGXUA74P7UJVSGZ";
const USDT: Asset = { code: "USDT", issuer: DEST };

// Minimal Horizon stub: one payment-op record + tx memo.
function horizonStub(record: {
  txHash: string;
  to: string;
  amount: string;
  assetType: string;
  assetCode?: string;
  assetIssuer?: string;
  memo: string;
  successful: boolean;
}) {
  return {
    transactions: () => ({
      transaction: (_h: string) => ({
        call: async () => ({
          hash: record.txHash,
          successful: record.successful,
          memo: record.memo,
          memo_type: "text",
        }),
      }),
    }),
    operations: () => ({
      forTransaction: (_h: string) => ({
        call: async () => ({
          records: [
            {
              type: "payment",
              to: record.to,
              amount: record.amount,
              asset_type: record.assetType,
              asset_code: record.assetCode,
              asset_issuer: record.assetIssuer,
            },
          ],
        }),
      }),
    }),
  } as unknown as Parameters<typeof verifyPayment>[1];
}

describe("buildPaymentXdr", () => {
  // Loads the source account from Horizon (network); only run when STELLAR_E2E is set.
  it.skipIf(!process.env.STELLAR_E2E)(
    "returns a base64 XDR string for a USDT payment with a text memo",
    async () => {
      const xdr = await buildPaymentXdr({
        destination: DEST,
        asset: USDT,
        amount: "1.0000000",
        memo: "ord_abc",
        source: SRC,
      });
      expect(typeof xdr).toBe("string");
      expect(xdr.length).toBeGreaterThan(0);
      expect(() => Buffer.from(xdr, "base64")).not.toThrow();
    },
  );
});

describe("verifyPayment", () => {
  const base = {
    expectedDestination: DEST,
    expectedAsset: USDT,
    minAmount: new Prisma.Decimal("1"),
    expectedMemo: "ord_abc",
    txHash: "abc123",
  };

  it("ok=true when destination, asset, amount>=min, and memo all match", async () => {
    const res = await verifyPayment(base, horizonStub({
      txHash: "abc123", to: DEST, amount: "1.0000000",
      assetType: "credit_alphanum4", assetCode: "USDT", assetIssuer: DEST,
      memo: "ord_abc", successful: true,
    }));
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.amount.equals(new Prisma.Decimal("1"))).toBe(true);
  });

  it("ok=false when the memo does not match", async () => {
    const res = await verifyPayment(base, horizonStub({
      txHash: "abc123", to: DEST, amount: "1.0000000",
      assetType: "credit_alphanum4", assetCode: "USDT", assetIssuer: DEST,
      memo: "ord_OTHER", successful: true,
    }));
    expect(res.ok).toBe(false);
  });

  it("ok=false when the amount is below minAmount", async () => {
    const res = await verifyPayment(base, horizonStub({
      txHash: "abc123", to: DEST, amount: "0.5000000",
      assetType: "credit_alphanum4", assetCode: "USDT", assetIssuer: DEST,
      memo: "ord_abc", successful: true,
    }));
    expect(res.ok).toBe(false);
  });

  it("ok=false when paid to the wrong destination", async () => {
    const res = await verifyPayment(base, horizonStub({
      txHash: "abc123", to: SRC, amount: "1.0000000",
      assetType: "credit_alphanum4", assetCode: "USDT", assetIssuer: DEST,
      memo: "ord_abc", successful: true,
    }));
    expect(res.ok).toBe(false);
  });

  it("ok=false when the transaction was not successful", async () => {
    const res = await verifyPayment(base, horizonStub({
      txHash: "abc123", to: DEST, amount: "1.0000000",
      assetType: "credit_alphanum4", assetCode: "USDT", assetIssuer: DEST,
      memo: "ord_abc", successful: false,
    }));
    expect(res.ok).toBe(false);
  });
});
