-- Referral codes get a match key, separate from the code as printed.
--
-- "code" stays the readable form that goes on a poster: RIDGE-MUNSOC. The
-- problem is that somebody reading it types "ridge munsoc", "RIDGEMUNSOC" or
-- "Ridge-Munsoc", and a comparison that kept the hyphen credited only the
-- third. That is a referrer losing Rs 150 because a stranger guessed a
-- punctuation mark wrong, which is the exact thing this table exists to stop.
--
-- So identity moves to a key with the separators taken out entirely, and the
-- unique constraint moves with it. "code" keeps its own unique index too,
-- because two codes that print identically would be just as confusing.
--
-- The backfill strips everything that is not a letter or a digit, which is
-- what normaliseReferralCode does in lib/referrals.ts. Both have to agree; the
-- test suite is what holds them to it.

ALTER TABLE "ReferralCode" ADD COLUMN "matchKey" TEXT;

UPDATE "ReferralCode"
   SET "matchKey" = UPPER(REGEXP_REPLACE("code", '[^A-Za-z0-9]', '', 'g'));

-- If this fails, two existing codes differ only by punctuation and are the same
-- code. Merge them by hand before migrating; there is no safe automatic answer,
-- because the referrals attached to each belong to different people.
ALTER TABLE "ReferralCode" ALTER COLUMN "matchKey" SET NOT NULL;

CREATE UNIQUE INDEX "ReferralCode_matchKey_key" ON "ReferralCode"("matchKey");
