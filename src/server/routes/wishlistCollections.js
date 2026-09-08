const express = require('express')
const { randomUUID } = require('crypto')
const { getDb } = require('../db')

const router = express.Router()

// Wishlist collections — folder-style grouping for a user's wishlist items.
// Mounted at /api/wishlist/collections BEFORE the /api/wishlist router so
// these paths never fall through to wishlist's `/:id` handlers. Every route
// is scoped to req.user.id.

// GET /api/wishlist/collections — the caller's collections, each with a live
// item_count and total_value (priced items only).
router.get('/', async (req, res) => {
  const db = getDb()
  const { rows } = await db.query(
    `SELECT c.*,
       (SELECT COUNT(*) FROM wishlist_items i
          WHERE i.collection_id = c.id AND i.deleted_at IS NULL) AS item_count,
       (SELECT COALESCE(SUM(i.price), 0) FROM wishlist_items i
          WHERE i.collection_id = c.id AND i.deleted_at IS NULL AND i.price IS NOT NULL) AS total_value
     FROM wishlist_collections c
     WHERE c.user_id = ? AND c.deleted_at IS NULL
     ORDER BY c.sort_order ASC, c.id ASC`,
    [req.user.id]
  )
  res.json(rows)
})

// POST /api/wishlist/collections — create. Only name is required.
router.post('/', async (req, res) => {
  const d = req.body || {}
  if (!d.name || !String(d.name).trim()) return res.status(400).json({ error: 'name is required' })

  const db = getDb()
  const now = new Date().toISOString()
  const { rows } = await db.query(
    `INSERT INTO wishlist_collections
       (sync_id, user_id, name, description, emoji, color, sort_order, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
     RETURNING id`,
    [
      randomUUID(), req.user.id, String(d.name).trim(), d.description ?? null,
      d.emoji || '📦', d.color || '#6C63FF', d.sort_order ?? 0, now, now,
    ]
  )
  res.json({ id: rows[0].id })
})

// PUT /api/wishlist/collections/:id — update name / description / emoji / color.
router.put('/:id', async (req, res) => {
  const d = req.body || {}
  if (!d.name || !String(d.name).trim()) return res.status(400).json({ error: 'name is required' })

  const db = getDb()
  const now = new Date().toISOString()
  const { rowCount } = await db.query(
    `UPDATE wishlist_collections
       SET name = ?, description = ?, emoji = ?, color = ?, sort_order = ?, updated_at = ?
     WHERE id = ? AND user_id = ?`,
    [
      String(d.name).trim(), d.description ?? null, d.emoji || '📦', d.color || '#6C63FF',
      d.sort_order ?? 0, now, req.params.id, req.user.id,
    ]
  )
  if (!rowCount) return res.status(404).json({ error: 'Collection not found' })
  res.json({ success: true })
})

// DELETE /api/wishlist/collections/:id — soft delete; its items move to
// Uncategorized (collection_id = NULL) rather than being deleted.
router.delete('/:id', async (req, res) => {
  const db = getDb()
  const now = new Date().toISOString()
  const { rowCount } = await db.query(
    'UPDATE wishlist_collections SET deleted_at = ?, updated_at = ? WHERE id = ? AND user_id = ?',
    [now, now, req.params.id, req.user.id]
  )
  if (!rowCount) return res.status(404).json({ error: 'Collection not found' })
  await db.query(
    'UPDATE wishlist_items SET collection_id = NULL, updated_at = ? WHERE collection_id = ? AND user_id = ?',
    [now, req.params.id, req.user.id]
  )
  res.json({ success: true })
})

module.exports = router
