import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { Marker } from './LineCard'
import { MONTHS, STATE_LABELS, canMark, fmtDate, sortForCard, reachedText } from '../../lib/lifeTimeline'

const W = 320
const MARGIN = 12

// Where the preview goes inside the stage. anchor / stage: DOMRects. A card
// above the line keeps its bottom edge (grows upward), a card below keeps its
// top edge; either is pushed back inside the stage, and when it still doesn't
// fit it is capped at the stage height and scrolls. A year node (keyboard)
// opens below the node, flipped above when there's more room there.
export function placePreview({ anchor, stage, w, h, side }) {
  const sw = stage.width
  const sh = stage.height
  const width = Math.min(w, sw - MARGIN * 2)
  const ax = anchor.left - stage.left
  const ay = anchor.top - stage.top
  const left = Math.min(sw - width - MARGIN, Math.max(MARGIN, ax + anchor.width / 2 - width / 2))
  const maxHeight = sh - MARGIN * 2
  const height = Math.min(h, maxHeight)
  let top
  if (side === 'up') top = ay + anchor.height - height
  else if (side === 'down') top = ay
  else {
    const below = ay + anchor.height + 8
    const above = ay - 8 - height
    top = below + height <= sh - MARGIN || sh - below < ay ? below : above
    if (top !== below && above < MARGIN) top = below
  }
  top = Math.min(sh - MARGIN - height, Math.max(MARGIN, top))
  return { left, top, width, maxHeight }
}

// Hover (mouse) or first tap (touch) on a year card, or Space on a focused
// year node: every item that year grouped by month, with status, amount, goal
// progress and a Mark achieved button per line. "Open year" opens the year
// view. Escape or a click outside closes it; focus returns to the year node
// when it was opened from the keyboard.
export default function YearPreview({
  year, items, anchorEl, side, stageEl, focusOnOpen, onOpenYear, onMark, onClose, onHoverIn, onHoverOut,
}) {
  const ref = useRef(null)
  const [pos, setPos] = useState({ left: -9999, top: -9999, width: W, maxHeight: 400 })
  const live = sortForCard(items)
  const dropped = (items || []).filter(i => !live.includes(i))
  const groups = []
  for (const it of [...live, ...dropped]) {
    const k = it.status === 'dropped' || it.state === 'dropped' ? 'dropped' : it.month ?? 0
    let g = groups.find(x => x.k === k)
    if (!g) { g = { k, items: [] }; groups.push(g) }
    g.items.push(it)
  }
  const head = (k) => (k === 'dropped' ? 'Dropped' : k === 0 ? 'Sometime this year' : MONTHS[k - 1])

  useLayoutEffect(() => {
    if (!anchorEl || !stageEl || !ref.current) return
    setPos(placePreview({
      anchor: anchorEl.getBoundingClientRect(), stage: stageEl.getBoundingClientRect(),
      w: W, h: ref.current.scrollHeight, side,
    }))
  }, [anchorEl, stageEl, side, items])

  useEffect(() => {
    if (focusOnOpen) ref.current?.querySelector('button')?.focus({ preventScroll: true })
    const onDown = (e) => {
      if (ref.current?.contains(e.target) || anchorEl?.contains(e.target)) return
      onClose(false)
    }
    const onKey = (e) => {
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); onClose(true) }
    }
    document.addEventListener('pointerdown', onDown, true)
    document.addEventListener('keydown', onKey, true)
    return () => {
      document.removeEventListener('pointerdown', onDown, true)
      document.removeEventListener('keydown', onKey, true)
    }
  }, [anchorEl, focusOnOpen, onClose])

  const titleOf = (it) => it.raw?.title ?? it.title
  return (
    <div
      ref={ref}
      className="lt-prev"
      role="dialog"
      aria-label={`${year}: ${live.length} planned`}
      style={{ left: pos.left, top: pos.top, width: pos.width, maxHeight: pos.maxHeight }}
      onPointerEnter={onHoverIn}
      onPointerLeave={onHoverOut}
      onPointerDown={(e) => e.stopPropagation()} // not the start of a pan
    >
      <div className="lt-prev-h">
        <b>{year}</b>
        <span>{live.length} planned</span>
      </div>
      {groups.map(g => (
        <div key={g.k} className="lt-prev-g">
          <h3>{head(g.k)}</h3>
          <ul>
            {g.items.map(it => {
              const st = it.state || 'upcoming'
              const markable = canMark(it)
              const undo = st === 'achieved'
              return (
                <li key={it.key} className={`lt-prev-row st-${st}${it.assumed ? ' assumed' : ''}`}>
                  <Marker item={it} />
                  <div className="lt-prev-body">
                    <span className="t">{it.title}</span>
                    <span className="m">
                      {it.amountText && <em>{it.amountText}</em>}
                      {st === 'achieved' && it.achievedAt ? `Achieved ${fmtDate(it.achievedAt)}`
                        : st !== 'upcoming' ? STATE_LABELS[st] : it.assumed ? 'Assumed date' : null}
                    </span>
                    {it.percent != null && st !== 'achieved' && (
                      <span className="prog" role="img" aria-label={`${it.percent}% of target`}>
                        <span className="bar"><i style={{ width: `${it.percent}%` }} /></span>
                        <b>{it.percent}%</b>
                      </span>
                    )}
                    {it.reached && markable && (
                      <button type="button" className="lt-reached" onClick={() => onMark(it)}>
                        {reachedText(it)}
                      </button>
                    )}
                  </div>
                  {markable && (
                    <button
                      type="button"
                      className={`lt-mark${undo ? ' undo' : ''}`}
                      aria-label={undo ? `Undo achieved: ${titleOf(it)}` : `Mark achieved: ${titleOf(it)}`}
                      title={undo ? 'Undo achieved' : 'Mark achieved'}
                      aria-haspopup={undo ? undefined : 'dialog'}
                      onClick={() => onMark(it)}
                    >
                      {undo ? 'Undo' : (
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><polyline points="5 12.5 10 17.5 19 7" /></svg>
                      )}
                    </button>
                  )}
                </li>
              )
            })}
          </ul>
        </div>
      ))}
      <div className="lt-prev-f">
        <button type="button" className="lt-btn gold" onClick={onOpenYear}>Open year</button>
      </div>
    </div>
  )
}
