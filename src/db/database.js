import Database from 'better-sqlite3'
import { app } from 'electron'
import { join } from 'path'
import bcrypt from 'bcryptjs'
import { randomUUID } from 'crypto'

let db

export function initDatabase() {
  const dbPath = join(app.getPath('userData'), 'wealthlens.db')
  db = new Database(dbPath)
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')
  createTables()
  migrateInvestments()
  migrateInvestmentsV2()
  migrateInvestmentsV3()
  seedDefaultCategories()
  migrateCategories()
  createSalaryPlanTables()
  seedSalaryPlan()
  createUsersTable()
  migrateExpensesAddUser()
  migrateExpensesAddSyncId()
  seedUsers()
  migrateUserPinsToSixDigit()
  seedTrackerBudget()
  migrateProfileV2()
  migrateWeightTracking()
  migrateRebalancingActions()
  migrateGoalsV2()
  migrateGoalsV3()
  migrateGoalInvestmentsJunction()
  migrateSyncColumns()
  createSyncLogTable()
  return db
}

function createTables() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS profile (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      monthly_salary REAL DEFAULT 0,
      salary_updated_at TEXT
    );

    CREATE TABLE IF NOT EXISTS goals (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      type TEXT CHECK(type IN ('need', 'want')) NOT NULL DEFAULT 'need',
      target_amount REAL NOT NULL DEFAULT 0,
      current_amount_today REAL DEFAULT 0,
      inflation_rate REAL DEFAULT 6,
      target_year INTEGER,
      target_age INTEGER,
      emoji TEXT,
      color TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      is_achieved INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS investments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      type TEXT CHECK(type IN ('mf_sip','mf_lumpsum','epf','ppf','nps','stocks','fd','gold','rd')) NOT NULL,
      provider TEXT,
      bank_or_amc TEXT,
      account_number TEXT,
      invested_amount REAL DEFAULT 0,
      current_value REAL DEFAULT 0,
      monthly_sip_amount REAL DEFAULT 0,
      start_date TEXT,
      maturity_date TEXT,
      goal_id INTEGER REFERENCES goals(id) ON DELETE SET NULL,
      last_updated_at TEXT DEFAULT (datetime('now')),
      notes TEXT
    );

    CREATE TABLE IF NOT EXISTS salary_allocations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      category TEXT CHECK(category IN ('mutual_fund','insurance','emergency','expenses','savings','other')) NOT NULL,
      label TEXT NOT NULL,
      percentage REAL DEFAULT 0,
      amount REAL DEFAULT 0,
      provider TEXT,
      bank TEXT,
      color TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS expenses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      amount REAL NOT NULL,
      category TEXT NOT NULL,
      note TEXT,
      date TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS expense_categories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      icon TEXT,
      color TEXT,
      is_default INTEGER DEFAULT 0
    );
  `)
}

// Add columns introduced after initial schema — safe to run on existing DBs
function migrateInvestments() {
  const add = (col, type) => {
    try { db.exec(`ALTER TABLE investments ADD COLUMN ${col} ${type}`) } catch {}
  }
  add('units',          'REAL DEFAULT 0')
  add('purchase_price', 'REAL DEFAULT 0')
  add('scheme_code',    'TEXT')
  add('interest_rate',  'REAL DEFAULT 0')
  add('ticker_symbol',  'TEXT')
  add('exchange',       'TEXT DEFAULT "NSE"')
  add('purity',         'TEXT DEFAULT "24K"')
}

// Adds sip_frequency column and removes the restrictive type CHECK so 'insurance' is allowed
function migrateInvestmentsV2() {
  // Step 1: sip_frequency column — safe no-op if already exists
  try { db.exec("ALTER TABLE investments ADD COLUMN sip_frequency TEXT DEFAULT 'monthly'") } catch {}

  // Step 2: check whether the type column still has the old restrictive CHECK
  const row = db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='investments'").get()
  if (!row || !row.sql.includes("CHECK") || row.sql.includes("'insurance'")) return

  // Step 3: recreate table without the CHECK constraint so any type string is valid
  db.pragma('foreign_keys = OFF')
  const doMigration = db.transaction(() => {
    db.exec(`
      CREATE TABLE investments_v2 (
        id                 INTEGER PRIMARY KEY AUTOINCREMENT,
        name               TEXT    NOT NULL,
        type               TEXT    NOT NULL,
        provider           TEXT,
        bank_or_amc        TEXT,
        account_number     TEXT,
        invested_amount    REAL    DEFAULT 0,
        current_value      REAL    DEFAULT 0,
        monthly_sip_amount REAL    DEFAULT 0,
        sip_frequency      TEXT    DEFAULT 'monthly',
        start_date         TEXT,
        maturity_date      TEXT,
        goal_id            INTEGER REFERENCES goals(id) ON DELETE SET NULL,
        last_updated_at    TEXT    DEFAULT (datetime('now')),
        notes              TEXT,
        units              REAL    DEFAULT 0,
        purchase_price     REAL    DEFAULT 0,
        scheme_code        TEXT,
        interest_rate      REAL    DEFAULT 0,
        ticker_symbol      TEXT,
        exchange           TEXT    DEFAULT 'NSE',
        purity             TEXT    DEFAULT '24K'
      );
    `)
    db.exec(`
      INSERT INTO investments_v2
        (id, name, type, provider, bank_or_amc, account_number,
         invested_amount, current_value, monthly_sip_amount, sip_frequency,
         start_date, maturity_date, goal_id, last_updated_at, notes,
         units, purchase_price, scheme_code, interest_rate,
         ticker_symbol, exchange, purity)
      SELECT
        id, name, type, provider, bank_or_amc, account_number,
        invested_amount, current_value, monthly_sip_amount,
        COALESCE(sip_frequency, 'monthly'),
        start_date, maturity_date, goal_id, last_updated_at, notes,
        COALESCE(units, 0), COALESCE(purchase_price, 0), scheme_code,
        COALESCE(interest_rate, 0), ticker_symbol,
        COALESCE(exchange, 'NSE'), COALESCE(purity, '24K')
      FROM investments;
    `)
    db.exec(`DROP TABLE investments;`)
    db.exec(`ALTER TABLE investments_v2 RENAME TO investments;`)
  })
  doMigration()
  db.pragma('foreign_keys = ON')
}

// Adds sip_last_applied_at so autoApplySIPs can track which periods have been credited
function migrateInvestmentsV3() {
  try { db.exec('ALTER TABLE investments ADD COLUMN sip_last_applied_at TEXT') } catch {}
  // Initialise existing rows to NOW so we never retroactively credit historical SIPs
  db.exec("UPDATE investments SET sip_last_applied_at = datetime('now') WHERE sip_last_applied_at IS NULL")
}

function seedDefaultCategories() {
  const { count } = db.prepare('SELECT COUNT(*) as count FROM expense_categories').get()
  if (count > 0) return

  const insert = db.prepare(
    'INSERT INTO expense_categories (name, icon, color, is_default) VALUES (?, ?, ?, 1)'
  )
  const defaults = [
    ['Food & Dining', '🍔', '#FF6B6B'],
    ['Transportation', '🚗', '#4ECDC4'],
    ['Shopping', '🛍️', '#45B7D1'],
    ['Entertainment', '🎬', '#96CEB4'],
    ['Healthcare', '💊', '#FF85A1'],
    ['Utilities', '⚡', '#DDA0DD'],
    ['Rent', '🏠', '#98D8C8'],
    ['Education', '📚', '#F7DC6F'],
    ['Travel', '✈️', '#82E0AA'],
    ['Bills', '📄', '#6366F1'],
    ['EMI', '🏦', '#EF4444'],
    ['Others', '💸', '#AEB6BF'],
  ]
  for (const [name, icon, color] of defaults) {
    insert.run(name, icon, color)
  }
}

function migrateCategories() {
  const add = db.prepare('INSERT OR IGNORE INTO expense_categories (name, icon, color, is_default) VALUES (?, ?, ?, 1)')
  const newCats = [
    ['Bills', '📄', '#6366F1'],
    ['EMI', '🏦', '#EF4444'],
  ]
  for (const [name, icon, color] of newCats) {
    add.run(name, icon, color)
  }
}

function createSalaryPlanTables() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS salary_plans (
      id             INTEGER PRIMARY KEY AUTOINCREMENT,
      label          TEXT    NOT NULL,
      monthly_salary REAL    NOT NULL DEFAULT 0,
      effective_from TEXT    NOT NULL,
      effective_to   TEXT,
      is_active      INTEGER NOT NULL DEFAULT 0,
      notes          TEXT,
      created_at     TEXT    DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS salary_plan_items (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      plan_id         INTEGER NOT NULL REFERENCES salary_plans(id) ON DELETE CASCADE,
      name            TEXT    NOT NULL,
      amount          REAL    NOT NULL DEFAULT 0,
      category        TEXT    CHECK(category IN ('needs','wants','investment')) NOT NULL DEFAULT 'needs',
      bank_or_provider TEXT,
      sort_order      INTEGER DEFAULT 0
    );
  `)
}

