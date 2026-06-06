import Database from 'better-sqlite3'
import { app } from 'electron'
import { join } from 'path'
import bcrypt from 'bcryptjs'

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
  seedUsers()
  migrateUserPinsToSixDigit()
  seedTrackerBudget()
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
      type TEXT CHECK(type IN ('mf_sip','mf_lumpsum','epf','ppf','nps','stocks','fd','gold')) NOT NULL,
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
