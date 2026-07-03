import type { PlatformSettings } from "../settings";
import type { PlatformMetrics, StudioMetrics } from "../metrics";
import { toStellarAmount } from "../money";

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

export type AdminMetricsDto = {
  gmv: string;
  feesCollected: string;
  activeStudios: number;
  recentOrders: {
    id: string;
    studioId: string;
    itemName: string;
    grossAmount: string;
    currency: string;
    paymentStatus: string;
    deliveryStatus: string;
    createdAt: string;
  }[];
};

export function toAdminMetricsDto(m: PlatformMetrics): AdminMetricsDto {
  return {
    gmv: toStellarAmount(m.gmv),
    feesCollected: toStellarAmount(m.feesCollected),
    activeStudios: m.activeStudios,
    recentOrders: m.recentOrders.map((o) => ({
      id: o.id,
      studioId: o.studioId,
      itemName: o.itemName,
      grossAmount: toStellarAmount(o.grossAmount),
      currency: o.currency,
      paymentStatus: o.paymentStatus,
      deliveryStatus: o.deliveryStatus,
      createdAt: o.createdAt.toISOString(),
    })),
  };
}

export type StudioMetricsDto = {
  gmv: string;
  feesCollected: string;
  orderCount: number;
  recentOrders: {
    id: string;
    studioId: string;
    itemName: string;
    grossAmount: string;
    currency: string;
    paymentStatus: string;
    deliveryStatus: string;
    createdAt: string;
  }[];
  webhookHealth: {
    total: number;
    delivered: number;
    failed: number;
    successRate: number;
  };
};

export function toStudioMetricsDto(m: StudioMetrics): StudioMetricsDto {
  return {
    gmv: toStellarAmount(m.gmv),
    feesCollected: toStellarAmount(m.feesCollected),
    orderCount: m.orderCount,
    recentOrders: m.recentOrders.map((o) => ({
      id: o.id,
      studioId: o.studioId,
      itemName: o.itemName,
      grossAmount: toStellarAmount(o.grossAmount),
      currency: o.currency,
      paymentStatus: o.paymentStatus,
      deliveryStatus: o.deliveryStatus,
      createdAt: o.createdAt.toISOString(),
    })),
    webhookHealth: m.webhookHealth,
  };
}

export type AdminLedgerEntryDto = {
  id: string;
  type: string;
  orderId: string | null;
  tradeId: string | null;
  referralId: string | null;
  stellarTxHash: string;
  sourceAddress: string;
  destAddress: string;
  amount: string;
  assetCode: string;
  assetIssuer: string | null;
  status: string;
  createdAt: string;
};

export function toAdminLedgerEntryDto(row: {
  id: string;
  type: string;
  orderId: string | null;
  tradeId: string | null;
  referralId: string | null;
  stellarTxHash: string;
  sourceAddress: string;
  destAddress: string;
  amount: { toString(): string };
  assetCode: string;
  assetIssuer: string | null;
  status: string;
  createdAt: Date;
}): AdminLedgerEntryDto {
  return {
    id: row.id,
    type: row.type,
    orderId: row.orderId,
    tradeId: row.tradeId,
    referralId: row.referralId,
    stellarTxHash: row.stellarTxHash,
    sourceAddress: row.sourceAddress,
    destAddress: row.destAddress,
    amount: row.amount.toString(),
    assetCode: row.assetCode,
    assetIssuer: row.assetIssuer,
    status: row.status,
    createdAt: row.createdAt.toISOString(),
  };
}

export type StudioBrandDto = {
  primary?: string;
  accent?: string;
  background?: string;
  surface?: string;
  displayFont?: string;
  monoFont?: string;
  [key: string]: unknown;
};

export type AdminStudioDto = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  logoUrl: string | null;
  brand: StudioBrandDto | null;
  status: string;
  platformFeeBps: number;
  payoutWalletAddress: string | null;
  integrationMode: string;
  webhookUrl: string | null;
  apiBaseUrl: string | null;
  createdAt: string;
};

export function toAdminStudioDto(row: {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  logoUrl: string | null;
  brand: unknown;
  status: string;
  platformFeeBps: number;
  payoutWalletAddress: string | null;
  integrationMode: string;
  webhookUrl: string | null;
  apiBaseUrl: string | null;
  createdAt: Date;
}): AdminStudioDto {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    description: row.description,
    logoUrl: row.logoUrl,
    brand: row.brand ? (row.brand as StudioBrandDto) : null,
    status: row.status,
    platformFeeBps: row.platformFeeBps,
    payoutWalletAddress: row.payoutWalletAddress,
    integrationMode: row.integrationMode,
    webhookUrl: row.webhookUrl,
    apiBaseUrl: row.apiBaseUrl,
    createdAt: row.createdAt.toISOString(),
  };
}

export type AdminUserDto = {
  id: string;
  username: string;
  role: string;
  studioId: string | null;
  isActive: boolean;
  lastLoginAt: string | null;
  createdAt: string;
};

export function toAdminUserDto(row: {
  id: string;
  username: string;
  role: string;
  studioId: string | null;
  isActive: boolean;
  lastLoginAt: Date | null;
  createdAt: Date;
}): AdminUserDto {
  return {
    id: row.id,
    username: row.username,
    role: row.role,
    studioId: row.studioId,
    isActive: row.isActive,
    lastLoginAt: row.lastLoginAt ? row.lastLoginAt.toISOString() : null,
    createdAt: row.createdAt.toISOString(),
  };
}
