import Database from 'better-sqlite3'
import { app } from 'electron'
import { join } from 'path'

let db

export function initDatabase() {
  const dbPath = join(app.getPath('userData'), 'wealthlens.db')
  db = new Database(dbPath)
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')
  createTables()
  migrateInvestments()
  seedDefaultCategories()
  migrateCategories()
  createSalaryPlanTables()
  seedSalaryPlan()
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

export function getDb() {
  return db
}
