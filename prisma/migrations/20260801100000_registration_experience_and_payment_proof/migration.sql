-- The second half of the rebuilt public registration form: a fallback
-- committee, prior MUN experience, a referral answer and a payment screenshot.
--
-- Purely additive and entirely nullable. Every existing Registration and
-- Delegate keeps its row and simply carries NULL until a submission or an edit
-- supplies a value, so nothing is rewritten and no default has to be
-- backfilled. Hand-written rather than generated so it applies with
-- `migrate deploy` against a database holding real conference data, without
-- the reset `migrate dev` would propose.
--
-- referralCode and paymentProofUrl deliberately stop at Registration. They are
-- facts about an *application* — who pointed the applicant here, and what they
-- attached to prove they paid — and neither survives as an attribute of a
-- person once the OC has accepted them. The three that do carry over onto
-- Delegate are the ones the Allocations screen reads.

ALTER TABLE "Registration" ADD COLUMN "committeePreference2" TEXT;
ALTER TABLE "Registration" ADD COLUMN "munsAttended"         INTEGER;
ALTER TABLE "Registration" ADD COLUMN "awardsWon"            INTEGER;
ALTER TABLE "Registration" ADD COLUMN "referralCode"         TEXT;
ALTER TABLE "Registration" ADD COLUMN "paymentProofUrl"      TEXT;

ALTER TABLE "Delegate" ADD COLUMN "committeePreference2" TEXT;
ALTER TABLE "Delegate" ADD COLUMN "munsAttended"         INTEGER;
ALTER TABLE "Delegate" ADD COLUMN "awardsWon"            INTEGER;
