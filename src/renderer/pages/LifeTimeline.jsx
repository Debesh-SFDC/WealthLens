import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import '@fontsource/cinzel/latin-500.css'
import '@fontsource/cinzel/latin-700.css'
import '../lifeTimeline.css'
import bridge from '../lib/bridge'
import { buildItems, groupByYear } from '../lib/lifeTimeline'
import GoldDust from '../components/lifeTimeline/GoldDust'
import YearTrack from '../components/lifeTimeline/YearTrack'
import YearView from '../components/lifeTimeline/YearView'
import EventModal, { readError } from '../components/lifeTimeline/EventModal'
import PhasesModal from '../components/lifeTimeline/PhasesModal'
import Toast from '../components/Toast'

// Timings match the prototype (resources/index.html); all zero under reduced motion.
const OPEN_DELAY = 260
const CLOSE_DELAY = 120

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

const isTyping = (el) => el && (el.isContentEditable || /^(INPUT|SELECT|TEXTAREA)$/.test(el.tagName))

export default function LifeTimeline({ onNavigate }) {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(null)
  const [zoomed, setZoomed] = useState(false)
  const [year, setYear] = useState(null)
  const [yearShown, setYearShown] = useState(false)
  const [modal, setModal] = useState(null) // null | { type: 'event', event } | { type: 'phases' }
  const [toast, setToast] = useState({ visible: false, message: '', type: 'success' })
  const reducedMotion = usePrefersReducedMotion()

  const scrollerRef = useRef(null)
  const trackRef = useRef(null)
  const backRef = useRef(null)
  const timer = useRef(null)

  const showToast = (message, type = 'success') => setToast({ visible: true, message, type })

  const load = useCallback(async () => {
    try {
      const res = await bridge.getLifeTimeline()
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
  const range = data?.range
  const phases = data?.phases || []

  const nodeFor = (y) => trackRef.current?.querySelector(`[data-y="${y}"]`)
  const setOrigin = (el) => {
    if (el && trackRef.current) trackRef.current.style.transformOrigin = `${el.offsetLeft + el.offsetWidth / 2}px 50%`
  }

  // Zoom the track into the chosen node, then fade the year view in.
  const openYear = useCallback((y, el) => {
    clearTimeout(timer.current)
    setOrigin(el)
    setYear(y)
    setZoomed(true)
    timer.current = setTimeout(() => setYearShown(true), reducedMotion ? 0 : OPEN_DELAY)
  }, [reducedMotion])

  // Reverse: fade the year view out, park the line on the year being viewed
  // (it may have changed via Previous/Next) and zoom back out from that node.
  const closeYear = useCallback(() => {
    clearTimeout(timer.current)
    setYearShown(false)
    const el = nodeFor(year)
    const scroller = scrollerRef.current
    if (el && scroller) {
      setOrigin(el)
      scroller.scrollLeft = el.offsetLeft - scroller.clientWidth / 2 + el.offsetWidth / 2
    }
    timer.current = setTimeout(() => {
      setZoomed(false)
      el?.focus({ preventScroll: true })
    }, reducedMotion ? 0 : CLOSE_DELAY)
  }, [year, reducedMotion])

  useEffect(() => {
    if (yearShown) backRef.current?.focus({ preventScroll: true })
  }, [yearShown])

  const goYear = useCallback((delta) => {
    if (!range) return
    setYear(y => Math.min(range.end, Math.max(range.start, y + delta)))
  }, [range])

  // Year view keys: ←/→ change year, Esc goes back. Modals handle their own Esc.
  useEffect(() => {
    if (!yearShown || modal) return
    const onKey = (e) => {
      if (isTyping(e.target) || e.altKey || e.ctrlKey || e.metaKey) return
      if (e.key === 'Escape') { e.preventDefault(); closeYear() }
      else if (e.key === 'ArrowLeft') { e.preventDefault(); goYear(-1) }
      else if (e.key === 'ArrowRight') { e.preventDefault(); goYear(1) }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [yearShown, modal, closeYear, goYear])

  function scrollToPhase(p) {
    if (!range) return
    if (zoomed) closeYear()
    const el = nodeFor(Math.min(range.end, Math.max(range.start, p.start_year)))
    if (el) scrollerRef.current?.scrollTo({ left: el.offsetLeft - 40, behavior: reducedMotion ? 'auto' : 'smooth' })
  }

  function selectItem(item) {
    if (item.kind === 'goal') onNavigate?.('goals-wishlist', { goalId: item.id })
    else if (item.kind === 'retirement') onNavigate?.('settings')
    else setModal({ type: 'event', event: item.raw })
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

  const ageNow = data?.birthYear != null ? range.start - data.birthYear : null

  return (
    <div className="lt">
      <GoldDust reducedMotion={reducedMotion} />

      <header className="lt-head">
        <div>
          <h1 className="lt-h1">LIFE TIMELINE</h1>
          <p className="lt-sub">Drag or scroll along the line, select a year to go inside it.</p>
        </div>
        {data && (
          <div className="lt-stats">
            <div><b>{ageNow ?? '—'}</b>Age now</div>
            <div><b>{data.retirement.year}</b>Retirement</div>
            <div><b>{range.end}</b>{data.birthYear != null ? 'Age 80' : 'Plan end'}</div>
          </div>
        )}
      </header>

      {data && (
        <div className="lt-bar">
          <div className="lt-chips">
            {phases.map(p => (
              <button key={p.id} type="button" className="lt-chip" onClick={() => scrollToPhase(p)}>
                {p.numeral && <span>{p.numeral}</span>}{p.name}
              </button>
            ))}
            <button type="button" className="lt-chip ghost" onClick={() => setModal({ type: 'phases' })}>
              {phases.length ? 'Edit chapters' : '+ Add chapters'}
            </button>
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
            <YearTrack
              range={range}
              byYear={byYear}
              phases={phases}
              birthYear={data.birthYear}
              childBirthYear={data.childBirthYear}
              zoomed={zoomed}
              scrollerRef={scrollerRef}
              trackRef={trackRef}
              onOpenYear={openYear}
            />
            <YearView
              year={year}
              show={yearShown}
              items={year != null ? byYear.get(year) : null}
              range={range}
              phases={phases}
              birthYear={data.birthYear}
              childBirthYear={data.childBirthYear}
              backRef={backRef}
              onBack={closeYear}
              onPrev={() => goYear(-1)}
              onNext={() => goYear(1)}
              onAdd={() => setModal({ type: 'event', event: null })}
              onSelectItem={selectItem}
            />
          </>
        )}
      </div>

      {modal?.type === 'event' && (
        <EventModal
          event={modal.event}
          defaultYear={year ?? range.start}
          range={range}
          onSave={saveEvent}
          onDelete={deleteEvent}
          onClose={() => setModal(null)}
        />
      )}
      {modal?.type === 'phases' && (
        <PhasesModal
          phases={phases}
          defaultYear={year ?? range.start}
          onSave={savePhases}
          onClose={() => setModal(null)}
        />
      )}
      <Toast {...toast} onHide={() => setToast(t => ({ ...t, visible: false }))} />
    </div>
  )
}
