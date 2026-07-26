const express = require('express')
const { randomUUID } = require('crypto')
const { getDb } = require('../db')

const router = express.Router()

// Credits elapsed SIP periods to invested_amount/current_value — same logic as
// autoApplySIPs in src/main/index.js, ported to async db.query.
async function autoApplySIPs(db) {
  const { rows: sips } = await db.query(`
    SELECT id, monthly_sip_amount, sip_frequency, sip_last_applied_at, start_date
    FROM investments
    WHERE type = 'mf_sip' AND monthly_sip_amount > 0 AND sip_last_applied_at IS NOT NULL
  `)

  const now = new Date()

  for (const inv of sips) {
    const last = new Date(inv.sip_last_applied_at)
    if (isNaN(last.getTime())) continue

    let periods = 0
    if (inv.sip_frequency === 'weekly') {
      periods = Math.floor((now - last) / (7 * 24 * 60 * 60 * 1000))
    } else {
      const sipDay = inv.start_date ? new Date(inv.start_date).getDate() : 1
      let cursor = new Date(last)
      for (;;) {
        const nextYear = cursor.getMonth() === 11 ? cursor.getFullYear() + 1 : cursor.getFullYear()
        const nextMonth = cursor.getMonth() === 11 ? 0 : cursor.getMonth() + 1
        const maxDay = new Date(nextYear, nextMonth + 1, 0).getDate()
        const sipDate = new Date(nextYear, nextMonth, Math.min(sipDay, maxDay))
        if (sipDate <= now) { periods++; cursor = sipDate } else break
      }
    }

    if (periods > 0) {
      const addition = periods * inv.monthly_sip_amount
      const nowIso = new Date().toISOString()
      await db.query(
        `UPDATE investments SET invested_amount = invested_amount + ?, current_value = current_value + ?,
           sip_last_applied_at = ?, last_updated_at = ? WHERE id = ?`,
        [addition, addition, nowIso, nowIso, inv.id]
      )
    }
  }
}

// GET /api/investments?goalId= — mirrors investments:getAll
router.get('/', async (req, res) => {
  const db = getDb()
  await autoApplySIPs(db)
  const { goalId } = req.query
  let rows
  if (goalId) {
    ({ rows } = await db.query(
      'SELECT * FROM investments WHERE goal_id = ? AND deleted_at IS NULL ORDER BY last_updated_at DESC',
      [goalId]
    ))
  } else {
    ({ rows } = await db.query(`
      SELECT i.*, g.title as goal_title
      FROM investments i
      LEFT JOIN goals g ON i.goal_id = g.id
      WHERE i.deleted_at IS NULL
      ORDER BY i.last_updated_at DESC
    `))
  }
  res.json(rows.map(r => ({ ...r, sip_frequency: r.sip_frequency ?? 'monthly' })))
})

// POST /api/investments — mirrors investments:create
router.post('/', async (req, res) => {
  const d = req.body || {}
  const db = getDb()
  const now = new Date().toISOString()
  const { rows } = await db.query(
    `INSERT INTO investments (sync_id, name, type, provider, bank_or_amc, account_number,
       invested_amount, current_value, monthly_sip_amount, sip_frequency,
       start_date, maturity_date, goal_id, notes, units, purchase_price,
       scheme_code, interest_rate, ticker_symbol, exchange, purity, sip_last_applied_at,
       created_at, last_updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     RETURNING id`,
    [
      randomUUID(), d.name, d.type, d.provider ?? null, d.bank_or_amc ?? null,
      d.account_number ?? null, d.invested_amount ?? 0, d.current_value ?? 0,
      d.monthly_sip_amount ?? 0, d.sip_frequency ?? 'monthly',
      d.start_date ?? null, d.maturity_date ?? null, d.goal_id ?? null, d.notes ?? null,
      d.units ?? 0, d.purchase_price ?? 0, d.scheme_code ?? null,
      d.interest_rate ?? 0, d.ticker_symbol ?? null, d.exchange ?? 'NSE', d.purity ?? '24K',
      now, now, now,
    ]
  )
  const investmentId = rows[0].id
  if (d.goal_id) {
    await db.query(
      'INSERT INTO goal_investments (sync_id, goal_id, investment_id, updated_at) VALUES (?, ?, ?, ?)',
      [randomUUID(), d.goal_id, investmentId, now]
    )
  }
  res.json({ id: investmentId })
})

// PUT /api/investments/:id — mirrors investments:update
router.put('/:id', async (req, res) => {
  const d = req.body || {}
  const db = getDb()
  const id = req.params.id
  const { rows: beforeRows } = await db.query('SELECT goal_id FROM investments WHERE id = ?', [id])
  const oldGoalId = beforeRows[0]?.goal_id ?? null
  const newGoalId = d.goal_id ?? null
  const now = new Date().toISOString()

  await db.query(
    `UPDATE investments SET name = ?, type = ?, provider = ?, bank_or_amc = ?,
       account_number = ?, invested_amount = ?, current_value = ?, monthly_sip_amount = ?,
       sip_frequency = ?, start_date = ?, maturity_date = ?, goal_id = ?, notes = ?,
       units = ?, purchase_price = ?, scheme_code = ?, interest_rate = ?,
       ticker_symbol = ?, exchange = ?, purity = ?, last_updated_at = ?
     WHERE id = ?`,
    [
      d.name, d.type, d.provider ?? null, d.bank_or_amc ?? null,
      d.account_number ?? null, d.invested_amount, d.current_value,
      d.monthly_sip_amount ?? 0, d.sip_frequency ?? 'monthly',
      d.start_date ?? null, d.maturity_date ?? null, newGoalId, d.notes ?? null,
      d.units ?? 0, d.purchase_price ?? 0, d.scheme_code ?? null,
      d.interest_rate ?? 0, d.ticker_symbol ?? null, d.exchange ?? 'NSE', d.purity ?? '24K',
      now, id,
    ]
  )

  if (oldGoalId !== newGoalId) {
    if (oldGoalId) await db.query('DELETE FROM goal_investments WHERE goal_id = ? AND investment_id = ?', [oldGoalId, id])
    if (newGoalId) {
      await db.query(
        'INSERT INTO goal_investments (sync_id, goal_id, investment_id, updated_at) VALUES (?, ?, ?, ?)',
        [randomUUID(), newGoalId, id, now]
      )
    }
  }

  res.json({ success: true })
})

// DELETE /api/investments/:id — mirrors investments:delete (soft delete)
router.delete('/:id', async (req, res) => {
  const db = getDb()
  const id = req.params.id
  const now = new Date().toISOString()
  await db.query('UPDATE investments SET deleted_at = ?, last_updated_at = ? WHERE id = ?', [now, now, id])
  await db.query('DELETE FROM goal_investments WHERE investment_id = ?', [id])
  res.json({ success: true })
})

module.exports = router
