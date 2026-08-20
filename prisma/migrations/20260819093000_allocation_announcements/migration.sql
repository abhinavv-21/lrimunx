-- The allocation announcement, and the study guide it links to.
--
-- Additive: one nullable column on Committee, one new enum and one new table.
-- Nothing existing is read or rewritten.
--
-- The unique index on "delegateId" is the feature, not an optimisation. The
-- announcement mails four hundred school students in batches of twenty-five
-- because a serverless function is capped at thirty seconds, which means the
-- operator presses the button repeatedly by design. Without this constraint,
-- "press it again" and "mail everyone twice" are the same action, and a
-- duplicate mailshot cannot be taken back.

CREATE TYPE "AnnouncementStatus" AS ENUM ('SENT', 'FAILED');

-- Per committee. A study guide is written by a committee's chairs about that
-- committee's agenda, so one link for the whole conference would send every
-- delegate to a page they then have to search.
ALTER TABLE "Committee" ADD COLUMN "studyGuideUrl" TEXT;

CREATE TABLE "AllocationAnnouncement" (
    "id"         TEXT                 NOT NULL,
    "delegateId" TEXT                 NOT NULL,
    "status"     "AnnouncementStatus" NOT NULL,
    "error"      TEXT,
    "attempts"   INTEGER              NOT NULL DEFAULT 1,
    "sentAt"     TIMESTAMP(3),
    "createdAt"  TIMESTAMP(3)         NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"  TIMESTAMP(3)         NOT NULL,

    CONSTRAINT "AllocationAnnouncement_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AllocationAnnouncement_delegateId_key"
    ON "AllocationAnnouncement"("delegateId");

-- The send picks up where it left off by asking for rows that are not SENT.
CREATE INDEX "AllocationAnnouncement_status_idx" ON "AllocationAnnouncement"("status");

-- Deleting a delegate takes their announcement record with them. A record of
-- having mailed someone who is no longer in the conference protects nothing.
ALTER TABLE "AllocationAnnouncement" ADD CONSTRAINT "AllocationAnnouncement_delegateId_fkey"
    FOREIGN KEY ("delegateId") REFERENCES "Delegate"("id") ON DELETE CASCADE ON UPDATE CASCADE;
