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
  seedDefaultCategories()
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
    ['Healthcare', '💊', '#FFEAA7'],
    ['Utilities', '⚡', '#DDA0DD'],
    ['Rent', '🏠', '#98D8C8'],
    ['Education', '📚', '#F7DC6F'],
    ['Travel', '✈️', '#82E0AA'],
    ['Others', '💳', '#AEB6BF'],
  ]
  for (const [name, icon, color] of defaults) {
    insert.run(name, icon, color)
  }
}

export function getDb() {
  return db
}
