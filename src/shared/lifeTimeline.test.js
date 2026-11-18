// Run: node --test src/shared/lifeTimeline.test.js   (node:test, no deps)
const test = require('node:test')
const assert = require('node:assert/strict')
const { achievementState, summarize, buildTimeline, cleanEvent, isoDateOrNull } = require('./lifeTimeline.js')

const TODAY = new Date(2026, 10, 18) // 18 Nov 2026, local time
const st = (item, today = TODAY) => achievementState(item, today).state

test('events: achieved and dropped come from status, whatever the date', () => {
  assert.equal(st({ kind: 'event', status: 'done', year: 2030 }), 'achieved')
  assert.equal(st({ kind: 'event', status: 'done', year: 2020 }), 'achieved')
  assert.equal(st({ kind: 'event', status: 'dropped', year: 2020 }), 'dropped')
  assert.equal(st({ kind: 'event', status: 'dropped', year: 2030 }), 'dropped')
})

test('events with no month are overdue only after 31 December of their year', () => {
  assert.equal(st({ status: 'planned', year: 2026 }), 'upcoming')
  assert.equal(st({ status: 'planned', year: 2026 }, new Date(2026, 11, 31)), 'upcoming')
  assert.equal(st({ status: 'planned', year: 2026 }, new Date(2027, 0, 1)), 'overdue')
  assert.equal(st({ status: 'planned', year: 2025 }), 'overdue')
})

test('events with a month are overdue once that month has ended', () => {
  assert.equal(st({ status: 'planned', year: 2026, month: 10 }), 'overdue') // October, now November
  assert.equal(st({ status: 'planned', year: 2026, month: 11 }), 'upcoming') // this month
  assert.equal(st({ status: 'planned', year: 2026, month: 11 }, new Date(2026, 10, 30)), 'upcoming')
  assert.equal(st({ status: 'planned', year: 2026, month: 11 }, new Date(2026, 11, 1)), 'overdue')
  assert.equal(st({ status: 'planned', year: 2026, month: 12 }), 'upcoming')
})

test('events with a day are overdue the day after', () => {
  assert.equal(st({ status: 'planned', year: 2026, month: 11, day: 18 }), 'upcoming') // today
  assert.equal(st({ status: 'planned', year: 2026, month: 11, day: 17 }), 'overdue')
  // the time of day doesn't matter
  assert.equal(st({ status: 'planned', year: 2026, month: 11, day: 18 }, new Date(2026, 10, 18, 23, 59)), 'upcoming')
  // a day without a month is ignored
  assert.equal(st({ status: 'planned', year: 2026, month: null, day: 3 }), 'upcoming')
})

test('goals: is_achieved is the rule; in progress carries a capped percent', () => {
  const g = (o) => achievementState({ kind: 'goal', year: 2028, month: 3, day: 31, target_amount: 200000, ...o }, TODAY)
  assert.deepEqual(g({ is_achieved: 1, current_amount: 0 }), { state: 'achieved', percent: 0 })
  assert.deepEqual(g({ is_achieved: 0, current_amount: 0 }), { state: 'upcoming', percent: 0 })
  assert.deepEqual(g({ is_achieved: 0, current_amount: 50000 }), { state: 'in_progress', percent: 25 })
  assert.deepEqual(g({ is_achieved: 0, current_amount: 500000 }), { state: 'in_progress', percent: 100 })
  // a fully funded goal isn't achieved until it is marked, matching the Goals page
  assert.equal(g({ is_achieved: 0, current_amount: 200000 }).state, 'in_progress')
  assert.equal(g({ is_achieved: 0, current_amount: 50000, target_amount: 0 }).percent, null)
  // overdue beats in progress, but the percent is still there for the bar
  assert.deepEqual(g({ year: 2026, month: 3, day: 31, current_amount: 50000 }), { state: 'overdue', percent: 25 })
})