function seedSalaryPlan() {
  const { count } = db.prepare('SELECT COUNT(*) as count FROM salary_plans').get()
  if (count > 0) return

  const plan = db.prepare(
    `INSERT INTO salary_plans (label, monthly_salary, effective_from, is_active) VALUES (?, ?, ?, 1)`
  ).run('Plan 1 - Jun 2026', 197500, '2026-06-01')

  const ins = db.prepare(
    `INSERT INTO salary_plan_items (plan_id, name, amount, category, bank_or_provider, sort_order)
     VALUES (?, ?, ?, ?, ?, ?)`
  )

  const items = [
    ['Rent',                      14000, 'needs',      'HDFC'],
    ['Broadband Bill',             1000,  'needs',      'IDFC'],
    ['Health Insurance',           9000,  'needs',      'SBI'],
    ['Outing',                     4000,  'wants',      'IDFC'],
    ['Food, Grocery, Vegetables', 13000,  'needs',      'Pragyan'],
    ['Electricity Bill',           2600,  'needs',      'IDFC'],
    ['Mobile Bill',                 900,  'needs',      'IDFC'],
    ['Equipment Maintenance',      1500,  'needs',      'IDBI'],
    ['Vehicle Maintenance',        2500,  'wants',      'IDBI'],
    ['Subscriptions',              1150,  'wants',      'IDFC'],
    ['Others',                     5000,  'needs',      'HDFC'],
    ['Vehicle Insurance',          2250,  'wants',      'IDBI'],
    ['Fuel Expense',               8000,  'wants',      'IDFC'],
    ['Vacation',                  10000,  'wants',      'IDFC'],
    ['Maid',                       2000,  'needs',      'Pragyan'],
    ['Mutual Fund',               50000,  'investment', 'AXIS'],
    ['Bajaj Allianz',              4500,  'investment', 'SBI'],
    ['Emergency Fund',            25000,  'investment', 'SBI'],
    ['Stocks/Crypto',             15000,  'investment', 'AXIS'],
    ['Term Insurance',             1750,  'needs',      'IDFC'],
    ['PPF',                       12500,  'investment', 'SBI'],
    ['Next Car',                   2850,  'wants',      'IDBI'],
    ['Opportunity Fund',           9000,  'investment', 'AXIS'],
  ]

  items.forEach(([name, amount, category, bank_or_provider], i) => {
    ins.run(plan.lastInsertRowid, name, amount, category, bank_or_provider, i)
  })
}

