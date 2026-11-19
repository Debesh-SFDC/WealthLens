import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { LaneCard, LanePill } from './LineCard'
import ItemTip from './ItemTip'
import { layoutLine } from '../../lib/lifeTimelineZoom'
import { MONTHS, STATE_LABELS } from '../../lib/lifeTimeline'

const HOVER_OPEN_MS = 120
const HOVER_CLOSE_MS = 180
const DRAG_THRESHOLD = 6
const WHEEL_ZOOM_SPEED = 0.0025 // per pixel of deltaY

const stateCls = (state, match) => `${state ? ` st-${state}` : ''}${match === false ? ' lt-off' : ''}`

// Check badge / progress ring for a decade node's dot.
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

// One item's card or pill in its lane, with its connector down (or up) to
// its marker on the line. The lane offset animates when lanes are recomputed
// as the zoom changes; x follows the zoom directly.
const Lane = memo(function Lane({ c, onActivate, onHover, onMark }) {
  const lastType = useRef('mouse')
  const y = c.side === 'up' ? -(c.d + c.h) : c.d
  return (
    // display: contents — the connector and the card stack separately, so year
    // labels can sit between them (opacity is set on each, not on a wrapper)
    <div className={`lt-lane ${c.side} ${c.mode}${c.match === false ? ' lt-off' : ''}`} data-key={c.key} aria-hidden="true">
      <span className="lt-conn2" style={{ transform: `translate3d(${c.x}px,0,0)`, height: c.d, opacity: c.opacity }} />
      <div className="lt-lanepos" style={{ transform: `translate3d(${c.a}px,0,0)`, opacity: c.opacity }}>
        <div
          className="lt-lanebox"
          style={{ transform: `translateY(${y}px)`, width: c.w, height: c.h, pointerEvents: c.opacity > 0.5 ? 'auto' : 'none' }}
          onPointerDown={(e) => { lastType.current = e.pointerType || 'mouse' }}
          onPointerEnter={(e) => { if (e.pointerType === 'mouse' && c.mode === 'pill') onHover(c.item, e.currentTarget, true) }}
          onPointerLeave={(e) => { if (e.pointerType === 'mouse' && c.mode === 'pill') onHover(c.item, e.currentTarget, false) }}
          onClick={(e) => onActivate(c.item, e.currentTarget, lastType.current, c.mode)}
        >
          {c.mode === 'full' ? <LaneCard item={c.item} loose={c.loose} onMark={onMark} /> : <LanePill item={c.item} width={c.w} />}
        </div>
      </div>
    </div>
  )
})

