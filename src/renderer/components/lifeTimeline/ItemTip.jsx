import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import EventCard from './EventCard'

const W = 240
const MARGIN = 12

// Where the tooltip goes inside the stage: above its anchor (a marker or a
// pill) when there's room, else below; always kept inside the stage.
// anchor / stage: DOMRects.
export function placeTip({ anchor, stage, w, h }) {
  const width = Math.min(w, stage.width - MARGIN * 2)
  const ax = anchor.left - stage.left + anchor.width / 2
  const ay = anchor.top - stage.top
  const left = Math.min(stage.width - width - MARGIN, Math.max(MARGIN, ax - width / 2))
  const above = ay - 10 - h
  const below = ay + anchor.height + 10
  let top = above >= MARGIN ? above : below
  top = Math.min(stage.height - MARGIN - h, Math.max(MARGIN, top))
  return { left, top, width }
}

// The full card of one item, shown when its marker (no room for a card at
// this zoom) or its compact pill is hovered or tapped. Selecting the card or
// "Open year" opens the year view; Escape or a click outside closes it.
export default function ItemTip({ item, anchorEl, stageEl, onOpenYear, onMark, onClose, onHoverIn, onHoverOut }) {
  const ref = useRef(null)
  const [pos, setPos] = useState({ left: -9999, top: -9999, width: W })

  useLayoutEffect(() => {
    if (!anchorEl || !stageEl || !ref.current) return
    setPos(placeTip({ anchor: anchorEl.getBoundingClientRect(), stage: stageEl.getBoundingClientRect(), w: W, h: ref.current.offsetHeight }))
  }, [anchorEl, stageEl, item])

  useEffect(() => {
    const onDown = (e) => {
      if (ref.current?.contains(e.target) || anchorEl?.contains(e.target)) return
      onClose()
    }
    const onKey = (e) => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); onClose() } }
    document.addEventListener('pointerdown', onDown, true)
    document.addEventListener('keydown', onKey, true)
    return () => {
      document.removeEventListener('pointerdown', onDown, true)
      document.removeEventListener('keydown', onKey, true)
    }
  }, [anchorEl, onClose])

  return (
    <div
      ref={ref}
      className="lt-tip2"
      role="dialog"
      aria-label={item.raw?.title ?? item.title}
      style={{ left: pos.left, top: pos.top, width: pos.width }}
      onPointerEnter={onHoverIn}
      onPointerLeave={onHoverOut}
      onPointerDown={(e) => e.stopPropagation()} // not the start of a pan
    >
      <div className="lt-tip2-card" onClick={onOpenYear}>
        <EventCard item={item} onMark={onMark} />
      </div>
      <button type="button" className="lt-btn lt-tip2-open" onClick={onOpenYear}>Open {item.year}</button>
    </div>
  )
}
