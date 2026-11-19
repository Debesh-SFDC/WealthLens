// Run: node src/renderer/lib/lifeTimelineCards.test.js   (plain node:assert, no deps)
// One card per item in lanes (positions, no overlaps, compact pills that grow
// back when zooming in), linked event + goal merge, children's ages and the
// shared net worth calculation.
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import * as z from './lifeTimelineZoom.js'
import { buildItems, groupByYear, kidsOf, reachedText } from './lifeTimeline.js'
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
  // 2027: nine items, two of them in March
  ev(2027, 1, 'Close the IDBI account'), ev(2027, 3, 'Tax filing'), ev(2027, 3, 'Car insurance renewal'),
  ev(2027, 5, 'Trip to Goa'), ev(2027, 7, 'Laptop upgrade'), ev(2027, 9, 'Health check-up'),
  ev(2027, 11, '5 years at MotiveMinds, gratuity earned'), ev(2027, null, 'Sell the old bike', { is_assumed: 1 }),
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
  // counted once in "N of M achieved": 24 live events (one dropped) + 1 unlinked goal
  assert.equal(data.summary.total, 25)
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

// ── One card per item, at its own date ────────────────────────────────────────
const X = (ppy) => (yf) => z.xOf(yf, ppy, data.range.start)
const layout = (o) => z.layoutLine({ range: data.range, byYear, phases: [], birthYear: 1994, kids: data.kids, todayMonth: 11, ...o })
{
  // positions: month m sits mid-month; a day pins it; no month = start of the year
  assert.equal(z.itemYear({ year: 2028, month: 6 }), 2028 + 5.5 / 12)
  assert.equal(z.itemYear({ year: 2028, month: 6, day: 16 }), 2028 + (5 + 15 / 30) / 12)
  assert.equal(z.itemYear({ year: 2028, month: null }), 2028)
  // lanes fit the stage: 3 per side on a tall stage, fewer on a short one
  assert.equal(z.laneSlots(1000, 'up').length, 3)
  assert.equal(z.laneSlots(1000, 'down').length, 3)
  assert.equal(z.laneSlots(440, 'up').filter(l => l.full).length, 2) // above: no labels to clear
  assert.equal(z.laneSlots(440, 'down').filter(l => l.full).length, 0) // short stage: pills only below
  assert.equal(z.laneSlots(440, 'down')[0].pills.length, 1)
  assert.equal(z.laneSlots(330, 'down').length, 0) // phone: the line sits low, nothing fits below
  assert.equal(z.laneSlots(1000, 'down')[0].pills.length, 2) // a lane holds two pills

  const y27 = items.filter(i => i.year === 2027)
  assert.equal(y27.length, 9)
  for (const ppy of [z.PRESETS.years, 300, z.PRESETS.months]) {
    const P = z.placeItems(items, { X: X(ppy), vh: 760 })
    // every item has exactly one placement: none merged, none missing
    assert.equal(P.length, items.length)
    assert.equal(new Set(P.map(p => p.item.key)).size, items.length)
    for (const p of P) assert.equal(p.x, X(ppy)(z.itemYear(p.item)), `${p.item.title} sits at its own date`)
    // two items in March 2027: two separate placements at the same marker x
    const mar = P.filter(p => p.item.year === 2027 && p.item.month === 3)
    assert.equal(mar.length, 2)
    assert.equal(mar[0].x, mar[1].x)
    assert.notEqual(mar[0].item.key, mar[1].item.key)
    // a dropped item is a marker only
    assert.equal(P.find(p => p.item.title === 'Dropped thing').mode, 'marker')
  }

  // zooming in on 2027 turns compact pills (and bare markers) into full cards
  const modes = (ppy) => {
    const P = z.placeItems(items, { X: X(ppy), vh: 760 }).filter(p => p.item.year === 2027)
    return { full: P.filter(p => p.mode === 'full').length, pill: P.filter(p => p.mode === 'pill').length, marker: P.filter(p => p.mode === 'marker').length }
  }
  const at128 = modes(z.PRESETS.years)
  const at600 = modes(600)
  const at1150 = modes(z.PRESETS.months)
  assert.ok(at128.pill + at128.marker > 0, `some 2027 items are compact at Years: ${JSON.stringify(at128)}`)
  assert.ok(at600.full > at128.full, `zooming in gives more full cards: ${JSON.stringify(at128)} -> ${JSON.stringify(at600)}`)
  assert.equal(at1150.full, 9, `all of 2027 is full cards at Months: ${JSON.stringify(at1150)}`)
  console.log(`  2027 at Years ${JSON.stringify(at128)} · 600 ppy ${JSON.stringify(at600)} · Months ${JSON.stringify(at1150)}`)
}

