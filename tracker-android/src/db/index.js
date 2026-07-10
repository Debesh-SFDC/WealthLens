import { CapacitorSQLite, SQLiteConnection } from '@capacitor-community/sqlite'
import { Preferences } from '@capacitor/preferences'

const sqlite = new SQLiteConnection(CapacitorSQLite)
let _db = null

const SCHEMA = `
CREATE TABLE IF NOT EXISTS expenses (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  sync_id     TEXT UNIQUE,
  amount      REAL NOT NULL,
  category    TEXT NOT NULL,
  note        TEXT,
  date        TEXT NOT NULL,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS categories (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  name       TEXT UNIQUE NOT NULL,
  icon       TEXT,
  color      TEXT,
  is_default INTEGER DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

INSERT OR IGNORE INTO categories (name, icon, color, is_default) VALUES
  ('Food',          '🍔', '#FF6B6B', 1),
  ('Transport',     '🚗', '#06B6D4', 1),
  ('Shopping',      '🛍️', '#A855F7', 1),
  ('Health',        '💊', '#10B981', 1),
  ('Bills',         '📄', '#6366F1', 1),
  ('Entertainment', '🎬', '#EC4899', 1),
  ('Fuel',          '⛽', '#F59E0B', 1),
  ('Dining',        '🍽️', '#F97316', 1),
  ('Others',        '💸', '#8B93A5', 1);

CREATE TABLE IF NOT EXISTS weight_logs (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  weight_kg  REAL NOT NULL,
  date       TEXT NOT NULL UNIQUE,
  note       TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
`

export async function openDb() {
  if (_db) return _db
  const ret = await sqlite.checkConnectionsConsistency()
  const isConn = (await sqlite.isConnection('wealthlens', false)).result
  if (isConn) {
    _db = await sqlite.retrieveConnection('wealthlens', false)
  } else {
    _db = await sqlite.createConnection('wealthlens', false, 'no-encryption', 1, false)
  }
  await _db.open()
  await _db.execute(SCHEMA)
  return _db
}

function uuid() {
  return crypto.randomUUID ? crypto.randomUUID() : ([1e7]+-1e3+-4e3+-8e3+-1e11).replace(/[018]/g,c=>(c^(crypto.getRandomValues(new Uint8Array(1))[0]&(15>>c/4))).toString(16))
}

// ── Expenses ────────────────────────────────────────────────────────────────

export async function getAllExpenses(filter = {}) {
  const db = await openDb()
  let sql = 'SELECT * FROM expenses WHERE 1=1'
  const params = []
  if (filter.month) { sql += ' AND date LIKE ?'; params.push(`${filter.month}%`) }
  if (filter.date)  { sql += ' AND date = ?';    params.push(filter.date) }
  sql += ' ORDER BY date DESC, created_at DESC'
  const res = await db.query(sql, params)
  return res.values || []
}

export async function createExpense({ amount, category, note, date, sync_id }) {
  const db = await openDb()
  const sid = sync_id || uuid()
  const now = new Date().toISOString()
  await db.run(
    'INSERT INTO expenses (sync_id, amount, category, note, date, created_at) VALUES (?,?,?,?,?,?)',
    [sid, amount, category, note || null, date, now]
  )
  return { sync_id: sid }
}

export async function updateExpense({ id, amount, category, note, date }) {
  const db = await openDb()
  await db.run(
    'UPDATE expenses SET amount=?, category=?, note=?, date=? WHERE id=?',
    [amount, category, note || null, date, id]
  )
}

export async function deleteExpense(id) {
  const db = await openDb()
  await db.run('DELETE FROM expenses WHERE id=?', [id])
}

export async function getAllExpensesForSync() {
  const db = await openDb()
  const res = await db.query('SELECT * FROM expenses ORDER BY date DESC')
  return res.values || []
}

export async function mergeExpensesFromSync(expenses) {
  const db = await openDb()
  let merged = 0
  for (const exp of expenses) {
    if (!exp.sync_id) continue
    const exists = await db.query('SELECT id FROM expenses WHERE sync_id=?', [exp.sync_id])
    if (exists.values?.length) continue
    await db.run(
      'INSERT INTO expenses (sync_id, amount, category, note, date, created_at) VALUES (?,?,?,?,?,?)',
      [exp.sync_id, Number(exp.amount), exp.category, exp.note || null, exp.date, exp.created_at || new Date().toISOString()]
    )
    merged++
  }
  return merged
}

