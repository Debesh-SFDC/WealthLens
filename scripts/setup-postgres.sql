-- Lifelog Postgres schema — mirrors src/db/database.js (SQLite) as of the
-- Hostinger-readiness pass. Run with: psql $DATABASE_URL < scripts/setup-postgres.sql
--
-- Portability note: booleans (is_active, is_achieved, inflation_adjust, is_default)
-- are INTEGER (0/1), and all date/timestamp columns are TEXT (ISO 8601 strings),
-- not native BOOLEAN/TIMESTAMPTZ. This is deliberate — src/server/db.js runs the
-- exact same SQL text against SQLite and Postgres (see its header comment), and
-- native Postgres booleans/timestamps would silently break comparisons like
-- `is_active = 1` or `date LIKE 'YYYY-MM%'` that both engines need to share.

CREATE TABLE IF NOT EXISTS users (
  id             SERIAL PRIMARY KEY,
  name           TEXT NOT NULL,
  role           TEXT NOT NULL CHECK (role IN ('admin','tracker')),
  pin_hash       TEXT NOT NULL,
  avatar_color   TEXT DEFAULT '#6C63FF',
  created_at     TEXT DEFAULT (now()::text),
  last_login_at  TEXT,
  pin_version    INTEGER DEFAULT 1,
  height_cm      REAL DEFAULT 0,
  date_of_birth  TEXT
);

-- Unified mobile+password auth (replaces per-user PIN login). pin_hash stays
-- in place — nothing reads it anymore, kept only so the column isn't NULL.
-- ADD COLUMN IF NOT EXISTS makes this safe to re-run against an already-live DB.
ALTER TABLE users ADD COLUMN IF NOT EXISTS mobile_number TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS password_hash TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_mobile ON users(mobile_number);

-- Per-user weight-profile field for the Dashboard/Settings weight trend card.
ALTER TABLE users ADD COLUMN IF NOT EXISTS target_weight_kg REAL;

-- Default admin/tracker accounts. Passwords below are bcrypt hashes of
-- 'Admin@1234' / 'Tracker@1234' — change them in Settings immediately after
-- first login (the app shows a one-time banner reminding you to).
INSERT INTO users (name, role, pin_hash, mobile_number, password_hash)
VALUES ('Debesh', 'admin', '$2a$10$1d1Myr3UrFthN52yq9vN9OgyJCT0r7CMLCCMVHRZyQDUBsA4KfUda',
        '9000000001', '$2a$10$1d1Myr3UrFthN52yq9vN9OgyJCT0r7CMLCCMVHRZyQDUBsA4KfUda')
ON CONFLICT (mobile_number) DO NOTHING;

INSERT INTO users (name, role, pin_hash, mobile_number, password_hash)
VALUES ('Spouse', 'tracker', '$2a$10$WRanmCFqtiGZOMA3ofmfduA6oH13umJS2gDYsPsoaUDYxM0RIuQSi',
        '9000000002', '$2a$10$WRanmCFqtiGZOMA3ofmfduA6oH13umJS2gDYsPsoaUDYxM0RIuQSi')
ON CONFLICT (mobile_number) DO NOTHING;

CREATE TABLE IF NOT EXISTS profile (
  id                     SERIAL PRIMARY KEY,
  sync_id                TEXT UNIQUE,
  name                   TEXT NOT NULL,
  monthly_salary         REAL DEFAULT 0,
  salary_updated_at      TEXT,
  tracker_monthly_budget REAL DEFAULT 0,
  date_of_birth          TEXT,
  retirement_age         INTEGER DEFAULT 60,
  updated_at             TEXT,
  device_id              TEXT
);

