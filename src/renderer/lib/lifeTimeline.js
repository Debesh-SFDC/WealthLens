// Life Timeline view model — turns the GET /api/life-timeline payload into
// per-year items for the page. Pure functions, no React, so they can be tested
// with plain node (see lifeTimeline.test.js).

export const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const MONTHS_LONG = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August',
  'September', 'October', 'November', 'December']

export const CATEGORY_LABELS = {
  career: 'Career', family: 'Family', home: 'Home', vehicle: 'Vehicle',
  money: 'Money', travel: 'Travel', health: 'Health', other: 'Other',
}
// Stored status → label. 'done' reads "Achieved"; the stored value stays 'done'.
export const STATUS_LABELS = { planned: 'Planned', done: 'Achieved', dropped: 'Dropped' }
// Display states (computed by achievementState in src/shared/lifeTimeline.js
// and sent with every event, goal and the retirement node).
export const STATE_LABELS = { achieved: 'Achieved', in_progress: 'In progress', upcoming: 'Upcoming', overdue: 'Overdue', dropped: 'Dropped' }
export const FILTERS = [
  { id: 'all', label: 'All' },
  { id: 'achieved', label: 'Achieved' },
  { id: 'upcoming', label: 'Upcoming' },
  { id: 'overdue', label: 'Overdue' },
]

// "12 Mar 2027" from 'YYYY-MM-DD' (or a longer ISO string).
export function fmtDate(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || ''))
  if (!m) return null
  return `${Number(m[3])} ${MONTHS[Number(m[2]) - 1]} ${m[1]}`
}