// ── Users ──────────────────────────────────────────────────────────────────

function createUsersTable() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      role TEXT CHECK(role IN ('admin','tracker')) NOT NULL,
      pin_hash TEXT NOT NULL,
      avatar_color TEXT DEFAULT '#6C63FF',
      created_at TEXT DEFAULT (datetime('now')),
      last_login_at TEXT
    );
  `)
}

function migrateExpensesAddUser() {
  try { db.exec('ALTER TABLE expenses ADD COLUMN logged_by_user_id INTEGER REFERENCES users(id)') } catch {}
}

function migrateExpensesAddSyncId() {
  try { db.exec('ALTER TABLE expenses ADD COLUMN sync_id TEXT') } catch {}
  const rows = db.prepare('SELECT id FROM expenses WHERE sync_id IS NULL').all()
  const upd  = db.prepare('UPDATE expenses SET sync_id = ? WHERE id = ?')
  for (const row of rows) upd.run(randomUUID(), row.id)
  try { db.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_expenses_sync_id ON expenses(sync_id)') } catch {}
}

function seedUsers() {
  const { count } = db.prepare('SELECT COUNT(*) as count FROM users').get()
  if (count > 0) return

  const insert = db.prepare(
    'INSERT INTO users (name, role, pin_hash, avatar_color) VALUES (?, ?, ?, ?)'
  )
  insert.run('Debesh', 'admin', bcrypt.hashSync('123456', 10), '#6C63FF')
  insert.run('Spouse', 'tracker', bcrypt.hashSync('000000', 10), '#EC4899')
}

function migrateUserPinsToSixDigit() {
  try { db.exec('ALTER TABLE users ADD COLUMN pin_version INTEGER DEFAULT 1') } catch {}
  const users = db.prepare('SELECT id, role FROM users WHERE pin_version IS NULL OR pin_version < 2').all()
  if (users.length === 0) return
  const update = db.prepare('UPDATE users SET pin_hash = ?, pin_version = 2 WHERE id = ?')
  for (const user of users) {
    const defaultPin = user.role === 'admin' ? '123456' : '000000'
    update.run(bcrypt.hashSync(defaultPin, 10), user.id)
  }
}

function seedTrackerBudget() {
  try { db.exec('ALTER TABLE profile ADD COLUMN tracker_monthly_budget REAL DEFAULT 0') } catch {}
}

function migrateProfileV2() {
  try { db.exec('ALTER TABLE profile ADD COLUMN date_of_birth TEXT') } catch {}
  try { db.exec('ALTER TABLE profile ADD COLUMN retirement_age INTEGER DEFAULT 60') } catch {}
  db.exec("UPDATE profile SET retirement_age = 60 WHERE retirement_age IS NULL")
}

function migrateRebalancingActions() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS rebalancing_actions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      suggestion_text TEXT NOT NULL UNIQUE,
      status TEXT DEFAULT 'pending' CHECK(status IN ('pending','done')),
      created_at TEXT DEFAULT (datetime('now')),
      completed_at TEXT
    );
  `)
}

