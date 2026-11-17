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
export const STATUS_LABELS = { planned: 'Planned', done: 'Done', dropped: 'Dropped' }

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

// One shape for everything drawn on the line: user events, goals with a
// target date, and the derived retirement node.
export function buildItems(data) {
  if (!data) return []
  const items = []
  for (const e of data.events || []) {
    const amount = fmtAmount(e.amount)
    items.push({
      key: `e${e.id}`, kind: 'event', id: e.id, year: e.year, month: e.month, day: e.day,
      title: e.title, amountText: amount || e.amount_note || null, noteText: amount ? e.amount_note : null,
      assumed: !!e.is_assumed, major: !!e.is_major, status: e.status || 'planned', raw: e,
    })
  }
  for (const g of data.goals || []) {
    items.push({
      key: `g${g.id}`, kind: 'goal', id: g.id, year: g.year, month: g.month, day: g.day,
      title: g.emoji ? `${g.emoji} ${g.title}` : g.title, amountText: fmtAmount(g.target_amount),
      noteText: `Goal · due ${g.day} ${MONTHS[g.month - 1]}`, assumed: false, major: false,
      status: g.is_achieved ? 'done' : 'planned', raw: g,
    })
  }
  const r = data.retirement
  if (r) {
    items.push({
      key: 'retirement', kind: 'retirement', year: r.year, month: r.month, day: r.day,
      title: `Retire on ${r.day} ${MONTHS_LONG[r.month - 1]}`,
      amountText: data.birthYear != null ? `Age ${r.age}` : null,
      noteText: 'From your retirement settings', assumed: false, major: true, status: 'planned', raw: r,
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

export function ageIn(year, birthYear) {
  return birthYear == null ? null : year - birthYear
}

// Child's age in a year; null when kid1_year isn't set or the child isn't born yet.
export function childAgeIn(year, childBirthYear) {
  if (childBirthYear == null) return null
  const k = year - childBirthYear
  return k >= 0 ? k : null
}

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
