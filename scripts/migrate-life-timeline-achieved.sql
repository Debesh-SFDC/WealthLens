-- Life Timeline: achievement date for events.
-- Adds the nullable life_events.achieved_at column (ISO date, YYYY-MM-DD),
-- set while status = 'done' (shown as "Achieved") and cleared otherwise.
-- Safe to re-run: ADD COLUMN IF NOT EXISTS is a no-op once the column exists.
-- No BEGIN/COMMIT on purpose.
-- Run with: psql "$DATABASE_URL" -f scripts/migrate-life-timeline-achieved.sql
ALTER TABLE life_events ADD COLUMN IF NOT EXISTS achieved_at TEXT;
