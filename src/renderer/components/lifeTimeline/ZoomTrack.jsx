import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import LineCard from './LineCard'
import YearPreview from './YearPreview'
import { layoutLine } from '../../lib/lifeTimelineZoom'

const HOVER_OPEN_MS = 140
const HOVER_CLOSE_MS = 200

const DRAG_THRESHOLD = 6
const WHEEL_ZOOM_SPEED = 0.0025 // per pixel of deltaY

const NodeLabel = ({ label, className = '' }) => (
  <span className={`lbl ${label.side === 'up' ? 'above' : ''} ${label.visible ? '' : 'off'} ${className}`} aria-hidden="true">
    <b>{label.lines[0]}</b>
    {label.lines.slice(1).map((l, i) => <i key={i}>{l}</i>)}
  </span>
)

// Check badge / progress ring / overdue ring for a node's dot.
const NodeMarks = ({ state, percent }) => (
  <>
    {state === 'in_progress' && percent != null && <span className="ring" style={{ '--p': percent }} />}
    {state === 'achieved' && (
      <span className="chk">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3.2} strokeLinecap="round" strokeLinejoin="round"><polyline points="5 12.5 10 17.5 19 7" /></svg>
      </span>
    )}
  </>
)
const stateCls = (state, match) => `${state ? ` st-${state}` : ''}${match === false ? ' lt-off' : ''}`

// A card on the line. Mouse: hover opens the year preview, a click opens the
// year view. Touch / pen: the first tap opens the preview, a second tap (on
// the card or the preview's "Open year") opens the year view.
const Card = memo(function Card({ c, onActivate, onHover }) {
  const lastType = useRef('mouse')
  return (
    <div className={`lt-cardpos ${c.side}${c.match === false ? ' lt-off' : ''}`} data-cy={c.set === 'years' ? c.year : undefined} style={{ transform: `translate3d(${c.x}px,0,0)`, opacity: c.opacity }} aria-hidden="true">
      <span className="lt-conn" />
      <div
        className="lt-cardwrap"
        style={{ '--s': c.scale, pointerEvents: c.opacity > 0.5 ? 'auto' : 'none' }}
        onPointerDown={(e) => { lastType.current = e.pointerType || 'mouse' }}
        onPointerEnter={(e) => { if (e.pointerType === 'mouse') onHover(c, e.currentTarget, true) }}
        onPointerLeave={(e) => { if (e.pointerType === 'mouse') onHover(c, e.currentTarget, false) }}
        onClick={(e) => onActivate(c, e.currentTarget, lastType.current)}
      >
        <LineCard slot={c} />
      </div>
    </div>
  )
})