test('retirement is achieved from its date on, and never overdue', () => {
  assert.equal(st({ kind: 'retirement', year: 2041, month: 8, day: 12 }), 'upcoming')
  assert.equal(st({ kind: 'retirement', year: 2026, month: 11, day: 18 }), 'achieved')
  assert.equal(st({ kind: 'retirement', year: 2020, month: 1, day: 1 }), 'achieved')
})

test('summarize counts events and goals, not dropped ones', () => {
  assert.deepEqual(summarize(
    [{ state: 'achieved' }, { state: 'overdue' }, { state: 'dropped' }],
    [{ state: 'achieved' }, { state: 'in_progress' }],
  ), { achieved: 2, total: 4 })
})

test('buildTimeline adds states, the summary and reaches back to past items', () => {
  const t = buildTimeline({
    profile: { date_of_birth: '1996-05-01', retirement_date: '2041-08-12' },
    events: [
      { id: 1, title: 'Old plan', year: 2024, status: 'planned' },
      { id: 2, title: 'Done', year: 2026, month: 3, status: 'done', achieved_at: '2026-03-12' },
      { id: 3, title: 'Dropped', year: 2030, status: 'dropped', achieved_at: '2026-01-01' },
    ],
    goals: [{ id: 9, title: 'Car', target_amount: 100, current_amount: 30, target_date: '2027-06-30', is_achieved: 0 }],
    today: TODAY,
  })
  assert.deepEqual(t.range, { start: 2024, end: 2076, today: 2026 })
  assert.equal(t.today, '2026-11-18')
  assert.deepEqual(t.events.map(e => e.state), ['overdue', 'achieved', 'dropped'])
  assert.equal(t.events[1].achieved_at, '2026-03-12')
  assert.equal(t.events[2].achieved_at, null) // only meaningful while achieved
  assert.deepEqual([t.goals[0].state, t.goals[0].percent], ['in_progress', 30])
  assert.equal(t.retirement.state, 'upcoming')
  assert.deepEqual(t.summary, { achieved: 1, total: 3 })
})

test('the line never starts before the birth year or 50 years back', () => {
  const t = buildTimeline({ profile: { date_of_birth: '1996-05-01' }, events: [{ id: 1, title: 'x', year: 1990 }], today: TODAY })
  assert.equal(t.range.start, 1996)
  const u = buildTimeline({ profile: {}, events: [{ id: 1, title: 'x', year: 1950 }], today: TODAY })
  assert.equal(u.range.start, 1976)
  const v = buildTimeline({ profile: {}, events: [{ id: 1, title: 'x', year: 2030 }], today: TODAY })
  assert.equal(v.range.start, 2026)
})

test('cleanEvent: achieved_at defaults to today while done and is cleared otherwise', () => {
  const base = { title: 'x', year: 2027 }
  assert.equal(cleanEvent({ ...base, status: 'done' }, TODAY).achieved_at, '2026-11-18')
  assert.equal(cleanEvent({ ...base, status: 'done', achieved_at: '2027-03-12' }, TODAY).achieved_at, '2027-03-12')
  assert.equal(cleanEvent({ ...base, status: 'done', achieved_at: '2027-03-12T10:00:00Z' }, TODAY).achieved_at, '2027-03-12')
  assert.equal(cleanEvent({ ...base, status: 'planned', achieved_at: '2027-03-12' }, TODAY).achieved_at, null)
  assert.equal(cleanEvent({ ...base, status: 'dropped', achieved_at: '2027-03-12' }, TODAY).achieved_at, null)
  assert.throws(() => cleanEvent({ ...base, status: 'done', achieved_at: '2027-02-30' }, TODAY), /achieved_at/)
  assert.throws(() => cleanEvent({ ...base, status: 'done', achieved_at: 'soon' }, TODAY), /achieved_at/)
  assert.equal(isoDateOrNull('2024-02-29'), '2024-02-29')
  assert.equal(isoDateOrNull('2025-02-29'), null)
})
