// Semantic zoom for the Life Timeline line. Everything is driven by one
// number, ppy (pixels per year): node positions, which level of detail shows
// (Decades / Years / Months) and how much room each item's card gets. Pure
// functions, tested in lifeTimelineZoom.test.js and lifeTimelineCards.test.js.
import { pickLead, ageIn, kidsAgesIn, kidsText, phaseLabelAt, groupState, matchesFilter, MONTHS } from './lifeTimeline.js'

export const PRESETS = { decades: 22, years: 128, months: 1150 }
export const MIN_PPY = 8
export const MAX_PPY = 2600
export const PAD_LEFT = 90

// ── One card per item, in lanes ─────────────────────────────────────────────
// Every event / goal / the retirement node has its own marker ON the line at
// its date and its own card in a lane above or below the line (film-style).
// Lane k on a side hangs CARD_TOP[side] + k * LANE_PITCH px from the line, up
// to MAX_LANES per side, as many as fit the stage height (EDGE keeps clear of
// the phase-name row at the top and the "You are here" marker / zoom controls
// at the bottom). Year, month and decade labels all sit BELOW the line within
// LABEL_REACH, so lanes below start beyond them; lanes above start just clear
// of the markers. A lane holds a full card, or up to two compact pills
// stacked (pill rows at d and d + PILL_PITCH). Pixel sizes match .lt-lcard /
// .lt-pill in lifeTimeline.css.
export const CARD_TOP = { up: 28, down: 88 }
export const LABEL_REACH = 80
export const EDGE = { up: 40, down: 72 } // down: clears the zoom controls (bottom right) and "You are here"
export const FULL_W = 172
export const FULL_H = 64
export const PILL_H = 24
export const PILL_PITCH = 32
export const PILL_MAX_W = 92
export const LANE_PITCH = FULL_H + 8
export const MAX_LANES = 3
// A card's connector meets it this far in from its left end (or its right end
// when the card extends left of its marker to find room).
export const ANCHOR = 6
const H_GAP = 8

export const pillWidth = (title) => Math.min(PILL_MAX_W, Math.round(34 + String(title || '').length * 6.6))

// Fractional year of an item on the line: day given → that day; month only →
// the middle of the month; no month → the start of its year ("sometime").
export function itemYear(it) {
  if (!it.month) return it.year
  const m = it.month - 1
  if (it.day) {
    const dim = new Date(it.year, it.month, 0).getDate()
    return it.year + (m + (it.day - 1) / dim) / 12
  }
  return it.year + (m + 0.5) / 12
}

// The track is at least TRACK_MIN_H tall (CSS .lt-track2 min-height) with the
// line at its middle, so on a short stage the line sits below the stage's
// middle and the bottom of the track is cut off.
export const TRACK_MIN_H = 460
export const lineY = (vh) => Math.max(vh, TRACK_MIN_H) / 2

// Lanes on one side of the line in a stage vh px tall. full: a full card fits
// there. pills: the pill rows (offsets) that fit in that lane.
export function laneSlots(vh, side) {
  const limit = side === 'up' ? lineY(vh) - EDGE.up : vh - lineY(vh) - EDGE.down
  const out = []
  for (let k = 0; k < MAX_LANES; k++) {
    const d = CARD_TOP[side] + k * LANE_PITCH
    if (d + PILL_H > limit) break
    const pills = [d, d + PILL_PITCH].filter(p => p + PILL_H <= limit && p + PILL_H <= d + FULL_H)
    out.push({ k, d, full: d + FULL_H <= limit, pills })
  }
  return out
}

// Which items get room first: majors and the retirement node, then goals in
// progress / reached, then overdue items, then the rest; ties by date.
const priority = (it) => (it.major || it.kind === 'retirement' ? 3 : 0)
  + (it.state === 'in_progress' || it.reached ? 2 : 0) + (it.state === 'overdue' ? 1 : 0)

