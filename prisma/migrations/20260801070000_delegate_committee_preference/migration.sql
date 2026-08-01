-- The delegate's committee preference, as answered on the registration form.
--
-- Nullable and additive: every existing delegate keeps their row and simply
-- carries NULL until a form or CSV import supplies a preference. Hand-written
-- so it applies with `migrate deploy` against live data.

ALTER TABLE "Delegate" ADD COLUMN "committeePreference" TEXT;
