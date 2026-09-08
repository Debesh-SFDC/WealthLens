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
  retirement_date        TEXT DEFAULT '2041-08-12',
  updated_at             TEXT,
  device_id              TEXT
);

-- Specific target retirement date (takes priority over DOB + retirement_age in
-- the Retirement Countdown widget). Safe to re-run against an already-live DB.
ALTER TABLE profile ADD COLUMN IF NOT EXISTS retirement_date TEXT DEFAULT '2041-08-12';

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

-- Optional bookkeeping columns (the app scopes goals globally and tracks
-- completion via is_achieved; these are informational only).
ALTER TABLE goals ADD COLUMN IF NOT EXISTS user_id INTEGER;
ALTER TABLE goals ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'active';

-- Seed six planning goals for the admin account. Guarded by title so they are
-- added at most once and not recreated after the user edits/deletes them.
INSERT INTO goals
  (sync_id, user_id, title, type, category, target_amount, current_amount, target_date,
   bank_or_provider, emoji, color, status, notes, created_at, updated_at)
SELECT NULL, 1, v.title, v.type, v.category, v.target_amount, v.current_amount,
       v.target_date, v.bank_or_provider, v.emoji, v.color, 'active', v.notes,
       now()::text, now()::text
FROM (VALUES
  ('Opportunity Fund', 'opportunity_fund', 'need', 500000, 150000, '2027-12-31', 'Arbitrage Mutual Fund', '💼', '#8B5CF6',
   'Build opportunity fund to ₹5L by end of 2027. Currently at ₹1.5L in Arbitrage MF.'),
  ('Moving Fund', 'emergency_fund', 'need', 200000, 37000, '2026-12-31', 'Savings Account', '🏠', '#3B82F6',
   'Need ₹2L for moving expenses by end of 2026. Currently have ₹37K.'),
  ('EcoSport Repainting', 'life_goal', 'want', 90000, 0, '2027-03-31', 'Savings Account', '🚗', '#EF4444',
   'Mars Red to Red Black dual tone repainting. Need ₹90K before March 2027.'),
  ('Work + Gaming Setup', 'life_goal', 'want', 225000, 0, '2027-12-31', 'Savings Account', '🖥️', '#6366F1',
   'Complete work and gaming PC setup. Total budget ₹2.25L by end of 2027.'),
  ('Mom''s Jewellery', 'life_goal', 'need', 250000, 0, '2028-03-31', 'Savings Account', '💍', '#EC4899',
   'Buy jewellery for Mom. Need ₹2.5L before March 2028.'),
  ('Father''s Bike', 'life_goal', 'need', 200000, 0, '2027-09-30', 'Savings Account', '🏍️', '#F97316',
   'Buy a bike for Father. Need ₹2L by next year end (Sep 2027).')
) AS v(title, type, category, target_amount, current_amount, target_date, bank_or_provider, emoji, color, notes)
WHERE EXISTS (SELECT 1 FROM users WHERE id = 1)
  AND NOT EXISTS (SELECT 1 FROM goals g WHERE g.title = v.title);

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

-- Travel module (Phase 1: trips, itinerary, budget; Phase 2: packing, documents,
-- companions) — admin only, fully separate from expenses (no trip_id on expenses,
-- no shared tables). budget_amount is the manually-set planned total; actual spend
-- is derived as SUM(travel_budget_items.actual_amount), computed in the GET route
-- rather than stored redundantly.
CREATE TABLE IF NOT EXISTS travel_trips (
  id             SERIAL PRIMARY KEY,
  sync_id        TEXT UNIQUE,
  title          TEXT NOT NULL,
  destination    TEXT,
  start_date     TEXT,
  end_date       TEXT,
  status         TEXT NOT NULL DEFAULT 'planned' CHECK (status IN ('planned','ongoing','completed')),
  budget_amount  REAL DEFAULT 0,
  emoji          TEXT,
  color          TEXT,
  notes          TEXT,
  created_at     TEXT,
  updated_at     TEXT,
  deleted_at     TEXT,
  device_id      TEXT
);

CREATE TABLE IF NOT EXISTS travel_itinerary_items (
  id           SERIAL PRIMARY KEY,
  sync_id      TEXT UNIQUE,
  trip_id      INTEGER NOT NULL REFERENCES travel_trips(id) ON DELETE CASCADE,
  day_number   INTEGER NOT NULL DEFAULT 1,
  date         TEXT,
  time         TEXT,
  title        TEXT NOT NULL,
  category     TEXT DEFAULT 'activity' CHECK (category IN ('activity','transport','food','stay','other')),
  location     TEXT,
  notes        TEXT,
  sort_order   INTEGER DEFAULT 0,
  created_at   TEXT,
  updated_at   TEXT,
  deleted_at   TEXT,
  device_id    TEXT
);

