const express = require('express')
const { randomUUID } = require('crypto')
const { getDb } = require('../db')

const router = express.Router()

// Tasks & Ideas — quick-capture to-dos and ideas. Mounted with requireAuth in
// src/server/index.js; every route below is scoped to req.user.id, so a user
// can never read or modify another user's tasks.

const TYPES      = ['task', 'idea']
const STATUSES   = ['pending', 'done', 'archived']
const PRIORITIES = ['high', 'medium', 'low']

// GET /api/tasks?type=&status=&date= — caller's own tasks. `date` (YYYY-MM-DD)
// matches due_date on that day, whether or not it carries a time component.
router.get('/', async (req, res) => {
  const { type, status, date } = req.query || {}
  const db = getDb()
  let query = 'SELECT * FROM tasks WHERE user_id = ? AND deleted_at IS NULL'
  const params = [req.user.id]
  if (type)   { query += ' AND type = ?';          params.push(type) }
  if (status) { query += ' AND status = ?';        params.push(status) }
  if (date)   { query += ' AND due_date LIKE ?';   params.push(`${date}%`) }
  query += ' ORDER BY created_at DESC'
  const { rows } = await db.query(query, params)
  res.json(rows)
})

// POST /api/tasks — create a task or idea. Only title is required so the
// one-line quick capture works.
router.post('/', async (req, res) => {
  const d = req.body || {}
  const title = (d.title || '').trim()
  if (!title) return res.status(400).json({ error: 'title is required' })
  const type     = TYPES.includes(d.type) ? d.type : 'task'
  const status   = STATUSES.includes(d.status) ? d.status : 'pending'
  const priority = PRIORITIES.includes(d.priority) ? d.priority : 'medium'

  const db = getDb()
  const now = new Date().toISOString()
  const { rows } = await db.query(
    `INSERT INTO tasks (sync_id, user_id, title, description, type, status, priority,
       due_date, done_at, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     RETURNING id`,
    [
      randomUUID(), req.user.id, title, d.description ?? null, type, status, priority,
      d.due_date || null, status === 'done' ? now : null, now, now,
    ]
  )
  res.json({ id: rows[0].id })
})

// PUT /api/tasks/:id — partial update: fields left out of the body keep their
// current value, so toggling done only needs { status }. done_at is stamped
// when status moves to 'done' and cleared when it moves back.
router.put('/:id', async (req, res) => {
  const d = req.body || {}
  const db = getDb()
  const { rows } = await db.query(
    'SELECT * FROM tasks WHERE id = ? AND user_id = ? AND deleted_at IS NULL',
    [req.params.id, req.user.id]
  )
  const cur = rows[0]
  if (!cur) return res.status(404).json({ error: 'Task not found' })

  const now = new Date().toISOString()
  const title    = d.title !== undefined ? String(d.title).trim() : cur.title
  if (!title) return res.status(400).json({ error: 'title is required' })
  const type     = TYPES.includes(d.type) ? d.type : cur.type
  const status   = STATUSES.includes(d.status) ? d.status : cur.status
  const priority = PRIORITIES.includes(d.priority) ? d.priority : cur.priority
  const description = d.description !== undefined ? (d.description || null) : cur.description
  const due_date    = d.due_date !== undefined ? (d.due_date || null) : cur.due_date
  const done_at = status === 'done' ? (cur.status === 'done' ? cur.done_at : now) : null

  await db.query(
    `UPDATE tasks SET title = ?, description = ?, type = ?, status = ?, priority = ?,
       due_date = ?, done_at = ?, updated_at = ?
     WHERE id = ? AND user_id = ?`,
    [title, description, type, status, priority, due_date, done_at, now, req.params.id, req.user.id]
  )
  res.json({ success: true, done_at })
})

// DELETE /api/tasks/:id — soft delete, scoped to req.user.id
router.delete('/:id', async (req, res) => {
  const db = getDb()
  const now = new Date().toISOString()
  const { rowCount } = await db.query(
    'UPDATE tasks SET deleted_at = ?, updated_at = ? WHERE id = ? AND user_id = ?',
    [now, now, req.params.id, req.user.id]
  )
  if (!rowCount) return res.status(404).json({ error: 'Task not found' })
  res.json({ success: true })
})

module.exports = router
