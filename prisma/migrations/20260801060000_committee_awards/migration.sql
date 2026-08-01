-- Committee awards.
--
-- Purely additive: one new table, no existing column touched. Written by hand
-- rather than generated so it can be applied with `migrate deploy` against the
-- live database without the reset that `migrate dev` would propose.

CREATE TABLE "Award" (
    "id"          TEXT         NOT NULL,
    "committeeId" TEXT         NOT NULL,
    "title"       TEXT         NOT NULL,
    "rank"        INTEGER      NOT NULL DEFAULT 90,
    "delegateId"  TEXT,
    "note"        TEXT,
    "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"   TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Award_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Award_committeeId_idx" ON "Award"("committeeId");

-- NULLs compare as distinct in Postgres, so this permits any number of
-- unassigned award slots while still stopping one delegate from collecting two
-- awards in the same committee.
CREATE UNIQUE INDEX "Award_committeeId_delegateId_key" ON "Award"("committeeId", "delegateId");

-- Deleting a committee takes its ceremony with it. Deleting a delegate empties
-- the award back into an unassigned slot rather than destroying the record of
-- the award itself.
ALTER TABLE "Award" ADD CONSTRAINT "Award_committeeId_fkey"
    FOREIGN KEY ("committeeId") REFERENCES "Committee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Award" ADD CONSTRAINT "Award_delegateId_fkey"
    FOREIGN KEY ("delegateId") REFERENCES "Delegate"("id") ON DELETE SET NULL ON UPDATE CASCADE;
