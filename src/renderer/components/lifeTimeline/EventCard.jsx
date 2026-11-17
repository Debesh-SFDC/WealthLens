// One card on the line. Assumed dates get the dashed cool-blue style; goals
// and committed events are solid gold. Renders as a <span> inside a year node
// (the node itself is the button) or as a <button> in the year view.
export default function EventCard({ item, extra, as = 'span', onClick, showTag = false }) {
  if (!item) return null
  const cls = ['card']
  if (item.assumed) cls.push('assumed')
  if (item.kind === 'goal') cls.push('goal')
  if (item.status === 'dropped') cls.push('dropped')

  let tag = null
  if (showTag) {
    if (item.kind === 'goal') tag = 'Goal'
    else if (item.kind === 'retirement') tag = 'Retirement'
    else if (item.status === 'done') tag = 'Done'
    else if (item.status === 'dropped') tag = 'Dropped'
    else if (item.assumed) tag = 'Assumed date'
  }

  const body = (
    <>
      {tag && <span className={`tag${item.status === 'done' ? ' done' : ''}`}>{tag}</span>}
      <strong>{item.title}</strong>
      {item.amountText && <em>{item.amountText}</em>}
      {item.noteText && <small>{item.noteText}</small>}
      {extra && <small>{extra}</small>}
    </>
  )

  if (as === 'button') {
    const label = item.kind === 'goal' ? `Open goal ${item.raw.title}`
      : item.kind === 'retirement' ? `${item.title}. Change it in Settings`
      : `Edit ${item.title}`
    return (
      <button type="button" className={cls.join(' ')} onClick={onClick} aria-label={label}>
        {body}
      </button>
    )
  }
  return <span className={cls.join(' ')}>{body}</span>
}
