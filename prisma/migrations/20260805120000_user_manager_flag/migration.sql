-- Separates "can run the conference" from "can hand out accounts".
--
-- Additive. One new column with a default, so every existing row keeps working
-- and nothing already stored is altered.
--
-- Defaulting to false means that for a moment nobody can manage accounts, which
-- would lock the feature away from everyone including the person who needs it.
-- The two statements below grant it, and the second exists so the system can
-- never end up with nobody able to create a user — the state you cannot fix
-- through the UI, because fixing it is the thing the UI now refuses.

ALTER TABLE "User" ADD COLUMN "canManageUsers" BOOLEAN NOT NULL DEFAULT false;

-- The account this was asked for.
UPDATE "User" SET "canManageUsers" = true WHERE "username" = 'abhinav';

-- Backstop: if that account does not exist on this database — a fresh deploy, a
-- restored dump, a differently-named owner — fall back to the longest-standing
-- ADMIN, which is the bootstrap account. Runs only when the statement above
-- matched nothing, so it can never widen access on a database that is already
-- correctly set up.
UPDATE "User"
SET "canManageUsers" = true
WHERE "id" = (
    SELECT "id" FROM "User"
    WHERE "role" = 'ADMIN'
    ORDER BY "createdAt" ASC
    LIMIT 1
  )
  AND NOT EXISTS (SELECT 1 FROM "User" WHERE "canManageUsers" = true);
