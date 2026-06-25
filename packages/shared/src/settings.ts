import { prisma } from "@xgamefi/db";
import { env } from "@xgamefi/config/env";

export type PlatformSettings = {
  id: string;
  defaultFeeBps: number;
  receivingAccount: string;
  payoutSignerPublic: string | null;
  usdAssetCode: string;
  usdAssetIssuer: string | null;
  network: "testnet" | "pubnet";
  updatedAt: Date;
};

const SINGLETON = "singleton";

function toSettings(row: {
  id: string;
  defaultFeeBps: number;
  receivingAccount: string;
  payoutSignerPublic: string | null;
  usdAssetCode: string;
  usdAssetIssuer: string | null;
  network: string;
  updatedAt: Date;
}): PlatformSettings {
  return {
    id: row.id,
    defaultFeeBps: row.defaultFeeBps,
    receivingAccount: row.receivingAccount,
    payoutSignerPublic: row.payoutSignerPublic,
    usdAssetCode: row.usdAssetCode,
    usdAssetIssuer: row.usdAssetIssuer,
    network: row.network === "pubnet" ? "pubnet" : "testnet",
    updatedAt: row.updatedAt,
  };
}

export async function getPlatformSettings(): Promise<PlatformSettings> {
  const row = await prisma.platformSetting.upsert({
    where: { id: SINGLETON },
    update: {},
    create: {
      id: SINGLETON,
      defaultFeeBps: env.PLATFORM_FEE_BPS,
      receivingAccount: env.STELLAR_RECEIVING_ACCOUNT,
      usdAssetCode: env.STELLAR_USD_ASSET_CODE,
      usdAssetIssuer: env.STELLAR_USD_ASSET_ISSUER,
      network: env.STELLAR_NETWORK,
    },
  });
  return toSettings(row);
}

export async function updatePlatformSettings(
  patch: Partial<
    Pick<
      PlatformSettings,
      | "defaultFeeBps"
      | "receivingAccount"
      | "payoutSignerPublic"
      | "usdAssetCode"
      | "usdAssetIssuer"
      | "network"
    >
  >,
): Promise<PlatformSettings> {
  await getPlatformSettings();
  const row = await prisma.platformSetting.update({
    where: { id: SINGLETON },
    data: patch,
  });
  return toSettings(row);
}