// ── No overlaps: Years and Months × 1280, 1920 and Wide, zoom sweep ────────────
// Rectangles from the layout's own geometry: lane cards / pills hang d px from
// the line and are h tall; labels reach at most LABEL_REACH from the line;
// connectors are vertical segments from the line to their card.
{
  const stages = [
    { vw: 390, vh: 330 },                         // phone (track taller than the stage)
    { vw: 1280, vh: 440 }, { vw: 1280, vh: 520 }, // laptop (short, typical)
    { vw: 1920, vh: 760 },                        // desktop
    { vw: 1920, vh: 960 }, { vw: 2560, vh: 1200 }, // wide view
  ]
  let checked = 0
  for (const { vw, vh } of stages) {
    const mid = z.lineY(vh)
    for (let s = 300; s <= 1000; s += 25) {
      const ppy = z.sliderToPpy(s)
      const width = z.trackWidth(data.range, ppy, vw)
      for (const frac of [0, 0.02, 0.05, 0.1, 0.3]) {
        const left = Math.max(0, (width - vw) * frac)
        const L = layout({ ppy, left, vw, vh })
        const rect = (c) => (c.side === 'up'
          ? { a: c.a, b: c.a + c.w, top: mid - c.d - c.h, bot: mid - c.d }
          : { a: c.a, b: c.a + c.w, top: mid + c.d, bot: mid + c.d + c.h })
        const hit = (p, q) => p.a < q.b && q.a < p.b && p.top < q.bot && q.top < p.bot
        const tag = `${vw}x${vh} ppy ${ppy.toFixed(0)}`
        for (let i = 0; i < L.cards.length; i++) {
          const c = L.cards[i]
          const r = rect(c)
          assert.ok(r.top >= z.EDGE.up - 0.01 && r.bot <= vh - z.EDGE.down + 0.01, `${tag}: ${c.item.title} leaves the stage`)
          for (let j = 0; j < L.cards.length; j++) {
            if (j === i) continue
            const o = L.cards[j]
            if (j > i) assert.ok(!hit(r, rect(o)), `${tag}: ${c.item.title} overlaps ${o.item.title}`)
            // c's connector (x, from the line to its card) never crosses another card
            if (o.side === c.side && o.d + o.h <= c.d) assert.ok(c.x <= o.a || c.x >= o.a + o.w, `${tag}: ${c.item.title}'s connector crosses ${o.item.title}`)
          }
          for (const lab of L.labels) {
            const lr = { a: lab.x - lab.w / 2, b: lab.x + lab.w / 2, top: mid, bot: mid + z.LABEL_REACH }
            assert.ok(!hit(r, lr), `${tag}: ${c.item.title} overlaps label ${lab.lines[0]}`)
          }
        }
        // labels never overlap each other
        const ls = [...L.labels].sort((p, q) => p.x - q.x)
        for (let i = 1; i < ls.length; i++) assert.ok(ls[i - 1].x + ls[i - 1].w / 2 <= ls[i].x - ls[i].w / 2, `${tag}: labels overlap`)
        checked++
      }
    }
  }
  // A3: Decades keeps the summary nodes, no item cards
  const D = layout({ ppy: z.PRESETS.decades, left: 0, vw: 1280, vh: 520 })
  assert.equal(D.cards.length, 0)
  assert.match(D.decades.find(d => d.decade === 2020).progress, /of \d+ achieved/)
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