function migrateWeightTracking() {
  try { db.exec('ALTER TABLE users ADD COLUMN height_cm REAL DEFAULT 0') } catch {}
  try { db.exec('ALTER TABLE users ADD COLUMN date_of_birth TEXT') } catch {}
  db.exec(`
    CREATE TABLE IF NOT EXISTS weight_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      weight_kg REAL NOT NULL,
      date TEXT NOT NULL,
      note TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      UNIQUE(user_id, date)
    );
  `)
  try { db.exec('CREATE INDEX IF NOT EXISTS idx_weight_logs_user_date ON weight_logs(user_id, date)') } catch {}
}

// Rebuilds the goals table around the 4 goal-type model (emergency fund, opportunity
// fund, life goal, debt payoff) and adds goal_contributions as an append-only ledger.
// Old rows (type='need'/'want', target_year) are preserved as life_goal entries.
function migrateGoalsV2() {
  const row = db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='goals'").get()
  const alreadyMigrated = row && row.sql.includes('target_date')

  if (!alreadyMigrated) {
    db.pragma('foreign_keys = OFF')
    const migrate = db.transaction(() => {
      db.exec(`
        CREATE TABLE goals_v2 (
          id                   INTEGER PRIMARY KEY AUTOINCREMENT,
          title                TEXT NOT NULL,
          type                 TEXT CHECK(type IN ('emergency_fund','opportunity_fund','life_goal','debt_payoff')) NOT NULL DEFAULT 'life_goal',
          category             TEXT CHECK(category IN ('need','want')) NOT NULL DEFAULT 'need',
          target_amount        REAL NOT NULL DEFAULT 0,
          current_amount       REAL DEFAULT 0,
          target_date          TEXT,
          bank_or_provider     TEXT,
          linked_investment_id INTEGER REFERENCES investments(id) ON DELETE SET NULL,
          emoji                TEXT,
          color                TEXT,
          inflation_adjust     INTEGER DEFAULT 0,
          inflation_rate       REAL DEFAULT 6,
          monthly_emi          REAL DEFAULT 0,
          notes                TEXT,
          is_achieved          INTEGER DEFAULT 0,
          achieved_at          TEXT,
          created_at           TEXT DEFAULT (datetime('now')),
          updated_at           TEXT DEFAULT (datetime('now'))
        );
      `)

      const oldGoals = db.prepare('SELECT * FROM goals').all()
      const findLinkedInvestments = db.prepare(
        'SELECT id, current_value, bank_or_amc FROM investments WHERE goal_id = ? ORDER BY current_value DESC'
      )
      const insert = db.prepare(`
        INSERT INTO goals_v2
          (id, title, type, category, target_amount, current_amount, target_date,
           bank_or_provider, linked_investment_id, emoji, color, inflation_adjust,
           inflation_rate, notes, is_achieved, achieved_at, created_at, updated_at)
        VALUES (?, ?, 'life_goal', ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, NULL, ?, ?, ?, ?)
      `)

      for (const g of oldGoals) {
        const linked = findLinkedInvestments.all(g.id)
        const currentAmount = linked.reduce((s, i) => s + (i.current_value || 0), 0)
        const primaryInv = linked[0]
        const targetDate = g.target_year ? `${g.target_year}-12-31` : null
        const achieved = Boolean(g.is_achieved)
        insert.run(
          g.id, g.title, g.type === 'want' ? 'want' : 'need',
          g.target_amount || 0, currentAmount, targetDate,
          primaryInv?.bank_or_amc || null, primaryInv?.id || null,
          g.emoji, g.color, g.inflation_rate ?? 6,
          achieved ? 1 : 0, achieved ? g.created_at : null,
          g.created_at, g.created_at
        )
      }

      db.exec('DROP TABLE goals')
      db.exec('ALTER TABLE goals_v2 RENAME TO goals')
    })
    migrate()
    db.pragma('foreign_keys = ON')
  }

  // monthly_emi may be missing on a v2 table created before this column was added
  try { db.exec('ALTER TABLE goals ADD COLUMN monthly_emi REAL DEFAULT 0') } catch {}

  db.exec(`
    CREATE TABLE IF NOT EXISTS goal_contributions (
      id                INTEGER PRIMARY KEY AUTOINCREMENT,
      goal_id           INTEGER NOT NULL REFERENCES goals(id) ON DELETE CASCADE,
      amount            REAL NOT NULL,
      note              TEXT,
      contributed_at    TEXT NOT NULL DEFAULT (datetime('now')),
      contribution_type TEXT CHECK(contribution_type IN ('manual','auto_linked')) NOT NULL DEFAULT 'manual',
      created_at        TEXT DEFAULT (datetime('now'))
    );
  `)
  try { db.exec('CREATE INDEX IF NOT EXISTS idx_goal_contributions_goal ON goal_contributions(goal_id)') } catch {}
}

