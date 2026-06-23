-- CreateEnum
CREATE TYPE "Role" AS ENUM ('ADMIN', 'STUDIO_OWNER', 'STUDIO_MEMBER');

-- CreateEnum
CREATE TYPE "IntegrationMode" AS ENUM ('API_PULL', 'WEBHOOK_PUSH');

-- CreateEnum
CREATE TYPE "StudioStatus" AS ENUM ('PENDING', 'ACTIVE', 'SUSPENDED');

-- CreateEnum
CREATE TYPE "Currency" AS ENUM ('XLM', 'USDT');

-- CreateEnum
CREATE TYPE "ShopStatus" AS ENUM ('DRAFT', 'PUBLISHED');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('PENDING', 'PAID', 'FAILED', 'REFUNDED');

-- CreateEnum
CREATE TYPE "DeliveryStatus" AS ENUM ('PENDING', 'DELIVERED', 'FAILED');

-- CreateEnum
CREATE TYPE "OwnershipSource" AS ENUM ('PRIMARY', 'P2P');

-- CreateEnum
CREATE TYPE "P2PListingStatus" AS ENUM ('ACTIVE', 'LOCKED', 'SOLD', 'CANCELLED');

-- CreateEnum
CREATE TYPE "P2PTradeStatus" AS ENUM ('ESCROW_PENDING', 'PAID', 'ITEM_TRANSFERRED', 'COMPLETED', 'REFUNDED', 'FAILED');

-- CreateEnum
CREATE TYPE "LedgerEntryType" AS ENUM ('SALE_IN', 'PAYOUT_OUT', 'P2P_ESCROW_IN', 'P2P_PAYOUT', 'REFERRAL_REWARD', 'REFUND');

