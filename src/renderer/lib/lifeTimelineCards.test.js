// Run: node src/renderer/lib/lifeTimelineCards.test.js   (plain node:assert, no deps)
// Multi-item year cards (heights, no overlaps), linked event + goal merge,
// children's ages and the shared net worth calculation.
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import * as z from './lifeTimelineZoom.js'
import { buildItems, groupByYear, sortForCard, kidsOf, reachedText } from './lifeTimeline.js'
import { pickDeskItems } from './deskTimeline.js'
import { buildGraph } from './lifeTimelineNetwork.js'
import { computeNetWorth, effectiveCurrentValue } from '../../shared/netWorth.mjs'

const require = createRequire(import.meta.url)
const shared = require('../../shared/lifeTimeline.js')
const today = new Date(2026, 10, 19)

// ── fixture: 2028 has 8 items, 2029 has 5 (neighbours), plus a sprinkle ──────
let id = 1
const ev = (year, month, title, extra = {}) => ({ id: id++, title, year, month, is_major: 0, is_assumed: 0, status: 'planned', category: 'other', ...extra })
const events = [
  ev(2027, 12, 'Resign from MotiveMinds', { is_major: 1 }),
  ev(2028, 1, 'First child: start trying'),
  ev(2028, 4, 'New job at 45 LPA or more'),
  ev(2028, 6, '1st house purchase', { is_major: 1 }),
  ev(2028, 10, 'Make 1st crore', { is_major: 1, goal_id: 501 }),
  ev(2028, 12, "First child's expected birth", { is_major: 1 }),
  ev(2028, null, 'Move to Bhubaneswar', { is_assumed: 1, amount_note: 'Moving Fund ₹2L' }),
  ev(2028, 6, 'House warming party'),
  ev(2028, 3, 'Dropped thing', { status: 'dropped' }),
  ev(2029, 2, 'A'), ev(2029, 2, 'B (major)', { is_major: 1 }), ev(2029, 7, 'C'), ev(2029, null, 'D'), ev(2029, 11, 'E'),
  ev(2031, 1, 'Second child decision'), ev(2031, 10, "Second child's expected birth", { is_major: 1 }),
  ev(2032, null, 'Child starts school', { is_assumed: 1 }),
]
const goals = [
  { id: 501, title: 'Make 1st crore', emoji: '👑', target_amount: 10000000, current_amount: 1, target_date: '2028-10-31', is_achieved: 0, auto_source: 'net_worth' },
  { id: 502, title: 'Car fund', target_amount: 800000, current_amount: 200000, target_date: '2028-03-31', is_achieved: 0 },
]
const fire = { kids_planned: 2, kid1_year: 2028, kid2_year: 2031 }
const profile = { date_of_birth: '1994-03-10', retirement_age: 45 }
const data = shared.buildTimeline({ profile, fire, phases: [], events, goals, netWorth: 6234567, today })
const items = buildItems(data)
const byYear = groupByYear(items)

