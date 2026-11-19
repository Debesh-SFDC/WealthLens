const express = require('express')
const { randomUUID } = require('crypto')
const { getDb } = require('../db')
const { cleanEvent, cleanPhases, buildTimeline, checkDependsOn, SQL } = require('../../shared/lifeTimeline')
const { liveNetWorth } = require('../netWorth')

const router = express.Router()

// Life Timeline — admin only (mounted with requireAuth + requireAdmin in
// src/server/index.js). Every life_events / life_phases query is scoped to
// req.user.id. The range, the retirement node and the goal nodes are derived
// on every read (see src/shared/lifeTimeline.js), never stored. Deletes are
// soft (deleted_at); nothing relies on ON DELETE CASCADE.

const EVENT_COLS = ['title', 'notes', 'year', 'month', 'day', 'amount', 'amount_note',
  'category', 'is_assumed', 'is_major', 'status', 'achieved_at', 'goal_id', 'depends_on_id']

// depends_on_id must point at another live event of the same user, no loops.
async function checkDepends(db, uid, eventId, dependsOnId) {
  if (dependsOnId == null) return
  const { rows } = await db.query(
    'SELECT id, depends_on_id FROM life_events WHERE user_id = ? AND deleted_at IS NULL', [uid])
  checkDependsOn(eventId, dependsOnId,
    new Map(rows.map(r => [Number(r.id), r.depends_on_id == null ? null : Number(r.depends_on_id)])))
}

// goal_id has no FK (see setup-postgres.sql), so check it against live goals here.
async function checkGoal(db, goalId) {
  if (goalId == null) return
  const { rows } = await db.query('SELECT id FROM goals WHERE id = ? AND deleted_at IS NULL', [goalId])
  if (!rows[0]) {
    const err = new Error('goal_id does not match a goal')
    err.status = 400
    throw err
  }
}

function sendError(res, e, label) {
  if (e.status === 400) return res.status(400).json({ error: e.message })
  console.error(label, e)
  return res.status(500).json({ error: 'Something went wrong' })
}

// GET /api/life-timeline → { range, birthYear, childBirthYear, retirement, phases, events, goals }
router.get('/', async (req, res) => {
  try {
    const db = getDb()
    const uid = req.user.id
    const [profile, fire, phases, events, goals] = await Promise.all([
      db.query(SQL.profile),
      db.query(SQL.fire),
      db.query(SQL.phases, [uid]),
      db.query(SQL.events, [uid]),
      db.query(SQL.goals),
    ])
    // live net worth only when a goal tracks it
    const netWorth = goals.rows.some(g => g.auto_source === 'net_worth') ? await liveNetWorth(db) : null
    res.json(buildTimeline({
      profile: profile.rows[0],
      fire: fire.rows[0],
      phases: phases.rows,
      events: events.rows,
      goals: goals.rows,
      netWorth,
    }))
  } catch (e) {
    sendError(res, e, 'GET /life-timeline failed')
  }
})

// POST /api/life-timeline/events
router.post('/events', async (req, res) => {
  try {
    const ev = cleanEvent(req.body)
    const db = getDb()
    await checkGoal(db, ev.goal_id)
    await checkDepends(db, req.user.id, null, ev.depends_on_id)
    const now = new Date().toISOString()
    const { rows } = await db.query(
      `INSERT INTO life_events (sync_id, user_id, ${EVENT_COLS.join(', ')}, created_at, updated_at)
       VALUES (?, ?, ${EVENT_COLS.map(() => '?').join(', ')}, ?, ?)
       RETURNING id`,
      [randomUUID(), req.user.id, ...EVENT_COLS.map(c => ev[c]), now, now]
    )
    res.json({ id: rows[0].id })
  } catch (e) {
    sendError(res, e, 'POST /life-timeline/events failed')
  }
})

// PUT /api/life-timeline/events/:id — full update of one of the caller's events
router.put('/events/:id', async (req, res) => {
  try {
    const ev = cleanEvent(req.body)
    const db = getDb()
    await checkGoal(db, ev.goal_id)
    await checkDepends(db, req.user.id, req.params.id, ev.depends_on_id)
    const now = new Date().toISOString()
    const { rows } = await db.query(
      `UPDATE life_events SET ${EVENT_COLS.map(c => `${c} = ?`).join(', ')}, updated_at = ?
       WHERE id = ? AND user_id = ? AND deleted_at IS NULL
       RETURNING id`,
      [...EVENT_COLS.map(c => ev[c]), now, req.params.id, req.user.id]
    )
    if (!rows[0]) return res.status(404).json({ error: 'Event not found' })
    res.json({ success: true })
  } catch (e) {
    sendError(res, e, 'PUT /life-timeline/events failed')
  }
})

// DELETE /api/life-timeline/events/:id — soft delete
router.delete('/events/:id', async (req, res) => {
  try {
    const db = getDb()
    const now = new Date().toISOString()
    const { rows } = await db.query(
      `UPDATE life_events SET deleted_at = ?, updated_at = ?
       WHERE id = ? AND user_id = ? AND deleted_at IS NULL
       RETURNING id`,
      [now, now, req.params.id, req.user.id]
    )
    if (!rows[0]) return res.status(404).json({ error: 'Event not found' })
    res.json({ success: true })
  } catch (e) {
    sendError(res, e, 'DELETE /life-timeline/events failed')
  }
})

// PUT /api/life-timeline/phases — body { phases: [...] } (or a bare array) is
// the complete new list. Rows sent with an id are updated in place (keeping
// their sync_id), rows without one are inserted, and the caller's live rows
// missing from the list are soft-deleted.
router.put('/phases', async (req, res) => {
  try {
    const list = cleanPhases(Array.isArray(req.body) ? req.body : req.body?.phases)
    const db = getDb()
    const uid = req.user.id
    const now = new Date().toISOString()
    const { rows: live } = await db.query(
      'SELECT id FROM life_phases WHERE user_id = ? AND deleted_at IS NULL', [uid])
    const liveIds = new Set(live.map(r => Number(r.id)))
    const unknown = list.find(p => p.id != null && !liveIds.has(p.id))
    if (unknown) return res.status(400).json({ error: `phase ${unknown.id} not found` })

    const keep = new Set(list.filter(p => p.id != null).map(p => p.id))
    for (const id of liveIds) {
      if (!keep.has(id)) {
        await db.query('UPDATE life_phases SET deleted_at = ?, updated_at = ? WHERE id = ? AND user_id = ?',
          [now, now, id, uid])
      }
    }
    for (const p of list) {
      if (p.id != null) {
        await db.query(
          `UPDATE life_phases SET numeral = ?, name = ?, start_year = ?, sort_order = ?, updated_at = ?
           WHERE id = ? AND user_id = ?`,
          [p.numeral, p.name, p.start_year, p.sort_order, now, p.id, uid])
      } else {
        await db.query(
          `INSERT INTO life_phases (sync_id, user_id, numeral, name, start_year, sort_order, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?) RETURNING id`,
          [randomUUID(), uid, p.numeral, p.name, p.start_year, p.sort_order, now, now])
      }
    }
    const { rows } = await db.query(SQL.phases, [uid])
    res.json({ success: true, phases: rows })
  } catch (e) {
    sendError(res, e, 'PUT /life-timeline/phases failed')
  }
})

module.exports = router
