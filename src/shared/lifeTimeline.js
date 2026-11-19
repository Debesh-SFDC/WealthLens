// Life Timeline — pure helpers shared by the Express router
// (src/server/routes/lifeTimeline.js) and the Electron IPC handlers
// (src/main/index.js), so validation and the derived parts of the timeline
// (range, retirement, goal placement) can't drift between web and desktop.
//
// CommonJS on purpose: the server is plain Node CJS. The Electron main bundle
// imports it too — electron.vite.config.js adds src/shared to the main build's
// commonjsOptions.include so Rollup converts it.

const CATEGORIES = ['career', 'family', 'home', 'vehicle', 'money', 'travel', 'health', 'other']
// Stored values. 'done' is labelled "Achieved" in the UI; the stored value
// stays 'done' so existing rows and Drive sync keep working.
const STATUSES = ['planned', 'done', 'dropped']
// Display states derived by achievementState() — never stored.
const STATES = ['achieved', 'dropped', 'overdue', 'in_progress', 'upcoming']
const PLAN_END_AGE = 80
// Used only when the profile has no date_of_birth, so the line still renders.
const FALLBACK_SPAN_YEARS = 50
// How far back the line may start to show past (overdue / achieved) items.
const MAX_LOOKBACK_YEARS = 50

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