// ── B4: a linked event and its goal are ONE item ──────────────────────────────
{
  assert.ok(!data.goals.some(g => g.id === 501), 'linked goal is not listed separately')
  assert.ok(data.goals.some(g => g.id === 502), 'unlinked dated goal stays')
  const crore = items.filter(i => /1st crore/.test(i.title))
  assert.equal(crore.length, 1, '"Make 1st crore" appears once')
  const it = crore[0]
  assert.equal(it.kind, 'event')
  assert.equal(it.month, 10)
  assert.equal(it.major, true)
  assert.equal(it.state, 'in_progress')
  assert.equal(it.percent, 62)
  assert.equal(it.amountText, '₹62.35L of ₹1 Cr')
  assert.equal(it.goal.current_amount, 6234567, 'live net worth, not the stored 1')
  assert.equal(it.reached, false)
  // counted once in "N of M achieved": 16 live events (one dropped) + 1 unlinked goal
  assert.equal(data.summary.total, 17)
  // Network: one node, no separate goal node
  const g = buildGraph(data)
  assert.equal(g.nodes.filter(n => /1st crore/.test(n.title)).length, 1)
  assert.equal(g.nodes.find(n => /1st crore/.test(n.title)).amountText, '₹62.35L of ₹1 Cr')
  // Desk Mode: same merged item and progress
  const desk = pickDeskItems(shared.buildTimeline({ profile, fire, phases: [], events: events.filter(e => e.year >= 2028 && e.month === 10), goals: goals.filter(x => x.id === 501), netWorth: 6234567, today }))
  assert.equal(desk.next.title, 'Make 1st crore')
  assert.equal(desk.next.percent, 62)
  // reached: net worth >= target and not achieved -> prompt; achievement stays manual
  const rich = buildItems(shared.buildTimeline({ profile, fire, phases: [], events, goals, netWorth: 10000001, today }))
  const r = rich.find(i => /1st crore/.test(i.title))
  assert.equal(r.reached, true)
  assert.notEqual(r.state, 'achieved')
  assert.equal(reachedText(r), "You've reached ₹1 Cr. Mark achieved?")
  // either side achieved -> the item is achieved, and no prompt
  const doneGoal = buildItems(shared.buildTimeline({ profile, fire, phases: [], events, goals: goals.map(x => (x.id === 501 ? { ...x, is_achieved: 1, achieved_at: '2028-09-01T12:00:00.000Z' } : x)), netWorth: 10000001, today }))
  const d = doneGoal.find(i => /1st crore/.test(i.title))
  assert.equal(d.state, 'achieved')
  assert.equal(d.reached, false)
  assert.equal(d.achievedAt, '2028-09-01')
  // a manual goal's stored current_amount is used as-is
  assert.equal(data.goals.find(x => x.id === 502).current_amount, 200000)
}

// ── A1: card ordering and lines ───────────────────────────────────────────────
{
  const list = sortForCard(byYear.get(2028))
  assert.equal(list.length, 8, 'dropped items are not listed')
  // by month, majors first within a month, no-month last
  assert.deepEqual(list.map(i => i.title), [
    'First child: start trying', 'Car fund', 'New job at 45 LPA or more', '1st house purchase', 'House warming party',
    'Make 1st crore', "First child's expected birth", 'Move to Bhubaneswar',
  ])
  const L = z.layoutLine({ range: data.range, byYear, phases: [], birthYear: 1994, kids: data.kids, ppy: z.PRESETS.years, left: 0, vw: 1920, vh: 800, todayMonth: 11 })
  const c28 = L.cards.find(c => c.key === 'y2028')
  assert.equal(c28.rows.length, 4)
  assert.equal(c28.more, 4, '"+4 more"')
  const c29 = L.cards.find(c => c.key === 'y2029')
  assert.equal(c29.rows.length, 4)
  assert.equal(c29.more, 1)
  assert.deepEqual(c29.rows.map(r => r.title).slice(0, 2), ['B (major)', 'A'])
  // a short stage keeps the card inside it by collapsing lines into "+N more"
  const S = z.layoutLine({ range: data.range, byYear, phases: [], birthYear: 1994, kids: data.kids, ppy: z.PRESETS.years, left: 0, vw: 1280, vh: 460, todayMonth: 11 })
  const s28 = S.cards.find(c => c.key === 'y2028')
  assert.ok(s28.rows.length >= 1 && s28.rows.length + s28.more === 8)
}

// ── A4: children's ages on the year labels ────────────────────────────────────
{
  assert.deepEqual(data.kids, [2028, 2031])
  const L = z.layoutLine({ range: data.range, byYear, phases: [], birthYear: 1994, kids: kidsOf(data), ppy: z.PRESETS.years, left: 0, vw: 6000, vh: 800 })
  const lines = (y) => L.years.find(n => n.year === y).label.lines
  assert.deepEqual(lines(2031), ['2031', 'age 37 · kids 3, 0'])
  assert.deepEqual(lines(2029), ['2029', 'age 35 · child 1'])
  assert.deepEqual(lines(2027), ['2027', 'age 33'])
  // kid 2 only counts with kids_planned >= 2
  assert.deepEqual(shared.buildTimeline({ profile, fire: { ...fire, kids_planned: 1 }, phases: [], events: [], goals: [], today }).kids, [2028])
}

