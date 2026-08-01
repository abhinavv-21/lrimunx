-- Committee preference is superseded by the Allocations screen, where a
-- committee is picked directly. Dropping the column rather than leaving it
-- unused so the delegate record stays honest about what it holds.
ALTER TABLE "Delegate" DROP COLUMN "committeePreference";

-- Key/value store for conference configuration entered in the app.
CREATE TABLE "Setting" (
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Setting_pkey" PRIMARY KEY ("key")
);