// Lane placement over ALL items (not just the visible ones, so cards don't
// jump while panning), in two rounds:
//  1. Right to left, every item takes the nearest free pill row (preferring
//     the side opposite its date-order neighbour). An item whose later
//     neighbour already holds a row steps one row further out, so connectors
//     pass beside the inner cards (film-style). No row free: just its marker.
//  2. Pills grow into full cards wherever a full card fits (majors and goals
//     in progress first) — so zooming in, which spreads items apart, turns
//     pills back into cards.
// A spot is free only if it clears every other placed card, its connector
// doesn't cross a card nearer the line, and it doesn't sit across the
// connector of a card further out. Cards extend right from their marker (the
// title starts at its date), or left when that's the only room.
// Returns [{ item, x, mode: 'full' | 'pill' | 'marker', side, lane, d, a, w, h }].
export function placeItems(items, { X, vh, grow = true }) {
  const list = items.map(it => ({ it, x: X(itemYear(it)) }))
    .sort((p, q) => p.x - q.x || priority(q.it) - priority(p.it))
  list.forEach((e, i) => { e.pref = i % 2 ? 'down' : 'up' })
  const lanes = { up: laneSlots(vh, 'up'), down: laneSlots(vh, 'down') }
  const free = (self, side, d, h, a, b, x) => list.every(o => {
    const p = o.spot
    if (o === self || !p || p.side !== side) return true
    const apart = b + H_GAP <= p.a || p.a + p.w + H_GAP <= a
    if (d < p.d + p.h + 4 && p.d < d + h + 4) return apart // same band
    if (p.d < d) return x <= p.a - 3 || x >= p.a + p.w + 3 // our connector passes p
    return o.x <= a - 3 || o.x >= b + 3 // p's connector passes us
  })
  const anchors = (x, w) => [x - ANCHOR, x - w + ANCHOR]
  const sidesOf = (e) => [e.pref, e.pref === 'up' ? 'down' : 'up']
  const dropped = (it) => it.status === 'dropped' || it.state === 'dropped'

  const placePill = (e, rights) => {
    const w = pillWidth(e.it.raw?.title ?? e.it.title)
    const rows = sidesOf(e).flatMap((side, si) => lanes[side].flatMap(L => L.pills.map(d => ({ side, k: L.k, d, si }))))
      .sort((p, q) => p.d - q.d || p.si - q.si)
    for (const right of rights) {
      for (const r of rows) {
        const a = anchors(e.x, w)[right ? 0 : 1]
        if (free(e, r.side, r.d, PILL_H, a, a + w, e.x)) { e.spot = { mode: 'pill', side: r.side, lane: r.k, d: r.d, a, w, h: PILL_H }; return }
      }
    }
  }
  // 1. pills extending right, right to left (a pill extending left here would
  //    cover the markers of items not placed yet and shut them out)
  for (const e of [...list].sort((p, q) => q.x - p.x || priority(q.it) - priority(p.it))) {
    e.spot = null
    if (!dropped(e.it)) placePill(e, [true])
  }
  // 1b. items still without a spot: either direction, against everything placed
  for (const e of list) if (!e.spot && !dropped(e.it)) placePill(e, [true, false])
  // 1c. a major item left as a bare marker takes the spot of a nearby lesser
  //     item, which then looks for room again (and may become the marker)
  for (const e of list) {
    if (e.spot || dropped(e.it) || priority(e.it) < 3) continue
    const near = list.filter(o => o.spot && priority(o.it) < priority(e.it) && Math.abs(o.x - e.x) <= FULL_W)
      .sort((p, q) => Math.abs(p.x - e.x) - Math.abs(q.x - e.x))
    for (const victim of near) {
      const keep = victim.spot
      victim.spot = null
      placePill(e, [true, false])
      if (e.spot) { placePill(victim, [true, false]); break }
      victim.spot = keep
    }
  }
  // 2. grow pills into full cards where there's room (own side first)
  //    Extending right first for everyone, then left for those still pills;
  //    repeated while anything grows (a pill that moves out to a full lane
  //    can free the row a neighbour needed).
  for (const right of grow ? [true, false] : []) {
    for (let pass = 0, grew = true; grew && pass < 4; pass++) {
      grew = false
      for (const e of [...list].filter(x => x.spot?.mode === 'pill').sort((p, q) => priority(q.it) - priority(p.it) || q.x - p.x)) {
        const sides = [e.spot.side, e.spot.side === 'up' ? 'down' : 'up']
        grow: for (const side of sides) {
          for (const L of lanes[side]) {
            if (!L.full) continue
            const a = anchors(e.x, FULL_W)[right ? 0 : 1]
            if (free(e, side, L.d, FULL_H, a, a + FULL_W, e.x)) { e.spot = { mode: 'full', side, lane: L.k, d: L.d, a, w: FULL_W, h: FULL_H }; grew = true; break grow }
          }
        }
      }
    }
  }
  return list.map(e => ({ item: e.it, x: e.x, ...(e.spot || { mode: 'marker', side: null, lane: null, d: 0, a: e.x, w: 0, h: 0 }) }))
}

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v))
export const clampPpy = (p) => clamp(p, MIN_PPY, MAX_PPY)
const smoothstep = (a, b, v) => {
  const t = clamp((v - a) / (b - a), 0, 1)
  return t * t * (3 - 2 * t)
}