// The marker ON the line at an item's date. A small dot (status-coloured);
// a dashed ring for "sometime this year". Hover (marker-only items) or a tap
// shows the item's full card.
const ItemMarker = memo(function ItemMarker({ m, onActivate, onHover }) {
  const lastType = useRef('mouse')
  const it = m.item
  const when = it.month ? `${it.day ? `${it.day} ` : ''}${MONTHS[it.month - 1]} ${it.year}` : `sometime in ${it.year}`
  return (
    <button
      type="button"
      className={`lt-imk${m.loose ? ' loose' : ''}${stateCls(it.state, m.match)}${it.assumed ? ' assumed' : ''}${m.mode === 'marker' ? ' solo' : ''}`}
      style={{ transform: `translate3d(${m.x}px,0,0)`, opacity: m.opacity, pointerEvents: m.opacity > 0.5 ? 'auto' : 'none' }}
      tabIndex={-1}
      aria-label={`${it.raw?.title ?? it.title}, ${when}${it.state && it.state !== 'upcoming' ? `, ${STATE_LABELS[it.state] || it.state}` : ''}`}
      data-key={it.key}
      onPointerDown={(e) => { lastType.current = e.pointerType || 'mouse' }}
      onPointerEnter={(e) => { if (e.pointerType === 'mouse' && m.mode !== 'full') onHover(it, e.currentTarget, true) }}
      onPointerLeave={(e) => { if (e.pointerType === 'mouse' && m.mode !== 'full') onHover(it, e.currentTarget, false) }}
      onClick={(e) => onActivate(it, e.currentTarget, lastType.current, 'marker')}
    >
      <span className="d" style={it.state === 'in_progress' && it.percent != null ? { '--p': it.percent } : undefined} />
    </button>
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

  // ── Item tooltip ─────────────────────────────────────────────────────────
  // { item, anchorEl, pinned }: the full card of a marker-only item or a pill.
  // pinned: opened by a tap (hover-out doesn't close it).
  const [tip, setTip] = useState(null)
  const tipRef = useRef(null)
  tipRef.current = tip
  const hoverTimer = useRef(0)
  const clearHover = () => { clearTimeout(hoverTimer.current); hoverTimer.current = 0 }
  useEffect(() => () => clearTimeout(hoverTimer.current), [])
  // Panning or zooming closes it (its anchor moves); so does leaving the line.
  const lastView = useRef({ ppy, left })
  useEffect(() => {
    const moved = Math.abs(lastView.current.ppy - ppy) > 1e-6 || Math.abs(lastView.current.left - left) > 2
    lastView.current = { ppy, left }
    if (moved && tipRef.current) setTip(null)
  }, [ppy, left])
  useEffect(() => { if (zoomed || hidden) setTip(null) }, [zoomed, hidden])
  const closeTip = useCallback(() => { clearHover(); setTip(null) }, [])

  const yearNode = (y) => trackRef.current?.querySelector(`.lt-node[data-y="${y}"]`)
  const openYearAt = useCallback((year) => {
    setTip(null)
    onOpenYear(year, yearNode(year), L.years.find(n => n.year === year)?.x)
  }, [onOpenYear, L]) // eslint-disable-line react-hooks/exhaustive-deps

  const onItemHover = useCallback((item, el, entering) => {
    clearHover()
    const t = tipRef.current
    if (entering) {
      if (t?.pinned && t.item.key !== item.key) return
      if (t?.item.key === item.key) return
      hoverTimer.current = setTimeout(() => setTip({ item, anchorEl: el }), HOVER_OPEN_MS)
    } else if (t && !t.pinned) {
      hoverTimer.current = setTimeout(() => setTip(null), HOVER_CLOSE_MS)
    }
  }, [])
  const onTipHover = useCallback((entering) => {
    clearHover()
    if (!entering && tipRef.current && !tipRef.current.pinned) hoverTimer.current = setTimeout(() => setTip(null), HOVER_CLOSE_MS)
  }, [])

  // Full card: opens the year. Pill or marker: a mouse click opens the year;
  // a tap shows the full card first and a second tap opens the year.
  const onItemActivate = useCallback((item, el, pointerType, mode) => {
    const t = tipRef.current
    if (mode === 'full' || (pointerType === 'mouse' && mode !== 'marker') || t?.item.key === item.key) { openYearAt(item.year); return }
    if (pointerType === 'mouse') {
      // a mouse click on a bare marker shows its card if hover hasn't yet
      if (!t) { clearHover(); setTip({ item, anchorEl: el, pinned: true }); return }
      openYearAt(item.year)
      return
    }
    clearHover()
    setTip({ item, anchorEl: el, pinned: true })
  }, [openYearAt])

  const markFromTip = useCallback((item, btn) => {
    const anchor = tipRef.current?.anchorEl
    setTip(null)
    onMark(item, anchor?.isConnected ? anchor : btn)
  }, [onMark])

  const [focusYear, setFocusYear] = useState(null)

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
          <div key={m.key} className="lt-mtick" style={{ transform: `translate3d(${m.x}px,0,0)`, opacity: m.opacity }} aria-hidden="true">
            <span className="dot" />
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
              className={`lt-node${y.year < (range.today ?? range.start) ? ' past' : ''}${y.match === false ? ' lt-off' : ''}${y.today ? ' now' : ''}`}
              style={{ transform: `translate3d(${y.x}px,0,0)`, '--hit': `${Math.max(18, Math.min(40, ppy * 0.3))}px` }}
              data-y={y.year}
              aria-label={label}
              tabIndex={inactive ? -1 : 0}
              onFocus={() => { onFocusNode(y.x); setFocusYear(y.year) }}
              onBlur={() => setFocusYear(f => (f === y.year ? null : f))}
              onClick={() => openYearAt(y.year)}
            >
              <span className="dot" />
            </button>
          )
        })}

        {/* connectors and cards sit in lanes; labels go above the connectors
            (on an opaque backing) and below the cards, which start beyond them */}
        {L.labels.map(l => (
          <div
            key={l.key}
            className={`lt-lblpos ${l.kind}${focusYear != null && l.kind !== 'mon' && l.year === focusYear ? ' focus' : ''}`}
            style={{ transform: `translate3d(${l.x}px,0,0)` }}
            aria-hidden="true"
          >
            <span className="lbl" onClick={() => { if (l.kind !== 'mon') openYearAt(l.year) }}>
              <b>{l.lines[0]}</b>
              {l.lines.slice(1).map((t, i) => <i key={i}>{t}</i>)}
            </span>
          </div>
        ))}

        {L.markers.map(m => <ItemMarker key={m.key} m={m} onActivate={onItemActivate} onHover={onItemHover} />)}

        {L.cards.map(c => <Lane key={c.key} c={c} onActivate={onItemActivate} onHover={onItemHover} onMark={onMark} />)}

        <div className="lt-now2" style={{ transform: `translate3d(${L.nowX}px,0,0)` }} aria-hidden="true">You are here</div>
      </div>
    </div>
    {tip && (
      <ItemTip
        item={tip.item}
        anchorEl={tip.anchorEl}
        stageEl={scrollerRef.current?.parentElement}
        onOpenYear={() => openYearAt(tip.item.year)}
        onMark={markFromTip}
        onClose={closeTip}
        onHoverIn={() => onTipHover(true)}
        onHoverOut={() => onTipHover(false)}
      />
    )}
    </>
  )
}
