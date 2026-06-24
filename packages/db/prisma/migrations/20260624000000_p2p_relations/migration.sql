-- CreateIndex
CREATE UNIQUE INDEX "ItemOwnership_playerId_itemId_key" ON "ItemOwnership"("playerId", "itemId");

-- AddForeignKey
ALTER TABLE "ItemOwnership" ADD CONSTRAINT "ItemOwnership_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "Item"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ItemOwnership" ADD CONSTRAINT "ItemOwnership_lockedForListingId_fkey" FOREIGN KEY ("lockedForListingId") REFERENCES "P2PListing"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "P2PListing" ADD CONSTRAINT "P2PListing_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "Item"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "P2PTrade" ADD CONSTRAINT "P2PTrade_buyerPlayerId_fkey" FOREIGN KEY ("buyerPlayerId") REFERENCES "Player"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "P2PTrade" ADD CONSTRAINT "P2PTrade_sellerPlayerId_fkey" FOREIGN KEY ("sellerPlayerId") REFERENCES "Player"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
