const express = require('express')
const bcrypt = require('bcryptjs')
const { randomUUID } = require('crypto')
const { getDb } = require('../db')

const router = express.Router()

// GET /api/users — mirrors users:getAll. Never returns password_hash/pin_hash.
router.get('/', async (req, res) => {
  const db = getDb()
  const { rows } = await db.query(
    `SELECT id, name, role, mobile_number, avatar_color, last_login_at, created_at,
            date_of_birth, height_cm, target_weight_kg
     FROM users ORDER BY role DESC`
  )
  res.json(rows)
})

// PUT /api/users/:id — { name, mobile_number, password?, date_of_birth?, height_cm?, target_weight_kg? }
// mirrors users:update. password omitted keeps the existing hash. Role is
// intentionally not editable here. Validates mobile isn't already taken by
// another user.
router.put('/:id', async (req, res) => {
  const { name, mobile_number, password, date_of_birth, height_cm, target_weight_kg } = req.body || {}
  const db = getDb()
  const id = req.params.id

  const { rows: existingRows } = await db.query('SELECT id FROM users WHERE mobile_number = ?', [mobile_number])
  if (existingRows[0] && String(existingRows[0].id) !== String(id)) {
    return res.status(400).json({ error: 'Mobile number already registered' })
  }

  const setParts = ['name = ?', 'mobile_number = ?']
  const params = [name, mobile_number]
  if (password)                       { setParts.push('password_hash = ?');    params.push(bcrypt.hashSync(String(password), 10)) }
  if (date_of_birth !== undefined)    { setParts.push('date_of_birth = ?');    params.push(date_of_birth) }
  if (height_cm !== undefined)        { setParts.push('height_cm = ?');        params.push(height_cm) }
  if (target_weight_kg !== undefined) { setParts.push('target_weight_kg = ?'); params.push(target_weight_kg) }
  params.push(id)

  await db.query(`UPDATE users SET ${setParts.join(', ')} WHERE id = ?`, params)
  res.json({ success: true })
})

// POST /api/users — { name, role, mobile_number, password } — mirrors users:create.
// Admin-only, used for adding family members (e.g. AccountSetup step 2, or
// "Add Family Member" in Settings). Validates mobile isn't already taken.
router.post('/', async (req, res) => {
  const { name, role, mobile_number, password } = req.body || {}
  if (!name || !role || !mobile_number || !password) {
    return res.status(400).json({ error: 'name, role, mobile_number and password are required' })
  }
  const db = getDb()
  const { rows: existingRows } = await db.query('SELECT id FROM users WHERE mobile_number = ?', [mobile_number])
  if (existingRows[0]) return res.status(400).json({ error: 'Mobile number already registered' })

  const { rows } = await db.query(
    `INSERT INTO users (name, role, pin_hash, mobile_number, password_hash)
     VALUES (?, ?, ?, ?, ?) RETURNING id`,
    [name, role, bcrypt.hashSync(randomUUID(), 10), mobile_number, bcrypt.hashSync(String(password), 10)]
  )
  res.json({ id: rows[0].id })
})

// DELETE /api/users/:id — mirrors users:delete. Cannot delete yourself.
// Cascades expenses + weight_logs (weight_logs also has ON DELETE CASCADE at
// the schema level, but deleted explicitly here too for clarity).
router.delete('/:id', async (req, res) => {
  const id = req.params.id
  if (String(req.user.id) === String(id)) {
    return res.status(400).json({ error: 'Cannot delete your own account' })
  }
  const db = getDb()
  await db.query('DELETE FROM expenses WHERE logged_by_user_id = ?', [id])
  await db.query('DELETE FROM weight_logs WHERE user_id = ?', [id])
  await db.query('DELETE FROM users WHERE id = ?', [id])
  res.json({ success: true })
})

module.exports = router