export async function getMonthlyStats(filter = {}) {
  const db = await openDb()
  let sql = 'SELECT date, SUM(amount) as total FROM expenses WHERE 1=1'
  const params = []
  if (filter.month) { sql += ' AND date LIKE ?'; params.push(`${filter.month}%`) }
  sql += ' GROUP BY date ORDER BY date'
  const res = await db.query(sql, params)
  return res.values || []
}

// ── Categories ───────────────────────────────────────────────────────────────

export async function getExpenseCategories() {
  const db = await openDb()
  const res = await db.query('SELECT * FROM categories ORDER BY is_default DESC, name ASC')
  return res.values || []
}

export async function createExpenseCategory({ name, icon, color }) {
  const db = await openDb()
  await db.run('INSERT INTO categories (name, icon, color, is_default) VALUES (?,?,?,0)', [name, icon || '💸', color || '#8B93A5'])
}

export async function deleteExpenseCategory(id) {
  const db = await openDb()
  await db.run('DELETE FROM categories WHERE id=? AND is_default=0', [id])
}

// ── Budget ───────────────────────────────────────────────────────────────────

export async function getTrackerBudget() {
  const { value } = await Preferences.get({ key: 'tracker_budget' })
  return value ? Number(value) : 0
}

export async function setTrackerBudget(amount) {
  await Preferences.set({ key: 'tracker_budget', value: String(amount) })
}

// ── PIN auth ─────────────────────────────────────────────────────────────────

export async function hasPin() {
  const { value } = await Preferences.get({ key: 'pin_hash' })
  return Boolean(value)
}

export async function verifyPin(pin) {
  const { value } = await Preferences.get({ key: 'pin_hash' })
  if (!value) return pin === '000000'
  return value === await hashPin(pin)
}

export async function setPin(pin) {
  await Preferences.set({ key: 'pin_hash', value: await hashPin(pin) })
}

async function hashPin(pin) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(pin))
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('')
}

// ── User name ────────────────────────────────────────────────────────────────

export async function getUserName() {
  const { value } = await Preferences.get({ key: 'user_name' })
  return value || 'You'
}

export async function setUserName(name) {
  await Preferences.set({ key: 'user_name', value: name })
}

// ── Weight Logs ──────────────────────────────────────────────────────────────

export async function logWeight({ weightKg, date, note }) {
  const db = await openDb()
  const exists = await db.query('SELECT id FROM weight_logs WHERE date=?', [date])
  if (exists.values?.length) {
    await db.run(
      'UPDATE weight_logs SET weight_kg=?, note=?, created_at=datetime(\'now\') WHERE date=?',
      [weightKg, note || null, date]
    )
  } else {
    await db.run(
      'INSERT INTO weight_logs (weight_kg, date, note) VALUES (?,?,?)',
      [weightKg, date, note || null]
    )
  }
}

export async function getWeightLogs(filter = {}) {
  const db = await openDb()
  let sql = 'SELECT * FROM weight_logs WHERE 1=1'
  const params = []
  if (filter.from) { sql += ' AND date >= ?'; params.push(filter.from) }
  if (filter.to)   { sql += ' AND date <= ?'; params.push(filter.to) }
  sql += ' ORDER BY date ASC'
  const res = await db.query(sql, params)
  return res.values || []
}

export async function deleteWeightLog(id) {
  const db = await openDb()
  await db.run('DELETE FROM weight_logs WHERE id=?', [id])
}

export async function saveWeightProfile({ heightCm, dateOfBirth }) {
  await Preferences.set({ key: 'weight_profile', value: JSON.stringify({ heightCm, dateOfBirth }) })
}

export async function getWeightProfile() {
  const { value } = await Preferences.get({ key: 'weight_profile' })
  return value ? JSON.parse(value) : { heightCm: 0, dateOfBirth: null }
}

// ── Device ID ────────────────────────────────────────────────────────────────

export async function getOrCreateDeviceId() {
  const { value } = await Preferences.get({ key: 'device_id' })
  if (value) return value
  const id = uuid()
  await Preferences.set({ key: 'device_id', value: id })
  return id
}