// Adds 'custom' as a 5th goal type alongside the original 4 — requires rebuilding
// the table since SQLite can't ALTER a CHECK constraint in place.
function migrateGoalsV3() {
  const row = db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='goals'").get()
  if (!row || row.sql.includes("'custom'")) return

  db.pragma('foreign_keys = OFF')
  const migrate = db.transaction(() => {
    db.exec(`
      CREATE TABLE goals_v3 (
        id                   INTEGER PRIMARY KEY AUTOINCREMENT,
        title                TEXT NOT NULL,
        type                 TEXT CHECK(type IN ('emergency_fund','opportunity_fund','life_goal','debt_payoff','custom')) NOT NULL DEFAULT 'life_goal',
        category             TEXT CHECK(category IN ('need','want')) NOT NULL DEFAULT 'need',
        target_amount        REAL NOT NULL DEFAULT 0,
        current_amount       REAL DEFAULT 0,
        target_date          TEXT,
        bank_or_provider     TEXT,
        linked_investment_id INTEGER REFERENCES investments(id) ON DELETE SET NULL,
        emoji                TEXT,
        color                TEXT,
        inflation_adjust     INTEGER DEFAULT 0,
        inflation_rate       REAL DEFAULT 6,
        monthly_emi          REAL DEFAULT 0,
        notes                TEXT,
        is_achieved          INTEGER DEFAULT 0,
        achieved_at          TEXT,
        created_at           TEXT DEFAULT (datetime('now')),
        updated_at           TEXT DEFAULT (datetime('now'))
      );
    `)
    db.exec(`
      INSERT INTO goals_v3
        (id, title, type, category, target_amount, current_amount, target_date,
         bank_or_provider, linked_investment_id, emoji, color, inflation_adjust,
         inflation_rate, monthly_emi, notes, is_achieved, achieved_at, created_at, updated_at)
      SELECT
        id, title, type, category, target_amount, current_amount, target_date,
        bank_or_provider, linked_investment_id, emoji, color, inflation_adjust,
        inflation_rate, monthly_emi, notes, is_achieved, achieved_at, created_at, updated_at
      FROM goals;
    `)
    db.exec('DROP TABLE goals')
    db.exec('ALTER TABLE goals_v3 RENAME TO goals')
  })
  migrate()
  db.pragma('foreign_keys = ON')
}

