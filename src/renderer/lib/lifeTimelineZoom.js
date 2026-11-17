// Semantic zoom for the Life Timeline line. Everything is driven by one
// number, ppy (pixels per year): node positions, which level of detail shows
// (Decades / Years / Months) and how big each card can be. Pure functions,
// tested in lifeTimelineZoom.test.js.
import { pickLead, ageIn, childAgeIn, phaseLabelAt, MONTHS } from './lifeTimeline.js'

export const PRESETS = { decades: 22, years: 128, months: 1150 }
export const MIN_PPY = 8
export const MAX_PPY = 2600
export const PAD_LEFT = 90

export const CARD_W = 180
const CARD_GAP = 16

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

// ── Card slots ─────────────────────────────────────────────────────────────
// Each slot gets the largest scale (0..1) at which its card can't overlap the
// nearest card on the same side of the line: width <= distance - gap to both
// neighbours, so two neighbours can never both reach past their midpoint.
function scaleSlots(slots) {
  const sides = { up: [], down: [] }
  slots.forEach((s, i) => { s.side = i % 2 ? 'down' : 'up'; sides[s.side].push(s) })
  for (const list of Object.values(sides)) {
    list.forEach((s, i) => {
      const prev = i > 0 ? s.x - list[i - 1].x : Infinity
      const next = i < list.length - 1 ? list[i + 1].x - s.x : Infinity
      s.scale = clamp((Math.min(prev, next) - CARD_GAP) / CARD_W, 0, 1)
    })
  }
  return slots
}

const cardOpacity = (scale, weight) => smoothstep(0.42, 0.72, scale) * weight

function biggest(items) {
  const live = items.filter(i => i.status !== 'dropped')
  if (!live.length) return null
  return live.find(i => i.major)
    || [...live].sort((a, b) => (b.raw?.amount ?? b.raw?.target_amount ?? 0) - (a.raw?.amount ?? a.raw?.target_amount ?? 0))[0]
}

// ── Labels ─────────────────────────────────────────────────────────────────
// Rough text widths (Cinzel digits / Plus Jakarta Sans) — generous on purpose.
const textW = (str, px) => String(str).length * px
const yearLabelW = (lines, big) => Math.max(textW('0000', big ? 13.5 : 9.5), ...lines.slice(1).map(l => textW(l, 6.4))) + 10

// Greedy by priority: keep a label only if its box clears every kept label and
// every obstacle (card connectors) on the same side. Guarantees no overlap.
function placeLabels(labels, obstacles) {
  const kept = { up: [], down: [] }
  const order = [...labels].sort((a, b) => b.priority - a.priority || a.x - b.x)
  for (const l of order) {
    const a = l.x - l.w / 2
    const b = l.x + l.w / 2
    const side = kept[l.side]
    const hit = side.some(k => a < k.b + 6 && b > k.a - 6)
      || (obstacles[l.side] || []).some(o => a < o + 5 && b > o - 5)
    l.visible = !hit
    if (!hit) side.push({ a, b })
  }
  return labels
}

