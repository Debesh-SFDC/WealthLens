const express = require('express')
const jwt = require('jsonwebtoken')
const bcrypt = require('bcryptjs')
const { randomUUID } = require('crypto')
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

function signToken(user) {
  return jwt.sign(
    { id: user.id, name: user.name, role: user.role },
    process.env.JWT_SECRET,
    { expiresIn: JWT_EXPIRES_IN }
  )
}

// POST /api/auth/login — { mobile_number, password } -> { token, user }
router.post('/login', async (req, res) => {
  const { mobile_number, password } = req.body || {}
  if (!mobile_number || !password) return res.status(400).json({ error: 'mobile_number and password are required' })

  const db = getDb()
  const { rows } = await db.query('SELECT * FROM users WHERE mobile_number = ?', [mobile_number])
  const user = rows[0]
  if (!user || !user.password_hash || !bcrypt.compareSync(String(password), user.password_hash)) {
    return res.status(401).json({ error: 'Invalid mobile number or password' })
  }

  await db.query('UPDATE users SET last_login_at = ? WHERE id = ?', [new Date().toISOString(), user.id])

  res.json({
    token: signToken(user),
    user: { id: user.id, name: user.name, role: user.role, avatar_color: user.avatar_color },
  })
})

// GET /api/auth/bootstrap-status — unauthenticated; lets the client know
// whether to show the first-launch account-setup wizard instead of Login.
router.get('/bootstrap-status', async (req, res) => {
  const db = getDb()
  const { rows } = await db.query('SELECT COUNT(*) as count FROM users')
  res.json({ hasUsers: Number(rows[0].count) > 0 })
})

// POST /api/auth/bootstrap — { name, mobile_number, password } -> { token, user }
// First-launch only. Guarded server-side (not just hidden in the UI) so it
// can never be used to mint an extra admin account after setup is done.
router.post('/bootstrap', async (req, res) => {
  const { name, mobile_number, password } = req.body || {}
  if (!name || !mobile_number || !password) {
    return res.status(400).json({ error: 'name, mobile_number and password are required' })
  }

  const db = getDb()
  const { rows: existingAdmins } = await db.query("SELECT id FROM users WHERE role = 'admin' LIMIT 1")
  if (existingAdmins[0]) return res.status(403).json({ error: 'Setup already completed' })

  const password_hash = bcrypt.hashSync(String(password), 10)
  const { rows } = await db.query(
    `INSERT INTO users (name, role, pin_hash, mobile_number, password_hash)
     VALUES (?, 'admin', ?, ?, ?) RETURNING id`,
    [name, bcrypt.hashSync(randomUUID(), 10), mobile_number, password_hash]
  )
  const user = { id: rows[0].id, name, role: 'admin', avatar_color: '#6C63FF' }

  res.json({ token: signToken(user), user })
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

function requireAdmin(req, res, next) {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Access denied. Admin only.' })
  }
  next()
}

module.exports = { router, requireAuth, requireAdmin }
