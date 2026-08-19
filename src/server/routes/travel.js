const express = require('express')
const { randomUUID } = require('crypto')
const { getDb } = require('../db')

const router = express.Router()

// Travel module (Phase 1: trips, itinerary, budget; Phase 2: packing, documents,
// companions) — admin only (mounted with requireAdmin in src/server/index.js).
// Fully separate from expenses: no trip_id on the expenses table, no shared
// tables. Every child table is soft-deleted alongside its trip explicitly
// (see DELETE /:id) since the FK ON DELETE CASCADE only fires on a real SQL
// DELETE, not the soft-delete UPDATE this app uses everywhere else.

// ── Trips ────────────────────────────────────────────────────────────────

// GET /api/travel — list trips. budget_spent is derived (SUM of that trip's
// travel_budget_items.actual_amount), not stored, so it can't drift from the
// line items — same rollup approach dashboard.js uses for monthly spend.
router.get('/', async (req, res) => {
  const db = getDb()
  const { rows: trips } = await db.query(
    'SELECT * FROM travel_trips WHERE deleted_at IS NULL ORDER BY start_date DESC'
  )
  const { rows: spend } = await db.query(`
    SELECT trip_id, COALESCE(SUM(actual_amount), 0) as spent
    FROM travel_budget_items
    WHERE deleted_at IS NULL
    GROUP BY trip_id
  `)
  const spentByTrip = {}
  for (const r of spend) spentByTrip[r.trip_id] = Number(r.spent)
  res.json(trips.map(t => ({ ...t, budget_spent: spentByTrip[t.id] || 0 })))
})

// GET /api/travel/:id — single trip with itinerary/budget/packing/documents/
// companions all fetched and attached.
router.get('/:id', async (req, res) => {
  const db = getDb()
  const id = req.params.id
  const { rows: tripRows } = await db.query(
    'SELECT * FROM travel_trips WHERE id = ? AND deleted_at IS NULL',
    [id]
  )
  const trip = tripRows[0]
  if (!trip) return res.status(404).json({ error: 'Trip not found' })

  const [
    { rows: itinerary },
    { rows: budgetItems },
    { rows: packingItems },
    { rows: documents },
    { rows: companions },
  ] = await Promise.all([
    db.query('SELECT * FROM travel_itinerary_items WHERE trip_id = ? AND deleted_at IS NULL ORDER BY day_number ASC, sort_order ASC', [id]),
    db.query('SELECT * FROM travel_budget_items WHERE trip_id = ? AND deleted_at IS NULL ORDER BY created_at ASC', [id]),
    db.query('SELECT * FROM travel_packing_items WHERE trip_id = ? AND deleted_at IS NULL ORDER BY sort_order ASC', [id]),
    db.query('SELECT * FROM travel_documents WHERE trip_id = ? AND deleted_at IS NULL ORDER BY created_at ASC', [id]),
    db.query('SELECT * FROM travel_companions WHERE trip_id = ? AND deleted_at IS NULL ORDER BY created_at ASC', [id]),
  ])

  const budget_spent = budgetItems.reduce((s, b) => s + Number(b.actual_amount || 0), 0)

  res.json({ ...trip, budget_spent, itinerary, budgetItems, packingItems, documents, companions })
})

// POST /api/travel — create trip
router.post('/', async (req, res) => {
  const d = req.body || {}
  const db = getDb()
  const now = new Date().toISOString()
  const { rows } = await db.query(
    `INSERT INTO travel_trips (sync_id, title, destination, start_date, end_date, status,
       budget_amount, emoji, color, notes, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     RETURNING id`,
    [
      randomUUID(), d.title, d.destination ?? null, d.start_date ?? null, d.end_date ?? null,
      d.status ?? 'planned', d.budget_amount ?? 0, d.emoji ?? null, d.color ?? null, d.notes ?? null,
      now, now,
    ]
  )
  res.json({ id: rows[0].id })
})

