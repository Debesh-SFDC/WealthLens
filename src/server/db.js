// Unified DB adapter — SQLite (better-sqlite3) in Electron/local mode,
// PostgreSQL (pg) in web mode. Route files only ever call db.query(sql, params);
// write SQL with `?` placeholders and it works against either backend.
//
// Portability rules followed by every route in src/server/routes/:
//   - No SQLite-only functions (datetime('now'), strftime) in SQL text — timestamps
//     are generated in Node (new Date().toISOString()) and passed as params; date
//     filtering uses `date LIKE 'YYYY-MM%'` instead of strftime.
//   - INSERT statements end with `RETURNING id` — better-sqlite3 (SQLite 3.35+)
//     and Postgres both support it, so `db.query` always hands back the new row's id.
//   - Booleans are stored as INTEGER 0/1 on both engines (see scripts/setup-postgres.sql)
//     so `WHERE is_active = 1` works unchanged either way.
const path = require('path')
const os = require('os')

function getElectronUserDataPath() {
  const home = os.homedir()
  const productName = 'WealthLens'
  if (process.platform === 'darwin') return path.join(home, 'Library', 'Application Support', productName)
  if (process.platform === 'win32') return path.join(process.env.APPDATA || path.join(home, 'AppData', 'Roaming'), productName)
  return path.join(home, '.config', productName)
}

function convertPlaceholders(sql) {
  let i = 0
  return sql.replace(/\?/g, () => `$${++i}`)
}

function initSqlite() {
  const Database = require('better-sqlite3')
  const dbPath = process.env.SQLITE_PATH || path.join(getElectronUserDataPath(), 'wealthlens.db')
  const sqlite = new Database(dbPath)
  sqlite.pragma('journal_mode = WAL')
  sqlite.pragma('foreign_keys = ON')

  return {
    dialect: 'sqlite',
    async query(sql, params = []) {
      const stmt = sqlite.prepare(sql)
      const normalized = sql.trim().toUpperCase()
      const returnsRows = normalized.startsWith('SELECT') || normalized.startsWith('WITH') || normalized.includes('RETURNING')
      if (returnsRows) return { rows: stmt.all(...params) }
      const info = stmt.run(...params)
      return { rows: [], rowCount: info.changes, insertId: info.lastInsertRowid }
    },
  }
}

function initPostgres() {
  const { Pool } = require('pg')
  const pool = new Pool({ connectionString: process.env.DATABASE_URL })

  return {
    dialect: 'postgres',
    async query(sql, params = []) {
      const result = await pool.query(convertPlaceholders(sql), params)
      return { rows: result.rows, rowCount: result.rowCount, insertId: result.rows[0]?.id }
    },
  }
}

let impl

function getMode() {
  return process.env.APP_MODE || process.env.VITE_APP_MODE || (process.env.NODE_ENV === 'production' ? 'web' : 'electron')
}

function getDb() {
  if (!impl) impl = getMode() === 'web' ? initPostgres() : initSqlite()
  return impl
}

module.exports = { getDb, getMode }