// Level shown in the switcher / next to the slider. Boundaries sit inside the
// cross-fades below.
export function levelFor(ppy) {
  if (ppy < 50) return 'decades'
  if (ppy < 620) return 'years'
  return 'months'
}

// How much of each level is showing; they cross-fade instead of popping.
export function weights(ppy) {
  const decades = 1 - smoothstep(34, 70, ppy)
  const months = smoothstep(480, 820, ppy)
  return {
    decades,
    months,
    years: (1 - decades) * (1 - months),
    monthTicks: smoothstep(150, 320, ppy),
    phaseBands: decades,
  }
}

// x of the start of fractional year yf (a year node sits at its year's start;
// months follow it, so the layout stays continuous at every zoom).
export const xOf = (yf, ppy, start) => PAD_LEFT + (yf - start) * ppy
export const trackWidth = (range, ppy, vw) => PAD_LEFT + (range.end - range.start + 1) * ppy + Math.max(160, vw * 0.4)
export const yearAt = (px, left, ppy, start) => start + (left + px - PAD_LEFT) / ppy

// Slider mapping: logarithmic so every level gets a fair share of travel.
const LOG_MIN = Math.log(MIN_PPY)
const LOG_MAX = Math.log(MAX_PPY)
export const ppyToSlider = (p) => Math.round(((Math.log(clampPpy(p)) - LOG_MIN) / (LOG_MAX - LOG_MIN)) * 1000)
export const sliderToPpy = (v) => Math.exp(LOG_MIN + (clamp(v, 0, 1000) / 1000) * (LOG_MAX - LOG_MIN))

function biggest(items) {
  const live = items.filter(i => i.status !== 'dropped')
  if (!live.length) return null
  return live.find(i => i.major)
    || [...live].sort((a, b) => (b.raw?.amount ?? b.raw?.target_amount ?? 0) - (a.raw?.amount ?? a.raw?.target_amount ?? 0))[0]
}

// ── Labels ─────────────────────────────────────────────────────────────────
// Rough text widths (Cinzel digits / Plus Jakarta Sans) — generous on purpose.
const textW = (str, px) => String(str).length * px
// +16: the label's opaque backing (padding) plus breathing room.
const yearLabelW = (lines, big) => Math.max(textW('0000', big ? 17 : 10), ...lines.slice(1).map(l => textW(l, 6.6))) + 16

// Greedy by priority: keep a label only if its box clears every kept label on
// the same side. Labels sit on an opaque backing above the connectors (which
// pass behind them) and below the cards, which start beyond LABEL_REACH.
function placeLabels(labels) {
  const kept = { up: [], down: [] }
  const order = [...labels].sort((a, b) => b.priority - a.priority || a.x - b.x)
  for (const l of order) {
    const a = l.x - l.w / 2
    const b = l.x + l.w / 2
    const side = kept[l.side]
    const hit = side.some(k => a < k.b + 6 && b > k.a - 6)
    l.visible = !hit
    if (!hit) side.push({ a, b })
  }
  return labels
}

