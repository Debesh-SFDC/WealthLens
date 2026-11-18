// Network view model: phase hubs, events, dated goals, retirement and "you are
// here", plus the edges between them. Pure — the force layout runs in
// NetworkView.jsx. Tested in lifeTimelineNetwork.test.js.
import { buildItems, phaseFor, fmtAmount, fmtDate, MONTHS } from './lifeTimeline.js'

export const CATEGORY_COLORS = {
  career: '#D4AF37',
  family: '#EC8FB0',
  home: '#5FD3A0',
  vehicle: '#F29B5B',
  money: '#B49CFF',
  travel: '#6EC5E9',
  health: '#E86A6A',
  other: '#A0A0A0',
}
export const GOAL_COLOR = '#F0D060'

// Radius by importance: major events and big amounts read as bigger.
function radiusFor(kind, major, amount) {
  if (kind === 'phase') return 24
  if (kind === 'now') return 10
  if (kind === 'retirement') return 15
  let r = 7
  if (major) r += 6
  const a = Number(amount)
  if (Number.isFinite(a) && a > 0) r += Math.min(5, Math.max(0, Math.log10(a) - 4) * 2)
  return r
}

export function buildGraph(data) {
  if (!data) return { nodes: [], links: [], neighbours: new Map() }
  const phases = [...(data.phases || [])].sort((a, b) => a.start_year - b.start_year)
  const nodes = []
  const links = []
  const hubId = (p) => `p${p.id}`

  phases.forEach((p, i) => {
    nodes.push({
      id: hubId(p), kind: 'phase', year: p.start_year, month: null, order: 0,
      title: p.name, numeral: p.numeral, color: '#D4AF37', r: radiusFor('phase'), phase: p,
    })
    if (i > 0) links.push({ source: hubId(phases[i - 1]), target: hubId(p), kind: 'spine' })
  })

  const attach = (node) => {
    const p = phaseFor(node.year, phases)
    node.phase = p
    if (p) links.push({ source: node.id, target: hubId(p), kind: 'phase' })
  }

  for (const it of buildItems(data)) {
    const amount = it.kind === 'goal' ? it.raw.target_amount : it.kind === 'event' ? it.raw.amount : null
    const node = {
      id: it.kind === 'event' ? `e${it.id}` : it.kind === 'goal' ? `g${it.id}` : 'ret',
      kind: it.kind, year: it.year, month: it.month, order: 2,
      title: it.kind === 'goal' ? it.raw.title : it.title,
      emoji: it.kind === 'goal' ? it.raw.emoji : null,
      category: it.kind === 'event' ? it.raw.category : null,
      color: it.kind === 'event' ? (CATEGORY_COLORS[it.raw.category] || CATEGORY_COLORS.other)
        : it.kind === 'goal' ? GOAL_COLOR : '#D4AF37',
      assumed: it.assumed, major: it.major, status: it.status,
      state: it.state, percent: it.percent,
      amountText: fmtAmount(amount) || (it.kind === 'event' ? it.raw.amount_note : null) || (it.kind === 'retirement' ? it.amountText : null),
      r: radiusFor(it.kind, it.major, amount),
      item: it,
    }
    nodes.push(node)
    attach(node)
  }

  const today = data.range.today ?? data.range.start
  const now = { id: 'now', kind: 'now', year: today, month: null, order: 1, title: 'You are here', color: '#F0D060', r: radiusFor('now') }
  nodes.push(now)
  attach(now)

  // "Reached" nodes: achieved items, plus hubs of phases that have begun and
  // "you are here". An edge between two reached nodes is lived history (drawn
  // bright); anything touching the future is dimmer.
  for (const n of nodes) {
    n.reached = n.kind === 'phase' || n.kind === 'now' ? n.year <= today : n.state === 'achieved'
  }
  const byId = new Map(nodes.map(n => [n.id, n]))
  for (const e of data.events || []) {
    if (e.goal_id != null && byId.has(`g${e.goal_id}`)) links.push({ source: `g${e.goal_id}`, target: `e${e.id}`, kind: 'goal' })
    if (e.depends_on_id != null && byId.has(`e${e.depends_on_id}`)) {
      // directed: prerequisite → the event that happens after it
      links.push({ source: `e${e.depends_on_id}`, target: `e${e.id}`, kind: 'dep' })
    }
  }

  for (const l of links) l.past = byId.get(l.source).reached && byId.get(l.target).reached

  const neighbours = new Map(nodes.map(n => [n.id, new Set([n.id])]))
  for (const l of links) {
    neighbours.get(l.source).add(l.target)
    neighbours.get(l.target).add(l.source)
  }

  // Chronological order drives Tab order: year, then month, hubs first in a year.
  nodes.sort((a, b) => a.year - b.year || a.order - b.order || (a.month ?? 0) - (b.month ?? 0) || String(a.id).localeCompare(String(b.id)))
  return { nodes, links, neighbours }
}

export function describeNode(n) {
  const when = n.month ? `${MONTHS[n.month - 1]} ${n.year}` : String(n.year)
  const phase = n.kind === 'phase' ? null : n.phase ? `${n.phase.numeral ? `${n.phase.numeral} · ` : ''}${n.phase.name}` : null
  const title = n.kind === 'phase' ? `${n.numeral ? `${n.numeral} · ` : ''}${n.title}` : n.title
  const it = n.item
  const status = !it ? null
    : n.state === 'achieved' ? (it.achievedAt ? `Achieved ${fmtDate(it.achievedAt)}` : 'Achieved')
    : n.state === 'in_progress' ? `In progress · ${n.percent}%`
    : n.state === 'overdue' ? 'Overdue'
    : n.state === 'dropped' ? 'Dropped' : null
  return { title, when: n.kind === 'phase' ? `From ${n.year}` : when, amount: n.amountText || null, phase, status }
}