// PUT /api/travel/:id — update trip (including status)
router.put('/:id', async (req, res) => {
  const d = req.body || {}
  const db = getDb()
  const now = new Date().toISOString()
  await db.query(
    `UPDATE travel_trips SET title = ?, destination = ?, start_date = ?, end_date = ?, status = ?,
       budget_amount = ?, emoji = ?, color = ?, notes = ?, updated_at = ?
     WHERE id = ?`,
    [
      d.title, d.destination ?? null, d.start_date ?? null, d.end_date ?? null, d.status ?? 'planned',
      d.budget_amount ?? 0, d.emoji ?? null, d.color ?? null, d.notes ?? null,
      now, req.params.id,
    ]
  )
  res.json({ success: true })
})

// DELETE /api/travel/:id — soft delete trip + cascade soft-delete every
// child row (itinerary/budget/packing/documents/companions) for that trip.
router.delete('/:id', async (req, res) => {
  const db = getDb()
  const id = req.params.id
  const now = new Date().toISOString()
  await db.query('UPDATE travel_trips SET deleted_at = ?, updated_at = ? WHERE id = ?', [now, now, id])
  await db.query('UPDATE travel_itinerary_items SET deleted_at = ?, updated_at = ? WHERE trip_id = ?', [now, now, id])
  await db.query('UPDATE travel_budget_items SET deleted_at = ?, updated_at = ? WHERE trip_id = ?', [now, now, id])
  await db.query('UPDATE travel_packing_items SET deleted_at = ?, updated_at = ? WHERE trip_id = ?', [now, now, id])
  await db.query('UPDATE travel_documents SET deleted_at = ?, updated_at = ? WHERE trip_id = ?', [now, now, id])
  await db.query('UPDATE travel_companions SET deleted_at = ?, updated_at = ? WHERE trip_id = ?', [now, now, id])
  res.json({ success: true })
})

// ── Itinerary ────────────────────────────────────────────────────────────

router.post('/:id/itinerary', async (req, res) => {
  const d = req.body || {}
  const db = getDb()
  const now = new Date().toISOString()
  const { rows } = await db.query(
    `INSERT INTO travel_itinerary_items (sync_id, trip_id, day_number, date, time, title,
       category, location, notes, sort_order, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     RETURNING id`,
    [
      randomUUID(), req.params.id, d.day_number ?? 1, d.date ?? null, d.time ?? null, d.title,
      d.category ?? 'activity', d.location ?? null, d.notes ?? null, d.sort_order ?? 0, now, now,
    ]
  )
  res.json({ id: rows[0].id })
})

router.put('/itinerary/:itemId', async (req, res) => {
  const d = req.body || {}
  const db = getDb()
  const now = new Date().toISOString()
  await db.query(
    `UPDATE travel_itinerary_items SET day_number = ?, date = ?, time = ?, title = ?, category = ?,
       location = ?, notes = ?, sort_order = ?, updated_at = ?
     WHERE id = ?`,
    [
      d.day_number ?? 1, d.date ?? null, d.time ?? null, d.title, d.category ?? 'activity',
      d.location ?? null, d.notes ?? null, d.sort_order ?? 0, now, req.params.itemId,
    ]
  )
  res.json({ success: true })
})

router.delete('/itinerary/:itemId', async (req, res) => {
  const db = getDb()
  const now = new Date().toISOString()
  await db.query('UPDATE travel_itinerary_items SET deleted_at = ?, updated_at = ? WHERE id = ?', [now, now, req.params.itemId])
  res.json({ success: true })
})

// ── Budget ───────────────────────────────────────────────────────────────

router.post('/:id/budget', async (req, res) => {
  const d = req.body || {}
  const db = getDb()
  const now = new Date().toISOString()
  const { rows } = await db.query(
    `INSERT INTO travel_budget_items (sync_id, trip_id, category, label, planned_amount,
       actual_amount, notes, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
     RETURNING id`,
    [
      randomUUID(), req.params.id, d.category ?? 'other', d.label, d.planned_amount ?? 0,
      d.actual_amount ?? 0, d.notes ?? null, now, now,
    ]
  )
  res.json({ id: rows[0].id })
})

router.put('/budget/:itemId', async (req, res) => {
  const d = req.body || {}
  const db = getDb()
  const now = new Date().toISOString()
  await db.query(
    `UPDATE travel_budget_items SET category = ?, label = ?, planned_amount = ?, actual_amount = ?,
       notes = ?, updated_at = ?
     WHERE id = ?`,
    [d.category ?? 'other', d.label, d.planned_amount ?? 0, d.actual_amount ?? 0, d.notes ?? null, now, req.params.itemId]
  )
  res.json({ success: true })
})

