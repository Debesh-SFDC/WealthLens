import { useEffect, useMemo, useRef } from 'react'
import EventCard from './EventCard'
import { pickLead, ageIn, childAgeIn, phaseLabelAt } from '../../lib/lifeTimeline'

const DRAG_THRESHOLD = 6

// The all-years line: every year from range.start to range.end is a node.
// Years with items are wide nodes whose lead card alternates above/below the
// line; empty years are small ticks. Pans by mouse drag, touch swipe (native
// scrolling) and the mouse wheel; a drag never counts as a click.
export default function YearTrack({
  range, byYear, phases, birthYear, childBirthYear, zoomed, scrollerRef, trackRef, onOpenYear,
}) {
  const drag = useRef({ down: null, dragged: false })

  const nodes = useMemo(() => {
    const out = []
    let flip = 0
    for (let y = range.start; y <= range.end; y++) {
      const { lead, count } = pickLead(byYear.get(y))
      out.push({
        year: y,
        lead,
        count,
        side: lead ? (flip++ % 2 ? 'down' : 'up') : null,
        phase: phaseLabelAt(y, phases, range.start),
        age: ageIn(y, birthYear),
        child: childAgeIn(y, childBirthYear),
      })
    }
    return out
  }, [range.start, range.end, byYear, phases, birthYear, childBirthYear])

  // Mouse drag-to-pan. Touch and pen use native overflow scrolling
  // (touch-action: pan-x), which never fires a click after a swipe.
  useEffect(() => {
    const scroller = scrollerRef.current
    if (!scroller) return
    const onDown = (e) => {
      drag.current.dragged = false
      if (e.pointerType !== 'mouse' || e.button !== 0) return
      drag.current.down = { x: e.clientX, s: scroller.scrollLeft }
    }
    const onMove = (e) => {
      const d = drag.current.down
      if (!d) return
      const dx = e.clientX - d.x
      if (!drag.current.dragged && Math.abs(dx) <= DRAG_THRESHOLD) return
      drag.current.dragged = true
      scroller.classList.add('drag')
      scroller.scrollLeft = d.s - dx
    }
    const onUp = () => {
      drag.current.down = null
      scroller.classList.remove('drag')
    }
    // Vertical wheel scrolls the line sideways
    const onWheel = (e) => {
      if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) {
        scroller.scrollLeft += e.deltaY
        e.preventDefault()
      }
    }
    scroller.addEventListener('pointerdown', onDown)
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onUp)
    scroller.addEventListener('wheel', onWheel, { passive: false })
    return () => {
      scroller.removeEventListener('pointerdown', onDown)
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onUp)
      scroller.removeEventListener('wheel', onWheel)
    }
  }, [scrollerRef])

  // Swallow the click that ends a drag
  const onClickCapture = (e) => {
    if (drag.current.dragged) {
      e.preventDefault()
      e.stopPropagation()
      drag.current.dragged = false
    }
  }

  return (
    <div className="lt-scroller" ref={scrollerRef} aria-hidden={zoomed || undefined}>
      <div
        className={`lt-track${zoomed ? ' zoom' : ''}`}
        ref={trackRef}
        onClickCapture={onClickCapture}
        role="group"
        aria-label="Years"
      >
        {nodes.map(n => {
          const meta = [
            n.age != null ? `age ${n.age}` : null,
            n.child != null ? `child ${n.child}` : null,
          ].filter(Boolean)
          const cls = ['lt-yr']
          if (n.lead) cls.push('ev', n.side)
          if (n.lead?.major) cls.push('big')
          if (n.phase) cls.push('ph')
          const label = [String(n.year), ...meta,
            n.count ? `${n.count} planned` : 'nothing planned',
            n.year === range.start ? 'you are here' : null].filter(Boolean).join(', ')
          return (
            <button
              key={n.year}
              type="button"
              className={cls.join(' ')}
              data-y={n.year}
              aria-label={label}
              tabIndex={zoomed ? -1 : 0}
              onClick={(e) => onOpenYear(n.year, e.currentTarget)}
            >
              {n.phase && <span className="lt-phase">{n.phase.numeral ? `${n.phase.numeral} · ` : ''}{n.phase.name}</span>}
              {n.lead && (
                <EventCard item={n.lead} extra={n.count > 1 ? `+ ${n.count - 1} more this year` : null} />
              )}
              <span className="dot" />
              <span className="lbl">
                <b>{n.year}</b>
                {n.lead
                  ? meta.length > 0 && <i>{meta.join(' · ')}</i>
                  : <>
                      {n.age != null && <i>{n.age}</i>}
                      {n.child != null && <i>child {n.child}</i>}
                    </>}
              </span>
              {n.year === range.start && <span className="lt-now">You are here</span>}
            </button>
          )
        })}
      </div>
    </div>
  )
}
