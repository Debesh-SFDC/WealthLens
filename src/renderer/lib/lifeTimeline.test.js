// Run: node src/renderer/lib/lifeTimeline.test.js   (plain node:assert, no deps)
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import * as m from './lifeTimeline.js'

const require = createRequire(import.meta.url)
const shared = require('../../shared/lifeTimeline.js')

// ── formatting ──
assert.equal(m.fmtAmount(225000), '₹2.25L')
assert.equal(m.fmtAmount(90000), '₹90K')
assert.equal(m.fmtAmount(200000), '₹2L')
assert.equal(m.fmtAmount(92300000), '₹9.23 Cr')
assert.equal(m.fmtAmount(null), null)
assert.equal(m.fmtAmount(''), null)

// ── ages ──
assert.equal(m.childAgeIn(2028, 2024), 4)
assert.equal(m.childAgeIn(2023, 2024), null)
assert.equal(m.childAgeIn(2028, null), null)
assert.equal(m.ageIn(2041, 1996), 45)

// ── phases ──
const phases = [{ numeral: 'I', name: 'Foundation', start_year: 2026 }, { numeral: 'II', name: 'Move', start_year: 2028 }]
assert.equal(m.phaseFor(2027, phases).numeral, 'I')
assert.equal(m.phaseFor(2030, phases).numeral, 'II')
assert.equal(m.phaseFor(2020, phases), null)
assert.equal(m.phaseLabelAt(2027, phases, 2027).numeral, 'I') // running phase shown at the first node
assert.equal(m.phaseLabelAt(2029, phases, 2027), null)

// ── items + lead ──
const today = new Date(2026, 10, 17)
const data = shared.buildTimeline({
  profile: { date_of_birth: '1996-05-02', retirement_age: 45, retirement_date: '2041-08-12' },
  fire: { kid1_year: 2024 },
  phases,
  events: [
    { id: 1, title: 'Loose', year: 2041, month: null, is_assumed: 1, is_major: 0, status: 'planned' },
    { id: 2, title: 'Dropped', year: 2030, month: 3, is_assumed: 0, is_major: 1, status: 'dropped' },
    { id: 3, title: 'With amount', year: 2041, month: 2, amount: '350000', amount_note: 'note', status: 'planned' },
  ],
  goals: [{ id: 9, title: 'Dream Bike', target_amount: 5000000, target_date: '2041-12-31', is_achieved: 0 }],
  today,
})
assert.deepEqual(data.range, { start: 2026, end: 2076 })
assert.equal(data.birthYear, 1996)
assert.equal(data.childBirthYear, 2024)
assert.deepEqual([data.retirement.date, data.retirement.age, data.retirement.source], ['2041-08-12', 45, 'retirement_date'])

const byYear = m.groupByYear(m.buildItems(data))
assert.deepEqual(byYear.get(2041).map(i => i.key), ['e3', 'retirement', 'g9', 'e1'])
assert.equal(m.pickLead(byYear.get(2041)).lead.key, 'retirement') // major wins
assert.equal(m.pickLead(byYear.get(2041)).count, 4)
assert.deepEqual(m.pickLead(byYear.get(2030)), { lead: null, count: 0 }) // only dropped → tick
const e3 = byYear.get(2041)[0]
assert.equal(e3.amountText, '₹3.5L')
assert.equal(e3.noteText, 'note')

// ── shared: retirement priority matches the Retirement Countdown ──
assert.equal(shared.resolveRetirement({ date_of_birth: '1996-05-02', retirement_age: 45 }).date, '2041-05-02')
assert.equal(shared.resolveRetirement({ date_of_birth: '1996-05-02', retirement_age: 45, retirement_date: '2040-01-15' }).date, '2040-01-15')
// no DOB → range falls back to 50 years, child age hidden when kid1_year unset
const bare = shared.buildTimeline({ profile: null, fire: null, phases: [], events: [], goals: [], today })
assert.deepEqual([bare.birthYear, bare.childBirthYear, bare.range.end], [null, null, 2076])

// ── shared: validation ──
assert.throws(() => shared.cleanEvent({ year: 2030 }), /title is required/)
assert.throws(() => shared.cleanEvent({ title: 'x' }), /year is required/)
assert.throws(() => shared.cleanEvent({ title: 'x', year: 2030, month: 13 }), /month/)
assert.throws(() => shared.cleanEvent({ title: 'x', year: 2030, category: 'nope' }), /category/)
assert.throws(() => shared.cleanEvent({ title: 'x', year: 2030, month: 2, day: 30 }), /day is not valid/)
const ok = shared.cleanEvent({ title: ' Trip ', year: '2030', month: '', day: 5, amount: '1200', is_assumed: true })
assert.deepEqual([ok.title, ok.year, ok.month, ok.day, ok.amount, ok.is_assumed, ok.is_major, ok.status, ok.category],
  ['Trip', 2030, null, null, 1200, 1, 0, 'planned', 'other'])
const ph = shared.cleanPhases([{ name: 'B', start_year: 2040 }, { name: 'A', start_year: 2030, id: 4 }])
assert.deepEqual(ph.map(p => [p.name, p.sort_order, p.id]), [['A', 0, 4], ['B', 1, null]])
assert.throws(() => shared.cleanPhases([{ name: '', start_year: 2030 }]), /name is required/)

console.log('lifeTimeline tests passed')