router.delete('/budget/:itemId', async (req, res) => {
  const db = getDb()
  const now = new Date().toISOString()
  await db.query('UPDATE travel_budget_items SET deleted_at = ?, updated_at = ? WHERE id = ?', [now, now, req.params.itemId])
  res.json({ success: true })
})

// ── Packing ──────────────────────────────────────────────────────────────

router.post('/:id/packing', async (req, res) => {
  const d = req.body || {}
  const db = getDb()
  const now = new Date().toISOString()
  const { rows } = await db.query(
    `INSERT INTO travel_packing_items (sync_id, trip_id, item_name, category, is_packed,
       sort_order, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     RETURNING id`,
    [randomUUID(), req.params.id, d.item_name, d.category ?? 'other', d.is_packed ? 1 : 0, d.sort_order ?? 0, now, now]
  )
  res.json({ id: rows[0].id })
})

router.put('/packing/:itemId', async (req, res) => {
  const d = req.body || {}
  const db = getDb()
  const now = new Date().toISOString()
  await db.query(
    `UPDATE travel_packing_items SET item_name = ?, category = ?, is_packed = ?, sort_order = ?, updated_at = ?
     WHERE id = ?`,
    [d.item_name, d.category ?? 'other', d.is_packed ? 1 : 0, d.sort_order ?? 0, now, req.params.itemId]
  )
  res.json({ success: true })
})

router.delete('/packing/:itemId', async (req, res) => {
  const db = getDb()
  const now = new Date().toISOString()
  await db.query('UPDATE travel_packing_items SET deleted_at = ?, updated_at = ? WHERE id = ?', [now, now, req.params.itemId])
  res.json({ success: true })
})

// ── Documents ────────────────────────────────────────────────────────────

router.post('/:id/documents', async (req, res) => {
  const d = req.body || {}
  const db = getDb()
  const now = new Date().toISOString()
  const { rows } = await db.query(
    `INSERT INTO travel_documents (sync_id, trip_id, doc_type, title, details, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     RETURNING id`,
    [randomUUID(), req.params.id, d.doc_type ?? 'other', d.title, d.details ?? null, now, now]
  )
  res.json({ id: rows[0].id })
})

router.put('/documents/:docId', async (req, res) => {
  const d = req.body || {}
  const db = getDb()
  const now = new Date().toISOString()
  await db.query(
    `UPDATE travel_documents SET doc_type = ?, title = ?, details = ?, updated_at = ? WHERE id = ?`,
    [d.doc_type ?? 'other', d.title, d.details ?? null, now, req.params.docId]
  )
  res.json({ success: true })
})

router.delete('/documents/:docId', async (req, res) => {
  const db = getDb()
  const now = new Date().toISOString()
  await db.query('UPDATE travel_documents SET deleted_at = ?, updated_at = ? WHERE id = ?', [now, now, req.params.docId])
  res.json({ success: true })
})

// ── Companions ───────────────────────────────────────────────────────────
// Free-text names, not a FK to users — trips can include kids or extended
// family who aren't app users.

router.post('/:id/companions', async (req, res) => {
  const d = req.body || {}
  const db = getDb()
  const now = new Date().toISOString()
  const { rows } = await db.query(
    `INSERT INTO travel_companions (sync_id, trip_id, name, relation, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?)
     RETURNING id`,
    [randomUUID(), req.params.id, d.name, d.relation ?? null, now, now]
  )
  res.json({ id: rows[0].id })
})

router.put('/companions/:compId', async (req, res) => {
  const d = req.body || {}
  const db = getDb()
  const now = new Date().toISOString()
  await db.query(
    `UPDATE travel_companions SET name = ?, relation = ?, updated_at = ? WHERE id = ?`,
    [d.name, d.relation ?? null, now, req.params.compId]
  )
  res.json({ success: true })
})

router.delete('/companions/:compId', async (req, res) => {
  const db = getDb()
  const now = new Date().toISOString()
  await db.query('UPDATE travel_companions SET deleted_at = ?, updated_at = ? WHERE id = ?', [now, now, req.params.compId])
  res.json({ success: true })
})

module.exports = router
