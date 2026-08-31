-- Referral codes: a code one person hands out, and everyone who used it.
--
-- Registration already had a free-text "referralCode" column holding whatever
-- the applicant typed. That column is NOT touched: it is what they actually
-- said, and it stays as evidence. What is added is the interpretation — a link
-- from the registration to the code it was matched to, so the count of
-- delegates one person brought in is a join rather than a string comparison
-- against every spelling of the same code.
--
-- ON DELETE SET NULL, not CASCADE. Deleting a referral code must never delete
-- the registrations that used it; it should only forget the attribution.

CREATE TABLE "ReferralCode" (
    "id"        TEXT NOT NULL,
    -- Normalised by apps/backend/src/lib/referrals.ts: upper case, no
    -- whitespace, one kind of dash. Nothing else writes to this column.
    "code"      TEXT NOT NULL,
    "ownerName" TEXT NOT NULL,
    "note"      TEXT,
    -- A retired code stops matching new registrations. It is deactivated
    -- rather than deleted, because the registrations that already used it
    -- still have to count toward what the referrer earned.
    "active"    BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ReferralCode_pkey" PRIMARY KEY ("id")
);

-- Unique, because two people cannot share a code and be paid separately for it.
CREATE UNIQUE INDEX "ReferralCode_code_key" ON "ReferralCode"("code");

CREATE INDEX "ReferralCode_ownerName_idx" ON "ReferralCode"("ownerName");

ALTER TABLE "Registration" ADD COLUMN "referralCodeId" TEXT;

CREATE INDEX "Registration_referralCodeId_idx" ON "Registration"("referralCodeId");

ALTER TABLE "Registration"
    ADD CONSTRAINT "Registration_referralCodeId_fkey"
    FOREIGN KEY ("referralCodeId") REFERENCES "ReferralCode"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
