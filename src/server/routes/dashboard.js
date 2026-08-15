const express = require('express')
const { getDb } = require('../db')

const router = express.Router()

// GET /api/dashboard/stats — expenses are role-scoped like /api/expenses
// (admin sees the whole household combined, tracker sees only their own).
// Weight is always the signed-in user's own — it isn't a shared figure.
// Investments/goals stay admin-only, matching /api/investments and /api/goals.
router.get('/stats', async (req, res) => {
  const db = getDb()
  const now = new Date()
  const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  const today = now.toISOString().slice(0, 10)
  const isAdmin = req.user.role === 'admin'

  let expQuery = `
    SELECT e.*, u.name as logged_by_name FROM expenses e
    LEFT JOIN users u ON e.logged_by_user_id = u.id
    WHERE e.deleted_at IS NULL AND e.date LIKE ?`
  const expParams = [`${month}%`]
  if (!isAdmin) {
    expQuery += ' AND e.logged_by_user_id = ?'
    expParams.push(req.user.id)
  }
  expQuery += ' ORDER BY e.date ASC, e.created_at ASC'
  const { rows: monthExpenses } = await db.query(expQuery, expParams)

  const thisMonthSpend = monthExpenses.reduce((sum, e) => sum + e.amount, 0)
  const todayExpenses = monthExpenses.filter(e => e.date === today)

  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate()
  const byDay = {}
  for (const e of monthExpenses) byDay[e.date] = (byDay[e.date] || 0) + e.amount
  const dailySpend = Array.from({ length: daysInMonth }, (_, i) => {
    const date = `${month}-${String(i + 1).padStart(2, '0')}`
    return { date, amount: byDay[date] || 0 }
  })

  const { rows: planRows } = await db.query("SELECT id FROM salary_plans WHERE is_active = 1 LIMIT 1")
  let monthlyBudget = 0
  if (planRows[0]) {
    const { rows: itemRows } = await db.query(
      "SELECT COALESCE(SUM(amount), 0) as total FROM salary_plan_items WHERE plan_id = ? AND category IN ('needs', 'wants')",
      [planRows[0].id]
    )
    monthlyBudget = Number(itemRows[0].total)
  }

  const thirtyDaysAgo = new Date(now.getTime() - 30 * 86_400_000).toISOString().slice(0, 10)
  const { rows: weightLogs } = await db.query(
    'SELECT * FROM weight_logs WHERE user_id = ? AND date >= ? ORDER BY date ASC',
    [req.user.id, thirtyDaysAgo]
  )
  const latestWeight = weightLogs.length ? weightLogs[weightLogs.length - 1].weight_kg : null
  const { rows: heightRows } = await db.query('SELECT height_cm FROM users WHERE id = ?', [req.user.id])
  const heightCm = heightRows[0]?.height_cm || 0

  let totalInvested = 0, netWorth = 0, activeGoals = 0
  if (isAdmin) {
    const { rows: invRows } = await db.query(
      'SELECT COALESCE(SUM(invested_amount), 0) as invested, COALESCE(SUM(current_value), 0) as value FROM investments WHERE deleted_at IS NULL'
    )
    totalInvested = Number(invRows[0].invested)
    netWorth = Number(invRows[0].value)
    const { rows: goalRows } = await db.query(
      'SELECT COUNT(*) as c FROM goals WHERE deleted_at IS NULL AND is_achieved = 0'
    )
    activeGoals = Number(goalRows[0].c)
  }

  res.json({
    thisMonthSpend, monthlyBudget, dailySpend, todayExpenses,
    latestWeight, weightLogs, heightCm, totalInvested, activeGoals, netWorth,
  })
})

module.exports = router
