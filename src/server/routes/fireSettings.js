const express = require('express')
const { getDb } = require('../db')

const router = express.Router()

// FIRE planner settings — single row, mirrors the Electron fire:getSettings /
// fire:saveSettings IPC handlers in src/main/index.js. JSON list columns are
// stored as TEXT on both SQLite and Postgres and parsed here.
const JSON_COLS = ['loans_json', 'future_expenses_json', 'lump_sums_json', 'additional_instruments_json', 'instrument_overrides_json']

function parseList(raw) {
  if (raw == null || raw === '') return []
  if (Array.isArray(raw) || typeof raw === 'object') return raw
  try {
    const v = JSON.parse(raw)
    return v ?? []
  } catch {
    return []
  }
}

function numOr(v, fallback) {
  if (v === null || v === undefined || v === '') return fallback
  const n = Number(v)
  return Number.isFinite(n) ? n : fallback
}

router.get('/', async (req, res) => {
  try {
    const db = getDb()
    const { rows } = await db.query('SELECT * FROM fire_planner_settings ORDER BY id DESC LIMIT 1')
    const row = rows[0]
    if (!row) return res.json(null)
    const out = { ...row }
    for (const c of JSON_COLS) out[c] = parseList(row[c])
    // instrument_overrides_json is a map, not a list
    if (Array.isArray(out.instrument_overrides_json)) out.instrument_overrides_json = {}
    res.json(out)
  } catch (e) {
    console.error('GET /fire-settings failed', e)
    res.status(500).send(`Could not load FIRE settings: ${e.message}`)
  }
})

async function save(req, res) {
  try {
    const d = req.body || {}
    const db = getDb()
    const now = new Date().toISOString()
    const params = [
      d.fire_type || 'regular',
      numOr(d.fi_multiple, null),
      numOr(d.sip_step_up_pct, 10),
      numOr(d.expense_no_kids, 0),
      numOr(d.expense_one_kid, 0),
      numOr(d.expense_two_kids, 0),
      numOr(d.kids_planned, 0),
      numOr(d.kid1_year, null),
      numOr(d.kid2_year, null),
      numOr(d.inflation_pct, 6),
      numOr(d.barista_income, null),
      JSON.stringify(d.loans_json ?? []),
      JSON.stringify(d.future_expenses_json ?? []),
      JSON.stringify(d.lump_sums_json ?? []),
      JSON.stringify(d.additional_instruments_json ?? []),
      JSON.stringify(d.instrument_overrides_json ?? {}),
      now,
    ]
    const { rows: existingRows } = await db.query('SELECT id FROM fire_planner_settings ORDER BY id DESC LIMIT 1')
    const existing = existingRows[0]
    if (existing) {
      await db.query(
        `UPDATE fire_planner_settings SET
           fire_type = ?, fi_multiple = ?, sip_step_up_pct = ?,
           expense_no_kids = ?, expense_one_kid = ?, expense_two_kids = ?,
           kids_planned = ?, kid1_year = ?, kid2_year = ?,
           inflation_pct = ?, barista_income = ?,
           loans_json = ?, future_expenses_json = ?, lump_sums_json = ?,
           additional_instruments_json = ?, instrument_overrides_json = ?,
           updated_at = ?
         WHERE id = ?`,
        [...params, existing.id]
      )
      return res.json({ id: existing.id })
    }
    const { rows } = await db.query(
      `INSERT INTO fire_planner_settings (
         fire_type, fi_multiple, sip_step_up_pct,
         expense_no_kids, expense_one_kid, expense_two_kids,
         kids_planned, kid1_year, kid2_year,
         inflation_pct, barista_income,
         loans_json, future_expenses_json, lump_sums_json,
         additional_instruments_json, instrument_overrides_json, updated_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id`,
      params
    )
    res.json({ id: rows[0].id })
  } catch (e) {
    console.error('save /fire-settings failed', e)
    res.status(500).send(`Could not save FIRE settings: ${e.message}`)
  }
}

// bridge uses PUT; POST accepted too.
router.put('/', save)
router.post('/', save)

module.exports = router
