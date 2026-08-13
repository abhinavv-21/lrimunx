-- The country matrix.
--
-- One row per country per committee: the list of who is IN the room, which is
-- a different fact from who has been allocated to it. Until now
-- `Assignment.country` was free text, so the system could tell you a country
-- was taken but not whether it was ever on offer.
--
-- Purely additive: one new table, no existing column touched, Assignment left
-- exactly as it is. A committee with no rows here keeps the old free-text
-- behaviour, so this can be applied and sit inert until a matrix is imported.
--
-- Written by hand rather than generated so it can go out with `migrate deploy`
-- against the live database, without the reset `migrate dev` would propose.

CREATE TABLE "CommitteeCountry" (
    "id"          TEXT         NOT NULL,
    "committeeId" TEXT         NOT NULL,
    "country"     TEXT         NOT NULL,
    "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CommitteeCountry_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "CommitteeCountry_committeeId_idx" ON "CommitteeCountry"("committeeId");

-- The same country cannot appear twice in one committee. It CAN appear in
-- several — France sits in UNSC and in DISEC, held by different delegates.
CREATE UNIQUE INDEX "CommitteeCountry_committeeId_country_key"
    ON "CommitteeCountry"("committeeId", "country");

-- Deleting a committee takes its matrix with it. There is deliberately no link
-- to Assignment: clearing an allocation must free the country, never remove it
-- from the room.
ALTER TABLE "CommitteeCountry" ADD CONSTRAINT "CommitteeCountry_committeeId_fkey"
    FOREIGN KEY ("committeeId") REFERENCES "Committee"("id") ON DELETE CASCADE ON UPDATE CASCADE;
