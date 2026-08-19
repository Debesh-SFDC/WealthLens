const express = require('express')
const { getDb } = require('../db')
const { requireAdmin } = require('../auth')

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

// GET /api/weight/all — admin only. Weight logs for every user, grouped by
// user, so the admin's Health tab can show the whole household at a glance.
router.get('/all', requireAdmin, async (req, res) => {
  const db = getDb()
  const { rows: users } = await db.query(
    'SELECT id, name, role, avatar_color, height_cm, target_weight_kg FROM users ORDER BY role DESC, name ASC'
  )
  const { rows: logs } = await db.query(
    'SELECT user_id, date, weight_kg, created_at as logged_at FROM weight_logs ORDER BY date ASC'
  )

  const result = users.map(u => {
    const userLogs = logs.filter(l => l.user_id === u.id)
    const latest = userLogs.length ? userLogs[userLogs.length - 1] : null
    const heightM = u.height_cm ? u.height_cm / 100 : null
    const bmi = latest && heightM ? Number((latest.weight_kg / (heightM * heightM)).toFixed(1)) : null
    return {
      id: u.id,
      name: u.name,
      role: u.role,
      avatar_color: u.avatar_color,
      logs: userLogs.map(l => ({ date: l.date, weight_kg: l.weight_kg, logged_at: l.logged_at })),
      latestWeight: latest ? latest.weight_kg : null,
      targetWeight: u.target_weight_kg ?? null,
      bmi,
    }
  })

  res.json({ users: result })
})

module.exports = router
