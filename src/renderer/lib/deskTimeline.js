// The Life Timeline card (Desk Mode and the Dashboard): which items are next, which are overdue, and
// the countdown / overdue wording. Pure (no React, no fetch); the states
// themselves come from the server (achievementState in
// src/shared/lifeTimeline.js) via buildItems, so nothing here re-derives them.
// Tested in deskTimeline.test.js.
import { buildItems, phaseFor, MONTHS } from './lifeTimeline.js'

const startOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate())

// Sort key: a missing month counts as January, a missing day as the 1st.
const orderKey = (it) => [it.year, it.month ?? 1, it.month ? (it.day ?? 1) : 1]
const byDate = (a, b) => {
  const [ay, am, ad] = orderKey(a)
  const [by, bm, bd] = orderKey(b)
  return ay - by || am - bm || ad - bd
}

export const NEXT_COUNT = 3

// { upcoming, next, overdue } from the GET /api/life-timeline payload.
// upcoming: the NEXT_COUNT earliest upcoming / in-progress items (events,
// dated goals and the retirement node), ordered by date. Those states mean
// "not yet due", so an item with them is never past its due date; a year-only
// item this year (sorted as 1 January) still counts until 31 December. Built
// from buildItems, so an event linked to a goal is one item carrying the
// goal's live progress.
// next: upcoming[0] or null. overdue: every overdue item, oldest first.
export function pickDeskItems(data, count = NEXT_COUNT) {
  if (!data) return { upcoming: [], next: null, overdue: [] }
  const items = buildItems(data)
  const upcoming = items.filter(i => i.state === 'upcoming' || i.state === 'in_progress').sort(byDate).slice(0, count)
  const overdue = items.filter(i => i.state === 'overdue').sort(byDate)
  return { upcoming, next: upcoming[0] || null, overdue }
}

// "Mar 2027", "12 Mar 2027" or "2028".
export function whenText(it) {
  if (!it.month) return String(it.year)
  return `${it.day && it.kind !== 'goal' ? `${it.day} ` : ''}${MONTHS[it.month - 1]} ${it.year}`
}

// Whole calendar years / months / days from a to b (a <= b, both midnight).
// Steps whole months with the day clamped to the month's length (31 Jan + 1
// month = 28 Feb), then counts the remaining days.
const daysIn = (y, m) => new Date(y, m + 1, 0).getDate()
const addMonths = (a, n) => {
  const y = a.getFullYear()
  const m = a.getMonth() + n
  const ty = y + Math.floor(m / 12)
  const tm = ((m % 12) + 12) % 12
  return new Date(ty, tm, Math.min(a.getDate(), daysIn(ty, tm)))
}
function diffYMD(a, b) {
  let months = (b.getFullYear() - a.getFullYear()) * 12 + b.getMonth() - a.getMonth()
  if (addMonths(a, months) > b) months -= 1
  const d = Math.round((b - addMonths(a, months)) / 86400000) // round: DST days are 23/25h
  return { y: Math.floor(months / 12), m: months % 12, d }
}

const unit = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`
// The two largest non-zero units: "1 year, 3 months", "4 months, 12 days", "5 days".
function twoUnits({ y, m, d }) {
  const parts = [y && unit(y, 'year'), m && unit(m, 'month'), d && unit(d, 'day')].filter(Boolean)
  return parts.slice(0, 2).join(', ')
}

// Countdown to an upcoming item, from today (a Date).
//   year only        → "in about 2 years" / "in about 1 year" / "this year"
//   month (no day)   → counts to the 1st of that month; "this month" once inside it
//   full date        → "in 4 months, 12 days" / "tomorrow" / "today"
export function countdownText(it, today = new Date()) {
  const t = startOfDay(today)
  if (!it.month) {
    const n = it.year - t.getFullYear()
    return n <= 0 ? 'this year' : `in about ${unit(n, 'year')}`
  }
  const target = new Date(it.year, it.month - 1, it.day ?? 1)
  if (target <= t) {
    if (!it.day) return 'this month'
    return 'today'
  }
  const diff = diffYMD(t, target)
  if (!diff.y && !diff.m && diff.d === 1) return 'tomorrow'
  return `in ${twoUnits(diff)}`
}

// How long an overdue item is past due, in its largest unit: "3 days overdue",
// "2 months overdue", "1 year overdue". Due = the end of the most precise unit
// given (the day, the month's last day, or 31 December), as in achievementState.
export function overdueText(it, today = new Date()) {
  const t = startOfDay(today)
  const due = !it.month ? new Date(it.year, 11, 31)
    : !it.day ? new Date(it.year, it.month, 0)
    : new Date(it.year, it.month - 1, it.day)
  if (due >= t) return 'due today'
  const { y, m, d } = diffYMD(due, t)
  const text = y ? unit(y, 'year') : m ? unit(m, 'month') : unit(d, 'day')
  return `${text} overdue`
}

// "Chapter II · Move and build" for the item's year, or null.
export function chapterText(it, phases) {
  const p = phaseFor(it.year, phases)
  if (!p) return null
  return `Chapter ${p.numeral ? `${p.numeral} · ` : ''}${p.name}`
}