const pad = (n) => String(n).padStart(2, '0')
const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`

// 'YYYY-MM-DD' (a longer ISO timestamp is cut to its date) → the same string
// if it is a real calendar date, else null.
function isoDateOrNull(v) {
  if (isBlank(v)) return null
  const str = String(v).slice(0, 10)
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(str)
  if (!m) return null
  const [y, mo, da] = [Number(m[1]), Number(m[2]), Number(m[3])]
  const d = new Date(y, mo - 1, da)
  return d.getFullYear() === y && d.getMonth() === mo - 1 && d.getDate() === da ? str : null
}

// Validates a create/update body and returns the exact column values to
// write. Throws ValidationError (status 400) on bad input.
// achieved_at: kept (default today) while status is 'done', cleared otherwise.
function cleanEvent(d = {}, today = new Date()) {
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

  let achieved_at = null
  if (status === 'done') {
    if (isBlank(d.achieved_at)) achieved_at = ymd(today)
    else {
      achieved_at = isoDateOrNull(d.achieved_at)
      if (!achieved_at) throw new ValidationError('achieved_at must be a date (YYYY-MM-DD)')
    }
  }

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
    achieved_at,
    goal_id: intOrNull(d.goal_id, 'goal_id', 1, Number.MAX_SAFE_INTEGER),
    depends_on_id: intOrNull(d.depends_on_id, 'depends_on_id', 1, Number.MAX_SAFE_INTEGER),
  }
}

// "Happens after" link check. `links` maps each of the user's live event ids
// to its depends_on_id. Rejects a missing target, a self-link and any cycle.
function checkDependsOn(eventId, dependsOnId, links) {
  if (dependsOnId == null) return
  const self = eventId == null ? null : Number(eventId)
  if (!links.has(dependsOnId)) throw new ValidationError('"Happens after" must be another of your events')
  if (dependsOnId === self) throw new ValidationError('An event cannot happen after itself')
  let cur = dependsOnId
  for (let i = 0; i <= links.size && cur != null; i++) {
    cur = links.get(cur) ?? null
    if (cur != null && cur === self) throw new ValidationError('That "Happens after" link would make a loop')
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

// ── Achievement state ───────────────────────────────────────────────────────
// One display state for an event, goal or the retirement node:
//   achieved    events: status 'done'; goals: is_achieved (the Goals page's
//               rule); retirement: its date has passed
//   dropped     status 'dropped'
//   overdue     neither, and its due date is before today. The due date is
//               the end of the most precise unit given: the day, else the last
//               day of the month, else 31 December of the year
//   in_progress a goal with current_amount > 0
//   upcoming    everything else
// percent: goals with a target only — current / target, 0..100 (whole number).
function achievementState(item, today = new Date()) {
  const kind = item.kind || 'event'
  const t = new Date(today.getFullYear(), today.getMonth(), today.getDate())
  const year = Number(item.year)
  const month = item.month == null || item.month === '' ? null : Number(item.month)
  const day = month == null || item.day == null || item.day === '' ? null : Number(item.day)
  // first moment after the due date
  const after = month == null ? new Date(year + 1, 0, 1)
    : day == null ? new Date(year, month, 1)
    : new Date(year, month - 1, day + 1)
  const past = after <= t

  let percent = null
  if (kind === 'goal') {
    const target = Number(item.target_amount)
    const current = Number(item.current_amount) || 0
    if (target > 0) percent = Math.max(0, Math.min(100, Math.round((current / target) * 100)))
  }

  let state
  if (kind === 'retirement') {
    // achieved on the day itself
    state = new Date(year, (month ?? 12) - 1, day ?? 1) <= t ? 'achieved' : 'upcoming'
  } else if (kind === 'goal' ? Number(item.is_achieved) === 1 || item.is_achieved === true : item.status === 'done') {
    state = 'achieved'
  } else if (item.status === 'dropped') {
    state = 'dropped'
  } else if (past) {
    state = 'overdue'
  } else if (kind === 'goal' && Number(item.current_amount) > 0) {
    state = 'in_progress'
  } else {
    state = 'upcoming'
  }
  return { state, percent }
}

// "7 of 42 achieved": events and goals; dropped ones and the derived
// retirement node don't count.
function summarize(events, goals) {
  const all = [...events, ...goals].filter(i => i.state !== 'dropped')
  return { achieved: all.filter(i => i.state === 'achieved').length, total: all.length }
}

// The goal fields the timeline needs. netWorth: the live figure (from
// src/shared/netWorth.mjs) used as current_amount when auto_source is
// 'net_worth' — the stored column is only a cache.
function goalSummary(g, netWorth) {
  const num = (v) => (v == null || v === '' ? null : Number(v))
  const auto = g.auto_source === 'net_worth' ? 'net_worth' : null
  const current = auto && netWorth != null ? Number(netWorth) : (num(g.current_amount) ?? 0)
  const target = num(g.target_amount)
  const achieved = Number(g.is_achieved) ? 1 : 0
  return {
    id: g.id,
    title: g.title,
    emoji: g.emoji || null,
    target_amount: target,
    current_amount: current,
    target_date: g.target_date || null,
    auto_source: auto,
    is_achieved: achieved,
    achieved_at: achieved ? isoDateOrNull(g.achieved_at) : null,
    // net worth reached the target but it isn't marked achieved yet
    // (achievement stays manual, so the UI offers it)
    reached: !!auto && !achieved && target > 0 && current >= target,
  }
}

// Children from the newest fire_planner_settings row: kid 2 only counts when
// kids_planned is 2 or more.
function kidYears(fire) {
  const yr = (v) => {
    const n = Number(v)
    return v != null && v !== '' && Number.isInteger(n) && n > 1900 ? n : null
  }
  const planned = Number(fire?.kids_planned) || 0
  const kid1 = yr(fire?.kid1_year)
  const kid2 = planned >= 2 ? yr(fire?.kid2_year) : null
  return [kid1, kid2].filter(v => v != null)
}

// Assembles the GET /api/life-timeline payload from raw rows.
// An event linked to a live goal (goal_id) and that goal are ONE item: the
// event keeps its title, month and is_major and carries the goal's live
// progress under `goal`; the goal is not listed again under `goals`.
function buildTimeline({ profile, fire, phases, events, goals, netWorth = null, today = new Date() }) {
  const dob = parseLocalDate(profile?.date_of_birth)
  const birthYear = dob ? dob.getFullYear() : null
  const thisYear = today.getFullYear()
  const end = Math.max(thisYear, birthYear != null ? birthYear + PLAN_END_AGE : thisYear + FALLBACK_SPAN_YEARS)
  const kids = kidYears(fire)
  const kid = Number(fire?.kid1_year)
  const childBirthYear = Number.isInteger(kid) && kid > 1900 ? kid : null

  const num = (v) => (v == null || v === '' ? null : Number(v))
  const liveIds = new Set((events || []).map(e => Number(e.id)))
  const goalById = new Map((goals || []).map(g => [Number(g.id), goalSummary(g, netWorth)]))
  const linkedGoalIds = new Set()

  const outEvents = (events || []).map(e => {
    const ev = {
      ...e,
      // a link to a deleted event is dropped rather than left dangling
      depends_on_id: e.depends_on_id != null && liveIds.has(Number(e.depends_on_id)) ? Number(e.depends_on_id) : null,
      year: Number(e.year),
      month: num(e.month),
      day: num(e.day),
      amount: num(e.amount),
      goal_id: num(e.goal_id),
      is_assumed: Number(e.is_assumed) ? 1 : 0,
      is_major: Number(e.is_major) ? 1 : 0,
      status: e.status || 'planned',
      achieved_at: e.status === 'done' ? isoDateOrNull(e.achieved_at) : null,
    }
    const goal = ev.goal_id != null ? goalById.get(ev.goal_id) : null
    if (!goal) return { ...ev, goal: null, ...achievementState({ ...ev, kind: 'event' }, today) }
    linkedGoalIds.add(goal.id)
    // Achieved when either side is (the Goals page or the timeline marked it);
    // otherwise the goal's progress drives in_progress / percent.
    const st = achievementState({
      ...ev, kind: 'goal', target_amount: goal.target_amount, current_amount: goal.current_amount,
      is_achieved: ev.status === 'done' || goal.is_achieved ? 1 : 0,
    }, today)
    return {
      ...ev,
      achieved_at: ev.achieved_at || goal.achieved_at,
      goal,
      ...st,
    }
  })
  const outGoals = (goals || []).map(g => {
    if (linkedGoalIds.has(Number(g.id))) return null
    const d = parseLocalDate(g.target_date)
    if (!d) return null
    const goal = {
      ...goalById.get(Number(g.id)),
      year: d.getFullYear(),
      month: d.getMonth() + 1,
      day: d.getDate(),
    }
    return { ...goal, ...achievementState({ ...goal, kind: 'goal' }, today) }
  }).filter(Boolean)
  const retirement = resolveRetirement(profile, today)

  // The line normally starts at this year; it reaches back to the earliest
  // event or goal (so overdue and achieved past items stay visible), but never
  // before the birth year or more than MAX_LOOKBACK_YEARS back.
  const floor = Math.max(thisYear - MAX_LOOKBACK_YEARS, birthYear ?? -Infinity)
  const earliest = Math.min(thisYear, ...outEvents.map(e => e.year), ...outGoals.map(g => g.year))
  const start = Math.max(floor, earliest)

  return {
    range: { start, end, today: thisYear },
    today: ymd(today),
    summary: summarize(outEvents, outGoals),
    birthYear,
    childBirthYear,
    // children's birth years in order (kid 2 only when kids_planned >= 2)
    kids,
    retirement: { ...retirement, ...achievementState({ ...retirement, kind: 'retirement' }, today) },
    phases: (phases || []).map(p => ({
      id: p.id, numeral: p.numeral, name: p.name, start_year: Number(p.start_year), sort_order: Number(p.sort_order) || 0,
    })),
    events: outEvents,
    goals: outGoals,
  }
}

// SQL shared by both backends (`?` placeholders; src/server/db.js converts
// them for Postgres). Goals are one global list in this app (no per-user
// scope — see goals:getAll), so only soft-deleted goals are left out. Undated
// goals are kept so an event can link to one; buildTimeline only places dated
// goals that no event links to.
const SQL = {
  profile: 'SELECT date_of_birth, retirement_age, retirement_date FROM profile ORDER BY id ASC LIMIT 1',
  fire: 'SELECT kids_planned, kid1_year, kid2_year FROM fire_planner_settings ORDER BY id DESC LIMIT 1',
  phases: 'SELECT * FROM life_phases WHERE user_id = ? AND deleted_at IS NULL ORDER BY sort_order ASC, start_year ASC, id ASC',
  events: 'SELECT * FROM life_events WHERE user_id = ? AND deleted_at IS NULL ORDER BY year ASC, COALESCE(month, 13) ASC, COALESCE(day, 32) ASC, id ASC',
  goals: 'SELECT id, title, emoji, target_amount, current_amount, target_date, is_achieved, achieved_at, auto_source FROM goals WHERE deleted_at IS NULL ORDER BY target_date ASC, id ASC',
}

module.exports = {
  CATEGORIES,
  STATUSES,
  STATES,
  PLAN_END_AGE,
  ValidationError,
  cleanEvent,
  checkDependsOn,
  cleanPhases,
  resolveRetirement,
  achievementState,
  summarize,
  isoDateOrNull,
  buildTimeline,
  SQL,
}