CREATE TABLE IF NOT EXISTS travel_budget_items (
  id              SERIAL PRIMARY KEY,
  sync_id         TEXT UNIQUE,
  trip_id         INTEGER NOT NULL REFERENCES travel_trips(id) ON DELETE CASCADE,
  category        TEXT NOT NULL DEFAULT 'other' CHECK (category IN ('flights','stay','food','transport','activities','shopping','other')),
  label           TEXT NOT NULL,
  planned_amount  REAL DEFAULT 0,
  actual_amount   REAL DEFAULT 0,
  notes           TEXT,
  created_at      TEXT,
  updated_at      TEXT,
  deleted_at      TEXT,
  device_id       TEXT
);

CREATE TABLE IF NOT EXISTS travel_packing_items (
  id           SERIAL PRIMARY KEY,
  sync_id      TEXT UNIQUE,
  trip_id      INTEGER NOT NULL REFERENCES travel_trips(id) ON DELETE CASCADE,
  item_name    TEXT NOT NULL,
  category     TEXT DEFAULT 'other' CHECK (category IN ('clothing','documents','electronics','toiletries','other')),
  is_packed    INTEGER DEFAULT 0,
  sort_order   INTEGER DEFAULT 0,
  created_at   TEXT,
  updated_at   TEXT,
  deleted_at   TEXT,
  device_id    TEXT
);

CREATE TABLE IF NOT EXISTS travel_documents (
  id           SERIAL PRIMARY KEY,
  sync_id      TEXT UNIQUE,
  trip_id      INTEGER NOT NULL REFERENCES travel_trips(id) ON DELETE CASCADE,
  doc_type     TEXT DEFAULT 'other' CHECK (doc_type IN ('flight','hotel','train','car_rental','insurance','other')),
  title        TEXT NOT NULL,
  details      TEXT,
  created_at   TEXT,
  updated_at   TEXT,
  deleted_at   TEXT,
  device_id    TEXT
);

CREATE TABLE IF NOT EXISTS travel_companions (
  id           SERIAL PRIMARY KEY,
  sync_id      TEXT UNIQUE,
  trip_id      INTEGER NOT NULL REFERENCES travel_trips(id) ON DELETE CASCADE,
  name         TEXT NOT NULL,
  relation     TEXT,
  created_at   TEXT,
  updated_at   TEXT,
  deleted_at   TEXT,
  device_id    TEXT
);

CREATE INDEX IF NOT EXISTS idx_travel_itinerary_trip ON travel_itinerary_items(trip_id);
CREATE INDEX IF NOT EXISTS idx_travel_budget_trip ON travel_budget_items(trip_id);
CREATE INDEX IF NOT EXISTS idx_travel_packing_trip ON travel_packing_items(trip_id);
CREATE INDEX IF NOT EXISTS idx_travel_documents_trip ON travel_documents(trip_id);
CREATE INDEX IF NOT EXISTS idx_travel_companions_trip ON travel_companions(trip_id);

-- Wishlist — a private, per-user list of things to buy someday. Available to
-- both admin and tracker roles; every route/IPC handler scopes to the
-- caller's own user_id, so wishlists are never visible across users.
CREATE TABLE IF NOT EXISTS wishlist_items (
  id              SERIAL PRIMARY KEY,
  sync_id         TEXT UNIQUE,
  user_id         INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name            TEXT NOT NULL,
  brand           TEXT,
  category        TEXT NOT NULL DEFAULT 'Other',
  url             TEXT,
  price           REAL,
  currency        TEXT DEFAULT 'INR',
  priority        TEXT DEFAULT 'medium' CHECK (priority IN ('high','medium','low')),
  status          TEXT DEFAULT 'wishlist' CHECK (status IN ('wishlist','shortlisted','planned','purchased','dropped')),
  purchase_timing TEXT DEFAULT 'No Plan',
  notes           TEXT,
  group_name      TEXT,
  target_month    INTEGER,
  target_year     INTEGER,
  deleted_at      TEXT,
  created_at      TEXT DEFAULT (now()::text),
  updated_at      TEXT DEFAULT (now()::text)
);

CREATE INDEX IF NOT EXISTS idx_wishlist_items_user ON wishlist_items(user_id);

-- Existing installs: add columns if the table pre-dates them.
ALTER TABLE wishlist_items ADD COLUMN IF NOT EXISTS group_name TEXT;
ALTER TABLE wishlist_items ADD COLUMN IF NOT EXISTS target_month INTEGER;
ALTER TABLE wishlist_items ADD COLUMN IF NOT EXISTS target_year INTEGER;

