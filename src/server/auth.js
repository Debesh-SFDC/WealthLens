const express = require('express')
const jwt = require('jsonwebtoken')
const bcrypt = require('bcryptjs')
const { getDb } = require('./db')

const JWT_EXPIRES_IN = '30d'

function requireAuth(req, res, next) {
  const header = req.headers.authorization || ''
  const token = header.startsWith('Bearer ') ? header.slice(7) : null
  if (!token) return res.status(401).json({ error: 'Missing bearer token' })
  try {
    req.user = jwt.verify(token, process.env.JWT_SECRET)
    next()
  } catch {
    return res.status(401).json({ error: 'Invalid or expired token' })
  }
}

const router = express.Router()

// POST /api/auth/login — { name, pin } -> { token, user }
router.post('/login', async (req, res) => {
  const { name, pin } = req.body || {}
  if (!name || !pin) return res.status(400).json({ error: 'name and pin are required' })

  const db = getDb()
  const { rows } = await db.query('SELECT * FROM users WHERE name = ?', [name])
  const user = rows[0]
  if (!user || !bcrypt.compareSync(String(pin), user.pin_hash)) {
    return res.status(401).json({ error: 'Invalid name or PIN' })
  }

  await db.query('UPDATE users SET last_login_at = ? WHERE id = ?', [new Date().toISOString(), user.id])

  const token = jwt.sign(
    { id: user.id, name: user.name, role: user.role },
    process.env.JWT_SECRET,
    { expiresIn: JWT_EXPIRES_IN }
  )
  res.json({
    token,
    user: { id: user.id, name: user.name, role: user.role, avatar_color: user.avatar_color },
  })
})

// GET /api/auth/me — current user from JWT
router.get('/me', requireAuth, async (req, res) => {
  const db = getDb()
  const { rows } = await db.query(
    'SELECT id, name, role, avatar_color FROM users WHERE id = ?',
    [req.user.id]
  )
  if (!rows[0]) return res.status(404).json({ error: 'User not found' })
  res.json(rows[0])
})

module.exports = { router, requireAuth }
