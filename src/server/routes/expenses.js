const express = require('express')
const { randomUUID } = require('crypto')
const { getDb } = require('../db')

const router = express.Router()

// GET /api/expenses?month=YYYY-MM — mirrors expenses:getAll.
// Role scoping: admin sees all, tracker sees only their own logged expenses.
router.get('/', async (req, res) => {
  const db = getDb()
  let query = `
    SELECT e.*, u.name as logged_by_name FROM expenses e
    LEFT JOIN users u ON e.logged_by_user_id = u.id
    WHERE e.deleted_at IS NULL`
  const params = []

  if (req.query.month) {
    query += ' AND e.date LIKE ?'
    params.push(`${req.query.month}%`)
  }
  if (req.user.role === 'tracker') {
    query += ' AND e.logged_by_user_id = ?'
    params.push(req.user.id)
  } else if (req.query.logged_by) {
    query += ' AND e.logged_by_user_id = ?'
    params.push(req.query.logged_by)
  }
  query += ' ORDER BY e.date DESC, e.created_at DESC'

  const { rows } = await db.query(query, params)
  res.json(rows)
})

// GET /api/expenses/categories — mirrors expenses:getCategories. No role
// restriction — both admin and tracker need the category list to log an expense.
router.get('/categories', async (req, res) => {
  const db = getDb()
  const { rows } = await db.query(
    'SELECT * FROM expense_categories ORDER BY is_default DESC, name ASC'
  )
  res.json(rows)
})

// GET /api/expenses/monthly-stats?month=&year= — mirrors expenses:getMonthlyStats.
// Same role scoping as GET / — admin sees the whole household, tracker only their own.
router.get('/monthly-stats', async (req, res) => {
  const db = getDb()
  const { month, year } = req.query || {}
  const ym = `${year}-${String(month).padStart(2, '0')}`

  let query = 'SELECT * FROM expenses WHERE deleted_at IS NULL AND date LIKE ?'
  const params = [`${ym}%`]
  if (req.user.role === 'tracker') {
    query += ' AND logged_by_user_id = ?'
    params.push(req.user.id)
  } else if (req.query.logged_by) {
    query += ' AND logged_by_user_id = ?'
    params.push(req.query.logged_by)
  }
  const { rows } = await db.query(query, params)

  const total = rows.reduce((s, r) => s + r.amount, 0)

  const catMap = {}
  for (const r of rows) catMap[r.category] = (catMap[r.category] || 0) + r.amount
  const byCategory = Object.entries(catMap)
    .map(([category, amount]) => ({ category, amount }))
    .sort((a, b) => b.amount - a.amount)

  const daysInMonth = new Date(Number(year), Number(month), 0).getDate()
  const dailyAvg = rows.length ? total / daysInMonth : 0

  const dayMap = {}
  for (const r of rows) dayMap[r.date] = (dayMap[r.date] || 0) + r.amount
  const topDayEntry = Object.entries(dayMap).sort((a, b) => b[1] - a[1])[0]

  res.json({
    total, byCategory, dailyAvg,
    topDay: topDayEntry ? { date: topDayEntry[0], amount: topDayEntry[1] } : null,
  })
})

// POST /api/expenses — mirrors expenses:create
router.post('/', async (req, res) => {
  const d = req.body || {}
  const db = getDb()
  const now = new Date().toISOString()
  const { rows } = await db.query(
    `INSERT INTO expenses (sync_id, amount, category, note, date, logged_by_user_id, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?) RETURNING id`,
    [randomUUID(), d.amount, d.category, d.note ?? null, d.date, req.user.id, now, now]
  )
  res.json({ id: rows[0].id })
})

// PUT /api/expenses/:id — mirrors expenses:update. Tracker can only edit their own.
router.put('/:id', async (req, res) => {
  const d = req.body || {}
  const db = getDb()
  const id = req.params.id

  if (req.user.role === 'tracker') {
    const { rows } = await db.query('SELECT logged_by_user_id FROM expenses WHERE id = ?', [id])
    if (rows[0]?.logged_by_user_id !== req.user.id) return res.status(403).json({ error: 'Forbidden' })
  }

  const now = new Date().toISOString()
  await db.query(
    'UPDATE expenses SET amount = ?, category = ?, note = ?, date = ?, updated_at = ? WHERE id = ?',
    [d.amount, d.category, d.note ?? null, d.date, now, id]
  )
  res.json({ success: true })
})

// DELETE /api/expenses/:id — mirrors expenses:delete (soft delete). Tracker can only delete their own.
router.delete('/:id', async (req, res) => {
  const db = getDb()
  const id = req.params.id

  if (req.user.role === 'tracker') {
    const { rows } = await db.query('SELECT logged_by_user_id FROM expenses WHERE id = ?', [id])
    if (rows[0]?.logged_by_user_id !== req.user.id) return res.status(403).json({ error: 'Forbidden' })
  }

  const now = new Date().toISOString()
  await db.query('UPDATE expenses SET deleted_at = ?, updated_at = ? WHERE id = ?', [now, now, id])
  res.json({ success: true })
})

module.exports = router
