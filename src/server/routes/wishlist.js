const express = require('express')
const { randomUUID } = require('crypto')
const { getDb } = require('../db')

const router = express.Router()

// Wishlist — a private, per-user list of things the caller wants to buy
// someday. Available to both admin and tracker roles (mounted with just
// requireAuth in src/server/index.js, no requireAdmin). Every route below is
// always scoped to req.user.id — there is no query or param that can read or
// modify another user's items, admin included.

// GET /api/wishlist?status=&priority=&category=&search= — caller's own items
router.get('/', async (req, res) => {
  const { status, priority, category, search } = req.query || {}
  const db = getDb()
  let query = 'SELECT * FROM wishlist_items WHERE user_id = ? AND deleted_at IS NULL'
  const params = [req.user.id]
  if (status)   { query += ' AND status = ?';   params.push(status) }
  if (priority) { query += ' AND priority = ?'; params.push(priority) }
  if (category) { query += ' AND category = ?'; params.push(category) }
  if (search)   { query += ' AND (name LIKE ? OR brand LIKE ?)'; params.push(`%${search}%`, `%${search}%`) }
  query += ' ORDER BY created_at DESC'
  const { rows } = await db.query(query, params)
  res.json(rows)
})

// POST /api/wishlist — creates an item for req.user.id. Only name is
// required; everything else (URL, price, priority, etc.) is optional so a
// "quick add" of just a name + category works.
router.post('/', async (req, res) => {
  const d = req.body || {}
  if (!d.name) return res.status(400).json({ error: 'name is required' })

  const db = getDb()
  const now = new Date().toISOString()
  const { rows } = await db.query(
    `INSERT INTO wishlist_items (sync_id, user_id, name, brand, category, url, price, currency,
       priority, status, purchase_timing, notes, group_name, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     RETURNING id`,
    [
      randomUUID(), req.user.id, d.name, d.brand ?? null, d.category ?? 'Other', d.url ?? null,
      d.price ?? null, d.currency ?? 'INR', d.priority ?? 'medium', d.status ?? 'wishlist',
      d.purchase_timing ?? 'No Plan', d.notes ?? null, d.group_name ?? null, now, now,
    ]
  )
  res.json({ id: rows[0].id })
})

// PUT /api/wishlist/:id — updates the item, scoped to req.user.id so one
// user can never edit another user's item even by guessing an id.
router.put('/:id', async (req, res) => {
  const d = req.body || {}
  const db = getDb()
  const now = new Date().toISOString()
  const { rowCount } = await db.query(
    `UPDATE wishlist_items SET name = ?, brand = ?, category = ?, url = ?, price = ?, currency = ?,
       priority = ?, status = ?, purchase_timing = ?, notes = ?, group_name = ?, updated_at = ?
     WHERE id = ? AND user_id = ?`,
    [
      d.name, d.brand ?? null, d.category ?? 'Other', d.url ?? null, d.price ?? null, d.currency ?? 'INR',
      d.priority ?? 'medium', d.status ?? 'wishlist', d.purchase_timing ?? 'No Plan', d.notes ?? null,
      d.group_name ?? null, now, req.params.id, req.user.id,
    ]
  )
  if (!rowCount) return res.status(404).json({ error: 'Item not found' })
  res.json({ success: true })
})

// DELETE /api/wishlist/:id — soft delete, scoped to req.user.id
router.delete('/:id', async (req, res) => {
  const db = getDb()
  const now = new Date().toISOString()
  const { rowCount } = await db.query(
    'UPDATE wishlist_items SET deleted_at = ?, updated_at = ? WHERE id = ? AND user_id = ?',
    [now, now, req.params.id, req.user.id]
  )
  if (!rowCount) return res.status(404).json({ error: 'Item not found' })
  res.json({ success: true })
})

module.exports = router