-- CreateEnum
CREATE TYPE "ReferralStatus" AS ENUM ('PENDING', 'QUALIFIED', 'REWARDED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "PromotionType" AS ENUM ('PERCENT', 'FIXED', 'BUNDLE', 'FIRST_PURCHASE');

-- CreateEnum
CREATE TYPE "WebhookEvent" AS ENUM ('purchase_completed', 'purchase_pending', 'purchase_failed', 'p2p_trade_completed');

-- CreateEnum
CREATE TYPE "WebhookDeliveryStatus" AS ENUM ('PENDING', 'DELIVERED', 'FAILED', 'EXHAUSTED');

-- CreateTable
CREATE TABLE "User" (
    "id" UUID NOT NULL,
    "username" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" "Role" NOT NULL,
    "studioId" UUID,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "lastLoginAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Session" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "userAgent" TEXT,
    "ip" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Player" (
    "id" UUID NOT NULL,
    "walletAddress" TEXT NOT NULL,
    "handle" TEXT,
    "referredByPlayerId" UUID,
    "firstPurchaseAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Player_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuthChallenge" (
    "id" UUID NOT NULL,
    "walletAddress" TEXT NOT NULL,
    "nonce" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuthChallenge_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Studio" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "logoUrl" TEXT,
    "brand" JSONB,
    "payoutWalletAddress" TEXT,
    "integrationMode" "IntegrationMode" NOT NULL DEFAULT 'API_PULL',
    "apiBaseUrl" TEXT,
    "webhookUrl" TEXT,
    "webhookSecretHash" TEXT,
    "platformFeeBps" INTEGER NOT NULL,
    "status" "StudioStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Studio_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ApiKey" (
    "id" UUID NOT NULL,
    "studioId" UUID NOT NULL,
    "keyPrefix" TEXT NOT NULL,
    "hashedKey" TEXT NOT NULL,
    "scopes" TEXT[],
    "lastUsedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ApiKey_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Item" (
    "id" UUID NOT NULL,
    "studioId" UUID NOT NULL,
    "externalId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "imageUrl" TEXT,
    "priceAmount" DECIMAL(38,7) NOT NULL,
    "priceCurrency" "Currency" NOT NULL,
    "stock" INTEGER,
    "rarity" TEXT,
    "category" TEXT,
    "metadata" JSONB,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "syncedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Item_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Shop" (
    "id" UUID NOT NULL,
    "studioId" UUID NOT NULL,
    "status" "ShopStatus" NOT NULL DEFAULT 'DRAFT',
    "layout" JSONB,
    "draftLayout" JSONB,
    "theme" JSONB,
    "featuredItemIds" TEXT[],
    "publishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Shop_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Order" (
    "id" UUID NOT NULL,
    "studioId" UUID NOT NULL,
    "itemId" UUID NOT NULL,
    "playerId" UUID NOT NULL,
    "quantity" INTEGER NOT NULL,
    "currency" "Currency" NOT NULL,
    "grossAmount" DECIMAL(38,7) NOT NULL,
    "discountAmount" DECIMAL(38,7) NOT NULL DEFAULT 0,
    "platformFeeAmount" DECIMAL(38,7) NOT NULL,
    "netToStudioAmount" DECIMAL(38,7) NOT NULL,
    "promotionId" UUID,
    "referralCodeUsed" TEXT,
    "idempotencyKey" TEXT NOT NULL,
    "stellarTxHash" TEXT,
    "paymentStatus" "PaymentStatus" NOT NULL DEFAULT 'PENDING',
    "deliveryStatus" "DeliveryStatus" NOT NULL DEFAULT 'PENDING',
    "paidAt" TIMESTAMP(3),
    "deliveredAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Order_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ItemOwnership" (
    "id" UUID NOT NULL,
    "playerId" UUID NOT NULL,
    "itemId" UUID NOT NULL,
    "studioId" UUID NOT NULL,
    "quantity" INTEGER NOT NULL,
    "source" "OwnershipSource" NOT NULL,
    "lockedForListingId" UUID,
    "acquiredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ItemOwnership_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "P2PListing" (
    "id" UUID NOT NULL,
    "studioId" UUID NOT NULL,
    "itemId" UUID NOT NULL,
    "sellerPlayerId" UUID NOT NULL,
    "price" DECIMAL(38,7) NOT NULL,
    "currency" "Currency" NOT NULL,
    "status" "P2PListingStatus" NOT NULL DEFAULT 'ACTIVE',
    "lockedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "P2PListing_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "P2PTrade" (
    "id" UUID NOT NULL,
    "listingId" UUID NOT NULL,
    "buyerPlayerId" UUID NOT NULL,
    "sellerPlayerId" UUID NOT NULL,
    "price" DECIMAL(38,7) NOT NULL,
    "currency" "Currency" NOT NULL,
    "platformFeeAmount" DECIMAL(38,7) NOT NULL,
    "netToSellerAmount" DECIMAL(38,7) NOT NULL,
    "escrowTxHash" TEXT,
    "payoutTxHash" TEXT,
    "status" "P2PTradeStatus" NOT NULL DEFAULT 'ESCROW_PENDING',
    "idempotencyKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "P2PTrade_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LedgerEntry" (
    "id" UUID NOT NULL,
    "type" "LedgerEntryType" NOT NULL,
    "orderId" UUID,
    "tradeId" UUID,
    "referralId" UUID,
    "stellarTxHash" TEXT NOT NULL,
    "sourceAddress" TEXT NOT NULL,
    "destAddress" TEXT NOT NULL,
    "amount" DECIMAL(38,7) NOT NULL,
    "assetCode" TEXT NOT NULL,
    "assetIssuer" TEXT,
    "status" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LedgerEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Referral" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "referrerPlayerId" UUID NOT NULL,
    "studioId" UUID,
    "refereePlayerId" UUID,
    "status" "ReferralStatus" NOT NULL DEFAULT 'PENDING',
    "qualifyingOrderId" UUID,
    "rewardAmount" DECIMAL(38,7),
    "rewardCurrency" "Currency",
    "rewardTxHash" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "qualifiedAt" TIMESTAMP(3),
    "rewardedAt" TIMESTAMP(3),

    CONSTRAINT "Referral_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Promotion" (
    "id" UUID NOT NULL,
    "studioId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "type" "PromotionType" NOT NULL,
    "value" DECIMAL(38,7) NOT NULL,
    "currency" "Currency",
    "appliesToItemIds" TEXT[],
    "bundleConfig" JSONB,
    "startsAt" TIMESTAMP(3),
    "endsAt" TIMESTAMP(3),
    "usageLimit" INTEGER,
    "usageCount" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Promotion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WebhookDelivery" (
    "id" UUID NOT NULL,
    "studioId" UUID NOT NULL,
    "event" "WebhookEvent" NOT NULL,
    "orderId" UUID,
    "tradeId" UUID,
    "url" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "signature" TEXT NOT NULL,
    "attempt" INTEGER NOT NULL DEFAULT 0,
    "maxAttempts" INTEGER NOT NULL,
    "status" "WebhookDeliveryStatus" NOT NULL DEFAULT 'PENDING',
    "responseStatus" INTEGER,
    "nextAttemptAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deliveredAt" TIMESTAMP(3),

    CONSTRAINT "WebhookDelivery_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IdempotencyKey" (
    "id" UUID NOT NULL,
    "key" TEXT NOT NULL,
    "scope" TEXT NOT NULL,
    "requestHash" TEXT NOT NULL,
    "responseSnapshot" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IdempotencyKey_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" UUID NOT NULL,
    "actorType" TEXT NOT NULL,
    "actorUserId" UUID,
    "action" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "metadata" JSONB,
    "ip" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_username_key" ON "User"("username");

-- CreateIndex
CREATE UNIQUE INDEX "Session_tokenHash_key" ON "Session"("tokenHash");

-- CreateIndex
CREATE UNIQUE INDEX "Player_walletAddress_key" ON "Player"("walletAddress");

-- CreateIndex
CREATE INDEX "AuthChallenge_walletAddress_idx" ON "AuthChallenge"("walletAddress");

-- CreateIndex
CREATE UNIQUE INDEX "Studio_slug_key" ON "Studio"("slug");

-- CreateIndex
CREATE INDEX "ApiKey_studioId_idx" ON "ApiKey"("studioId");

-- CreateIndex
CREATE INDEX "Item_studioId_idx" ON "Item"("studioId");

-- CreateIndex
CREATE UNIQUE INDEX "Item_studioId_externalId_key" ON "Item"("studioId", "externalId");

-- CreateIndex
CREATE UNIQUE INDEX "Shop_studioId_key" ON "Shop"("studioId");

-- CreateIndex
CREATE UNIQUE INDEX "Order_idempotencyKey_key" ON "Order"("idempotencyKey");

-- CreateIndex
CREATE UNIQUE INDEX "Order_stellarTxHash_key" ON "Order"("stellarTxHash");

-- CreateIndex
CREATE INDEX "Order_studioId_idx" ON "Order"("studioId");

-- CreateIndex
CREATE INDEX "Order_playerId_idx" ON "Order"("playerId");

-- CreateIndex
CREATE INDEX "ItemOwnership_playerId_idx" ON "ItemOwnership"("playerId");

-- CreateIndex
CREATE INDEX "ItemOwnership_studioId_idx" ON "ItemOwnership"("studioId");

-- CreateIndex
CREATE INDEX "P2PListing_studioId_idx" ON "P2PListing"("studioId");

-- CreateIndex
CREATE UNIQUE INDEX "P2PTrade_idempotencyKey_key" ON "P2PTrade"("idempotencyKey");

-- CreateIndex
CREATE INDEX "LedgerEntry_orderId_idx" ON "LedgerEntry"("orderId");

-- CreateIndex
CREATE INDEX "LedgerEntry_tradeId_idx" ON "LedgerEntry"("tradeId");

-- CreateIndex
CREATE UNIQUE INDEX "Referral_code_key" ON "Referral"("code");

-- CreateIndex
CREATE INDEX "Referral_referrerPlayerId_idx" ON "Referral"("referrerPlayerId");

-- CreateIndex
CREATE INDEX "Promotion_studioId_idx" ON "Promotion"("studioId");

-- CreateIndex
CREATE INDEX "WebhookDelivery_studioId_idx" ON "WebhookDelivery"("studioId");

-- CreateIndex
CREATE UNIQUE INDEX "IdempotencyKey_key_key" ON "IdempotencyKey"("key");

-- CreateIndex
CREATE INDEX "AuditLog_entityType_entityId_idx" ON "AuditLog"("entityType", "entityId");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_studioId_fkey" FOREIGN KEY ("studioId") REFERENCES "Studio"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Player" ADD CONSTRAINT "Player_referredByPlayerId_fkey" FOREIGN KEY ("referredByPlayerId") REFERENCES "Player"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApiKey" ADD CONSTRAINT "ApiKey_studioId_fkey" FOREIGN KEY ("studioId") REFERENCES "Studio"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Item" ADD CONSTRAINT "Item_studioId_fkey" FOREIGN KEY ("studioId") REFERENCES "Studio"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Shop" ADD CONSTRAINT "Shop_studioId_fkey" FOREIGN KEY ("studioId") REFERENCES "Studio"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_studioId_fkey" FOREIGN KEY ("studioId") REFERENCES "Studio"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "Item"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ItemOwnership" ADD CONSTRAINT "ItemOwnership_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "P2PListing" ADD CONSTRAINT "P2PListing_sellerPlayerId_fkey" FOREIGN KEY ("sellerPlayerId") REFERENCES "Player"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "P2PTrade" ADD CONSTRAINT "P2PTrade_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "P2PListing"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Promotion" ADD CONSTRAINT "Promotion_studioId_fkey" FOREIGN KEY ("studioId") REFERENCES "Studio"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WebhookDelivery" ADD CONSTRAINT "WebhookDelivery_studioId_fkey" FOREIGN KEY ("studioId") REFERENCES "Studio"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