// Replaces the single linked_investment_id column with a goal_investments junction
// table so a goal can pull its current_amount from many investments (SIPs, FDs, etc.)
function migrateGoalInvestmentsJunction() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS goal_investments (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      goal_id       INTEGER NOT NULL REFERENCES goals(id) ON DELETE CASCADE,
      investment_id INTEGER NOT NULL REFERENCES investments(id) ON DELETE CASCADE,
      created_at    TEXT DEFAULT (datetime('now')),
      UNIQUE(goal_id, investment_id)
    );
  `)
  try { db.exec('CREATE INDEX IF NOT EXISTS idx_goal_investments_goal ON goal_investments(goal_id)') } catch {}
  try { db.exec('CREATE INDEX IF NOT EXISTS idx_goal_investments_investment ON goal_investments(investment_id)') } catch {}

  const cols = db.prepare("PRAGMA table_info(goals)").all().map(c => c.name)
  if (cols.includes('linked_investment_id')) {
    db.exec(`
      INSERT OR IGNORE INTO goal_investments (goal_id, investment_id)
      SELECT id, linked_investment_id FROM goals WHERE linked_investment_id IS NOT NULL
    `)
    try { db.exec('ALTER TABLE goals DROP COLUMN linked_investment_id') } catch {}
  }
  try { db.exec('ALTER TABLE goals ADD COLUMN last_synced_at TEXT') } catch {}
}

// Adds the row-level sync bookkeeping columns (sync_id UUID, deleted_at soft-delete,
// device_id) that the Google Drive row-level sync engine (src/db/sync.js) needs on
// every synced table, and backfills sync_id for pre-existing rows so they survive
// the first sync unchanged. Safe to re-run — every ALTER is wrapped in try/catch
// and every backfill only targets rows where sync_id IS NULL.
function migrateSyncColumns() {
  const addCol = (table, col, type) => {
    try { db.exec(`ALTER TABLE ${table} ADD COLUMN ${col} ${type}`) } catch {}
  }

  addCol('expenses', 'updated_at', 'TEXT')
  addCol('expenses', 'deleted_at', 'TEXT')
  addCol('expenses', 'device_id', 'TEXT')
  db.exec(`UPDATE expenses SET updated_at = COALESCE(updated_at, created_at, datetime('now')) WHERE updated_at IS NULL`)

  addCol('goals', 'sync_id', 'TEXT')
  addCol('goals', 'deleted_at', 'TEXT')
  addCol('goals', 'device_id', 'TEXT')

  addCol('goal_contributions', 'sync_id', 'TEXT')
  addCol('goal_contributions', 'updated_at', 'TEXT')
  addCol('goal_contributions', 'deleted_at', 'TEXT')
  addCol('goal_contributions', 'device_id', 'TEXT')
  db.exec(`UPDATE goal_contributions SET updated_at = COALESCE(updated_at, created_at, datetime('now')) WHERE updated_at IS NULL`)

  addCol('goal_investments', 'sync_id', 'TEXT')
  addCol('goal_investments', 'updated_at', 'TEXT')
  addCol('goal_investments', 'deleted_at', 'TEXT')
  addCol('goal_investments', 'device_id', 'TEXT')
  db.exec(`UPDATE goal_investments SET updated_at = COALESCE(updated_at, created_at, datetime('now')) WHERE updated_at IS NULL`)

  addCol('investments', 'sync_id', 'TEXT')
  addCol('investments', 'created_at', 'TEXT')
  addCol('investments', 'deleted_at', 'TEXT')
  addCol('investments', 'device_id', 'TEXT')
  db.exec(`UPDATE investments SET created_at = COALESCE(created_at, last_updated_at, datetime('now')) WHERE created_at IS NULL`)

  addCol('salary_plans', 'sync_id', 'TEXT')
  addCol('salary_plans', 'updated_at', 'TEXT')
  addCol('salary_plans', 'deleted_at', 'TEXT')
  addCol('salary_plans', 'device_id', 'TEXT')
  db.exec(`UPDATE salary_plans SET updated_at = COALESCE(updated_at, created_at, datetime('now')) WHERE updated_at IS NULL`)

  addCol('salary_plan_items', 'sync_id', 'TEXT')
  addCol('salary_plan_items', 'created_at', 'TEXT')
  addCol('salary_plan_items', 'updated_at', 'TEXT')
  addCol('salary_plan_items', 'deleted_at', 'TEXT')
  addCol('salary_plan_items', 'device_id', 'TEXT')
  db.exec(`UPDATE salary_plan_items SET created_at = COALESCE(created_at, datetime('now')) WHERE created_at IS NULL`)
  db.exec(`UPDATE salary_plan_items SET updated_at = COALESCE(updated_at, created_at, datetime('now')) WHERE updated_at IS NULL`)

  addCol('profile', 'sync_id', 'TEXT')
  addCol('profile', 'updated_at', 'TEXT')
  addCol('profile', 'device_id', 'TEXT')
  db.exec(`UPDATE profile SET updated_at = COALESCE(updated_at, salary_updated_at, datetime('now')) WHERE updated_at IS NULL`)

  const backfillSyncId = (table) => {
    const rows = db.prepare(`SELECT id FROM ${table} WHERE sync_id IS NULL`).all()
    if (rows.length === 0) return
    const upd = db.prepare(`UPDATE ${table} SET sync_id = ? WHERE id = ?`)
    for (const row of rows) upd.run(randomUUID(), row.id)
  }
  for (const table of ['goals', 'goal_contributions', 'goal_investments', 'investments',
    'salary_plans', 'salary_plan_items', 'profile']) {
    backfillSyncId(table)
    try { db.exec(`CREATE UNIQUE INDEX IF NOT EXISTS idx_${table}_sync_id ON ${table}(sync_id)`) } catch {}
  }
}

function createSyncLogTable() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS sync_log (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      synced_at       TEXT NOT NULL DEFAULT (datetime('now')),
      device_id       TEXT NOT NULL,
      status          TEXT CHECK(status IN ('success', 'failed')) NOT NULL,
      rows_uploaded   INTEGER DEFAULT 0,
      rows_downloaded INTEGER DEFAULT 0,
      error_message   TEXT
    );
  `)
  try { db.exec('CREATE INDEX IF NOT EXISTS idx_sync_log_synced_at ON sync_log(synced_at DESC)') } catch {}
}

