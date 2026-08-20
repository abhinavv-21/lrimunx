-- Attendance becomes per-day: 21, 22 and 23 November 2026.
--
-- The old single "Delegate"."attendanceStatus" could only say whether a
-- delegate had ever been seen. Checking someone in on day 2 overwrote day 1, so
-- "who was here for the ceremony" was a question the database could not answer.
--
-- THE COLUMN IS NOT DROPPED, and that is the point of the ordering below. Every
-- CHECKED_IN delegate is carried into a day 1 row BEFORE anything else happens,
-- so this migration cannot lose an attendance mark. The column then stays, as a
-- maintained mirror of "checked in on at least one day" — the delegates list,
-- the exports and the dashboard all count on it, and the attendance routes
-- rewrite it on every change.

CREATE TABLE "DelegateAttendance" (
    "id"         TEXT               NOT NULL,
    "delegateId" TEXT               NOT NULL,
    "day"        INTEGER            NOT NULL,
    "status"     "AttendanceStatus" NOT NULL DEFAULT 'ABSENT',
    "createdAt"  TIMESTAMP(3)       NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"  TIMESTAMP(3)       NOT NULL,

    CONSTRAINT "DelegateAttendance_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "DelegateAttendance_delegateId_day_key"
    ON "DelegateAttendance"("delegateId", "day");

CREATE INDEX "DelegateAttendance_day_status_idx" ON "DelegateAttendance"("day", "status");

ALTER TABLE "DelegateAttendance" ADD CONSTRAINT "DelegateAttendance_delegateId_fkey"
    FOREIGN KEY ("delegateId") REFERENCES "Delegate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Carry the existing data across. Anyone currently CHECKED_IN was checked in on
-- the only day the old model had, which is day 1.
--
-- gen_random_uuid() is pgcrypto, in core since PostgreSQL 13; the ids only have
-- to be unique, nothing reads them back. ABSENT delegates get no row: absence
-- is the default the API writes when someone actually looks at day 1.
INSERT INTO "DelegateAttendance" ("id", "delegateId", "day", "status", "createdAt", "updatedAt")
SELECT gen_random_uuid(), "id", 1, 'CHECKED_IN', "updatedAt", "updatedAt"
FROM "Delegate"
WHERE "attendanceStatus" = 'CHECKED_IN';