CREATE TABLE IF NOT EXISTS goals (
  id                INTEGER PRIMARY KEY,
  sync_id           TEXT UNIQUE,
  title             TEXT NOT NULL,
  type              TEXT NOT NULL DEFAULT 'life_goal'
                       CHECK (type IN ('emergency_fund','opportunity_fund','life_goal','debt_payoff','custom')),
  category          TEXT NOT NULL DEFAULT 'need' CHECK (category IN ('need','want')),
  target_amount     REAL NOT NULL DEFAULT 0,
  current_amount    REAL DEFAULT 0,
  target_date       TEXT,
  bank_or_provider  TEXT,
  emoji             TEXT,
  color             TEXT,
  inflation_adjust  INTEGER DEFAULT 0,
  inflation_rate    REAL DEFAULT 6,
  monthly_emi       REAL DEFAULT 0,
  notes             TEXT,
  is_achieved       INTEGER DEFAULT 0,
  achieved_at       TEXT,
  last_synced_at    TEXT,
  created_at        TEXT,
  updated_at        TEXT,
  deleted_at        TEXT,
  device_id         TEXT
);
CREATE SEQUENCE IF NOT EXISTS goals_id_seq OWNED BY goals.id;
ALTER TABLE goals ALTER COLUMN id SET DEFAULT nextval('goals_id_seq');
SELECT setval('goals_id_seq', COALESCE((SELECT MAX(id) FROM goals), 1));

CREATE TABLE IF NOT EXISTS investments (
  id                   INTEGER PRIMARY KEY,
  sync_id              TEXT UNIQUE,
  name                 TEXT NOT NULL,
  type                 TEXT NOT NULL,
  provider             TEXT,
  bank_or_amc          TEXT,
  account_number       TEXT,
  invested_amount      REAL DEFAULT 0,
  current_value        REAL DEFAULT 0,
  monthly_sip_amount   REAL DEFAULT 0,
  sip_frequency        TEXT DEFAULT 'monthly',
  start_date           TEXT,
  maturity_date        TEXT,
  goal_id              INTEGER REFERENCES goals(id) ON DELETE SET NULL,
  last_updated_at      TEXT,
  notes                TEXT,
  units                REAL DEFAULT 0,
  purchase_price       REAL DEFAULT 0,
  scheme_code          TEXT,
  interest_rate        REAL DEFAULT 0,
  ticker_symbol        TEXT,
  exchange             TEXT DEFAULT 'NSE',
  purity               TEXT DEFAULT '24K',
  deposited_so_far     REAL,
  nps_equity_pct       INTEGER DEFAULT 75,
  sip_last_applied_at  TEXT,
  created_at           TEXT,
  deleted_at           TEXT,
  device_id            TEXT
);
CREATE SEQUENCE IF NOT EXISTS investments_id_seq OWNED BY investments.id;
ALTER TABLE investments ALTER COLUMN id SET DEFAULT nextval('investments_id_seq');
SELECT setval('investments_id_seq', COALESCE((SELECT MAX(id) FROM investments), 1));

CREATE TABLE IF NOT EXISTS goal_investments (
  id             SERIAL PRIMARY KEY,
  sync_id        TEXT UNIQUE,
  goal_id        INTEGER NOT NULL REFERENCES goals(id) ON DELETE CASCADE,
  investment_id  INTEGER NOT NULL REFERENCES investments(id) ON DELETE CASCADE,
  created_at     TEXT,
  updated_at     TEXT,
  deleted_at     TEXT,
  device_id      TEXT,
  UNIQUE (goal_id, investment_id)
);

CREATE TABLE IF NOT EXISTS goal_contributions (
  id                 SERIAL PRIMARY KEY,
  sync_id            TEXT UNIQUE,
  goal_id            INTEGER NOT NULL REFERENCES goals(id) ON DELETE CASCADE,
  amount             REAL NOT NULL,
  note               TEXT,
  contributed_at     TEXT NOT NULL,
  contribution_type  TEXT NOT NULL DEFAULT 'manual' CHECK (contribution_type IN ('manual','auto_linked')),
  created_at         TEXT,
  updated_at         TEXT,
  deleted_at         TEXT,
  device_id          TEXT
);

CREATE TABLE IF NOT EXISTS salary_allocations (
  id          SERIAL PRIMARY KEY,
  category    TEXT NOT NULL CHECK (category IN ('mutual_fund','insurance','emergency','expenses','savings','other')),
  label       TEXT NOT NULL,
  percentage  REAL DEFAULT 0,
  amount      REAL DEFAULT 0,
  provider    TEXT,
  bank        TEXT,
  color       TEXT,
  created_at  TEXT
);

