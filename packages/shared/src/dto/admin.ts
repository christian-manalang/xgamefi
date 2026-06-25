import type { PlatformSettings } from "../settings";

export type AdminSettingsDto = {
  defaultFeeBps: number;
  receivingAccount: string;
  payoutSignerPublic: string | null;
  usdAssetCode: string;
  usdAssetIssuer: string | null;
  network: "testnet" | "pubnet";
  updatedAt: string;
};

export function toAdminSettingsDto(s: PlatformSettings): AdminSettingsDto {
  return {
    defaultFeeBps: s.defaultFeeBps,
    receivingAccount: s.receivingAccount,
    payoutSignerPublic: s.payoutSignerPublic,
    usdAssetCode: s.usdAssetCode,
    usdAssetIssuer: s.usdAssetIssuer,
    network: s.network,
    updatedAt: s.updatedAt.toISOString(),
  };
}