export function logSyncEvent(db, { deviceId, status, rowsUploaded = 0, rowsDownloaded = 0, errorMessage = null }) {
  db.prepare(`
    INSERT INTO sync_log (device_id, status, rows_uploaded, rows_downloaded, error_message)
    VALUES (?, ?, ?, ?, ?)
  `).run(deviceId, status, rowsUploaded, rowsDownloaded, errorMessage)
}

export function getSyncLog(db, limit = 20) {
  return db.prepare('SELECT * FROM sync_log ORDER BY synced_at DESC, id DESC LIMIT ?').all(limit)
}

// ── Exported DB functions ──────────────────────────────────────────────────

export function getAllUsers(db) {
  return db.prepare('SELECT id, name, role, avatar_color, last_login_at FROM users ORDER BY role DESC').all()
}

export function getAllUsersWithHash(db) {
  return db.prepare('SELECT id, name, role, avatar_color, pin_hash FROM users').all()
}

export function getUserById(db, id) {
  return db.prepare('SELECT * FROM users WHERE id = ?').get(id)
}

export function updateUser(db, { id, name, avatar_color }) {
  db.prepare('UPDATE users SET name = ?, avatar_color = ? WHERE id = ?').run(name, avatar_color, id)
}

export function updateUserPin(db, id, pinHash) {
  db.prepare('UPDATE users SET pin_hash = ? WHERE id = ?').run(pinHash, id)
}

