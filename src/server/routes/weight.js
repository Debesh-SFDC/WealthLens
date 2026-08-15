const express = require('express')
const { getDb } = require('../db')

const router = express.Router()

// POST /api/weight — { weightKg, date, note? } — logs/updates the caller's
// own weight for that date. Always scoped to req.user.id, regardless of body,
// since weight is inherently personal (mirrors Electron's weight:log handler).
router.post('/', async (req, res) => {
  const { weightKg, date, note } = req.body || {}
  if (!weightKg || !date) return res.status(400).json({ error: 'weightKg and date are required' })

  const db = getDb()
  const now = new Date().toISOString()
  await db.query(
    `INSERT INTO weight_logs (user_id, weight_kg, date, note, created_at)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT (user_id, date) DO UPDATE SET
       weight_kg = excluded.weight_kg, note = excluded.note, created_at = excluded.created_at`,
    [req.user.id, weightKg, date, note ?? null, now]
  )
  res.json({ success: true })
})

module.exports = router
