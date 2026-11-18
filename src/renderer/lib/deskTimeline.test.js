// Run: node src/renderer/lib/deskTimeline.test.js   (plain node:assert, no deps)
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { pickDeskItems, countdownText, overdueText, whenText, chapterText } from './deskTimeline.js'

const require = createRequire(import.meta.url)
const shared = require('../../shared/lifeTimeline.js')
const today = new Date(2026, 10, 18) // 18 Nov 2026

// States come from the real shared function, as in production.
const data = shared.buildTimeline({
  profile: { date_of_birth: '1996-05-02', retirement_date: '2041-08-12' },
  phases: [{ id: 1, numeral: 'I', name: 'Foundation', start_year: 2026 }, { id: 2, numeral: 'II', name: 'Move and build', start_year: 2028 }],
  events: [
    { id: 1, title: 'Year-only next year', year: 2027, status: 'planned' },
    { id: 2, title: 'March next year', year: 2027, month: 3, status: 'planned' },
    { id: 3, title: 'Missed in September', year: 2026, month: 9, status: 'planned' },
    { id: 4, title: 'Missed long ago', year: 2024, status: 'planned' },
    { id: 5, title: 'Done already', year: 2026, month: 12, status: 'done', achieved_at: '2026-11-01' },
    { id: 6, title: 'Dropped', year: 2026, month: 12, status: 'dropped' },
    { id: 7, title: 'Missed on a day', year: 2026, month: 11, day: 10, status: 'planned' },
  ],
  goals: [
    { id: 9, title: 'Car fund', target_amount: 200000, current_amount: 50000, target_date: '2026-12-31', is_achieved: 0 },
  ],
  today,
})

const { next, overdue } = pickDeskItems(data)
// the in-progress goal (Dec 2026) is earlier than everything in 2027; done and dropped are skipped
assert.equal(next.title, 'Car fund')
assert.equal(next.state, 'in_progress')
assert.equal(next.percent, 25)
assert.deepEqual(overdue.map(i => i.title), ['Missed long ago', 'Missed in September', 'Missed on a day'])

// a year-only item orders as 1 January: it beats March of the same year
const later = pickDeskItems({ ...data, goals: [] })
assert.equal(later.next.title, 'Year-only next year')
// nothing upcoming
assert.equal(pickDeskItems({ ...data, events: [], goals: [], retirement: { ...data.retirement, state: 'achieved' } }).next, null)
assert.deepEqual(pickDeskItems(null), { next: null, overdue: [] })

// countdowns
assert.equal(countdownText({ year: 2027, month: 3 }, today), 'in 3 months, 11 days')
assert.equal(countdownText({ year: 2027, month: 3, day: 30 }, today), 'in 4 months, 12 days')
assert.equal(countdownText({ year: 2028, month: 2 }, today), 'in 1 year, 2 months')
assert.equal(countdownText({ year: 2026, month: 12, day: 18 }, today), 'in 1 month')
assert.equal(countdownText({ year: 2026, month: 11, day: 19 }, today), 'tomorrow')
assert.equal(countdownText({ year: 2026, month: 11, day: 18 }, today), 'today')
assert.equal(countdownText({ year: 2026, month: 11 }, today), 'this month')
assert.equal(countdownText({ year: 2026, month: 11, day: 25 }, today), 'in 7 days')
assert.equal(countdownText({ year: 2027 }, today), 'in about 1 year')
assert.equal(countdownText({ year: 2030 }, today), 'in about 4 years')
assert.equal(countdownText({ year: 2026 }, today), 'this year')
// month-end edge: 31 Jan → 1 Mar is 1 month, 1 day
assert.equal(countdownText({ year: 2027, month: 3, day: 1 }, new Date(2027, 0, 31)), 'in 1 month, 1 day')

// overdue wording, measured from the end of the due period
assert.equal(overdueText({ year: 2026, month: 9 }, today), '1 month overdue') // due 30 Sep
assert.equal(overdueText({ year: 2026, month: 8 }, today), '2 months overdue')
assert.equal(overdueText({ year: 2024 }, today), '1 year overdue') // due 31 Dec 2024
assert.equal(overdueText({ year: 2026, month: 11, day: 10 }, today), '8 days overdue')
assert.equal(overdueText({ year: 2026, month: 11, day: 17 }, today), '1 day overdue')

// labels
assert.equal(whenText({ kind: 'event', year: 2027, month: 3 }), 'Mar 2027')
assert.equal(whenText({ kind: 'event', year: 2027, month: 3, day: 9 }), '9 Mar 2027')
assert.equal(whenText({ kind: 'goal', year: 2026, month: 12, day: 31 }), 'Dec 2026')
assert.equal(whenText({ kind: 'event', year: 2028 }), '2028')
assert.equal(chapterText({ year: 2029 }, data.phases), 'Chapter II · Move and build')
assert.equal(chapterText({ year: 2020 }, data.phases), null)

console.log('deskTimeline tests passed')