export function updateUserLastLogin(db, id) {
  db.prepare("UPDATE users SET last_login_at = datetime('now') WHERE id = ?").run(id)
}

export function getDb() {
  return db
}

export function generateExpenseSyncId() {
  return randomUUID()
}

export function getAllExpensesForSync(db) {
  return db.prepare(`
    SELECT e.sync_id, e.amount, e.category, e.note, e.date, e.created_at,
           u.name AS user_name, u.role AS user_role
    FROM expenses e
    LEFT JOIN users u ON e.logged_by_user_id = u.id
    WHERE e.sync_id IS NOT NULL
    ORDER BY e.date ASC, e.created_at ASC
  `).all()
}

export function mergeExpensesFromSync(db, expenses) {
  const findUser    = db.prepare('SELECT id FROM users WHERE name = ? LIMIT 1')
  const checkExists = db.prepare('SELECT id FROM expenses WHERE sync_id = ?')
  const insert      = db.prepare(`
    INSERT INTO expenses (sync_id, amount, category, note, date, logged_by_user_id, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `)
  let merged = 0
  const tx = db.transaction(() => {
    for (const exp of expenses) {
      if (!exp.sync_id || checkExists.get(exp.sync_id)) continue
      const user   = exp.user_name ? findUser.get(exp.user_name) : null
      insert.run(
        exp.sync_id,
        Number(exp.amount),
        exp.category,
        exp.note || null,
        exp.date,
        user?.id ?? null,
        exp.created_at || new Date().toISOString()
      )
      merged++
    }
  })
  tx()
  return merged
}
