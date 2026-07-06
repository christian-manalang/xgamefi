/* global console, process */

import { config } from "dotenv";
import { Asset, BASE_FEE, Horizon, Keypair, Networks, Operation, TransactionBuilder } from "@stellar/stellar-sdk";

config({ path: ".env" });

const horizonUrl = process.env.STELLAR_HORIZON_URL;
const assetCode = process.env.STELLAR_USD_ASSET_CODE;
const assetIssuer = process.env.STELLAR_USD_ASSET_ISSUER;
const issuerSecret = process.env.STELLAR_PAYOUT_SIGNER_SECRET;

const destination = process.argv[2];
const amount = process.argv[3] ?? "1.0";

if (!destination) {
  console.error("Usage: node apps/web/scripts/issue-testnet-usdt.mjs <destination-address> [amount]");
  process.exit(1);
}

if (!horizonUrl || !assetCode || !assetIssuer || !issuerSecret) {
  console.error("Missing Stellar env vars. Need STELLAR_HORIZON_URL, STELLAR_USD_ASSET_CODE, STELLAR_USD_ASSET_ISSUER, STELLAR_PAYOUT_SIGNER_SECRET.");
  process.exit(1);
}

const issuerKeypair = Keypair.fromSecret(issuerSecret);
if (issuerKeypair.publicKey() !== assetIssuer) {
  console.error(`STELLAR_PAYOUT_SIGNER_SECRET public key (${issuerKeypair.publicKey()}) does not match STELLAR_USD_ASSET_ISSUER (${assetIssuer}).`);
  process.exit(1);
}

const server = new Horizon.Server(horizonUrl);
const asset = assetCode === "XLM" && !assetIssuer ? Asset.native() : new Asset(assetCode, assetIssuer);

async function main() {
  const issuerAccount = await server.loadAccount(assetIssuer);
  const tx = new TransactionBuilder(issuerAccount, {
    fee: BASE_FEE,
    networkPassphrase: Networks.TESTNET,
  })
    .addOperation(Operation.payment({ destination, asset, amount }))
    .setTimeout(30)
    .build();

  tx.sign(issuerKeypair);
  const result = await server.submitTransaction(tx);
  console.log(`Issued ${amount} ${assetCode} to ${destination}`);
  console.log(`Tx hash: ${result.hash}`);
  console.log(`Explorer: https://stellar.expert/explorer/testnet/tx/${result.hash}`);
}

main().catch((err) => {
  console.error("Failed to issue USDT:");
  if (err?.response) {
    console.error("Status:", err.response.status);
    console.error("Data:", err.response.data);
  } else if (err?.data) {
    console.error("Data:", err.data);
  } else {
    console.error(err);
  }
  process.exit(1);
});
