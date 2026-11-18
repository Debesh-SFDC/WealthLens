import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import '@fontsource/cinzel/latin-500.css'
import '@fontsource/cinzel/latin-700.css'
import '../lifeTimeline.css'
import bridge from '../lib/bridge'
import { buildItems, groupByYear, fmtDate, FILTERS } from '../lib/lifeTimeline'
import { PRESETS, MIN_PPY, MAX_PPY, PAD_LEFT, levelFor, xOf, ppyToSlider, sliderToPpy } from '../lib/lifeTimelineZoom'
import GoldDust from '../components/lifeTimeline/GoldDust'
import ZoomTrack from '../components/lifeTimeline/ZoomTrack'
import useLineZoom from '../components/lifeTimeline/useLineZoom'
import NetworkView, { NET_MIN_K, NET_MAX_K, kToSlider, sliderToK } from '../components/lifeTimeline/NetworkView'
import { ViewSwitcher, ZoomControls } from '../components/lifeTimeline/ViewControls'
import YearView from '../components/lifeTimeline/YearView'
import EventModal, { readError } from '../components/lifeTimeline/EventModal'
import PhasesModal from '../components/lifeTimeline/PhasesModal'
import AchievePopover, { Burst } from '../components/lifeTimeline/AchievePopover'
import Toast from '../components/Toast'

// Timings match the prototype (resources/index.html); all zero under reduced motion.
const OPEN_DELAY = 260
const CLOSE_DELAY = 120
const VIEW_KEY = 'lifelog.lifeTimeline.view'
const FILTER_KEY = 'lifelog.lifeTimeline.filter'
const BURST_HOLD = 450 // ms of burst before the node switches to its achieved look
const LEVEL_LABEL = { decades: 'Decades', years: 'Years', months: 'Months', network: 'Network' }

function usePrefersReducedMotion() {
  const query = '(prefers-reduced-motion: reduce)'
  const [reduced, setReduced] = useState(() => typeof window !== 'undefined' && window.matchMedia?.(query).matches)
  useEffect(() => {
    const mq = window.matchMedia?.(query)
    if (!mq) return
    const onChange = () => setReduced(mq.matches)
    mq.addEventListener?.('change', onChange)
    return () => mq.removeEventListener?.('change', onChange)
  }, [])
  return !!reduced
}

// localStorage can throw (private mode, blocked storage) — never let it break the page.
function readView() {
  try {
    const v = localStorage.getItem(VIEW_KEY)
    return LEVEL_LABEL[v] ? v : 'years'
  } catch { return 'years' }
}
function writeView(v) {
  try { localStorage.setItem(VIEW_KEY, v) } catch { /* storage unavailable */ }
}
function readFilter() {
  try {
    const v = localStorage.getItem(FILTER_KEY)
    return FILTERS.some(f => f.id === v) ? v : 'all'
  } catch { return 'all' }
}
function writeFilter(v) {
  try { localStorage.setItem(FILTER_KEY, v) } catch { /* storage unavailable */ }
}

const wait = (ms) => new Promise(r => setTimeout(r, ms))
// "Achieved 12 Mar 2027: note" appended to the existing notes.
const withNote = (notes, date, note) => (note ? [notes, `Achieved ${fmtDate(date)}: ${note}`].filter(Boolean).join('\n') : notes ?? null)

const isTyping = (el) => el && (el.isContentEditable || /^(INPUT|SELECT|TEXTAREA)$/.test(el.tagName))