// ── Layout ─────────────────────────────────────────────────────────────────
// byYear: Map(year -> items) from groupByYear(buildItems(data)).
export function layoutLine({ range, byYear, phases, birthYear, childBirthYear, ppy, left, vw, todayMonth = 1 }) {
  const { start, end } = range
  const w = weights(ppy)
  const X = (yf) => xOf(yf, ppy, start)
  const margin = Math.max(vw, 400)
  const inView = (x, pad = 0) => x >= left - margin - pad && x <= left + vw + margin + pad
  const monthsDominant = w.months >= 0.5
  const decadesDominant = w.decades >= 0.5
  const showMeta = ppy >= 60

  // Card sets ----------------------------------------------------------------
  const yearSlots = []
  const monthSlots = []
  for (let y = start; y <= end; y++) {
    const items = byYear.get(y) || []
    const { lead, count } = pickLead(items)
    if (lead) yearSlots.push({ key: `y${y}`, set: 'years', year: y, x: X(y), item: lead, extra: count > 1 ? `+ ${count - 1} more this year` : null })
    const groups = new Map()
    for (const it of items) {
      const k = it.month ?? 0
      if (!groups.has(k)) groups.set(k, [])
      groups.get(k).push(it)
    }
    for (const k of [...groups.keys()].sort((a, b) => a - b)) {
      const { lead: ml, count: mc } = pickLead(groups.get(k))
      if (!ml) continue
      monthSlots.push({
        key: `m${y}-${k}`, set: 'months', year: y, month: k || null, loose: k === 0,
        x: X(y + (k ? (k - 1) / 12 : 0)), item: ml,
        tag: k === 0 ? 'Sometime this year' : null,
        extra: mc > 1 ? `+ ${mc - 1} more` : null,
      })
    }
  }
  const decadeSlots = []
  const decades = []
  for (let ds = Math.floor(start / 10) * 10; ds <= end; ds += 10) {
    const a = Math.max(ds, start)
    const b = Math.min(ds + 9, end)
    const items = []
    for (let y = a; y <= b; y++) items.push(...(byYear.get(y) || []))
    const live = items.filter(i => i.status !== 'dropped')
    const top = biggest(items)
    const x = X((a + b + 1) / 2)
    decades.push({ key: `d${ds}`, decade: ds, x, count: live.length, top, openYear: top ? top.year : a })
    if (top) {
      decadeSlots.push({
        key: `d${ds}`, set: 'decades', year: top.year, x,
        item: { ...top, amountText: `${live.length} planned`, noteText: top.amountText || null },
      })
    }
  }
  scaleSlots(yearSlots)
  scaleSlots(monthSlots)
  scaleSlots(decadeSlots)

  const cards = []
  const push = (slots, weight) => {
    for (const s of slots) {
      const opacity = cardOpacity(s.scale, weight)
      if (opacity < 0.02 || !inView(s.x, CARD_W)) continue
      cards.push({ ...s, opacity })
    }
  }
  push(decadeSlots, w.decades)
  push(yearSlots, w.years)
  push(monthSlots, w.months)

  // Connectors of clearly visible cards are obstacles for labels on that side.
  const obstacles = { up: [], down: [] }
  for (const c of cards) if (c.opacity > 0.25) obstacles[c.side].push(c.x)

  // Year nodes -----------------------------------------------------------------
  const yearCardSide = new Map(yearSlots.map(s => [s.year, s.side]))
  const looseSide = new Map(monthSlots.filter(s => s.loose).map(s => [s.year, s.side]))
  const years = []
  const labels = []
  for (let y = start; y <= end; y++) {
    const x = X(y)
    if (!inView(x)) continue
    const items = byYear.get(y) || []
    const { lead, count } = pickLead(items)
    const age = ageIn(y, birthYear)
    const child = childAgeIn(y, childBirthYear)
    const cardSide = monthsDominant ? looseSide.get(y) : decadesDominant ? null : yearCardSide.get(y)
    const big = !monthsDominant && !!lead
    const lines = [String(y)]
    if (showMeta) {
      if (big) {
        const meta = [age != null ? `age ${age}` : null, child != null ? `child ${child}` : null].filter(Boolean).join(' · ')
        if (meta) lines.push(meta)
      } else {
        if (age != null) lines.push(String(age))
        if (child != null) lines.push(`child ${child}`)
      }
    }
    const label = {
      key: `yl${y}`, x, side: cardSide === 'down' ? 'up' : 'down', lines, big,
      w: yearLabelW(lines, big),
      priority: (lead ? 4 : 2) + (y % 10 === 0 ? 1 : y % 5 === 0 ? 0.5 : 0) + (y === start ? 3 : 0),
    }
    labels.push(label)
    years.push({
      year: y, x, lead, count, age, child, label,
      ev: big, major: big && !!lead?.major, mark: monthsDominant,
    })
  }

  // Decade nodes (visible while Decades shows) ------------------------------------
  const decadeNodes = []
  if (w.decades > 0.02) {
    for (const d of decades) {
      if (!inView(d.x)) continue
      const label = {
        key: `dl${d.decade}`, x: d.x, side: 'down', lines: [`${d.decade}s`, `${d.count} planned`],
        big: true, w: Math.max(textW(`${d.decade}s`, 14), textW(`${d.count} planned`, 6.4)) + 12,
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
    const has = new Set(monthSlots.filter(s => !s.loose).map(s => `${s.year}-${s.month}`))
    for (let y = start; y <= end; y++) {
      if (!inView(X(y), ppy)) continue
      for (let m = 2; m <= 12; m++) {
        const x = X(y + (m - 1) / 12)
        if (!inView(x)) continue
        const label = {
          key: `ml${y}-${m}`, x, side: 'down', lines: [MONTHS[m - 1].toUpperCase()], big: false,
          w: textW('MMM', 11) + 8, priority: w.monthTicks >= 0.5 ? 1 : -1,
        }
        if (w.monthTicks >= 0.5) labels.push(label)
        else label.visible = false
        months.push({ key: `m${y}-${m}`, x, year: y, month: m, has: monthsDominant && has.has(`${y}-${m}`), label, opacity: w.monthTicks })
      }
    }
  }

  placeLabels(labels, obstacles)

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
    years,
    decades: decadeNodes,
    months,
    bands: bands.filter(b => b.x1 >= left - margin && b.x0 <= left + vw + margin),
    phaseLabels: phaseLabels.filter(l => inView(l.x) || inView(l.sep)),
    nowX: X(start + ((todayMonth - 1) / 12) * w.months),
  }
}
