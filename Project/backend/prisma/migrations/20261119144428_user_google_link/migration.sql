-- AlterTable
ALTER TABLE "User" ADD COLUMN     "googleLinkedAt" TIMESTAMP(3),
ADD COLUMN     "googleUid" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "User_googleUid_key" ON "User"("googleUid");