// The zoomable line. Pans with mouse drag, touch swipe (with inertia) and the
// plain wheel; zooms with ctrl/cmd + wheel (trackpad pinch) and a two-finger
// pinch, always anchored at the pointer. Only nodes near the viewport render.
export default function ZoomTrack({
  range, byYear, phases, birthYear, childBirthYear, kids, zoom, zoomed, hidden, scrollerRef, trackRef, onOpenYear,
  onMark, filter = 'all',
}) {
  const { ppy, left, vw, vh } = zoom
  const todayMonth = new Date().getMonth() + 1
  const L = useMemo(
    () => layoutLine({ range, byYear, phases, birthYear, childBirthYear, kids, ppy, left, vw, vh, todayMonth, filter }),
    [range, byYear, phases, birthYear, childBirthYear, kids, ppy, left, vw, vh, todayMonth, filter],
  )

  // ── Year preview ─────────────────────────────────────────────────────────
  // { year, anchorEl, side, x, pinned, focus, nodeEl }. pinned: opened by tap or
  // keyboard (hover-out doesn't close it).
  const [preview, setPreview] = useState(null)
  const previewRef = useRef(null)
  previewRef.current = preview
  const hoverTimer = useRef(0)
  const clearHover = () => { clearTimeout(hoverTimer.current); hoverTimer.current = 0 }
  useEffect(() => () => clearTimeout(hoverTimer.current), [])
  // Panning, zooming or leaving the line closes it (its anchor moves).
  const lastView = useRef({ ppy, left })
  useEffect(() => {
    const moved = Math.abs(lastView.current.ppy - ppy) > 1e-6 || Math.abs(lastView.current.left - left) > 2
    lastView.current = { ppy, left }
    if (moved && previewRef.current) setPreview(null)
  }, [ppy, left])
  useEffect(() => { if (zoomed || hidden) setPreview(null) }, [zoomed, hidden])

  const yearNode = (y) => trackRef.current?.querySelector(`.lt-node[data-y="${y}"]`)
  const cardFor = (y) => trackRef.current?.querySelector(`.lt-cardpos[data-cy="${y}"] .lt-cardwrap`)
  const openPreview = useCallback((p) => { clearHover(); setPreview(p) }, [])
  const closePreview = useCallback((returnFocus) => {
    clearHover()
    const p = previewRef.current
    setPreview(null)
    if (returnFocus && p?.focus) {
      const n = trackRef.current?.querySelector(`.lt-node[data-y="${p.year}"]`)
      n?.focus({ preventScroll: true })
    }
  }, [trackRef])

  const onCardHover = useCallback((c, el, entering) => {
    clearHover()
    const p = previewRef.current
    if (entering) {
      if (p?.pinned && p.year !== c.year) return
      if (p?.year === c.year) return
      hoverTimer.current = setTimeout(() => setPreview({ year: c.year, anchorEl: el, side: c.side, x: c.x }), HOVER_OPEN_MS)
    } else if (p && !p.pinned) {
      hoverTimer.current = setTimeout(() => setPreview(null), HOVER_CLOSE_MS)
    }
  }, [])
  const onPreviewHover = useCallback((entering) => {
    clearHover()
    if (!entering && previewRef.current && !previewRef.current.pinned) {
      hoverTimer.current = setTimeout(() => setPreview(null), HOVER_CLOSE_MS)
    }
  }, [])

  const openYearAt = useCallback((year, x) => {
    setPreview(null)
    onOpenYear(year, yearNode(year), x)
  }, [onOpenYear]) // eslint-disable-line react-hooks/exhaustive-deps

  const onCardActivate = useCallback((c, el, pointerType) => {
    const p = previewRef.current
    // Decade and month cards open the year view directly; so does a mouse click
    // or a second tap.
    if (c.set !== 'years' || pointerType === 'mouse' || (p && p.year === c.year)) { openYearAt(c.year, c.x); return }
    openPreview({ year: c.year, anchorEl: el, side: c.side, x: c.x, pinned: true })
  }, [openYearAt, openPreview])

  const previewItems = preview ? byYear.get(preview.year) || [] : null
  const markFromPreview = useCallback((item) => {
    const p = previewRef.current
    // anchor the Mark achieved popover to the year's card (or node), which stays on screen
    const anchor = (p && (cardFor(p.year) || yearNode(p.year))) || null
    setPreview(null)
    if (anchor) onMark(item, anchor)
  }, [onMark]) // eslint-disable-line react-hooks/exhaustive-deps
  const zoomRef = useRef(zoom)
  zoomRef.current = zoom
  const gesture = useRef({ pointers: new Map(), pan: null, pinch: null, dragged: false, samples: [], inertia: 0 })

  useEffect(() => {
    const scroller = scrollerRef.current
    if (!scroller) return
    const g = gesture.current
    const rel = (clientX) => clientX - scroller.getBoundingClientRect().left
    const stopInertia = () => { cancelAnimationFrame(g.inertia); g.inertia = 0 }

    const beginPan = (p) => { g.pan = { x: p.x, left: scroller.scrollLeft }; g.samples = [{ x: p.x, t: performance.now() }] }
    const beginPinch = () => {
      const [a, b] = [...g.pointers.values()]
      const cx = rel((a.x + b.x) / 2)
      g.pinch = { dist: Math.hypot(a.x - b.x, a.y - b.y) || 1, ppy: zoomRef.current.ppy, year: zoomRef.current.yearAtPx(cx) }
      g.pan = null
      g.dragged = true // a pinch is never a click
    }

    let frame = 0
    let pending = null
    const flush = () => {
      frame = 0
      const job = pending
      pending = null
      if (job) job()
    }
    const schedule = (job) => { pending = job; if (!frame) frame = requestAnimationFrame(flush) }

    const onDown = (e) => {
      if (e.pointerType === 'mouse' && e.button !== 0) return
      stopInertia()
      zoomRef.current.stopAnim()
      g.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY, type: e.pointerType })
      if (g.pointers.size === 1) { g.dragged = false; beginPan({ x: e.clientX }) }
      else if (g.pointers.size === 2) beginPinch()
    }
    const onMove = (e) => {
      const p = g.pointers.get(e.pointerId)
      if (!p) return
      p.x = e.clientX
      p.y = e.clientY
      if (g.pointers.size >= 2 && g.pinch) {
        const [a, b] = [...g.pointers.values()]
        const dist = Math.hypot(a.x - b.x, a.y - b.y) || 1
        const cx = rel((a.x + b.x) / 2)
        const { ppy: p0, year } = g.pinch
        schedule(() => zoomRef.current.zoomAt(p0 * (dist / g.pinch.dist), year, cx))
        return
      }
      if (!g.pan) return
      const dx = e.clientX - g.pan.x
      if (!g.dragged && Math.abs(dx) <= DRAG_THRESHOLD) return
      g.dragged = true
      scroller.classList.add('drag')
      scroller.scrollLeft = g.pan.left - dx
      const now = performance.now()
      g.samples.push({ x: e.clientX, t: now })
      while (g.samples.length > 2 && now - g.samples[0].t > 100) g.samples.shift()
    }
    const onUp = (e) => {
      const p = g.pointers.get(e.pointerId)
      if (!p) return
      g.pointers.delete(e.pointerId)
      scroller.classList.remove('drag')
      if (g.pointers.size === 1) {
        // pinch → pan with the remaining finger, without a jump
        g.pinch = null
        beginPan(g.pointers.values().next().value)
        return
      }
      if (g.pointers.size > 0) return
      const wasPan = g.pan && g.dragged
      g.pan = null
      g.pinch = null
      // touch / pen fling keeps gliding
      if (wasPan && p.type !== 'mouse' && g.samples.length > 1) {
        const a = g.samples[0]
        const b = g.samples[g.samples.length - 1]
        let v = (b.x - a.x) / Math.max(16, b.t - a.t) // px per ms
        let last = performance.now()
        const glide = (now) => {
          const dt = now - last
          last = now
          scroller.scrollLeft -= v * dt
          v *= Math.pow(0.94, dt / 16)
          g.inertia = Math.abs(v) > 0.02 ? requestAnimationFrame(glide) : 0
        }
        g.inertia = requestAnimationFrame(glide)
      }
    }

    // Wheel: ctrl/cmd (and trackpad pinch, which arrives as ctrl+wheel) zooms
    // at the cursor; plain vertical wheel pans sideways. One update per frame.
    let wheelFactor = 1
    let wheelX = 0
    const onWheel = (e) => {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault()
        stopInertia()
        const unit = e.deltaMode === 1 ? 20 : e.deltaMode === 2 ? 400 : 1
        wheelFactor *= Math.exp(-e.deltaY * unit * WHEEL_ZOOM_SPEED)
        wheelX = rel(e.clientX)
        schedule(() => { const f = wheelFactor; wheelFactor = 1; zoomRef.current.zoomBy(f, wheelX) })
      } else if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) {
        e.preventDefault()
        scroller.scrollLeft += e.deltaY * (e.deltaMode === 1 ? 20 : 1)
      }
    }
    let scrollFrame = 0
    const onScroll = () => {
      if (!scrollFrame) scrollFrame = requestAnimationFrame(() => { scrollFrame = 0; zoomRef.current.syncFromScroll() })
    }

    scroller.addEventListener('pointerdown', onDown)
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onUp)
    scroller.addEventListener('wheel', onWheel, { passive: false })
    scroller.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      stopInertia()
      cancelAnimationFrame(frame)
      cancelAnimationFrame(scrollFrame)
      scroller.removeEventListener('pointerdown', onDown)
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onUp)
      scroller.removeEventListener('wheel', onWheel)
      scroller.removeEventListener('scroll', onScroll)
    }
  }, [scrollerRef])

  // Swallow the click that ends a drag or pinch
  const onClickCapture = (e) => {
    if (gesture.current.dragged) {
      e.preventDefault()
      e.stopPropagation()
      gesture.current.dragged = false
    }
  }

  // Keep a keyboard-focused node on screen (also renders the next ones).
  const onFocusNode = (x) => {
    if (x < left + 60 || x > left + vw - 60) zoom.panTo(x - vw / 2)
  }

  const w = L.weights
  const inactive = zoomed || hidden
  const nodePointer = useRef('mouse')

  return (
    <>
    <div className={`lt-scroller${hidden ? ' lt-hide' : ''}`} ref={scrollerRef} aria-hidden={inactive || undefined}>
      <div
        className={`lt-track2${zoomed ? ' zoom' : ''}`}
        ref={trackRef}
        style={{ width: L.width }}
        onClickCapture={onClickCapture}
        role="group"
        aria-label={`Years, ${L.level} view`}
      >
        {/* lived part of the line: full gold up to "You are here" (the rest of the line is dimmer) */}
        <div className="lt-past" style={{ width: Math.max(0, L.nowX) }} aria-hidden="true" />
        {L.bands.map(b => (
          <div key={b.key} className={`lt-band c${b.index % 5}`} style={{ left: b.x0, width: b.x1 - b.x0, opacity: b.opacity * 0.9 }} aria-hidden="true" />
        ))}
        {L.phaseLabels.map(p => (
          <div key={p.key} className="lt-phase2" style={{ transform: `translate3d(${p.sep}px,0,0)` }} aria-hidden="true">
            <span className={p.visible ? '' : 'off'} style={{ left: p.x - p.sep + (p.x === p.sep ? 8 : 0) }}>{p.text}</span>
          </div>
        ))}

        {L.months.map(m => (
          <div key={m.key} className={`lt-mtick${m.has ? ' has' : ''}${stateCls(m.state, m.match)}`} data-ym={`${m.year}-${m.month}`} style={{ transform: `translate3d(${m.x}px,0,0)`, opacity: m.opacity }} aria-hidden="true">
            <span className="dot"><NodeMarks state={m.state} percent={m.percent} /></span>
            <NodeLabel label={m.label} className="mlbl" />
          </div>
        ))}

        {L.decades.map(d => (
          <button
            key={d.key}
            type="button"
            className={`lt-node dec${stateCls(d.state, d.match)}`}
            style={{ transform: `translate3d(${d.x}px,0,0)`, opacity: d.opacity, pointerEvents: d.opacity > 0.5 ? 'auto' : 'none' }}
            tabIndex={!inactive && d.opacity > 0.5 ? 0 : -1}
            aria-label={`${d.decade}s, ${d.progress}${d.top ? `, biggest: ${d.top.title}` : ''}`}
            onFocus={() => onFocusNode(d.x)}
            onClick={(e) => onOpenYear(d.openYear, e.currentTarget, d.x)}
          >
            <span className="dot"><NodeMarks state={d.state} percent={d.percent} /></span>
            <NodeLabel label={d.label} />
          </button>
        ))}

        {L.years.map(y => {
          const meta = [y.age != null ? `age ${y.age}` : null, y.child].filter(Boolean)
          const stateText = y.state === 'achieved' ? 'all achieved' : y.state === 'overdue' ? 'overdue'
            : y.state === 'in_progress' ? `in progress, ${y.percent}%` : null
          const label = [String(y.year), ...meta,
            y.count ? `${y.count} planned${y.lead ? `: ${y.lead.title}` : ''}` : 'nothing planned',
            stateText, y.today ? 'you are here' : null].filter(Boolean).join(', ')
          return (
            <button
              key={y.year}
              type="button"
              className={`lt-node${y.ev ? ' ev' : ''}${y.major ? ' big' : ''}${y.mark ? ' mark' : ''}${y.year < (range.today ?? range.start) ? ' past' : ''}${stateCls(y.state, y.match)}`}
              style={{ transform: `translate3d(${y.x}px,0,0)`, '--hit': `${Math.max(18, Math.min(56, ppy))}px` }}
              data-y={y.year}
              aria-label={label}
              tabIndex={inactive ? -1 : 0}
              aria-haspopup="dialog"
              aria-expanded={preview?.year === y.year || undefined}
              onFocus={() => onFocusNode(y.x)}
              onPointerDown={(e) => { nodePointer.current = e.pointerType || 'mouse' }}
              onKeyDown={(e) => {
                // Space previews the year; Enter (the button's click) opens it.
                if (e.key !== ' ') return
                e.preventDefault()
                if (!y.count) return
                const card = cardFor(y.year)
                openPreview({ year: y.year, anchorEl: card || e.currentTarget, side: card ? (L.cards.find(c => c.key === `y${y.year}`)?.side ?? null) : null, x: y.x, pinned: true, focus: true })
              }}
              onKeyUp={(e) => { if (e.key === ' ') e.preventDefault() }}
              onClick={(e) => {
                const pt = nodePointer.current
                nodePointer.current = 'mouse'
                // touch: the first tap on a year with items previews it
                if (pt !== 'mouse' && y.count && preview?.year !== y.year) {
                  const card = cardFor(y.year)
                  openPreview({ year: y.year, anchorEl: card || e.currentTarget, side: card ? (L.cards.find(c => c.key === `y${y.year}`)?.side ?? null) : null, x: y.x, pinned: true })
                  return
                }
                openYearAt(y.year, y.x)
              }}
            >
              <span className="dot"><NodeMarks state={y.state} percent={y.percent} /></span>
              <NodeLabel label={y.label} />
            </button>
          )
        })}

        {L.cards.map(c => <Card key={c.key} c={c} onActivate={onCardActivate} onHover={onCardHover} />)}

        <div className="lt-now2" style={{ transform: `translate3d(${L.nowX}px,0,0)` }} aria-hidden="true">You are here</div>
      </div>
    </div>
    {preview && previewItems && (
      <YearPreview
        year={preview.year}
        items={previewItems}
        anchorEl={preview.anchorEl}
        side={preview.side}
        stageEl={scrollerRef.current?.parentElement}
        focusOnOpen={!!preview.focus}
        onOpenYear={() => openYearAt(preview.year, preview.x)}
        onMark={markFromPreview}
        onClose={closePreview}
        onHoverIn={() => onPreviewHover(true)}
        onHoverOut={() => onPreviewHover(false)}
      />
    )}
    </>
  )
}

