-- Ownership of the deployment, and the day a logistics request belongs to.
--
-- Additive on both counts. One new column with a default and one nullable
-- column, so every existing row keeps working and nothing stored is altered.
--
-- isOwner exists so that "only Abhinav may open settings, the danger zone and
-- the restart button" is a row in the database rather than a string compared
-- inside half a dozen route handlers. A hardcoded username is wrong the first
-- time the hub is handed to next year's secretariat, wrong on a restored dump
-- that carries a differently-named account, and absent entirely on a test
-- database — and each of those is a code change and a deploy to fix. This is an
-- UPDATE.

ALTER TABLE "User" ADD COLUMN "isOwner" BOOLEAN NOT NULL DEFAULT false;

-- The account this was asked for.
UPDATE "User" SET "isOwner" = true WHERE "username" = 'abhinav';

-- Backstop, mirroring the one in 20260805120000_user_manager_flag: if that
-- account is not on this database, fall back to the longest-standing ADMIN,
-- which is the bootstrap account. Runs only when the statement above matched
-- nothing, so it can never widen access on a database that is already correct.
-- Without it a fresh deploy has an owner-only settings screen and no owner.
UPDATE "User"
SET "isOwner" = true
WHERE "id" = (
    SELECT "id" FROM "User"
    WHERE "role" = 'ADMIN'
    ORDER BY "createdAt" ASC
    LIMIT 1
  )
  AND NOT EXISTS (SELECT 1 FROM "User" WHERE "isOwner" = true);

-- Nullable rather than defaulted to 1. A request filed in October belongs to no
-- day yet, and calling that "day 1" would put three weeks of pre-conference
-- errands into the first morning's queue.
ALTER TABLE "LogisticsReq" ADD COLUMN "day" INTEGER;
