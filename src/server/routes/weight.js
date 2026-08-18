const express = require('express')
const { getDb } = require('../db')

const router = express.Router()

// GET /api/weight?from=&to= — the caller's own weight logs in an optional
// date range, ascending. Always scoped to req.user.id.
router.get('/', async (req, res) => {
  const { from, to } = req.query || {}
  const db = getDb()
  let query = 'SELECT * FROM weight_logs WHERE user_id = ?'
  const params = [req.user.id]
  if (from) { query += ' AND date >= ?'; params.push(from) }
  if (to)   { query += ' AND date <= ?'; params.push(to) }
  query += ' ORDER BY date ASC'
  const { rows } = await db.query(query, params)
  res.json(rows)
})

// POST /api/weight — { weightKg, date?, note? } — logs/updates the caller's
// own weight for that date (defaults to today when omitted). Always scoped
// to req.user.id, regardless of body, since weight is inherently personal
// (mirrors Electron's weight:log handler). Upserts by (user_id, date), so a
// past date backfills/overwrites that day's entry rather than creating a
// duplicate.
router.post('/', async (req, res) => {
  const { weightKg, note } = req.body || {}
  const date = req.body?.date || new Date().toISOString().slice(0, 10)
  if (!weightKg) return res.status(400).json({ error: 'weightKg is required' })

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
