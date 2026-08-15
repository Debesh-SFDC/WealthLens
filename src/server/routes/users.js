const express = require('express')
const bcrypt = require('bcryptjs')
const { randomUUID } = require('crypto')
const { getDb } = require('../db')

const router = express.Router()

// GET /api/users — mirrors users:getAll. Never returns password_hash/pin_hash.
router.get('/', async (req, res) => {
  const db = getDb()
  const { rows } = await db.query(
    'SELECT id, name, role, mobile_number, avatar_color, last_login_at FROM users ORDER BY role DESC'
  )
  res.json(rows)
})

// PUT /api/users/:id — { name, mobile_number, password? } — mirrors users:update.
// password omitted keeps the existing hash. Role is intentionally not editable here.
router.put('/:id', async (req, res) => {
  const { name, mobile_number, password } = req.body || {}
  const db = getDb()
  const id = req.params.id

  if (password) {
    await db.query(
      'UPDATE users SET name = ?, mobile_number = ?, password_hash = ? WHERE id = ?',
      [name, mobile_number, bcrypt.hashSync(String(password), 10), id]
    )
  } else {
    await db.query('UPDATE users SET name = ?, mobile_number = ? WHERE id = ?', [name, mobile_number, id])
  }
  res.json({ success: true })
})

// POST /api/users — { name, role, mobile_number, password } — mirrors users:create.
// Admin-only, used for adding family members (e.g. AccountSetup step 2) after
// the admin account already exists.
router.post('/', async (req, res) => {
  const { name, role, mobile_number, password } = req.body || {}
  if (!name || !role || !mobile_number || !password) {
    return res.status(400).json({ error: 'name, role, mobile_number and password are required' })
  }
  const db = getDb()
  const { rows } = await db.query(
    `INSERT INTO users (name, role, pin_hash, mobile_number, password_hash)
     VALUES (?, ?, ?, ?, ?) RETURNING id`,
    [name, role, bcrypt.hashSync(randomUUID(), 10), mobile_number, bcrypt.hashSync(String(password), 10)]
  )
  res.json({ id: rows[0].id })
})

module.exports = router
