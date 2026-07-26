const express = require('express')
const { randomUUID } = require('crypto')
const { getDb } = require('../db')

const router = express.Router()

// GET /api/profile — mirrors profile:get
router.get('/', async (req, res) => {
  const db = getDb()
  const { rows } = await db.query('SELECT * FROM profile LIMIT 1')
  res.json(rows[0] ?? null)
})

// PUT /api/profile — mirrors profile:save (upsert)
router.put('/', async (req, res) => {
  const d = req.body || {}
  const db = getDb()
  const now = new Date().toISOString()
  const { rows: existingRows } = await db.query('SELECT id FROM profile LIMIT 1')
  const existing = existingRows[0]

  if (existing) {
    await db.query(
      `UPDATE profile SET name = ?, monthly_salary = ?, salary_updated_at = ?, date_of_birth = ?,
         retirement_age = ?, updated_at = ? WHERE id = ?`,
      [d.name, d.monthly_salary, now, d.date_of_birth || null, d.retirement_age || 60, now, existing.id]
    )
    return res.json({ id: existing.id })
  }

  const { rows } = await db.query(
    `INSERT INTO profile (sync_id, name, monthly_salary, salary_updated_at, date_of_birth, retirement_age, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?) RETURNING id`,
    [randomUUID(), d.name, d.monthly_salary, now, d.date_of_birth || null, d.retirement_age || 60, now]
  )
  res.json({ id: rows[0].id })
})

module.exports = router
