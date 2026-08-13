/*
  Warnings:

  - You are about to drop the column `feeCategory` on the `Delegate` table. All the data in the column will be lost.
  - You are about to drop the column `paymentStatus` on the `Delegate` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "Delegate" DROP COLUMN "feeCategory",
DROP COLUMN "paymentStatus";

-- DropEnum
DROP TYPE "FeeCategory";

-- DropEnum
DROP TYPE "PaymentStatus";