// Today as 'YYYY-MM-DD' in local time (the default "Achieved on" date).
export function todayIso(d = new Date()) {
  const p = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

// Does an item pass the header filter? "Upcoming" includes goals in progress.
// The derived retirement node only shows under All.
export function matchesFilter(item, filter) {
  if (!filter || filter === 'all') return true
  if (item.kind === 'retirement') return item.state === filter
  if (filter === 'upcoming') return item.state === 'upcoming' || item.state === 'in_progress'
  return item.state === filter
}

// Only events and goals can be marked; dropped events are changed in the form.
export const canMark = (item) => (item.kind === 'event' || item.kind === 'goal') && item.state !== 'dropped'

// One state for a group of items drawn as one node (a year, a month, a
// decade): achieved when every live item is, overdue if any is, otherwise the
// lead item's state (so a goal in progress shows its ring).
export function groupState(items, lead) {
  const live = (items || []).filter(i => i.state !== 'dropped')
  if (!live.length) return { state: items?.length ? 'dropped' : null, percent: null }
  if (live.every(i => i.state === 'achieved')) return { state: 'achieved', percent: null }
  if (live.some(i => i.state === 'overdue')) return { state: 'overdue', percent: null }
  const l = lead || live[0]
  return { state: l.state === 'achieved' ? 'upcoming' : l.state, percent: l.state === 'in_progress' ? l.percent : null }
}

// ₹2.25L / ₹90K / ₹9.23 Cr — same scale as the Retirement Countdown.
export function fmtAmount(v) {
  if (v == null || v === '') return null
  const n = Number(v)
  if (!Number.isFinite(n)) return null
  const abs = Math.abs(n)
  const trim = (s) => s.replace(/\.0+$|(\.\d*[1-9])0+$/, '$1')
  if (abs >= 1e7) return `₹${trim((n / 1e7).toFixed(2))} Cr`
  if (abs >= 1e5) return `₹${trim((n / 1e5).toFixed(2))}L`
  if (abs >= 1e3) return `₹${trim((n / 1e3).toFixed(1))}K`
  return `₹${Math.round(n)}`
}

// "₹62.3L of ₹1 Cr" — a goal's live progress.
export function goalProgressText(goal) {
  if (!goal || !(Number(goal.target_amount) > 0)) return null
  return `${fmtAmount(goal.current_amount || 0)} of ${fmtAmount(goal.target_amount)}`
}

// "You've reached ₹1 Cr. Mark achieved?" — shown on a goal (or linked event)
// whose live amount has reached its target but isn't marked achieved yet.
export function reachedText(item) {
  const target = fmtAmount(item?.goal?.target_amount ?? item?.raw?.target_amount)
  return target ? `You've reached ${target}. Mark achieved?` : 'Target reached. Mark achieved?'
}

// One shape for everything drawn on the line: user events, goals with a
// target date, and the derived retirement node.
export function buildItems(data) {
  if (!data) return []
  const items = []
  for (const e of data.events || []) {
    const amount = fmtAmount(e.amount)
    // An event linked to a goal is one item: the event's title, month and
    // is_major, with the goal's live progress ("₹62L of ₹1 Cr").
    const goal = e.goal || null
    const progressText = goal ? goalProgressText(goal) : null
    const state = e.state || 'upcoming'
    items.push({
      key: `e${e.id}`, kind: 'event', id: e.id, year: e.year, month: e.month, day: e.day,
      title: e.title,
      amountText: progressText || amount || e.amount_note || null,
      noteText: progressText ? (goal.auto_source === 'net_worth' ? 'Tracks your net worth' : 'Linked goal') : amount ? e.amount_note : null,
      assumed: !!e.is_assumed, major: !!e.is_major, status: e.status || 'planned', raw: e,
      state, percent: goal ? (e.percent ?? null) : null, achievedAt: e.achieved_at || null,
      goal, reached: !!goal?.reached && state !== 'achieved',
    })
  }
  for (const g of data.goals || []) {
    const state = g.state || 'upcoming'
    items.push({
      key: `g${g.id}`, kind: 'goal', id: g.id, year: g.year, month: g.month, day: g.day,
      title: g.emoji ? `${g.emoji} ${g.title}` : g.title,
      amountText: g.auto_source === 'net_worth' ? goalProgressText(g) : fmtAmount(g.target_amount),
      noteText: `Goal · due ${g.day} ${MONTHS[g.month - 1]}`, assumed: false, major: false,
      status: g.is_achieved ? 'done' : 'planned', raw: g,
      state, percent: g.percent ?? null, achievedAt: g.achieved_at || null,
      goal: g, reached: !!g.reached && state !== 'achieved',
    })
  }
  const r = data.retirement
  if (r) {
    items.push({
      key: 'retirement', kind: 'retirement', year: r.year, month: r.month, day: r.day,
      title: `Retire on ${r.day} ${MONTHS_LONG[r.month - 1]}`,
      amountText: data.birthYear != null ? `Age ${r.age}` : null,
      noteText: 'From your retirement settings', assumed: false, major: true, status: 'planned', raw: r,
      state: r.state || 'upcoming', percent: null, achievedAt: r.state === 'achieved' ? r.date : null,
    })
  }
  const order = (i) => [i.month ?? 13, i.day ?? 32]
  return items.sort((a, b) => {
    const [am, ad] = order(a)
    const [bm, bd] = order(b)
    return a.year - b.year || am - bm || ad - bd
  })
}

export function groupByYear(items) {
  const map = new Map()
  for (const it of items) {
    if (!map.has(it.year)) map.set(it.year, [])
    map.get(it.year).push(it)
  }
  return map
}

// The card shown on the all-years line: a major item wins, else the first
// (earliest) one. Dropped items never lead; a year with only dropped items
// renders as an empty tick.
export function pickLead(items) {
  const live = (items || []).filter(i => i.status !== 'dropped')
  if (!live.length) return { lead: null, count: 0 }
  return { lead: live.find(i => i.major) || live[0], count: live.length }
}

// Items for a multi-line card or preview: live (not dropped) items ordered by
// month (no-month items last), major items first within a month, then day.
export function sortForCard(items) {
  return (items || [])
    .filter(i => i.status !== 'dropped' && i.state !== 'dropped')
    .map((it, i) => ({ it, i }))
    .sort((a, b) => (a.it.month ?? 13) - (b.it.month ?? 13)
      || Number(!!b.it.major) - Number(!!a.it.major)
      || (a.it.day ?? 32) - (b.it.day ?? 32)
      || a.i - b.i)
    .map(x => x.it)
}

// Status marker for one card line: achieved check, overdue amber, in-progress
// ring, assumed dashed, upcoming outline.
export function markerFor(item) {
  if (item.state === 'achieved') return 'achieved'
  if (item.state === 'overdue') return 'overdue'
  if (item.state === 'in_progress') return 'progress'
  if (item.assumed) return 'assumed'
  return 'upcoming'
}

export function ageIn(year, birthYear) {
  return birthYear == null ? null : year - birthYear
}

// Child's age in a year; null when kid1_year isn't set or the child isn't born yet.
export function childAgeIn(year, childBirthYear) {
  if (childBirthYear == null) return null
  const k = year - childBirthYear
  return k >= 0 ? k : null
}

// Ages of the children born by `year` (kids: birth years from the payload).
export function kidsAgesIn(year, kids) {
  return (kids || []).map(k => year - k).filter(a => a >= 0)
}

// "child 3" with one child, "kids 3, 0" once the second is born.
export function kidsText(ages) {
  if (!ages?.length) return null
  return ages.length === 1 ? `child ${ages[0]}` : `kids ${ages.join(', ')}`
}

// Payload → children's birth years (older payloads only had childBirthYear).
export const kidsOf = (data) => data?.kids ?? (data?.childBirthYear != null ? [data.childBirthYear] : [])

export function phaseFor(year, phases) {
  let found = null
  for (const p of phases || []) if (p.start_year <= year && (!found || p.start_year >= found.start_year)) found = p
  return found
}

// Phase label to draw at a node: phases starting that year, plus — at the
// first node — the phase already running when the range begins.
export function phaseLabelAt(year, phases, rangeStart) {
  const starting = (phases || []).find(p => p.start_year === year)
  if (starting) return starting
  if (year === rangeStart) return phaseFor(year, phases)
  return null
}
