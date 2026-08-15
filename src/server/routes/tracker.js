const express = require('express')
const { getDb } = require('../db')

const router = express.Router()

// GET /api/tracker/summary — tracker dashboard: own expense total this month,
// read-only goals list, and the active salary plan's total budget only
// (no line-item breakdown — that's admin-only via /api/salary-plans).
router.get('/summary', async (req, res) => {
  const db = getDb()
  const month = new Date().toISOString().slice(0, 7)

  const { rows: expenseRows } = await db.query(
    `SELECT COALESCE(SUM(amount), 0) as total FROM expenses
     WHERE deleted_at IS NULL AND logged_by_user_id = ? AND date LIKE ?`,
    [req.user.id, `${month}%`]
  )

  const { rows: goals } = await db.query(
    'SELECT * FROM goals WHERE deleted_at IS NULL ORDER BY created_at DESC'
  )

  const { rows: planRows } = await db.query(
    'SELECT monthly_salary FROM salary_plans WHERE is_active = 1 LIMIT 1'
  )

  res.json({
    monthlyExpenseTotal: expenseRows[0].total,
    goals,
    activeSalaryPlanTotal: planRows[0]?.monthly_salary ?? 0,
  })
})

module.exports = router
