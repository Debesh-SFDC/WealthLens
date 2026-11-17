// Life Timeline — pure helpers shared by the Express router
// (src/server/routes/lifeTimeline.js) and the Electron IPC handlers
// (src/main/index.js), so validation and the derived parts of the timeline
// (range, retirement, goal placement) can't drift between web and desktop.
//
// CommonJS on purpose: the server is plain Node CJS. The Electron main bundle
// imports it too — electron.vite.config.js adds src/shared to the main build's
// commonjsOptions.include so Rollup converts it.

const CATEGORIES = ['career', 'family', 'home', 'vehicle', 'money', 'travel', 'health', 'other']
const STATUSES = ['planned', 'done', 'dropped']
const PLAN_END_AGE = 80
// Used only when the profile has no date_of_birth, so the line still renders.
const FALLBACK_SPAN_YEARS = 50

class ValidationError extends Error {
  constructor(message) {
    super(message)
    this.name = 'ValidationError'
    this.status = 400
  }
}

const isBlank = (v) => v === undefined || v === null || v === ''

function intOrNull(v, field, min, max) {
  if (isBlank(v)) return null
  const n = Number(v)
  if (!Number.isInteger(n) || n < min || n > max) {
    throw new ValidationError(`${field} must be a whole number from ${min} to ${max}`)
  }
  return n
}

const flag = (v) => (v === true || v === 1 || v === '1' || v === 'true' ? 1 : 0)

// Validates a create/update body and returns the exact column values to
// write. Throws ValidationError (status 400) on bad input.
function cleanEvent(d = {}) {
  const title = String(d.title ?? '').trim()
  if (!title) throw new ValidationError('title is required')
  if (title.length > 200) throw new ValidationError('title must be 200 characters or fewer')

  const year = intOrNull(d.year, 'year', 1900, 2200)
  if (year == null) throw new ValidationError('year is required')
  const month = intOrNull(d.month, 'month', 1, 12)
  let day = intOrNull(d.day, 'day', 1, 31)
  if (month == null) day = null
  if (day != null && day > new Date(year, month, 0).getDate()) {
    throw new ValidationError('day is not valid for that month')
  }

  let amount = null
  if (!isBlank(d.amount)) {
    amount = Number(d.amount)
    if (!Number.isFinite(amount)) throw new ValidationError('amount must be a number')
  }

  const category = isBlank(d.category) ? 'other' : String(d.category)
  if (!CATEGORIES.includes(category)) throw new ValidationError(`category must be one of ${CATEGORIES.join(', ')}`)
  const status = isBlank(d.status) ? 'planned' : String(d.status)
  if (!STATUSES.includes(status)) throw new ValidationError(`status must be one of ${STATUSES.join(', ')}`)

  const text = (v, max) => {
    const s = isBlank(v) ? '' : String(v).trim()
    return s ? s.slice(0, max) : null
  }

  return {
    title,
    notes: text(d.notes, 4000),
    year,
    month,
    day,
    amount,
    amount_note: text(d.amount_note, 200),
    category,
    is_assumed: flag(d.is_assumed),
    is_major: flag(d.is_major),
    status,
    goal_id: intOrNull(d.goal_id, 'goal_id', 1, Number.MAX_SAFE_INTEGER),
  }
}

// Validates the full phase list for PUT /phases. Returns rows in display order.
function cleanPhases(list) {
  if (!Array.isArray(list)) throw new ValidationError('phases must be an array')
  if (list.length > 30) throw new ValidationError('at most 30 phases')
  const seenIds = new Set()
  return list.map((p = {}, i) => {
    const name = String(p.name ?? '').trim()
    if (!name) throw new ValidationError(`phase ${i + 1}: name is required`)
    const start_year = intOrNull(p.start_year, `phase ${i + 1}: start_year`, 1900, 2200)
    if (start_year == null) throw new ValidationError(`phase ${i + 1}: start_year is required`)
    const id = intOrNull(p.id, `phase ${i + 1}: id`, 1, Number.MAX_SAFE_INTEGER)
    if (id != null) {
      if (seenIds.has(id)) throw new ValidationError('duplicate phase id')
      seenIds.add(id)
    }
    return {
      id,
      numeral: String(p.numeral ?? '').trim().slice(0, 12) || null,
      name: name.slice(0, 80),
      start_year,
      sort_order: i,
    }
  }).sort((a, b) => a.start_year - b.start_year || a.sort_order - b.sort_order)
    .map((p, i) => ({ ...p, sort_order: i }))
}

