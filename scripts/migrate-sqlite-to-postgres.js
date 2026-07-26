#!/usr/bin/env node
// One-time migration: local WealthLens SQLite file -> Postgres (Hostinger).
//
// Usage:
//   node scripts/migrate-sqlite-to-postgres.js \
//     --sqlite /path/to/WealthLens.db \
//     --database-url postgresql://user:pass@host:5432/wealthlens_db
//
// Creates all tables (via scripts/setup-postgres.sql) if they don't already
// exist, then copies every row table-by-table in FK dependency order,
// preserving integer ids (so foreign keys stay valid) and sync_ids/timestamps
// unchanged. Re-running is safe — inserts are ON CONFLICT (id) DO NOTHING.
const fs = require('fs')
const path = require('path')
const Database = require('better-sqlite3')
const { Client } = require('pg')

function parseArgs() {
  const args = process.argv.slice(2)
  const out = {}
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--sqlite') out.sqlitePath = args[++i]
    if (args[i] === '--database-url') out.databaseUrl = args[++i]
  }
  if (!out.sqlitePath || !out.databaseUrl) {
    console.error('Usage: node scripts/migrate-sqlite-to-postgres.js --sqlite <path> --database-url <postgres-url>')
    process.exit(1)
  }
  return out
}

// Order matters: parents before children (FK dependencies).
const TABLES = [
  'users',
  'profile',
  'goals',
  'investments',
  'goal_investments',
  'goal_contributions',
  'salary_allocations',
  'salary_plans',
  'salary_plan_items',
  'expenses',
  'expense_categories',
  'weight_logs',
  'rebalancing_actions',
  'sync_log',
]

// All tables use a Postgres sequence for `id` (goals/investments via an explicit
// OWNED BY sequence in setup-postgres.sql, the rest via SERIAL) — pg_get_serial_sequence
// resolves either form, so one setval call per table works uniformly.
const SERIAL_TABLES = new Set([
  'users', 'profile', 'goals', 'investments', 'goal_investments', 'goal_contributions',
  'salary_allocations', 'salary_plans', 'salary_plan_items', 'expenses', 'expense_categories',
  'weight_logs', 'rebalancing_actions', 'sync_log',
])

async function main() {
  const { sqlitePath, databaseUrl } = parseArgs()

  const sqlite = new Database(sqlitePath, { readonly: true })
  const pg = new Client({ connectionString: databaseUrl })
  await pg.connect()

  const schemaSql = fs.readFileSync(path.join(__dirname, 'setup-postgres.sql'), 'utf8')
  await pg.query(schemaSql)
  console.log('Schema ensured (setup-postgres.sql applied).\n')

  const summary = []

  for (const table of TABLES) {
    const tableExists = sqlite.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name=?"
    ).get(table)
    if (!tableExists) { summary.push([table, 0, 'skipped (not in source DB)']); continue }

    const rows = sqlite.prepare(`SELECT * FROM ${table}`).all()
    let inserted = 0

    for (const row of rows) {
      const cols = Object.keys(row)
      const placeholders = cols.map((_, i) => `$${i + 1}`).join(', ')
      const values = cols.map(c => row[c])
      const sql = `INSERT INTO ${table} (${cols.join(', ')}) VALUES (${placeholders}) ON CONFLICT (id) DO NOTHING`
      const result = await pg.query(sql, values)
      inserted += result.rowCount
    }

    if (SERIAL_TABLES.has(table) && rows.length > 0) {
      await pg.query(
        `SELECT setval(pg_get_serial_sequence('${table}', 'id'), COALESCE((SELECT MAX(id) FROM ${table}), 1))`
      )
    }

    summary.push([table, inserted, `of ${rows.length} source rows`])
  }

  console.log('Migration summary:')
  for (const [table, inserted, note] of summary) {
    console.log(`  ${table.padEnd(24)} ${String(inserted).padStart(6)} rows inserted  (${note})`)
  }

  await pg.end()
  sqlite.close()
}

main().catch(err => {
  console.error('Migration failed:', err)
  process.exit(1)
})