// ── No overlaps: Decades / Years / Months × 1280, 1920 and Wide ───────────────
// Rectangles from the layout's own geometry: cards hang CARD_TOP px from the
// line and are h * scale tall; year labels reach up to ~77px from the line
// (a major year's 26px Cinzel year + meta line, measured in Chrome).
{
  const LABEL_REACH = 80
  const stages = [
    { vw: 1280, vh: 460 }, { vw: 1280, vh: 520 }, // laptop (min height, typical)
    { vw: 1920, vh: 760 },                        // desktop
    { vw: 1920, vh: 960 }, { vw: 2560, vh: 1200 }, // wide view
  ]
  let checked = 0
  for (const { vw, vh } of stages) {
    const mid = vh / 2
    for (const level of ['decades', 'years', 'months']) {
      const ppy = z.PRESETS[level]
      const width = z.trackWidth(data.range, ppy, vw)
      for (const frac of [0, 0.03, 0.06, 0.1, 0.3]) {
        const left = Math.max(0, (width - vw) * frac)
        const L = z.layoutLine({ range: data.range, byYear, phases: [], birthYear: 1994, kids: data.kids, ppy, left, vw, vh, todayMonth: 11 })
        const shown = L.cards.filter(c => c.opacity > 0.02)
        const rect = (c) => {
          const hw = (z.CARD_W * c.scale) / 2
          const h = c.h * c.scale
          return c.side === 'up'
            ? { a: c.x - hw, b: c.x + hw, top: mid - z.CARD_TOP - h, bot: mid - z.CARD_TOP }
            : { a: c.x - hw, b: c.x + hw, top: mid + z.CARD_TOP, bot: mid + z.CARD_TOP + h }
        }
        const hit = (p, q) => p.a < q.b && q.a < p.b && p.top < q.bot && q.top < p.bot
        for (let i = 0; i < shown.length; i++) {
          const r = rect(shown[i])
          assert.ok(r.top >= z.EDGE.up - 0.01 && r.bot <= vh - z.EDGE.down + 0.01,
            `${level} ${vw}x${vh}: card ${shown[i].key} leaves the stage (${r.top.toFixed(0)}..${r.bot.toFixed(0)})`)
          for (let j = i + 1; j < shown.length; j++) {
            assert.ok(!hit(r, rect(shown[j])), `${level} ${vw}x${vh}: cards ${shown[i].key} and ${shown[j].key} overlap`)
          }
          for (const lab of [...L.years.map(y => y.label), ...L.decades.map(d => d.label), ...L.months.map(m => m.label)].filter(l => l.visible)) {
            const lr = lab.side === 'up'
              ? { a: lab.x - lab.w / 2, b: lab.x + lab.w / 2, top: mid - LABEL_REACH, bot: mid }
              : { a: lab.x - lab.w / 2, b: lab.x + lab.w / 2, top: mid, bot: mid + LABEL_REACH }
            assert.ok(!hit(r, lr), `${level} ${vw}x${vh}: card ${shown[i].key} overlaps label ${lab.lines[0]}`)
          }
        }
        checked++
      }
    }
  }
  // the 2028 / 2029 neighbours are both on screen at Years
  const Y = z.layoutLine({ range: data.range, byYear, phases: [], birthYear: 1994, kids: data.kids, ppy: z.PRESETS.years, left: 0, vw: 1280, vh: 520 })
  assert.ok(Y.cards.some(c => c.key === 'y2028') && Y.cards.some(c => c.key === 'y2029'))
  // A3: Decades keep the summary and add the top 2 titles
  const D = z.layoutLine({ range: data.range, byYear, phases: [], birthYear: 1994, kids: data.kids, ppy: z.PRESETS.decades, left: 0, vw: 1280, vh: 520 })
  const d20 = D.cards.find(c => c.key === 'd2020')
  assert.match(d20.tag, /of \d+ achieved/)
  assert.equal(d20.rows.length, 2)
  assert.equal(d20.more, 0)
  // A3: two items in one month stack on one month card (June 2028)
  const M = z.layoutLine({ range: data.range, byYear, phases: [], birthYear: 1994, kids: data.kids, ppy: z.PRESETS.months, left: z.xOf(2028.3, z.PRESETS.months, data.range.start), vw: 1280, vh: 520 })
  const jun = M.cards.find(c => c.key === 'm2028-6')
  assert.deepEqual(jun.rows.map(r => r.title), ['1st house purchase', 'House warming party'])
  console.log(`  overlap layouts checked: ${checked}`)
}

