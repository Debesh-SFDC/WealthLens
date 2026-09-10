const express = require('express')
const { getDb } = require('../db')

const router = express.Router()

// Goal ↔ wishlist-collection links. Every route is scoped to req.user.id.
// Goals themselves are admin-only (single-admin install), collections are
// per-user, so the link row carries the owning user_id for scoping.

// GET /api/goal-wishlist-links — all links for the caller, each joined with the
// goal (title / emoji / colour / amounts / date) and the collection (name /
// emoji / colour). Rows whose goal or collection was soft-deleted are dropped.
router.get('/', async (req, res) => {
  const db = getDb()
  const { rows } = await db.query(
    `SELECT l.id, l.goal_id, l.collection_id, l.created_at,
       g.title AS goal_title, g.emoji AS goal_emoji, g.color AS goal_color,
       g.target_amount AS goal_target_amount, g.current_amount AS goal_current_amount,
       g.target_date AS goal_target_date, g.is_achieved AS goal_is_achieved,
       c.name AS collection_name, c.emoji AS collection_emoji, c.color AS collection_color
     FROM goal_wishlist_links l
     JOIN goals g ON g.id = l.goal_id AND g.deleted_at IS NULL
     JOIN wishlist_collections c ON c.id = l.collection_id AND c.deleted_at IS NULL
     WHERE l.user_id = ?
     ORDER BY l.id DESC`,
    [req.user.id]
  )
  res.json(rows)
})

// POST /api/goal-wishlist-links — body { goal_id, collection_id }. The
// UNIQUE(goal_id, collection_id) constraint makes a duplicate a 409.
router.post('/', async (req, res) => {
  const { goal_id, collection_id } = req.body || {}
  if (!goal_id || !collection_id) {
    return res.status(400).json({ error: 'goal_id and collection_id are required' })
  }
  const db = getDb()
  const now = new Date().toISOString()
  try {
    const { rows } = await db.query(
      `INSERT INTO goal_wishlist_links (user_id, goal_id, collection_id, created_at)
       VALUES (?, ?, ?, ?)
       RETURNING id`,
      [req.user.id, goal_id, collection_id, now]
    )
    res.json({ id: rows[0].id })
  } catch (e) {
    res.status(409).json({ error: 'That goal and collection are already linked' })
  }
})

// DELETE /api/goal-wishlist-links/:id — hard delete, scoped to the caller.
router.delete('/:id', async (req, res) => {
  const db = getDb()
  const { rowCount } = await db.query(
    'DELETE FROM goal_wishlist_links WHERE id = ? AND user_id = ?',
    [req.params.id, req.user.id]
  )
  if (!rowCount) return res.status(404).json({ error: 'Link not found' })
  res.json({ success: true })
})

module.exports = router
