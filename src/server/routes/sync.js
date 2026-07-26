// POST /api/sync — mirrors the intent of the Electron sync:now IPC handler
// (src/main/index.js performFullSync), but with a key architectural difference:
// in Electron mode the server DB doesn't exist, so each device's SQLite file
// pushes/pulls through a WealthLens_sync.json file on Google Drive as the
// shared store. In web mode the Postgres DB IS the shared store — there's no
// Drive intermediary to round-trip through. So this endpoint accepts an
// optional client-side snapshot (e.g. from an offline-capable web client) and
// merges it in with last-write-wins by updated_at, then returns the
// authoritative merged snapshot. A client with nothing to push can POST an
// empty body and just receive the current server snapshot back.
//
// Ported subset: profile, goals, investments, salary_plans, salary_plan_items,
// expenses. goal_contributions / goal_investments cross-table FK remapping
// (see src/db/sync.js for the full Electron version) was left out of this
// first web-mode pass to keep scope manageable — same upsert pattern extends
// to them when needed.
const express = require('express')
const { getDb } = require('../db')

const router = express.Router()

function newer(a, b) {
  const ta = a ? new Date(a).getTime() : 0
  const tb = b ? new Date(b).getTime() : 0
  return ta > tb
}

async function upsertBySyncId(db, table, updatedAtCol, row, insertCols, insertParams) {
  const { rows: localRows } = await db.query(`SELECT id, ${updatedAtCol} as updated_at FROM ${table} WHERE sync_id = ?`, [row.id])
  const local = localRows[0]
  if (!local) {
    await db.query(
      `INSERT INTO ${table} (sync_id, ${insertCols.join(', ')}) VALUES (?, ${insertCols.map(() => '?').join(', ')})`,
      [row.id, ...insertParams]
    )
    return 1
  }
  if (newer(row[updatedAtCol], local.updated_at)) {
    await db.query(
      `UPDATE ${table} SET ${insertCols.map(c => `${c} = ?`).join(', ')} WHERE sync_id = ?`,
      [...insertParams, row.id]
    )
    return 1
  }
  return 0
}

router.get('/', async (req, res) => {
  res.json(await buildSnapshot(getDb()))
})

router.post('/', async (req, res) => {
  const db = getDb()
  const incoming = req.body?.data
  let downloaded = 0

  if (incoming) {
    for (const g of incoming.goals || []) {
      downloaded += await upsertBySyncId(db, 'goals', 'updated_at', g,
        ['title', 'type', 'category', 'target_amount', 'current_amount', 'target_date',
         'bank_or_provider', 'emoji', 'color', 'inflation_adjust', 'inflation_rate', 'monthly_emi',
         'notes', 'is_achieved', 'achieved_at', 'created_at', 'updated_at', 'deleted_at', 'device_id'],
        [g.title, g.type, g.category, g.target_amount, g.current_amount, g.target_date,
         g.bank_or_provider ?? null, g.emoji ?? null, g.color ?? null, g.inflation_adjust ?? 0,
         g.inflation_rate ?? 6, g.monthly_emi ?? 0, g.notes ?? null, g.is_achieved ?? 0,
         g.achieved_at ?? null, g.created_at, g.updated_at, g.deleted_at ?? null, g.device_id ?? null])
    }

    for (const e of incoming.expenses || []) {
      downloaded += await upsertBySyncId(db, 'expenses', 'updated_at', e,
        ['amount', 'category', 'note', 'date', 'created_at', 'updated_at', 'deleted_at', 'device_id'],
        [e.amount, e.category, e.note ?? null, e.date, e.created_at, e.updated_at, e.deleted_at ?? null, e.device_id ?? null])
    }

    for (const p of incoming.salary_plans || []) {
      downloaded += await upsertBySyncId(db, 'salary_plans', 'updated_at', p,
        ['label', 'monthly_salary', 'effective_from', 'effective_to', 'is_active', 'notes',
         'created_at', 'updated_at', 'deleted_at', 'device_id'],
        [p.label, p.monthly_salary, p.effective_from, p.effective_to ?? null, p.is_active ?? 0,
         p.notes ?? null, p.created_at, p.updated_at, p.deleted_at ?? null, p.device_id ?? null])
    }

    if (incoming.profile) {
      const pr = incoming.profile
      const { rows: localRows } = await db.query('SELECT id, updated_at FROM profile LIMIT 1')
      const local = localRows[0]
      if (!local) {
        await db.query(
          `INSERT INTO profile (sync_id, name, monthly_salary, salary_updated_at, date_of_birth, retirement_age, updated_at, device_id)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [pr.id, pr.name, pr.monthly_salary, pr.salary_updated_at ?? null, pr.date_of_birth ?? null,
           pr.retirement_age ?? 60, pr.updated_at, pr.device_id ?? null]
        )
        downloaded++
      } else if (newer(pr.updated_at, local.updated_at)) {
        await db.query(
          `UPDATE profile SET sync_id = ?, name = ?, monthly_salary = ?, salary_updated_at = ?,
             date_of_birth = ?, retirement_age = ?, updated_at = ?, device_id = ? WHERE id = ?`,
          [pr.id, pr.name, pr.monthly_salary, pr.salary_updated_at ?? null, pr.date_of_birth ?? null,
           pr.retirement_age ?? 60, pr.updated_at, pr.device_id ?? null, local.id]
        )
        downloaded++
      }
    }
  }

  res.json({ success: true, downloaded, snapshot: await buildSnapshot(db), syncedAt: new Date().toISOString() })
})

async function buildSnapshot(db) {
  const [goals, investments, expenses, salary_plans, salary_plan_items, profile] = await Promise.all([
    db.query('SELECT sync_id as id, * FROM goals WHERE sync_id IS NOT NULL'),
    db.query('SELECT sync_id as id, * FROM investments WHERE sync_id IS NOT NULL'),
    db.query('SELECT sync_id as id, * FROM expenses WHERE sync_id IS NOT NULL'),
    db.query('SELECT sync_id as id, * FROM salary_plans WHERE sync_id IS NOT NULL'),
    db.query('SELECT sync_id as id, * FROM salary_plan_items WHERE sync_id IS NOT NULL'),
    db.query('SELECT sync_id as id, * FROM profile WHERE sync_id IS NOT NULL LIMIT 1'),
  ])
  return {
    goals: goals.rows,
    investments: investments.rows,
    expenses: expenses.rows,
    salary_plans: salary_plans.rows,
    salary_plan_items: salary_plan_items.rows,
    profile: profile.rows[0] ?? null,
  }
}

module.exports = router
