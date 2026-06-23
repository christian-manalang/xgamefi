import {
  Horizon,
  Asset as StellarAsset,
  Operation,
  TransactionBuilder,
  Memo,
  Networks,
  BASE_FEE,
  Keypair,
} from "@stellar/stellar-sdk";
import { Prisma } from "@xgamefi/db";
import { env } from "@xgamefi/config/env";
import { fromStellarAmount } from "./money.js";

export type Asset = { code: "XLM" } | { code: string; issuer: string };

function toStellarAsset(asset: Asset): StellarAsset {
  return asset.code === "XLM" && !("issuer" in asset)
    ? StellarAsset.native()
    : new StellarAsset(asset.code, (asset as { issuer: string }).issuer);
}

function networkPassphrase(): string {
  return env.STELLAR_NETWORK === "pubnet" ? Networks.PUBLIC : Networks.TESTNET;
}

function horizonServer(): Horizon.Server {
  return new Horizon.Server(env.STELLAR_HORIZON_URL);
}

export async function buildPaymentXdr(args: {
  destination: string;
  asset: Asset;
  amount: string;
  memo: string;
  source: string;
}): Promise<string> {
  const server = horizonServer();
  const account = await server.loadAccount(args.source);
  const tx = new TransactionBuilder(account, {
    fee: BASE_FEE,
    networkPassphrase: networkPassphrase(),
  })
    .addOperation(
      Operation.payment({
        destination: args.destination,
        asset: toStellarAsset(args.asset),
        amount: args.amount,
      }),
    )
    .addMemo(Memo.text(args.memo))
    .setTimeout(180)
    .build();
  return tx.toXDR();
}

export type VerifyResult =
  | { ok: true; txHash: string; amount: Prisma.Decimal; memo: string; asset: Asset }
  | { ok: false; reason: string };

type HorizonLike = Pick<Horizon.Server, "transactions" | "operations">;

function assetMatches(
  expected: Asset,
  op: { asset_type: string; asset_code?: string; asset_issuer?: string },
): boolean {
  if (expected.code === "XLM" && !("issuer" in expected)) {
    return op.asset_type === "native";
  }
  const exp = expected as { code: string; issuer: string };
  return op.asset_code === exp.code && op.asset_issuer === exp.issuer;
}

export async function verifyPayment(
  args: {
    txHash?: string;
    expectedDestination: string;
    expectedAsset: Asset;
    minAmount: Prisma.Decimal;
    expectedMemo: string;
  },
  horizon: HorizonLike = horizonServer(),
): Promise<VerifyResult> {
  if (!args.txHash) return { ok: false, reason: "missing txHash" };

  const tx = await horizon.transactions().transaction(args.txHash).call();
  if (!tx.successful) return { ok: false, reason: "transaction not successful" };
  if (tx.memo !== args.expectedMemo) return { ok: false, reason: "memo mismatch" };

  const ops = await horizon.operations().forTransaction(args.txHash).call();
  const payment = ops.records.find(
    (r) =>
      r.type === "payment" &&
      (r as { to: string }).to === args.expectedDestination &&
      assetMatches(args.expectedAsset, r as never),
  ) as { amount: string } | undefined;

  if (!payment) return { ok: false, reason: "no matching payment op (destination/asset)" };

  const amount = fromStellarAmount(payment.amount);
  if (amount.lessThan(args.minAmount)) return { ok: false, reason: "amount below minimum" };

  return { ok: true, txHash: tx.hash, amount, memo: tx.memo, asset: args.expectedAsset };
}

export async function sendPayment(args: {
  destination: string;
  asset: Asset;
  amount: string;
  memo?: string;
}): Promise<{ txHash: string }> {
  const server = horizonServer();
  const signer = Keypair.fromSecret(env.STELLAR_PAYOUT_SIGNER_SECRET);
  const account = await server.loadAccount(signer.publicKey());
  const builder = new TransactionBuilder(account, {
    fee: BASE_FEE,
    networkPassphrase: networkPassphrase(),
  }).addOperation(
    Operation.payment({
      destination: args.destination,
      asset: toStellarAsset(args.asset),
      amount: args.amount,
    }),
  );
  if (args.memo) builder.addMemo(Memo.text(args.memo));
  const tx = builder.setTimeout(180).build();
  tx.sign(signer);
  const res = await server.submitTransaction(tx);
  return { txHash: res.hash };
}
