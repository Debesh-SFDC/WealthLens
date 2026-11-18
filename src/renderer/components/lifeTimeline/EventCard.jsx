import { canMark, fmtDate } from '../../lib/lifeTimeline'

const CheckIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <polyline points="5 12.5 10 17.5 19 7" />
  </svg>
)

// One card on the line or in the year view. Assumed dates get the dashed
// cool-blue style; the achievement state (item.state, from the server) adds
// its own look on top: achieved (gold, "Achieved 12 Mar 2027"), in progress
// (progress bar), overdue (amber chip), dropped (faded, struck through).
//
// as="span": inside a line card (the year node is the accessible control, so
// the line's mark button is pointer-only: tabIndex -1). as="button": the year
// view, where the card and its mark button are both in the tab order.
// onMark(item, buttonEl) is called by the round "Mark achieved" / "Undo" button.
export default function EventCard({ item, extra, as = 'span', onClick, showTag = false, onMark }) {
  if (!item) return null
  const st = item.state || 'upcoming'
  const cls = ['card', `st-${st}`]
  if (item.assumed) cls.push('assumed')
  if (item.kind === 'goal') cls.push('goal')
  if (st === 'dropped' || item.status === 'dropped') cls.push('dropped')

  let tag = null
  if (showTag) {
    if (item.kind === 'goal') tag = 'Goal'
    else if (item.kind === 'retirement') tag = 'Retirement'
    else if (st === 'achieved') tag = 'Achieved'
    else if (st === 'dropped') tag = 'Dropped'
    else if (item.assumed) tag = 'Assumed date'
  }

  const achievedText = st === 'achieved'
    ? (item.achievedAt ? `Achieved ${fmtDate(item.achievedAt)}` : 'Achieved')
    : null

  const body = (
    <>
      {(tag || st === 'overdue') && (
        <span className="tags">
          {tag && <span className={`tag${st === 'achieved' && tag === 'Achieved' ? ' done' : ''}`}>{tag}</span>}
          {st === 'overdue' && <span className="chip-overdue">Overdue</span>}
        </span>
      )}
      <strong>{item.title}</strong>
      {item.amountText && <em>{item.amountText}</em>}
      {st === 'in_progress' && item.percent != null && (
        <span className="prog" role="img" aria-label={`${item.percent}% saved`}>
          <span className="bar"><i style={{ width: `${item.percent}%` }} /></span>
          <b>{item.percent}%</b>
        </span>
      )}
      {item.noteText && <small>{item.noteText}</small>}
      {extra && <small>{extra}</small>}
      {achievedText && <small className="ach"><CheckIcon />{achievedText}</small>}
    </>
  )

  const markable = onMark && canMark(item)
  const undo = st === 'achieved'
  const mark = markable && (
    <button
      type="button"
      className={`lt-mark${undo ? ' undo' : ''}`}
      tabIndex={as === 'span' ? -1 : 0}
      aria-label={undo ? `Undo achieved: ${item.raw?.title ?? item.title}` : `Mark achieved: ${item.raw?.title ?? item.title}`}
      title={undo ? 'Undo achieved' : 'Mark achieved'}
      aria-haspopup={undo ? undefined : 'dialog'}
      onPointerDown={(e) => e.stopPropagation()} // not the start of a pan
      onClick={(e) => { e.stopPropagation(); e.preventDefault(); onMark(item, e.currentTarget) }}
    >
      {undo ? 'Undo' : <CheckIcon />}
    </button>
  )

  let card
  if (as === 'button') {
    const label = item.kind === 'goal' ? `Open goal ${item.raw.title}`
      : item.kind === 'retirement' ? `${item.title}. Change it in Settings`
      : `Edit ${item.title}`
    const state = st === 'upcoming' ? '' : `, ${achievedText || (st === 'in_progress' ? `in progress, ${item.percent}%` : st)}`
    card = (
      <button type="button" className={cls.join(' ')} onClick={onClick} aria-label={label + state}>
        {body}
      </button>
    )
  } else {
    card = <span className={cls.join(' ')}>{body}</span>
  }
  if (!markable) return card
  const Box = as === 'button' ? 'div' : 'span'
  return <Box className="cardbox" data-key={item.key}>{card}{mark}</Box>
}
