-- CreateTable
CREATE TABLE "PlatformSetting" (
    "id" TEXT NOT NULL DEFAULT 'singleton',
    "defaultFeeBps" INTEGER NOT NULL DEFAULT 500,
    "receivingAccount" TEXT NOT NULL,
    "payoutSignerPublic" TEXT,
    "usdAssetCode" TEXT NOT NULL DEFAULT 'USDT',
    "usdAssetIssuer" TEXT,
    "network" TEXT NOT NULL DEFAULT 'testnet',
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlatformSetting_pkey" PRIMARY KEY ("id")
);