export default function LifeTimeline({ onNavigate }) {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(null)
  const [mode, setMode] = useState(() => (readView() === 'network' ? 'network' : 'line'))
  const [zoomed, setZoomed] = useState(false)
  const [year, setYear] = useState(null)
  const [yearShown, setYearShown] = useState(false)
  const [modal, setModal] = useState(null) // null | { type: 'event', event } | { type: 'phases' }
  const [toast, setToast] = useState({ visible: false, message: '', type: 'success' })
  const [netK, setNetK] = useState(1)
  const [filter, setFilterState] = useState(readFilter)
  const [pop, setPop] = useState(null) // { item, anchor } — the Mark achieved popover
  const [bursts, setBursts] = useState([]) // [{ id, x, y }]
  const reducedMotion = usePrefersReducedMotion()

  const scrollerRef = useRef(null)
  const trackRef = useRef(null)
  const backRef = useRef(null)
  const networkRef = useRef(null)
  const timer = useRef(null)

  const initialView = useRef(readView())
  const range = data?.range
  const zoom = useLineZoom({
    range,
    scrollerRef,
    initialPpy: PRESETS[initialView.current] ?? PRESETS.years,
    reducedMotion,
  })
  const level = levelFor(zoom.ppy)
  const activeView = mode === 'network' ? 'network' : level

  // Remember the last view: the network, or the level the line settles on.
  useEffect(() => { if (data) writeView(activeView) }, [activeView, data])

  const showToast = (message, type = 'success') => setToast({ visible: true, message, type })

  const load = useCallback(async (holdMs = 0) => {
    try {
      const [res] = await Promise.all([bridge.getLifeTimeline(), holdMs ? wait(holdMs) : null])
      setData(res)
      setLoadError(null)
    } catch (e) {
      console.error('getLifeTimeline failed', e)
      setLoadError(readError(e))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])
  useEffect(() => () => clearTimeout(timer.current), [])

  const byYear = useMemo(() => groupByYear(buildItems(data)), [data])
  const phases = data?.phases || []
  const todayYear = range?.today ?? range?.start

  // The line may start before this year (to show past items); open it with
  // this year where the line used to begin.
  const parked = useRef(false)
  useEffect(() => {
    if (!range || parked.current) return
    parked.current = true
    if (range.start < todayYear) zoom.panTo(xOf(todayYear, zoom.ppy, range.start) - PAD_LEFT)
  }, [range, todayYear, zoom])

  const setFilter = (f) => { setFilterState(f); writeFilter(f) }

  // ── Mark achieved / undo ──────────────────────────────────────────────
  // Where the burst goes: the item's node on the line (its month tick when
  // zoomed to months), else the button that was pressed (year view).
  const burstAt = useCallback((item, anchor) => {
    let el = null
    if (!zoomed && mode === 'line' && trackRef.current) {
      el = (item.month && item.month > 1 && trackRef.current.querySelector(`.lt-mtick.has[data-ym="${item.year}-${item.month}"] .dot`))
        || trackRef.current.querySelector(`.lt-node[data-y="${item.year}"] .dot`)
        || [...trackRef.current.querySelectorAll('.lt-node.dec')].find(n => n.getAttribute('aria-label')?.startsWith(`${Math.floor(item.year / 10) * 10}s`))?.querySelector('.dot')
    }
    const r = (el && el.getBoundingClientRect().width ? el : anchor).getBoundingClientRect()
    const id = Date.now() + Math.random()
    setBursts(b => [...b, { id, x: r.left + r.width / 2, y: r.top + r.height / 2 }])
  }, [zoomed, mode])

  // Goals change through the Goals API (whole row, as the Goals page does),
  // so the Goals page agrees; events through the Life Timeline API.
  const setAchieved = useCallback(async (item, on, { date, note } = {}) => {
    if (item.kind === 'goal') {
      const goals = await bridge.getAllGoals()
      const goal = (goals || []).find(g => Number(g.id) === Number(item.id))
      if (!goal) throw new Error('That goal no longer exists')
      await bridge.updateGoal({
        ...goal,
        is_achieved: on,
        // stored like the Goals page's own timestamps; noon UTC keeps the date in every timezone
        achieved_at: on ? `${date}T12:00:00.000Z` : null,
        notes: on ? withNote(goal.notes, date, note) : goal.notes,
      })
    } else {
      const ev = item.raw
      await bridge.updateLifeEvent({
        ...ev,
        status: on ? 'done' : 'planned',
        achieved_at: on ? date : null,
        notes: on ? withNote(ev.notes, date, note) : ev.notes,
      })
    }
  }, [])

  const onMark = useCallback((item, anchor) => {
    if (item.state === 'achieved') {
      setAchieved(item, false)
        .then(() => { showToast(`${item.raw?.title ?? item.title}: achievement undone`); return load() })
        .catch(e => showToast(readError(e), 'error'))
      return
    }
    setPop({ item, anchor })
  }, [setAchieved, load])

  const savePop = useCallback(async ({ date, note }) => {
    const { item, anchor } = pop
    await setAchieved(item, true, { date, note })
    setPop(null)
    burstAt(item, anchor)
    showToast(`Achieved: ${item.raw?.title ?? item.title}`)
    await load(reducedMotion ? 0 : BURST_HOLD)
    if (anchor.isConnected) anchor.focus({ preventScroll: true }) // now the Undo button
  }, [pop, setAchieved, burstAt, load, reducedMotion])
  const closePop = useCallback(() => setPop(null), [])

  // ── View switching ─────────────────────────────────────────────────────
  function changeView(v) {
    if (v === 'network') { setMode('network'); return }
    const wasNetwork = mode === 'network'
    setMode('line')
    // stretch / compress the line to the preset, anchored at the centre
    zoom.animateTo(PRESETS[v], { duration: wasNetwork ? 0 : 450 })
  }

  // ── Year view (shared by every view) ───────────────────────────────────
  // x: the node's position on the track (line), used as the zoom origin.
  const openYear = useCallback((y, _el, x) => {
    if (!range) return
    clearTimeout(timer.current)
    if (trackRef.current && mode === 'line') {
      trackRef.current.style.transformOrigin = `${x ?? xOf(y, zoom.ppy, range.start)}px 50%`
    }
    setYear(y)
    setZoomed(true)
    timer.current = setTimeout(() => setYearShown(true), reducedMotion ? 0 : OPEN_DELAY)
  }, [range, mode, zoom.ppy, reducedMotion])

  // "All years": fade the year view out and return to the view you came from.
  // On the line, park it on the year being viewed (may have changed via
  // Previous/Next) and zoom back out from that node.
  const closeYear = useCallback(() => {
    clearTimeout(timer.current)
    setYearShown(false)
    if (mode === 'line' && range) {
      const x = xOf(year, zoom.ppy, range.start)
      if (trackRef.current) trackRef.current.style.transformOrigin = `${x}px 50%`
      zoom.centerOnYear(year)
    }
    timer.current = setTimeout(() => {
      setZoomed(false)
      if (mode === 'line') {
        requestAnimationFrame(() => trackRef.current?.querySelector(`[data-y="${year}"]`)?.focus({ preventScroll: true }))
      }
    }, reducedMotion ? 0 : CLOSE_DELAY)
  }, [year, mode, range, zoom, reducedMotion])

  useEffect(() => {
    if (yearShown) backRef.current?.focus({ preventScroll: true })
  }, [yearShown])

  const goYear = useCallback((delta) => {
    if (!range) return
    setYear(y => Math.min(range.end, Math.max(range.start, y + delta)))
  }, [range])

  // ── Zoom controls (line or network) ────────────────────────────────────
  const zoomIn = useCallback(() => {
    if (mode === 'network') networkRef.current?.zoomIn()
    else zoom.animateTo(zoom.ppy * 1.6, { duration: 200 })
  }, [mode, zoom])
  const zoomOut = useCallback(() => {
    if (mode === 'network') networkRef.current?.zoomOut()
    else zoom.animateTo(zoom.ppy / 1.6, { duration: 200 })
  }, [mode, zoom])
  const zoomReset = useCallback(() => {
    if (mode === 'network') networkRef.current?.fit()
    else zoom.animateTo(PRESETS.years, { duration: 450 })
  }, [mode, zoom])

  // Keys: ←/→/Esc in the year view; + − 0 zoom everywhere else.
  useEffect(() => {
    if (modal || pop || !data) return
    const onKey = (e) => {
      if (isTyping(e.target) || e.altKey || e.ctrlKey || e.metaKey) return
      if (yearShown) {
        if (e.key === 'Escape') { e.preventDefault(); closeYear() }
        else if (e.key === 'ArrowLeft') { e.preventDefault(); goYear(-1) }
        else if (e.key === 'ArrowRight') { e.preventDefault(); goYear(1) }
        return
      }
      if (zoomed) return
      if (e.key === '+' || e.key === '=') { e.preventDefault(); zoomIn() }
      else if (e.key === '-' || e.key === '_') { e.preventDefault(); zoomOut() }
      else if (e.key === '0') { e.preventDefault(); zoomReset() }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [modal, pop, data, yearShown, zoomed, closeYear, goYear, zoomIn, zoomOut, zoomReset])

  function onPhaseChip(p) {
    if (!range) return
    if (zoomed) closeYear()
    if (mode === 'network') { networkRef.current?.focusPhase(p.id); return }
    const yr = Math.min(range.end, Math.max(range.start, p.start_year))
    const scroller = scrollerRef.current
    const left = xOf(yr, zoom.ppy, range.start) - 40
    if (scroller && !reducedMotion) scroller.scrollTo({ left, behavior: 'smooth' })
    else zoom.panTo(left)
  }

  function selectItem(item) {
    if (item.kind === 'goal') onNavigate?.('goals-wishlist', { goalId: item.id })
    else if (item.kind === 'retirement') onNavigate?.('settings')
    else setModal({ type: 'event', event: item.raw })
  }

  function openNetworkNode(n) {
    if (n.kind === 'goal') { onNavigate?.('goals-wishlist', { goalId: n.item.id }); return }
    openYear(Math.min(range.end, Math.max(range.start, n.year)))
  }

  async function saveEvent(payload) {
    if (payload.id) await bridge.updateLifeEvent(payload)
    else await bridge.createLifeEvent(payload)
    setModal(null)
    showToast(payload.id ? 'Event updated' : 'Event added')
    await load()
  }

  async function deleteEvent(id) {
    await bridge.deleteLifeEvent(id)
    setModal(null)
    showToast('Event deleted')
    await load()
  }

  async function savePhases(list) {
    await bridge.replaceLifePhases(list)
    setModal(null)
    showToast('Chapters saved')
    await load()
  }

  const ageNow = data?.birthYear != null ? todayYear - data.birthYear : null
  const summary = data?.summary
  const pct = summary?.total ? Math.round((summary.achieved / summary.total) * 100) : 0
  const isNet = mode === 'network'
  const onNetScale = useCallback((k) => setNetK(k), [])

  return (
    <div className="lt">
      <GoldDust reducedMotion={reducedMotion} />

      <header className="lt-head">
        <div>
          <h1 className="lt-h1">LIFE TIMELINE</h1>
          <p className="lt-sub">
            Drag to pan, pinch or Ctrl + scroll to zoom, select {isNet ? 'a node' : 'a year'} to go inside it.
          </p>
        </div>
        {data && summary && (
          <div className="lt-progress" role="img" aria-label={`${summary.achieved} of ${summary.total} achieved`}>
            <span><b>{summary.achieved}</b> of {summary.total} achieved</span>
            <span className="bar"><i style={{ width: `${pct}%` }} /></span>
          </div>
        )}
        {data && (
          <div className="lt-stats">
            <div><b>{ageNow ?? '—'}</b>Age now</div>
            <div><b>{data.retirement.year}</b>Retirement</div>
            <div><b>{range.end}</b>{data.birthYear != null ? 'Age 80' : 'Plan end'}</div>
          </div>
        )}
        {data && <div className="lt-segrow"><ViewSwitcher active={activeView} onChange={changeView} /></div>}
      </header>

      {data && (
        <div className="lt-bar">
          <div className="lt-chips">
            {phases.map(p => (
              <button key={p.id} type="button" className="lt-chip" onClick={() => onPhaseChip(p)}>
                {p.numeral && <span>{p.numeral}</span>}{p.name}
              </button>
            ))}
            <button type="button" className="lt-chip ghost" onClick={() => setModal({ type: 'phases' })}>
              {phases.length ? 'Edit chapters' : '+ Add chapters'}
            </button>
          </div>
          <div className="lt-filters" role="radiogroup" aria-label="Show">
            {FILTERS.map(f => (
              <button
                key={f.id}
                type="button"
                role="radio"
                aria-checked={filter === f.id}
                className={`lt-fchip ${f.id}${filter === f.id ? ' on' : ''}`}
                onClick={() => setFilter(f.id)}
              >
                {f.label}
              </button>
            ))}
          </div>
          <div className="lt-legend">
            <span className="y"><i />Planned and goals</span>
            <span className="a"><i />Assumed date</span>
          </div>
        </div>
      )}

      <div className="lt-stage">
        {loading && <div className="lt-center" role="status">Loading your timeline…</div>}
        {!loading && loadError && !data && (
          <div className="lt-center" role="alert">
            <p style={{ margin: 0 }}>Couldn't load the timeline. {loadError}</p>
            <button type="button" className="lt-btn" onClick={() => { setLoading(true); load() }}>Try again</button>
          </div>
        )}
        {data && (
          <>
            <ZoomTrack
              range={range}
              byYear={byYear}
              phases={phases}
              birthYear={data.birthYear}
              childBirthYear={data.childBirthYear}
              zoom={zoom}
              zoomed={zoomed && !isNet}
              hidden={isNet}
              scrollerRef={scrollerRef}
              trackRef={trackRef}
              onOpenYear={openYear}
              onMark={onMark}
              filter={filter}
            />
            <NetworkView
              ref={networkRef}
              data={data}
              hidden={!isNet}
              zoomed={zoomed && isNet}
              reducedMotion={reducedMotion}
              onOpenNode={openNetworkNode}
              onScale={onNetScale}
              filter={filter}
            />
            {!zoomed && (
              isNet ? (
                <ZoomControls
                  level={LEVEL_LABEL.network}
                  slider={kToSlider(netK)}
                  onSlider={(v) => networkRef.current?.setScale(sliderToK(v))}
                  onIn={zoomIn}
                  onOut={zoomOut}
                  onFit={() => networkRef.current?.fit()}
                  canIn={netK < NET_MAX_K * 0.999}
                  canOut={netK > NET_MIN_K * 1.001}
                />
              ) : (
                <ZoomControls
                  level={LEVEL_LABEL[level]}
                  slider={ppyToSlider(zoom.ppy)}
                  onSlider={(v) => zoom.zoomBy(sliderToPpy(v) / zoom.ppy)}
                  onIn={zoomIn}
                  onOut={zoomOut}
                  canIn={zoom.ppy < MAX_PPY * 0.999}
                  canOut={zoom.ppy > MIN_PPY * 1.001}
                />
              )
            )}
            <YearView
              year={year}
              show={yearShown}
              items={year != null ? byYear.get(year) : null}
              range={range}
              phases={phases}
              birthYear={data.birthYear}
              childBirthYear={data.childBirthYear}
              backRef={backRef}
              backLabel={isNet ? '← Network' : '← All years'}
              onBack={closeYear}
              onPrev={() => goYear(-1)}
              onNext={() => goYear(1)}
              onAdd={() => setModal({ type: 'event', event: null })}
              onSelectItem={selectItem}
              onMark={onMark}
              filter={filter}
            />
          </>
        )}
      </div>

      {modal?.type === 'event' && (
        <EventModal
          event={modal.event}
          defaultYear={year ?? todayYear}
          range={range}
          events={data?.events || []}
          onSave={saveEvent}
          onDelete={deleteEvent}
          onClose={() => setModal(null)}
        />
      )}
      {modal?.type === 'phases' && (
        <PhasesModal
          phases={phases}
          defaultYear={year ?? todayYear}
          onSave={savePhases}
          onClose={() => setModal(null)}
        />
      )}
      {pop && <AchievePopover item={pop.item} anchor={pop.anchor} onSave={savePop} onClose={closePop} />}
      {bursts.map(b => <Burst key={b.id} x={b.x} y={b.y} onDone={() => setBursts(list => list.filter(x => x.id !== b.id))} />)}
      <Toast {...toast} onHide={() => setToast(t => ({ ...t, visible: false }))} />
    </div>
  )
}
