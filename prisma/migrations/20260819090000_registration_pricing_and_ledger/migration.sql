-- Registration pricing and the conference ledger.
--
-- Purely additive: two nullable columns on Registration, two new enums and one
-- new table. Nothing existing is rewritten, so applying this against a live
-- database leaves every registration exactly as it was — priceTier and
-- amountPaid simply start out empty and stay empty until the secretariat
-- records a payment against the row.
--
-- Written by hand rather than generated so it can go out with `migrate deploy`
-- without the reset `migrate dev` would propose.

CREATE TYPE "PriceTier" AS ENUM ('BASE', 'INTERNAL', 'ALUMNI', 'DISCOUNT');

CREATE TYPE "LedgerCategory" AS ENUM (
    'REGISTRATION', 'SPONSORSHIP', 'VENUE', 'FOOD', 'PRINTING',
    'AWARDS', 'TRANSPORT', 'HOSPITALITY', 'MARKETING', 'MISC'
);

-- Both nullable and both without a default. A registration with no tier is not
-- "on the base rate", it is one nobody has processed yet, and the review queue
-- needs to be able to tell those apart.
ALTER TABLE "Registration" ADD COLUMN "priceTier"  "PriceTier";
ALTER TABLE "Registration" ADD COLUMN "amountPaid" INTEGER;

-- Whole Nepali rupees, matching LedgerEntry.credit/debit, so the income
-- summary can add the two without a conversion.
CREATE INDEX "Registration_priceTier_idx" ON "Registration"("priceTier");

CREATE TABLE "LedgerEntry" (
    "id"           TEXT             NOT NULL,
    "entryDate"    TIMESTAMP(3)     NOT NULL,
    "particular"   TEXT             NOT NULL,
    "category"     "LedgerCategory" NOT NULL,
    "credit"       INTEGER          NOT NULL DEFAULT 0,
    "debit"        INTEGER          NOT NULL DEFAULT 0,
    "note"         TEXT,
    "recordedById" TEXT             NOT NULL,
    "createdAt"    TIMESTAMP(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"    TIMESTAMP(3)     NOT NULL,

    CONSTRAINT "LedgerEntry_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "LedgerEntry_entryDate_idx" ON "LedgerEntry"("entryDate");
CREATE INDEX "LedgerEntry_category_idx"  ON "LedgerEntry"("category");

-- RESTRICT, not CASCADE. Deleting the account of a volunteer who left must not
-- take the venue invoice they typed out of the books with it.
ALTER TABLE "LedgerEntry" ADD CONSTRAINT "LedgerEntry_recordedById_fkey"
    FOREIGN KEY ("recordedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
