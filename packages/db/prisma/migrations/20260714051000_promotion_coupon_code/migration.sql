-- AlterTable
ALTER TABLE "Promotion" ADD COLUMN     "code" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Promotion_studioId_code_key" ON "Promotion"("studioId", "code");