const pad = (n) => String(n).padStart(2, '0')
const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`

function parseLocalDate(str) {
  if (!str || typeof str !== 'string') return null
  const d = new Date(`${str.slice(0, 10)}T00:00:00`)
  return Number.isNaN(d.getTime()) ? null : d
}

function addYears(date, n) {
  const d = new Date(date)
  d.setFullYear(d.getFullYear() + n)
  return d
}

function ageOnDate(dob, target) {
  let age = target.getFullYear() - dob.getFullYear()
  if (target.getMonth() < dob.getMonth()
    || (target.getMonth() === dob.getMonth() && target.getDate() < dob.getDate())) age -= 1
  return age
}

// Same priority as the Retirement Countdown widget
// (src/renderer/components/RetirementCountdown.jsx): an explicit
// profile.retirement_date wins, then date_of_birth + retirement_age, then
// retirement_age years from today. Never stored, so it can't drift.
function resolveRetirement(profile, today = new Date()) {
  const dob = parseLocalDate(profile?.date_of_birth)
  const explicit = parseLocalDate(profile?.retirement_date)
  const retirementAge = Number(profile?.retirement_age) || 60
  let date
  let source
  if (explicit) { date = explicit; source = 'retirement_date' }
  else if (dob) { date = addYears(dob, retirementAge); source = 'date_of_birth' }
  else { date = addYears(today, retirementAge); source = 'today' }
  return {
    date: ymd(date),
    year: date.getFullYear(),
    month: date.getMonth() + 1,
    day: date.getDate(),
    age: dob ? ageOnDate(dob, date) : retirementAge,
    source,
  }
}

// Assembles the GET /api/life-timeline payload from raw rows.
function buildTimeline({ profile, fire, phases, events, goals, today = new Date() }) {
  const dob = parseLocalDate(profile?.date_of_birth)
  const birthYear = dob ? dob.getFullYear() : null
  const start = today.getFullYear()
  const end = Math.max(start, birthYear != null ? birthYear + PLAN_END_AGE : start + FALLBACK_SPAN_YEARS)
  const kid = Number(fire?.kid1_year)
  const childBirthYear = Number.isInteger(kid) && kid > 1900 ? kid : null

  const num = (v) => (v == null || v === '' ? null : Number(v))
  return {
    range: { start, end },
    birthYear,
    childBirthYear,
    retirement: resolveRetirement(profile, today),
    phases: (phases || []).map(p => ({
      id: p.id, numeral: p.numeral, name: p.name, start_year: Number(p.start_year), sort_order: Number(p.sort_order) || 0,
    })),
    events: (events || []).map(e => ({
      ...e,
      year: Number(e.year),
      month: num(e.month),
      day: num(e.day),
      amount: num(e.amount),
      goal_id: num(e.goal_id),
      is_assumed: Number(e.is_assumed) ? 1 : 0,
      is_major: Number(e.is_major) ? 1 : 0,
    })),
    goals: (goals || []).map(g => {
      const d = parseLocalDate(g.target_date)
      return d && {
        id: g.id,
        title: g.title,
        emoji: g.emoji || null,
        target_amount: num(g.target_amount),
        target_date: g.target_date,
        is_achieved: Number(g.is_achieved) ? 1 : 0,
        year: d.getFullYear(),
        month: d.getMonth() + 1,
        day: d.getDate(),
      }
    }).filter(Boolean),
  }
}

// SQL shared by both backends (`?` placeholders; src/server/db.js converts
// them for Postgres). Goals are one global list in this app (no per-user
// scope — see goals:getAll), so only soft-deleted and undated goals are left out.
const SQL = {
  profile: 'SELECT date_of_birth, retirement_age, retirement_date FROM profile ORDER BY id ASC LIMIT 1',
  fire: 'SELECT kid1_year FROM fire_planner_settings ORDER BY id DESC LIMIT 1',
  phases: 'SELECT * FROM life_phases WHERE user_id = ? AND deleted_at IS NULL ORDER BY sort_order ASC, start_year ASC, id ASC',
  events: 'SELECT * FROM life_events WHERE user_id = ? AND deleted_at IS NULL ORDER BY year ASC, COALESCE(month, 13) ASC, COALESCE(day, 32) ASC, id ASC',
  goals: "SELECT id, title, emoji, target_amount, target_date, is_achieved FROM goals WHERE deleted_at IS NULL AND target_date IS NOT NULL AND target_date <> '' ORDER BY target_date ASC, id ASC",
}

module.exports = {
  CATEGORIES,
  STATUSES,
  PLAN_END_AGE,
  ValidationError,
  cleanEvent,
  cleanPhases,
  resolveRetirement,
  buildTimeline,
  SQL,
}
