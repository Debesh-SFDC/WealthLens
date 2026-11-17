// Run: node src/renderer/lib/lifeTimelineZoom.test.js   (plain node:assert, no deps)
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import * as z from './lifeTimelineZoom.js'
import * as n from './lifeTimelineNetwork.js'
import { buildItems, groupByYear } from './lifeTimeline.js'

const require = createRequire(import.meta.url)
const shared = require('../../shared/lifeTimeline.js')

const today = new Date(2026, 10, 17)
const phases = [
  { id: 1, numeral: 'I', name: 'Foundation', start_year: 2026 }, { id: 2, numeral: 'II', name: 'Move and build', start_year: 2028 },
  { id: 3, numeral: 'III', name: 'Freedom', start_year: 2041 }, { id: 4, numeral: 'IV', name: 'Second act', start_year: 2047 },
  { id: 5, numeral: 'V', name: 'Legacy', start_year: 2061 },
]
const events = []
let id = 1
for (const [y, m, major] of [[2026, 12], [2027, 11], [2028], [2028], [2028], [2029], [2031], [2034, null, 1], [2042], [2046], [2052], [2056], [2066], [2076, null, 1], [2041, 3], [2041, 4], [2041, 5]]) {
  events.push({ id: id++, title: `Event ${id} with a longish title`, year: y, month: m ?? null, is_major: major ? 1 : 0, is_assumed: 0, status: 'planned', category: 'home' })
}
events.push({ id: 99, title: 'After house', year: 2041, month: 9, depends_on_id: 8, goal_id: 7, status: 'done', category: 'vehicle' })
events.push({ id: 100, title: 'Dangling', year: 2050, depends_on_id: 12345, status: 'planned', category: 'other' })
const goals = Array.from({ length: 12 }, (_, i) => ({ id: i + 1, title: `Goal ${i}`, target_amount: 100000 * (i + 1), target_date: `${2027 + (i % 3)}-0${(i % 9) + 1}-28`, is_achieved: 0 }))
const data = shared.buildTimeline({
  profile: { date_of_birth: '1996-05-02', retirement_age: 45, retirement_date: '2041-08-12' },
  fire: { kid1_year: 2024 }, phases, events, goals, today,
})
const byYear = groupByYear(buildItems(data))

// ── levels / presets ──
assert.equal(z.levelFor(z.PRESETS.decades), 'decades')
assert.equal(z.levelFor(z.PRESETS.years), 'years')
assert.equal(z.levelFor(z.PRESETS.months), 'months')
assert.equal(z.weights(z.PRESETS.years).years, 1)
assert.equal(z.weights(z.PRESETS.decades).decades, 1)
assert.equal(z.weights(z.PRESETS.months).months, 1)
for (const p of [z.MIN_PPY, 22, 128, 1150, z.MAX_PPY]) assert.ok(Math.abs(z.sliderToPpy(z.ppyToSlider(p)) - p) / p < 0.01)

// anchor maths: the year under px stays under px after a zoom
{
  const left = 500, px = 300, ppy = 128
  const yA = z.yearAt(px, left, ppy, 2026)
  const ppy2 = 400
  const left2 = z.xOf(yA, ppy2, 2026) - px
  assert.ok(Math.abs(z.yearAt(px, left2, ppy2, 2026) - yA) < 1e-9)
}