-- Seed one example item for the admin account (id=1), once — guarded with
-- WHERE NOT EXISTS rather than ON CONFLICT since there's no natural unique
-- key to target here, and this script is safe to re-run.
INSERT INTO wishlist_items
  (user_id, name, brand, category, url, purchase_timing, status, priority, notes)
SELECT 1, 'AutoEngina Helmet & Jacket Hanger', 'AutoEngina', 'Home',
  'https://autoengina.com/products/helmet-jacket-hanger-engina-lifestyle?variant=46303575474396',
  'After I Buy a House', 'wishlist', 'medium',
  'Buy this or something similar depending on the new home available wall/storage space.'
WHERE NOT EXISTS (SELECT 1 FROM wishlist_items) AND EXISTS (SELECT 1 FROM users WHERE id = 1);

-- Gaming PC build (MD Computers quote #969081) for the admin account (id=1),
-- as its 8 individual components sharing group_name so the Wishlist UI shows
-- them collapsed under one group header. Replaces the earlier single
-- "Custom Gaming PC Build" line-item. Guarded by group_name so it is safe
-- to re-run.
DELETE FROM wishlist_items WHERE user_id = 1 AND name = 'Custom Gaming PC Build';

INSERT INTO wishlist_items
  (user_id, name, brand, category, url, price, currency, purchase_timing, status, priority, notes, group_name)
SELECT 1, v.name, v.brand, 'PC', 'https://www.mdcomputers.in', v.price, 'INR',
  'Later', 'wishlist', 'high', v.notes, 'Gaming PC Build — Quote #969081'
FROM (VALUES
  ('Intel Core i5-14400 Processor', 'Intel', 23600, 'Model: BX8071514400 | Part of Gaming PC Build Quote #969081'),
  ('Arctic Freezer 36 ARGB CPU Air Cooler', 'Arctic', 4050, 'Model: ACFRE00124A | Part of Gaming PC Build Quote #969081'),
  ('MSI B760M Gaming Plus WiFi6E DDR4 M-ATX Motherboard', 'MSI', 16600, 'Model: B760M-GAMING-PLUS-WIFI-DDR4 | Part of Gaming PC Build Quote #969081'),
  ('Corsair Vengeance LPX 16GB (8GBx2) 3600MHz RAM', 'Corsair', 14999, 'Model: CMK16GX4M2D3600C18 | Part of Gaming PC Build Quote #969081'),
  ('Crucial E100 1TB NVMe Gen4 SSD', 'Crucial', 14980, 'Model: CT1000E100SSD8 | Part of Gaming PC Build Quote #969081'),
  ('Asus Dual RTX 3050 OC Edition 6GB Gaming GPU', 'Asus', 29386, 'Model: DUAL-RTX3050-O6G | Part of Gaming PC Build Quote #969081'),
  ('Corsair RM750e ATX 3.1 Gold Fully Modular PSU', 'Corsair', 10400, 'Model: CP-9020292-IN | Part of Gaming PC Build Quote #969081'),
  ('Lian Li A3-mATX Wood Black Mini Tower Cabinet', 'Lian Li', 8800, 'Model: G99-A3X-WDG-IN | Part of Gaming PC Build Quote #969081')
) AS v(name, brand, price, notes)
WHERE EXISTS (SELECT 1 FROM users WHERE id = 1)
  AND NOT EXISTS (
    SELECT 1 FROM wishlist_items
    WHERE user_id = 1 AND group_name = 'Gaming PC Build — Quote #969081'
  );

-- ── Wishlist collections — folder-style grouping (Reminders lists / boards) ──
CREATE TABLE IF NOT EXISTS wishlist_collections (
  id          SERIAL PRIMARY KEY,
  sync_id     TEXT UNIQUE,
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  description TEXT,
  emoji       TEXT DEFAULT '📦',
  color       TEXT DEFAULT '#6C63FF',
  sort_order  INTEGER DEFAULT 0,
  deleted_at  TEXT,
  created_at  TEXT DEFAULT (now()::text),
  updated_at  TEXT DEFAULT (now()::text)
);
CREATE INDEX IF NOT EXISTS idx_wishlist_collections_user ON wishlist_collections(user_id);

-- collection_id — nullable; cleared (not cascaded) when the collection is
-- removed so items fall back to Uncategorized.
ALTER TABLE wishlist_items ADD COLUMN IF NOT EXISTS collection_id INTEGER REFERENCES wishlist_collections(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_wishlist_items_collection ON wishlist_items(collection_id);

-- One-time migration for admin (id=1): seed defaults only when they have none.
INSERT INTO wishlist_collections (user_id, name, emoji, color, sort_order)
SELECT 1, v.name, v.emoji, v.color, v.sort_order
FROM (VALUES
  ('Scrambler 400X', '🏍️', '#f97316', 1),
  ('Gaming PC',      '🖥️', '#6366f1', 2),
  ('Home Setup',     '🏠', '#22c55e', 3),
  ('Life & Misc',    '✨', '#ec4899', 4)
) AS v(name, emoji, color, sort_order)
WHERE EXISTS (SELECT 1 FROM users WHERE id = 1)
  AND NOT EXISTS (SELECT 1 FROM wishlist_collections WHERE user_id = 1);

-- Sort existing items into collections — single statement so the "nothing
-- assigned yet" guard is evaluated once; a no-op on every later re-run.
UPDATE wishlist_items wi
SET collection_id = c.id, updated_at = now()::text
FROM wishlist_collections c
WHERE wi.user_id = 1 AND wi.collection_id IS NULL AND wi.deleted_at IS NULL
  AND c.user_id = 1 AND c.deleted_at IS NULL
  AND c.name = CASE
    WHEN wi.group_name LIKE '%Gaming PC%' OR wi.category = 'PC' THEN 'Gaming PC'
    WHEN wi.name LIKE '%Helmet%' OR wi.name LIKE '%Hanger%' OR wi.category = 'Home' THEN 'Home Setup'
    ELSE 'Life & Misc'
  END
  AND NOT EXISTS (
    SELECT 1 FROM wishlist_items x
    WHERE x.user_id = 1 AND x.collection_id IS NOT NULL AND x.deleted_at IS NULL
  );

-- Scrambler 400X accessory shortlist — guarded by name so it is safe to re-run.
INSERT INTO wishlist_items
  (user_id, collection_id, name, brand, category, priority, status, purchase_timing, notes)
SELECT 1,
  (SELECT id FROM wishlist_collections WHERE user_id = 1 AND name = 'Scrambler 400X' AND deleted_at IS NULL),
  v.name, v.brand, 'Motorcycle', 'high', 'wishlist', 'Later', v.notes
FROM (VALUES
  ('Engine Guard', 'Triumph', 'Protect engine casing from tip-over damage'),
  ('Knuckle Guard / Hand Guard', 'Triumph', 'Protect hands from wind, debris and tip-overs'),
  ('Mirror Replacement', 'Triumph', 'Stock mirrors vibrate at highway speeds, replace with bar-end or aftermarket'),
  ('Saddle Stay / Luggage Rack', 'Triumph', 'Required to mount saddle bags properly'),
  ('Saddle Bags', 'Triumph', 'For touring — soft panniers preferred, fits 20-30L each side'),
  ('Side Stand Extender', 'Triumph', 'Prevents bike sinking into soft ground when parked on gravel or mud')
) AS v(name, brand, notes)
WHERE EXISTS (SELECT 1 FROM wishlist_collections WHERE user_id = 1 AND name = 'Scrambler 400X' AND deleted_at IS NULL)
  AND NOT EXISTS (
    SELECT 1 FROM wishlist_items x
    JOIN wishlist_collections sc ON sc.id = x.collection_id
    WHERE x.user_id = 1 AND sc.name = 'Scrambler 400X' AND x.name = v.name
  );

-- One-off: "Ford EcoSport" collection + its full-body-repaint item for admin.
-- Guarded by name so it is added at most once and not resurrected after delete.
INSERT INTO wishlist_collections (user_id, name, emoji, color, sort_order)
SELECT 1, 'Ford EcoSport', '🚗', '#ef4444', 5
WHERE EXISTS (SELECT 1 FROM users WHERE id = 1)
  AND NOT EXISTS (SELECT 1 FROM wishlist_collections WHERE user_id = 1 AND name = 'Ford EcoSport');

INSERT INTO wishlist_items
  (user_id, collection_id, name, brand, category, price, currency, priority, status, purchase_timing, notes)
SELECT 1,
  (SELECT id FROM wishlist_collections WHERE user_id = 1 AND name = 'Ford EcoSport' ORDER BY id ASC LIMIT 1),
  'Full Body Repainting — Mars Red to Red Black Dual Tone',
  'Local Auto Body Shop', 'Automobile', 90000, 'INR', 'medium', 'wishlist', 'Later',
  'Change current Mars Red color to Red Black dual tone finish. Get quotes from multiple body shops before finalizing. Check if factory dual tone is available as vinyl wrap alternative.'
WHERE EXISTS (SELECT 1 FROM wishlist_collections WHERE user_id = 1 AND name = 'Ford EcoSport')
  AND NOT EXISTS (
    SELECT 1 FROM wishlist_items
    WHERE user_id = 1 AND name = 'Full Body Repainting — Mars Red to Red Black Dual Tone'
  );
