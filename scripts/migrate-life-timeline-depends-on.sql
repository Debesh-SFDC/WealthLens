-- Life Timeline: "Happens after" links between events.
-- Adds the nullable life_events.depends_on_id column (another life_events.id;
-- no foreign key, matching goal_id). Safe to re-run: ADD COLUMN IF NOT EXISTS
-- is a no-op once the column exists. No BEGIN/COMMIT on purpose.
-- Run with: psql "$DATABASE_URL" -f scripts/migrate-life-timeline-depends-on.sql
ALTER TABLE life_events ADD COLUMN IF NOT EXISTS depends_on_id INTEGER;