// ── B1: shared net worth == the Net Worth page's original calculation ─────────
{
  // NetWorth.jsx's effectiveCurrentValue before it moved, verbatim (reference).
  function original(inv) {
    if (inv.type === 'insurance') {
      const monthly = Number(inv.monthly_sip_amount) || 0
      const premiumYears = Number(inv.interest_rate) || 0
      const maturityAmt = Number(inv.purchase_price) || 0
      const start = inv.start_date ? new Date(inv.start_date).getTime() : null
      const maturityTs = inv.maturity_date ? new Date(inv.maturity_date).getTime() : null
      if (!start || !monthly) return 0
      if (maturityTs && Date.now() >= maturityTs) return maturityAmt
      const msPerMonth = 30.4375 * 24 * 60 * 60 * 1000
      const n = Math.min(Math.floor((Date.now() - start) / msPerMonth), Math.round(premiumYears * 12))
      return n * monthly
    }
    if (inv.type === 'rd') {
      const monthly = Number(inv.monthly_sip_amount) || 0
      const tenureMonths = Number(inv.units) || 0
      const maturityAmt = Number(inv.purchase_price) || 0
      const start = inv.start_date ? new Date(inv.start_date).getTime() : null
      const maturityTs = inv.maturity_date ? new Date(inv.maturity_date).getTime() : null
      if (!start || !monthly) return 0
      if (maturityTs && Date.now() >= maturityTs) return maturityAmt
      const msPerMonth = 30.4375 * 24 * 60 * 60 * 1000
      const n = Math.min(Math.floor((Date.now() - start) / msPerMonth), tenureMonths)
      return n * monthly
    }
    return Number(inv.current_value) || 0
  }
  const invs = [
    { type: 'mf_sip', current_value: 1234567.89 },
    { type: 'stocks', current_value: '250000' },
    { type: 'epf', current_value: null },
    { type: 'insurance', monthly_sip_amount: 5000, interest_rate: 10, purchase_price: 900000, start_date: '2022-04-15', maturity_date: '2040-04-15', current_value: 999 },
    { type: 'insurance', monthly_sip_amount: 2000, interest_rate: 5, purchase_price: 150000, start_date: '2010-01-01', maturity_date: '2020-01-01' },
    { type: 'rd', monthly_sip_amount: 3000, units: 24, purchase_price: 76000, start_date: '2025-09-01', maturity_date: '2027-09-01', current_value: 1 },
    { type: 'rd', monthly_sip_amount: 3000, units: 12, purchase_price: 37000, start_date: '2019-01-01', maturity_date: '2020-01-01' },
  ]
  const ref = invs.reduce((s, inv) => s + original(inv), 0)
  assert.equal(computeNetWorth(invs), ref)
  invs.forEach(inv => assert.equal(effectiveCurrentValue(inv), original(inv)))
  // raw SUM(current_value) (the old dashboard figure) differs when insurance / RD exist
  const rawSum = invs.reduce((s, i) => s + (Number(i.current_value) || 0), 0)
  assert.notEqual(rawSum, ref)
  // soft-deleted rows never count
  assert.equal(computeNetWorth([...invs, { type: 'stocks', current_value: 5e6, deleted_at: '2026-01-01' }]), ref)
}

console.log('lifeTimelineCards tests passed')