CREATE TABLE IF NOT EXISTS salary_plans (
  id              SERIAL PRIMARY KEY,
  sync_id         TEXT UNIQUE,
  label           TEXT NOT NULL,
  monthly_salary  REAL NOT NULL DEFAULT 0,
  effective_from  TEXT NOT NULL,
  effective_to    TEXT,
  is_active       INTEGER NOT NULL DEFAULT 0,
  notes           TEXT,
  created_at      TEXT,
  updated_at      TEXT,
  deleted_at      TEXT,
  device_id       TEXT
);

CREATE TABLE IF NOT EXISTS salary_plan_items (
  id                SERIAL PRIMARY KEY,
  sync_id           TEXT UNIQUE,
  plan_id           INTEGER NOT NULL REFERENCES salary_plans(id) ON DELETE CASCADE,
  name              TEXT NOT NULL,
  amount            REAL NOT NULL DEFAULT 0,
  category          TEXT NOT NULL DEFAULT 'needs' CHECK (category IN ('needs','wants','investment')),
  bank_or_provider  TEXT,
  sort_order        INTEGER DEFAULT 0,
  created_at        TEXT,
  updated_at        TEXT,
  deleted_at        TEXT,
  device_id         TEXT
);

CREATE TABLE IF NOT EXISTS expenses (
  id                  SERIAL PRIMARY KEY,
  sync_id             TEXT UNIQUE,
  amount              REAL NOT NULL,
  category            TEXT NOT NULL,
  note                TEXT,
  date                TEXT NOT NULL,
  logged_by_user_id   INTEGER REFERENCES users(id),
  created_at          TEXT,
  updated_at          TEXT,
  deleted_at          TEXT,
  device_id           TEXT
);

CREATE TABLE IF NOT EXISTS expense_categories (
  id          SERIAL PRIMARY KEY,
  name        TEXT NOT NULL UNIQUE,
  icon        TEXT,
  color       TEXT,
  is_default  INTEGER DEFAULT 0
);

-- is_default is INTEGER (not boolean) to match every other flag column in this
-- schema (e.g. salary_plans.is_active) — use 1, not true, or Postgres rejects it.
INSERT INTO expense_categories (name, icon, color, is_default)
VALUES ('Grocery', '🛒', '#22c55e', 1)
ON CONFLICT (name) DO NOTHING;

CREATE TABLE IF NOT EXISTS weight_logs (
  id          SERIAL PRIMARY KEY,
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  weight_kg   REAL NOT NULL,
  date        TEXT NOT NULL,
  note        TEXT,
  created_at  TEXT,
  UNIQUE (user_id, date)
);

CREATE TABLE IF NOT EXISTS rebalancing_actions (
  id                SERIAL PRIMARY KEY,
  suggestion_text   TEXT NOT NULL UNIQUE,
  status            TEXT DEFAULT 'pending' CHECK (status IN ('pending','done')),
  created_at        TEXT,
  completed_at      TEXT
);

CREATE TABLE IF NOT EXISTS sync_log (
  id               SERIAL PRIMARY KEY,
  synced_at        TEXT NOT NULL,
  device_id        TEXT NOT NULL,
  status           TEXT NOT NULL CHECK (status IN ('success','failed')),
  rows_uploaded    INTEGER DEFAULT 0,
  rows_downloaded  INTEGER DEFAULT 0,
  error_message    TEXT
);

CREATE INDEX IF NOT EXISTS idx_goal_investments_goal ON goal_investments(goal_id);
CREATE INDEX IF NOT EXISTS idx_goal_investments_investment ON goal_investments(investment_id);
CREATE INDEX IF NOT EXISTS idx_goal_contributions_goal ON goal_contributions(goal_id);
CREATE INDEX IF NOT EXISTS idx_weight_logs_user_date ON weight_logs(user_id, date);
CREATE INDEX IF NOT EXISTS idx_sync_log_synced_at ON sync_log(synced_at DESC);
