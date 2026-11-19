-- One-off: the ₹1 Cr net worth goal, linked to the "Make 1st crore" Life
-- Timeline event (user_id = 1). Run AFTER scripts/life-timeline-update-2026-11-19.sql
-- (that script creates the event). Run with:
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f scripts/networth-goal-2026-11-19.sql
--
-- Safe to re-run: ADD COLUMN IF NOT EXISTS, the INSERT is guarded by a
-- NOT EXISTS on a live goal titled like '%1st crore%', and the UPDATE skips an
-- event that already points at the goal (so updated_at is bumped once). No
-- BEGIN/COMMIT on purpose. Each statement commits on its own, so a problem in
-- the read-only check SELECTs at the end can't undo the changes above it.
--
-- Conventions (same as src/server/routes/goals.js and the life timeline
-- script): sync_id is a random UUID (built from md5(), no extension needed);
-- created_at / updated_at are TEXT ISO 8601 UTC like JS toISOString(); flags
-- are INTEGER 0/1; live rows have deleted_at IS NULL.

-- ── Schema: auto-tracked goals ───────────────────────────────────────────────
-- 'net_worth': the API returns the live net worth as current_amount (the
-- stored column is only a cache). Same as scripts/setup-postgres.sql.
ALTER TABLE goals ADD COLUMN IF NOT EXISTS auto_source TEXT;

-- ── The goal ───────────────────────────────────────────────────────────────
-- Goals are one global list in this app (no per-user scope in the API);
-- user_id = 1 and status = 'active' are informational, as on the seeded goals.
-- current_amount starts at 0: it is never read for an auto-tracked goal.
INSERT INTO goals
  (sync_id, user_id, title, type, category, target_amount, current_amount, target_date,
   emoji, color, inflation_adjust, inflation_rate, monthly_emi, notes,
   is_achieved, achieved_at, status, auto_source, created_at, updated_at, sort_order)
SELECT md5(random()::text || clock_timestamp()::text)::uuid::text, 1,
       'Make 1st crore', 'life_goal', 'need', 10000000, 0, '2028-10-31',
       '👑', '#D4AF37', 0, 6, 0,
       'Net worth target: ₹1 Cr by 31 Oct 2028. Tracks the Net Worth page automatically.',
       0, NULL, 'active', 'net_worth',
       to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
       to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
       (SELECT COALESCE(MAX(sort_order), -1) + 1 FROM goals WHERE deleted_at IS NULL)
WHERE NOT EXISTS (SELECT 1 FROM goals WHERE deleted_at IS NULL AND title ILIKE '%1st crore%');

-- ── Link the timeline event to it (one item on the timeline) ─────────────────
-- If more than one live goal matches, the oldest wins.
UPDATE life_events e
SET goal_id = g.id,
    updated_at = to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
FROM (SELECT id FROM goals WHERE deleted_at IS NULL AND title ILIKE '%1st crore%' ORDER BY id LIMIT 1) g
WHERE e.user_id = 1 AND e.deleted_at IS NULL
  AND e.title ILIKE '%1st crore%'
  AND e.goal_id IS DISTINCT FROM g.id;

-- ── Check the result ─────────────────────────────────────────────────────────

SELECT id, sync_id, title, type, target_amount, target_date, emoji, color,
       auto_source, is_achieved, notes, created_at, updated_at
FROM goals
WHERE deleted_at IS NULL AND title ILIKE '%1st crore%'
ORDER BY id;

SELECT e.id, e.year, e.month, e.title, e.is_major, e.goal_id, g.title AS goal_title, e.updated_at
FROM life_events e
LEFT JOIN goals g ON g.id = e.goal_id
WHERE e.user_id = 1 AND e.deleted_at IS NULL AND e.title ILIKE '%1st crore%';

-- Live net worth, computed like src/shared/netWorth.mjs (effectiveCurrentValue
-- summed over live investments), so it should equal the Net Worth page:
--   insurance: maturity amount once matured, else whole months elapsed
--              (30.4375-day months) capped at premium years x 12, x premium
--   rd:        maturity amount once matured, else months elapsed capped at
--              the tenure (units), x instalment
--   others:    current_value
-- REAL columns go through ::text so each value is the number node-pg hands
-- the server (it parses Postgres' text output). Dates are read as UTC
-- midnight, like JS new Date('YYYY-MM-DD'); a stored date with a time part
-- could differ by a month boundary from the JS figure.
WITH v AS (
  SELECT type,
         COALESCE(current_value::text::double precision, 0)      AS current_value,
         COALESCE(monthly_sip_amount::text::double precision, 0) AS monthly,
         COALESCE(interest_rate::text::double precision, 0)      AS premium_years,
         COALESCE(units::text::double precision, 0)              AS tenure_months,
         COALESCE(purchase_price::text::double precision, 0)     AS maturity_amt,
         CASE WHEN start_date ~ '^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])'
              THEN extract(epoch FROM (left(start_date, 10)::date)::timestamp) * 1000 END AS start_ms,
         CASE WHEN maturity_date ~ '^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])'
              THEN extract(epoch FROM (left(maturity_date, 10)::date)::timestamp) * 1000 END AS maturity_ms,
         extract(epoch FROM now()) * 1000 AS now_ms
  FROM investments
  WHERE deleted_at IS NULL
)
SELECT round(SUM(
         CASE
           WHEN type IN ('insurance', 'rd') THEN
             CASE
               WHEN start_ms IS NULL OR monthly = 0 THEN 0
               WHEN maturity_ms IS NOT NULL AND now_ms >= maturity_ms THEN maturity_amt
               ELSE LEAST(floor((now_ms - start_ms) / (30.4375 * 24 * 60 * 60 * 1000)),
                          CASE WHEN type = 'insurance' THEN round(premium_years * 12) ELSE tenure_months END)
                    * monthly
             END
           ELSE current_value
         END)::numeric, 0) AS live_net_worth
FROM v;
