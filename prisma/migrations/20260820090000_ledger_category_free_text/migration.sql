-- Ledger categories become free text.
--
-- The ten-member enum could not hold an expense nobody predicted, and a
-- conference always has one, so everything unforeseen was being filed under
-- MISC — one bucket that says nothing at closing.
--
-- The column is converted IN PLACE with a USING clause, never dropped and
-- re-added: there are live rows here and on Neon, and Prisma's own generated
-- diff for this change is `DROP COLUMN` followed by `ADD COLUMN`, which would
-- take every category with it. The index is not touched either — Postgres
-- rebuilds "LedgerEntry_category_idx" as part of the type change.
--
-- Each enum member becomes the label the hub was already printing for it, so
-- what is stored is now exactly what a treasurer reads on the screen and types
-- into the box. MISC spells itself out; the abbreviation was only ever there
-- because an enum member cannot have a space in it.

ALTER TABLE "LedgerEntry"
    ALTER COLUMN "category" TYPE TEXT
    USING (
        CASE "category"::text
            WHEN 'REGISTRATION' THEN 'Registration'
            WHEN 'SPONSORSHIP'  THEN 'Sponsorship'
            WHEN 'VENUE'        THEN 'Venue'
            WHEN 'FOOD'         THEN 'Food'
            WHEN 'PRINTING'     THEN 'Printing'
            WHEN 'AWARDS'       THEN 'Awards'
            WHEN 'TRANSPORT'    THEN 'Transport'
            WHEN 'HOSPITALITY'  THEN 'Hospitality'
            WHEN 'MARKETING'    THEN 'Marketing'
            WHEN 'MISC'         THEN 'Miscellaneous'
            ELSE "category"::text
        END
    );

DROP TYPE "LedgerCategory";
