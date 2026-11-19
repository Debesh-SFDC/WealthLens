import { canMark, fmtDate, markerFor } from '../../lib/lifeTimeline'

const Check = ({ w = 3.4 }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={w} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <polyline points="5 12.5 10 17.5 19 7" />
  </svg>
)

// Status marker: achieved check, overdue amber, in-progress ring, assumed
// dashed, upcoming outline. Used inside pills.
export function Marker({ item }) {
  const m = markerFor(item)
  return (
    <i className={`lt-mk ${m}${item.reached ? ' reached' : ''}`} style={m === 'progress' ? { '--p': item.percent ?? 0 } : undefined} aria-hidden="true">
      {m === 'achieved' && <Check />}
    </i>
  )
}

// One item's card in a lane on the line: fixed height (layoutLine's FULL_H)
// so lanes stack predictably — title, amount or progress, then one status
// line (achieved date, progress bar, overdue chip, or the note). Decorative
// for screen readers (aria-hidden on the line); the year node and the year
// view are the accessible paths. The round Mark achieved button is
// pointer-only here, as before.
export function LaneCard({ item, loose, onMark }) {
  const st = item.state || 'upcoming'
  const cls = ['card', 'lt-lcard', `st-${st}`]
  if (item.assumed) cls.push('assumed')
  if (item.kind === 'goal' || item.goal) cls.push('goal')
  if (item.reached) cls.push('reached')
  let status
  if (st === 'achieved') status = <small className="ach"><Check w={2.4} />{item.achievedAt ? `Achieved ${fmtDate(item.achievedAt)}` : 'Achieved'}</small>
  else if (st === 'in_progress' && item.percent != null) {
    status = (
      <span className="prog">
        <span className="bar"><i style={{ width: `${item.percent}%` }} /></span>
        <b>{item.percent}%</b>
      </span>
    )
  } else if (st === 'overdue') status = <span className="chip-overdue">Overdue</span>
  else status = <small>{loose ? 'Sometime this year' : item.assumed ? 'Assumed date' : item.noteText || ''}</small>
  const markable = onMark && canMark(item)
  const undo = st === 'achieved'
  return (
    <span className="cardbox">
      <span className={cls.join(' ')}>
        <strong>{item.title}</strong>
        <em>{item.amountText || ' '}</em>
        {status}
      </span>
      {markable && (
        <button
          type="button"
          className={`lt-mark${undo ? ' undo' : ''}`}
          tabIndex={-1}
          aria-label={undo ? `Undo achieved: ${item.raw?.title ?? item.title}` : `Mark achieved: ${item.raw?.title ?? item.title}`}
          title={undo ? 'Undo achieved' : 'Mark achieved'}
          onPointerDown={(e) => e.stopPropagation()} // not the start of a pan
          onClick={(e) => { e.stopPropagation(); e.preventDefault(); onMark(item, e.currentTarget) }}
        >
          {undo ? 'Undo' : <Check w={2.4} />}
        </button>
      )}
    </span>
  )
}

// Compact pill when a full card has no room at this zoom: status icon and a
// short title. Hover or tap shows the full card.
export function LanePill({ item, width }) {
  return (
    <span className={`lt-pill st-${item.state || 'upcoming'}${item.assumed ? ' assumed' : ''}${item.reached ? ' reached' : ''}`} style={{ width }}>
      <Marker item={item} />
      <span className="t">{item.raw?.title ?? item.title}</span>
    </span>
  )
}
