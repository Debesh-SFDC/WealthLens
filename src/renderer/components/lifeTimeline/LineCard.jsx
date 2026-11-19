import { MONTHS, markerFor } from '../../lib/lifeTimeline'

const Check = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3.4} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <polyline points="5 12.5 10 17.5 19 7" />
  </svg>
)

// Status marker for one line: achieved check, overdue amber, in-progress
// ring, assumed dashed, upcoming outline. Shared with the year preview.
export function Marker({ item }) {
  const m = markerFor(item)
  return (
    <i className={`lt-mk ${m}${item.reached ? ' reached' : ''}`} style={m === 'progress' ? { '--p': item.percent ?? 0 } : undefined} aria-hidden="true">
      {m === 'achieved' && <Check />}
    </i>
  )
}

// One card on the line (Decades, Years or Months), listing a slot's lines from
// layoutLine: status marker, short month label (blank when none) and title,
// one per line, the first line's amount under it, then "+N more". Decorative
// (aria-hidden on the line): the year node is the accessible control and the
// year preview lists everything with its own buttons.
export default function LineCard({ slot }) {
  const { rows = [], more = 0, tag, noMonth, yearLabels } = slot
  const allAssumed = rows.length > 0 && rows.every(r => r.assumed)
  const label = (it) => (yearLabels ? String(it.year) : it.month ? MONTHS[it.month - 1] : '')
  return (
    <span className={`card multi${allAssumed ? ' assumed' : ''}${yearLabels ? ' yl' : ''}${noMonth ? ' nomon' : ''}`}>
      {tag && <span className="mhead">{tag}</span>}
      {rows.map((it, i) => (
        <span key={it.key} className="mline">
          <span className={`mrow${it.reached ? ' reached' : ''}${it.assumed ? ' assumed' : ''}`}>
            <Marker item={it} />
            {!noMonth && <span className="mmon">{label(it)}</span>}
            <span className="mtitle">{it.title}</span>
          </span>
          {i === 0 && it.amountText && <em className="mamt">{it.amountText}</em>}
        </span>
      ))}
      {more > 0 && <small className="mmore">+{more} more</small>}
    </span>
  )
}
