-- Public registrations submitted from the conference website.
--
-- Purely additive: one new enum and one new table. No existing column is
-- touched and no row is rewritten, so the live conference data (users,
-- committees, delegates, audit trail) survives untouched. Written by hand
-- rather than generated so it applies with `migrate deploy` without the reset
-- that `migrate dev` would propose against a database holding real data.

CREATE TYPE "RegistrationStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

CREATE TABLE "Registration" (
    "id"                  TEXT                 NOT NULL,
    "reference"           TEXT                 NOT NULL,
    "fullName"            TEXT                 NOT NULL,
    "email"               TEXT                 NOT NULL,
    "phone"               TEXT                 NOT NULL,
    "schoolName"          TEXT                 NOT NULL,
    "grade"               TEXT                 NOT NULL,
    "committeePreference" TEXT,
    "dietaryNotes"        TEXT,
    "accessibilityNotes"  TEXT,
    "status"              "RegistrationStatus" NOT NULL DEFAULT 'PENDING',
    "reviewedById"        TEXT,
    "reviewedAt"          TIMESTAMP(3),
    "rejectionReason"     TEXT,
    "delegateId"          TEXT,
    "submittedIp"         TEXT,
    "userAgent"           TEXT,
    "createdAt"           TIMESTAMP(3)         NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"           TIMESTAMP(3)         NOT NULL,

    CONSTRAINT "Registration_pkey" PRIMARY KEY ("id")
);

-- The applicant quotes this reference when they chase their application, so it
-- has to resolve to exactly one row.
CREATE UNIQUE INDEX "Registration_reference_key" ON "Registration"("reference");

-- One approved registration owns at most one delegate. NULL stays distinct in
-- Postgres, so every pending and rejected row can sit unlinked.
CREATE UNIQUE INDEX "Registration_delegateId_key" ON "Registration"("delegateId");

-- The review queue reads PENDING newest-first; the email index backs the
-- duplicate-submission check on the public endpoint. Email is deliberately not
-- unique — a rejected applicant may reapply.
CREATE INDEX "Registration_status_createdAt_idx" ON "Registration"("status", "createdAt");
CREATE INDEX "Registration_email_idx" ON "Registration"("email");

-- Deleting the reviewer's account must not delete the application they
-- reviewed, so the reviewer link is nullable and restricted rather than
-- cascading. Same for the delegate: unlinking is a decision, not a side effect.
ALTER TABLE "Registration" ADD CONSTRAINT "Registration_reviewedById_fkey"
    FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Registration" ADD CONSTRAINT "Registration_delegateId_fkey"
    FOREIGN KEY ("delegateId") REFERENCES "Delegate"("id") ON DELETE SET NULL ON UPDATE CASCADE;