// ── Layout ─────────────────────────────────────────────────────────────────
// byYear: Map(year -> items) from groupByYear(buildItems(data)).
// filter: header filter id; nodes and cards that don't match get match: false
// (drawn dimmed, never removed, so the line keeps its shape).
// vh: stage height (cards get as many lines as fit). kids: children's birth
// years (payload.kids); childBirthYear is the older single-child field.
export function layoutLine({ range, byYear, phases, birthYear, childBirthYear, kids, ppy, left, vw, vh = 460, todayMonth = 1, filter = 'all' }) {
  const kidYears = kids ?? (childBirthYear != null ? [childBirthYear] : [])
  const { start, end } = range
  const today = range.today ?? start
  const anyMatch = (items) => filter === 'all' || items.some(i => matchesFilter(i, filter))
  const w = weights(ppy)
  const X = (yf) => xOf(yf, ppy, start)
  const margin = Math.max(vw, 400)
  const inView = (x, pad = 0) => x >= left - margin - pad && x <= left + vw + margin + pad
  const monthsDominant = w.months >= 0.5
  const decadesDominant = w.decades >= 0.5
  const showMeta = ppy >= 60

  // Decade summaries (counts, achieved) for the Decades level ---------------------
  const decades = []
  for (let ds = Math.floor(start / 10) * 10; ds <= end; ds += 10) {
    const a = Math.max(ds, start)
    const b = Math.min(ds + 9, end)
    const items = []
    for (let y = a; y <= b; y++) items.push(...(byYear.get(y) || []))
    const live = items.filter(i => i.status !== 'dropped' && i.state !== 'dropped')
    const achieved = live.filter(i => i.state === 'achieved').length
    const top = biggest(items)
    const progress = live.length ? `${achieved} of ${live.length} achieved` : 'nothing planned'
    const g = groupState(items, top)
    decades.push({ key: `d${ds}`, decade: ds, x: X((a + b + 1) / 2), count: live.length, achieved, progress, top, openYear: top ? top.year : a, state: g.state, percent: g.percent, match: anyMatch(items) })
  }

  // Items: a marker on the line for each, a card / pill where there's room.
  // Decades shows summary nodes only, so items fade out as it takes over.
  const itemOpacity = 1 - w.decades
  const allItems = []
  for (let y = start; y <= end; y++) allItems.push(...(byYear.get(y) || []))
  const placements = itemOpacity > 0.02 ? placeItems(allItems, { X, vh }) : []
  const markers = []
  const cards = []
  for (const p of placements) {
    if (!inView(p.x, PILL_MAX_W + FULL_W)) continue
    const match = matchesFilter(p.item, filter)
    const loose = !p.item.month
    markers.push({ key: `k${p.item.key}`, item: p.item, x: p.x, loose, mode: p.mode, match, opacity: itemOpacity })
    if (p.mode !== 'marker') cards.push({ key: p.item.key, item: p.item, x: p.x, mode: p.mode, side: p.side, lane: p.lane, d: p.d, a: p.a, w: p.w, h: p.h, loose, match, opacity: itemOpacity })
  }

  // Year nodes -----------------------------------------------------------------
  const years = []
  const labels = []
  for (let y = start; y <= end; y++) {
    const x = X(y)
    if (!inView(x)) continue
    const items = byYear.get(y) || []
    const { lead, count } = pickLead(items)
    const age = ageIn(y, birthYear)
    const kidAges = kidsAgesIn(y, kidYears)
    const child = kidsText(kidAges)
    const big = !monthsDominant && !!lead
    const lines = [String(y)]
    if (showMeta) {
      if (big) {
        const meta = [age != null ? `age ${age}` : null, child].filter(Boolean).join(' · ')
        if (meta) lines.push(meta)
      } else {
        if (age != null) lines.push(String(age))
        if (child) lines.push(child)
      }
    }
    const label = {
      key: `yl${y}`, x, side: 'down', lines, big, year: y,
      kind: monthsDominant ? 'mark' : big ? (lead.major ? 'big' : 'ev') : 'yr',
      w: yearLabelW(lines, big),
      priority: (lead ? 4 : 2) + (y % 10 === 0 ? 1 : y % 5 === 0 ? 0.5 : 0) + (y === today ? 3 : y === start ? 1 : 0),
    }
    labels.push(label)
    // Each item has its own marker now, so the year node is a plain tick
    // (its state is only read out to screen readers).
    const g = items.length ? groupState(items, lead) : { state: null, percent: null }
    years.push({
      year: y, x, lead, count, age, child, kidAges, label,
      state: g.state, percent: g.percent,
      match: anyMatch(items), today: y === today,
    })
  }

  // Decade nodes (visible while Decades shows) ------------------------------------
  const decadeNodes = []
  if (w.decades > 0.02) {
    for (const d of decades) {
      if (!inView(d.x)) continue
      const label = {
        key: `dl${d.decade}`, x: d.x, side: 'down', lines: [`${d.decade}s`, d.progress], kind: 'dec', year: d.openYear,
        big: true, w: Math.max(textW(`${d.decade}s`, 17), textW(d.progress, 6.6)) + 16,
        priority: decadesDominant ? 9 : -1,
      }
      if (decadesDominant) labels.push(label)
      else label.visible = false
      decadeNodes.push({ ...d, label, opacity: w.decades })
    }
  }

  // Month ticks ------------------------------------------------------------------
  const months = []
  if (w.monthTicks > 0.02) {
    for (let y = start; y <= end; y++) {
      if (!inView(X(y), ppy)) continue
      for (let m = 2; m <= 12; m++) {
        const x = X(y + (m - 1) / 12)
        if (!inView(x)) continue
        const label = {
          key: `ml${y}-${m}`, x, side: 'down', lines: [MONTHS[m - 1].toUpperCase()], big: false, kind: 'mon', year: y,
          w: textW('MMM', 11) + 14, priority: w.monthTicks >= 0.5 ? 1 : -1,
        }
        if (w.monthTicks >= 0.5) labels.push(label)
        else label.visible = false
        months.push({ key: `m${y}-${m}`, x, year: y, month: m, label, opacity: w.monthTicks })
      }
    }
  }

  placeLabels(labels)

  // Phases -----------------------------------------------------------------------
  const sorted = [...(phases || [])].sort((a, b) => a.start_year - b.start_year)
  const bands = []
  const phaseLabels = []
  sorted.forEach((p, i) => {
    const a = Math.max(p.start_year, start)
    const b = Math.min(sorted[i + 1]?.start_year ?? end + 1, end + 1)
    if (b <= a) return
    const x0 = X(a)
    const x1 = X(b)
    const text = `${p.numeral ? `${p.numeral} · ` : ''}${p.name}`
    const tw = textW(text, 10.5) + 16
    bands.push({ key: `b${p.id ?? i}`, x0, x1, index: i, opacity: w.phaseBands })
    const shown = phaseLabelAt(a, sorted, start)
    if (shown !== p) return
    // Zoomed out, a phase is named centred over its band (only if it fits
    // inside it); otherwise at its first year, as before.
    if (decadesDominant) phaseLabels.push({ key: `pl${p.id ?? i}`, x: (x0 + x1) / 2 - tw / 2, w: tw, text, sep: x0, fits: x1 - x0 >= tw + 8 })
    else phaseLabels.push({ key: `pl${p.id ?? i}`, x: x0, w: tw, text, sep: x0, fits: true })
  })
  // top-row phase labels: drop any that don't fit or would hit the previous one
  let lastEnd = -Infinity
  for (const l of phaseLabels) {
    l.visible = l.fits && l.x >= lastEnd
    if (l.visible) lastEnd = l.x + l.w + 8
  }

  return {
    width: trackWidth(range, ppy, vw),
    weights: w,
    level: levelFor(ppy),
    cards,
    markers,
    labels: labels.filter(l => l.visible),
    years,
    decades: decadeNodes,
    months,
    bands: bands.filter(b => b.x1 >= left - margin && b.x0 <= left + vw + margin),
    phaseLabels: phaseLabels.filter(l => inView(l.x) || inView(l.sep)),
    nowX: X(today + ((todayMonth - 1) / 12) * w.months),
    todayX: X(today),
  }
}