// ── no overlaps at any zoom (sweep the whole range) ──
const vw = 1200
let checked = 0
for (let s = 0; s <= 1000; s += 10) {
  const ppy = z.sliderToPpy(s)
  const width = z.trackWidth(data.range, ppy, vw)
  for (const frac of [0, 0.37, 0.8]) {
    const left = Math.max(0, (width - vw) * frac)
    const L = z.layoutLine({ range: data.range, byYear, phases: data.phases, birthYear: 1996, childBirthYear: 2024, ppy, left, vw, todayMonth: 11 })
    const labels = [...L.years.map(y => y.label), ...L.decades.map(d => d.label), ...L.months.map(m => m.label)].filter(l => l.visible)
    for (const side of ['up', 'down']) {
      const ls = labels.filter(l => l.side === side).sort((a, b) => a.x - b.x)
      for (let i = 1; i < ls.length; i++) {
        assert.ok(ls[i - 1].x + ls[i - 1].w / 2 <= ls[i].x - ls[i].w / 2, `labels overlap at ppy ${ppy.toFixed(1)}: ${ls[i - 1].lines[0]} / ${ls[i].lines[0]}`)
      }
      for (const set of ['decades', 'years', 'months']) {
        const cs = L.cards.filter(c => c.side === side && c.set === set).sort((a, b) => a.x - b.x)
        for (let i = 1; i < cs.length; i++) {
          const half = (c) => (z.CARD_W * c.scale) / 2
          assert.ok(cs[i - 1].x + half(cs[i - 1]) < cs[i].x - half(cs[i]), `cards overlap at ppy ${ppy.toFixed(1)}`)
        }
      }
    }
    const tops = L.phaseLabels.filter(l => l.visible).sort((a, b) => a.x - b.x)
    for (let i = 1; i < tops.length; i++) assert.ok(tops[i - 1].x + tops[i - 1].w <= tops[i].x)
    checked++
  }
}

// level of detail
const at = (ppy) => z.layoutLine({ range: data.range, byYear, phases: data.phases, birthYear: 1996, childBirthYear: 2024, ppy, left: 0, vw: 4000 })
assert.ok(at(22).decades.length >= 5 && at(22).cards.every(c => c.set === 'decades'))
assert.ok(at(128).cards.every(c => c.set === 'years') && at(128).months.length === 0)
const mon = at(1150)
assert.ok(mon.cards.every(c => c.set === 'months') && mon.months.length > 0)
assert.ok(mon.cards.some(c => c.loose && c.tag === 'Sometime this year'))
assert.equal(at(22).bands.length, 5)
assert.equal(at(22).decades[0].label.lines[0], '2020s')

// ── network ──
const g = n.buildGraph(data)
const kinds = (k) => g.nodes.filter(x => x.kind === k).length
assert.equal(kinds('phase'), 5)
assert.equal(kinds('now'), 1)
assert.equal(kinds('retirement'), 1)
assert.equal(kinds('goal'), 12)
assert.equal(g.links.filter(l => l.kind === 'spine').length, 4)
const dep = g.links.filter(l => l.kind === 'dep')
assert.deepEqual(dep, [{ source: 'e8', target: 'e99', kind: 'dep' }])
assert.equal(g.links.filter(l => l.kind === 'goal').length, 1)
assert.ok(g.neighbours.get('e99').has('e8') && g.neighbours.get('e99').has('g7') && g.neighbours.get('e99').has('p3'))
assert.ok(g.nodes.find(x => x.id === 'e99').dim)
// chronological tab order
for (let i = 1; i < g.nodes.length; i++) assert.ok(g.nodes[i - 1].year <= g.nodes[i].year)
assert.equal(n.describeNode(g.nodes.find(x => x.id === 'e99')).phase, 'III · Freedom')
// dangling depends_on (target missing) is dropped by the API payload
assert.equal(data.events.find(e => e.id === 100).depends_on_id, null)

// ── depends_on validation ──
const links = new Map([[1, null], [2, 1], [3, 2]])
assert.throws(() => shared.checkDependsOn(1, 3, links), /loop/)
assert.throws(() => shared.checkDependsOn(2, 2, links), /itself/)
assert.throws(() => shared.checkDependsOn(null, 42, links), /another of your events/)
shared.checkDependsOn(3, 1, links)
shared.checkDependsOn(null, 3, links)
assert.equal(shared.cleanEvent({ title: 'x', year: 2030, depends_on_id: '3' }).depends_on_id, 3)

console.log(`lifeTimelineZoom tests passed (${checked} layouts swept)`)
