const express = require('express')
const { randomUUID } = require('crypto')
const { getDb } = require('../db')

const router = express.Router()

// GET /api/goals — mirrors goals:getAll
router.get('/', async (req, res) => {
  const db = getDb()
  const { rows } = await db.query(
    'SELECT * FROM goals WHERE deleted_at IS NULL ORDER BY created_at DESC'
  )
  res.json(rows)
})

// POST /api/goals — mirrors goals:create
router.post('/', async (req, res) => {
  const d = req.body || {}
  const db = getDb()
  const now = new Date().toISOString()
  const { rows } = await db.query(
    `INSERT INTO goals (sync_id, title, type, category, target_amount, current_amount, target_date,
       bank_or_provider, emoji, color, inflation_adjust, inflation_rate, monthly_emi, notes,
       created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     RETURNING id`,
    [
      randomUUID(), d.title, d.type, d.category ?? 'need', d.target_amount ?? 0, d.current_amount ?? 0,
      d.target_date ?? null, d.bank_or_provider ?? null, d.emoji ?? null, d.color ?? null,
      d.inflation_adjust ? 1 : 0, d.inflation_rate ?? 6, d.monthly_emi ?? 0, d.notes ?? null,
      now, now,
    ]
  )
  res.json({ id: rows[0].id })
})

// PUT /api/goals/:id — mirrors goals:update
router.put('/:id', async (req, res) => {
  const d = req.body || {}
  const db = getDb()
  const now = new Date().toISOString()
  await db.query(
    `UPDATE goals SET title = ?, type = ?, category = ?, target_amount = ?, current_amount = ?,
       target_date = ?, bank_or_provider = ?, emoji = ?, color = ?,
       inflation_adjust = ?, inflation_rate = ?, monthly_emi = ?, notes = ?,
       is_achieved = ?, achieved_at = ?, updated_at = ?
     WHERE id = ?`,
    [
      d.title, d.type, d.category ?? 'need', d.target_amount ?? 0, d.current_amount ?? 0,
      d.target_date ?? null, d.bank_or_provider ?? null, d.emoji ?? null, d.color ?? null,
      d.inflation_adjust ? 1 : 0, d.inflation_rate ?? 6, d.monthly_emi ?? 0, d.notes ?? null,
      d.is_achieved ? 1 : 0, d.is_achieved ? (d.achieved_at || now) : null,
      now, req.params.id,
    ]
  )
  res.json({ success: true })
})

// DELETE /api/goals/:id — mirrors goals:delete (soft delete + unlink investments)
router.delete('/:id', async (req, res) => {
  const db = getDb()
  const now = new Date().toISOString()
  const id = req.params.id
  await db.query('UPDATE goals SET deleted_at = ?, updated_at = ? WHERE id = ?', [now, now, id])
  await db.query('UPDATE investments SET goal_id = NULL, last_updated_at = ? WHERE goal_id = ?', [now, id])
  await db.query('DELETE FROM goal_investments WHERE goal_id = ?', [id])
  await db.query('DELETE FROM goal_wishlist_links WHERE goal_id = ?', [id])
  res.json({ success: true })
})

// GET /api/goals/:id/contributions — mirrors goalContributions:getAll
router.get('/:id/contributions', async (req, res) => {
  const db = getDb()
  const { rows } = await db.query(
    'SELECT * FROM goal_contributions WHERE goal_id = ? AND deleted_at IS NULL ORDER BY contributed_at DESC, id DESC',
    [req.params.id]
  )
  res.json(rows)
})

// POST /api/goals/:id/contributions — mirrors goalContributions:create
router.post('/:id/contributions', async (req, res) => {
  const d = req.body || {}
  const db = getDb()
  const now = new Date().toISOString()
  const amount = Number(d.amount) || 0
  const { rows } = await db.query(
    `INSERT INTO goal_contributions (sync_id, goal_id, amount, note, contributed_at, contribution_type, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     RETURNING id`,
    [randomUUID(), req.params.id, amount, d.note ?? null, d.contributed_at || now, d.contribution_type || 'manual', now, now]
  )
  await db.query(
    'UPDATE goals SET current_amount = COALESCE(current_amount, 0) + ?, updated_at = ? WHERE id = ?',
    [amount, now, req.params.id]
  )
  res.json({ id: rows[0].id, success: true })
})

// DELETE /api/goals/:id/contributions/:cid — mirrors goalContributions:delete
router.delete('/:id/contributions/:cid', async (req, res) => {
  const db = getDb()
  const now = new Date().toISOString()
  const { rows } = await db.query(
    'SELECT amount FROM goal_contributions WHERE id = ? AND goal_id = ? AND deleted_at IS NULL',
    [req.params.cid, req.params.id]
  )
  if (!rows.length) return res.json({ success: true })
  await db.query('UPDATE goal_contributions SET deleted_at = ?, updated_at = ? WHERE id = ?', [now, now, req.params.cid])
  await db.query(
    'UPDATE goals SET current_amount = COALESCE(current_amount, 0) - ?, updated_at = ? WHERE id = ?',
    [rows[0].amount, now, req.params.id]
  )
  res.json({ success: true })
})

module.exports = router
