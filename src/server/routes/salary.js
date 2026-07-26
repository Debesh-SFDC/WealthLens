const express = require('express')
const { randomUUID } = require('crypto')
const { getDb } = require('../db')

const router = express.Router()

async function planSummary(db, plan) {
  const { rows } = await db.query(
    'SELECT category, SUM(amount) as total FROM salary_plan_items WHERE plan_id = ? GROUP BY category',
    [plan.id]
  )
  const bycat = {}
  for (const r of rows) bycat[r.category] = r.total
  const { rows: countRows } = await db.query(
    'SELECT COUNT(*) as c FROM salary_plan_items WHERE plan_id = ?',
    [plan.id]
  )
  return {
    ...plan,
    totalNeeds: bycat.needs || 0,
    totalWants: bycat.wants || 0,
    totalInvestment: bycat.investment || 0,
    itemCount: countRows[0].c,
  }
}

async function planWithItems(db, plan) {
  if (!plan) return null
  const { rows: items } = await db.query(
    'SELECT * FROM salary_plan_items WHERE plan_id = ? ORDER BY sort_order',
    [plan.id]
  )
  return { ...plan, items }
}

// GET /api/salary-plans — mirrors plans:getAll
router.get('/', async (req, res) => {
  const db = getDb()
  const { rows: plans } = await db.query('SELECT * FROM salary_plans WHERE deleted_at IS NULL ORDER BY effective_from DESC')
  res.json(await Promise.all(plans.map(p => planSummary(db, p))))
})

// GET /api/salary-plans/active — mirrors plans:getActive
router.get('/active', async (req, res) => {
  const db = getDb()
  const { rows } = await db.query('SELECT * FROM salary_plans WHERE is_active = 1 LIMIT 1')
  res.json(await planWithItems(db, rows[0]))
})

// GET /api/salary-plans/:id — mirrors plans:getById
router.get('/:id', async (req, res) => {
  const db = getDb()
  const { rows } = await db.query('SELECT * FROM salary_plans WHERE id = ?', [req.params.id])
  res.json(await planWithItems(db, rows[0]))
})

// POST /api/salary-plans — mirrors plans:create (closes current active plan, updates profile salary)
router.post('/', async (req, res) => {
  const { label, monthly_salary, effective_from, notes, items } = req.body || {}
  const db = getDb()
  const now = new Date().toISOString()

  const { rows: activeRows } = await db.query('SELECT id FROM salary_plans WHERE is_active = 1 LIMIT 1')
  if (activeRows[0]) {
    const prevDay = new Date(new Date(effective_from).getTime() - 86_400_000).toISOString().slice(0, 10)
    await db.query(
      'UPDATE salary_plans SET is_active = 0, effective_to = ?, updated_at = ? WHERE id = ?',
      [prevDay, now, activeRows[0].id]
    )
  }

  const { rows: planRows } = await db.query(
    `INSERT INTO salary_plans (sync_id, label, monthly_salary, effective_from, is_active, notes, created_at, updated_at)
     VALUES (?, ?, ?, ?, 1, ?, ?, ?) RETURNING id`,
    [randomUUID(), label, monthly_salary, effective_from, notes ?? null, now, now]
  )
  const planId = planRows[0].id

  let sortOrder = 0
  for (const it of items || []) {
    await db.query(
      `INSERT INTO salary_plan_items (sync_id, plan_id, name, amount, category, bank_or_provider, sort_order, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [randomUUID(), planId, it.name, it.amount, it.category, it.bank_or_provider ?? null, sortOrder++, now, now]
    )
  }

  const { rows: profRows } = await db.query('SELECT id FROM profile LIMIT 1')
  if (profRows[0]) {
    await db.query(
      'UPDATE profile SET monthly_salary = ?, salary_updated_at = ?, updated_at = ? WHERE id = ?',
      [monthly_salary, now, now, profRows[0].id]
    )
  } else {
    await db.query(
      `INSERT INTO profile (sync_id, name, monthly_salary, salary_updated_at, updated_at) VALUES (?, '', ?, ?, ?)`,
      [randomUUID(), monthly_salary, now, now]
    )
  }

  res.json({ id: planId })
})

// PUT /api/salary-plans/:id — mirrors plans:updateItems
router.put('/:id', async (req, res) => {
  const { items, monthly_salary, label } = req.body || {}
  const db = getDb()
  const planId = req.params.id
  const now = new Date().toISOString()

  if (label != null) {
    await db.query('UPDATE salary_plans SET label = ?, updated_at = ? WHERE id = ?', [label, now, planId])
  }
  if (monthly_salary != null) {
    await db.query('UPDATE salary_plans SET monthly_salary = ?, updated_at = ? WHERE id = ?', [monthly_salary, now, planId])
    const { rows: profRows } = await db.query('SELECT id FROM profile LIMIT 1')
    if (profRows[0]) {
      await db.query(
        'UPDATE profile SET monthly_salary = ?, salary_updated_at = ?, updated_at = ? WHERE id = ?',
        [monthly_salary, now, now, profRows[0].id]
      )
    }
  }

  await db.query('DELETE FROM salary_plan_items WHERE plan_id = ?', [planId])
  let sortOrder = 0
  for (const it of items || []) {
    await db.query(
      `INSERT INTO salary_plan_items (sync_id, plan_id, name, amount, category, bank_or_provider, sort_order, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [randomUUID(), planId, it.name, it.amount, it.category, it.bank_or_provider ?? null, sortOrder++, now, now]
    )
  }

  res.json({ success: true })
})

// DELETE /api/salary-plans/:id — soft delete (no IPC equivalent existed; added for REST completeness)
router.delete('/:id', async (req, res) => {
  const db = getDb()
  const now = new Date().toISOString()
  await db.query('UPDATE salary_plans SET deleted_at = ?, updated_at = ? WHERE id = ?', [now, now, req.params.id])
  res.json({ success: true })
})

module.exports = router
