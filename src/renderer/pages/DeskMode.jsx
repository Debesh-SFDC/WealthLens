import { useState, useEffect, useLayoutEffect, useMemo, useRef, useCallback } from 'react'
import bridge from '../lib/bridge'
import {
  localDateStr, addDays, relativeDue, sortByDeadline, deadlineCounts,
  CATEGORIES, CATEGORY_META, categoryOf, readLastCategory, writeLastCategory,
} from '../lib/tasks'
import {
  DndContext, DragOverlay, KeyboardSensor, MouseSensor, TouchSensor,
  pointerWithin, rectIntersection, useDraggable, useDroppable, useSensor, useSensors,
} from '@dnd-kit/core'
import CategoryChips from '../components/CategoryChips'
import Toast from '../components/Toast'
import '../desk.css'
import '@fontsource/cinzel/latin-700.css'
import '../lifeTimeline.css' // the Mark achieved popover and burst
import DeskTimelineCard from '../components/DeskTimelineCard'
import AchievePopover, { Burst } from '../components/lifeTimeline/AchievePopover'
import { setAchieved } from '../lib/lifeTimelineActions'

// Desk Mode — full-screen ambient display for a spare monitor or tablet: live
// clock, every open task grouped by category (Job / Personal / Project) and
// sorted by deadline, recent ideas and a weather-reactive animated background.
// Two layouts share the same data: portrait (a 1080×1920 desk monitor —
// stacked sections, bigger type) and landscape (category columns). Auto picks
// by the (orientation: portrait) media query; ⚙️ → Layout can force either.
// No sidebar/nav; ESC or the corner control exits.

const WEATHER_URL = 'https://api.open-meteo.com/v1/forecast?latitude=20.47&longitude=85.84'
  + '&current=temperature_2m,weathercode,windspeed_10m&timezone=Asia%2FKolkata'
const LOCATION = 'Bhubaneswar'
const DATA_REFRESH_MS    = 60 * 1000          // keeps due labels / overdue count current
const WEATHER_REFRESH_MS = 30 * 60 * 1000
const SHIFT_MS           = 10 * 60 * 1000     // burn-in guard
const EXPAND_IDLE_MS     = 90 * 1000          // an expanded section folds back after this
const REFRESH_HOLD_MS    = 2000               // no data refresh this long after a drop
const FLASH_MS           = 1800               // highlight on a just-moved row
const UNDO_MS            = 6000
const OVERRIDE_KEY = 'desk_weather_override'
const LAYOUT_KEY   = 'desk_layout'

// Pixel offsets the whole layout cycles through, one step every 10 minutes, so
// static text/edges never sit on exactly the same pixels for hours.
const SHIFTS = [[0, 0], [3, -2], [-2, 3], [2, 2], [-3, -1], [1, -3], [-1, 2], [3, 1]]

// WMO weather codes → scene
function conditionFromCode(code) {
  if (code === 0) return 'clear'
  if ([1, 2, 3].includes(code)) return 'cloudy'
  if ([45, 48].includes(code)) return 'fog'
  if (code >= 51 && code <= 67) return 'rain'
  if (code >= 71 && code <= 77) return 'snow'
  if (code >= 80 && code <= 82) return 'rain'
  if (code >= 85 && code <= 86) return 'snow'
  if (code >= 95 && code <= 99) return 'storm'
  return 'cloudy'
}

const CONDITION_META = {
  clear:  { label: 'Clear sky',     icon: '☀️', nightIcon: '🌙' },
  cloudy: { label: 'Partly cloudy', icon: '🌤️', nightIcon: '☁️' },
  fog:    { label: 'Foggy',         icon: '🌫️' },
  rain:   { label: 'Rainy',         icon: '🌧️' },
  snow:   { label: 'Snowy',         icon: '❄️' },
  storm:  { label: 'Thunderstorm',  icon: '⛈️' },
}

const isNightHour = (h) => h >= 20 || h < 6

function readOverride() {
  try { return localStorage.getItem(OVERRIDE_KEY) || 'auto' } catch { return 'auto' }
}
function writeOverride(v) {
  try { v === 'auto' ? localStorage.removeItem(OVERRIDE_KEY) : localStorage.setItem(OVERRIDE_KEY, v) } catch {}
}

const rand = (min, max) => min + Math.random() * (max - min)
const range = (n) => Array.from({ length: n }, (_, i) => i)

// ── Animated background ─────────────────────────────────────────────────────
function WeatherBackground({ scene, night }) {
  // Particle positions/timings are randomised once per scene so they don't
  // jump on every clock tick re-render.
  const particles = useMemo(() => ({
    motes: range(18).map(() => ({ '--x': `${rand(0, 100)}%`, '--s': `${rand(2, 5)}px`, '--d': `${rand(14, 26)}s`, '--delay': `${-rand(0, 26)}s`, '--sway': `${rand(-8, 8)}vw` })),
    clouds: range(7).map(i => ({ '--y': `${rand(2, 42)}%`, '--w': `${rand(16, 32)}vw`, '--o': rand(0.55, 0.9).toFixed(2), '--d': `${rand(70, 150)}s`, '--delay': `${-rand(0, 150)}s`, zIndex: i })),
    drops: range(scene === 'storm' ? 140 : 90).map(() => ({ '--x': `${rand(0, 100)}%`, '--h': `${rand(50, 100)}px`, '--o': rand(0.4, 0.8).toFixed(2), '--d': `${rand(scene === 'storm' ? 0.4 : 0.55, scene === 'storm' ? 0.65 : 0.95)}s`, '--delay': `${-rand(0, 1)}s` })),
    fog: range(5).map(i => ({ '--y': `${i * 20 - 5}%`, '--h': `${rand(30, 45)}vh`, '--o': rand(0.35, 0.6).toFixed(2), '--d': `${rand(30, 55)}s`, '--delay': `${-rand(0, 40)}s` })),
    flakes: range(70).map(() => ({ '--x': `${rand(0, 100)}%`, '--s': `${rand(3, 7)}px`, '--d': `${rand(9, 18)}s`, '--delay': `${-rand(0, 18)}s`, '--sway': `${rand(-5, 5)}vw` })),
    stars: range(90).map(() => ({ '--x': `${rand(0, 100)}%`, '--y': `${rand(0, 75)}%`, '--s': `${rand(1, 2.6)}px`, '--d': `${rand(2.5, 6)}s`, '--delay': `${-rand(0, 6)}s` })),
  }), [scene])

  // Clear/cloudy nights become the starry night sky; rain/fog/snow/storm keep
  // their weather and are dimmed instead.
  const showNightSky = night && (scene === 'clear' || scene === 'cloudy')
  const sceneClass = showNightSky ? 'night' : scene

  return (
    <div className={`desk-bg desk-scene-${sceneClass}`} aria-hidden="true">
      {showNightSky && (
        <>
          {particles.stars.map((s, i) => <span key={i} className="desk-star" style={s} />)}
          <span className="desk-moon" />
          {scene === 'cloudy' && particles.clouds.slice(0, 4).map((c, i) => (
            <span key={i} className="desk-cloud" style={{ ...c, '--o': 0.12 }} />
          ))}
        </>
      )}

      {!showNightSky && scene === 'clear' && (
        <>
          <div className="desk-sun"><div className="desk-sun-rays" /><div className="desk-sun-core" /></div>
          {particles.motes.map((m, i) => <span key={i} className="desk-mote" style={m} />)}
        </>
      )}

      {!showNightSky && scene === 'cloudy' && (
        <>
          <div className="desk-sun" style={{ opacity: 0.55 }}><div className="desk-sun-core" /></div>
          {particles.clouds.map((c, i) => <span key={i} className="desk-cloud" style={c} />)}
        </>
      )}

      {(scene === 'rain' || scene === 'storm') && (
        <>
          <div className="desk-rain">
            {particles.drops.map((d, i) => <span key={i} className="desk-drop" style={d} />)}
          </div>
          {scene === 'rain'
            ? <div className="desk-flash desk-flash-soft" />
            : <><div className="desk-flash desk-flash-a" /><div className="desk-flash desk-flash-b" /></>}
        </>
      )}

      {scene === 'fog' && particles.fog.map((f, i) => <span key={i} className="desk-fog" style={f} />)}

      {scene === 'snow' && particles.flakes.map((f, i) => <span key={i} className="desk-flake" style={f} />)}

      {night && !showNightSky && <div className="desk-night-dim" />}
    </div>
  )
}

function readLayout() {
  try { return localStorage.getItem(LAYOUT_KEY) || 'auto' } catch { return 'auto' }
}
function writeLayout(v) {
  try { v === 'auto' ? localStorage.removeItem(LAYOUT_KEY) : localStorage.setItem(LAYOUT_KEY, v) } catch {}
}

// Live (orientation: portrait) match — the same media query CSS would use.
function usePortraitQuery() {
  const query = '(orientation: portrait)'
  const [match, setMatch] = useState(() => window.matchMedia(query).matches)
  useEffect(() => {
    const mq = window.matchMedia(query)
    const onChange = () => setMatch(mq.matches)
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])
  return match
}

function weatherIcon(scene, night) {
  const meta = CONDITION_META[scene] || CONDITION_META.cloudy
  return night && meta.nightIcon ? meta.nightIcon : meta.icon
}

// ── Clock card (landscape) ──────────────────────────────────────────────────
function ClockCard({ now, weather, scene, night }) {
  const h = now.getHours()
  const hh = String(h % 12 || 12)
  const mm = String(now.getMinutes()).padStart(2, '0')
  const meta = CONDITION_META[scene] || CONDITION_META.cloudy
  return (
    <div className="desk-glass flex flex-col items-center justify-center text-center px-6 py-6">
      <div className="flex items-start leading-none">
        <span className="desk-clock font-light tracking-tight tabular-nums">
          {hh}<span className="desk-colon">:</span>{mm}
        </span>
        <span className="ml-2 mt-2 text-xl sm:text-2xl font-semibold opacity-80" style={{ color: '#F0D060' }}>{h >= 12 ? 'PM' : 'AM'}</span>
      </div>
      <p className="mt-3 text-lg font-medium opacity-90">
        {now.toLocaleDateString('en-IN', { weekday: 'long' })}, {now.toLocaleDateString('en-IN', { day: 'numeric', month: 'long' })}
      </p>
      <div className="mt-4 pt-4 w-full border-t border-white/20 flex flex-col items-center gap-1">
        {weather ? (
          <>
            <div className="flex items-center gap-3">
              <span className="text-4xl" style={{ textShadow: 'none' }}>{weatherIcon(scene, night)}</span>
              <span className="text-3xl font-semibold tabular-nums">{Math.round(weather.temperature)}°C</span>
            </div>
            <p className="text-xs opacity-75">{meta.label} · 📍 {LOCATION} · 💨 {Math.round(weather.windspeed)} km/h</p>
          </>
        ) : (
          <p className="text-sm opacity-70">📍 {LOCATION} · weather loading…</p>
        )}
      </div>
    </div>
  )
}

// ── Header strip (portrait) ─────────────────────────────────────────────────
function PortraitHeader({ now, greeting, weather, scene, night }) {
  const h = now.getHours()
  const meta = CONDITION_META[scene] || CONDITION_META.cloudy
  return (
    <header className="desk-glass dp-header">
      <div className="min-w-0">
        <p className="dp-greeting font-semibold truncate">{greeting}</p>
        <p className="dp-date font-medium opacity-85">
          {now.toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' })}
        </p>
      </div>
      <div className="flex items-start justify-center leading-none">
        <span className="dp-clock desk-clock-color font-light tracking-tight tabular-nums">
          {String(h % 12 || 12)}<span className="desk-colon">:</span>{String(now.getMinutes()).padStart(2, '0')}
        </span>
        <span className="dp-ampm ml-2 font-semibold opacity-80" style={{ color: '#F0D060' }}>{h >= 12 ? 'PM' : 'AM'}</span>
      </div>
      <div className="min-w-0 text-right">
        {weather ? (
          <>
            <p className="dp-temp font-semibold tabular-nums whitespace-nowrap">
              <span style={{ textShadow: 'none' }}>{weatherIcon(scene, night)}</span> {Math.round(weather.temperature)}°C
            </p>
            <p className="dp-date opacity-85 truncate">{meta.label} · {LOCATION}</p>
          </>
        ) : (
          <p className="dp-date opacity-70 truncate">📍 {LOCATION}</p>
        )}
      </div>
    </header>
  )
}

// ── Deadline summary pills ──────────────────────────────────────────────────
const SUMMARY = [
  ['overdue',   '🔴', 'Overdue',     '#F87171'],
  ['today',     '🟠', 'Due today',   '#FB923C'],
  ['week',      '🟡', 'Next 7 days', '#FDE047'],
  ['doneToday', '✅', 'Done today',  '#4ADE80'],
]
function SummaryStrip({ counts }) {
  return (
    <div className="desk-summary">
      {SUMMARY.map(([key, icon, label, color]) => {
        const n = counts[key]
        const hot = key === 'overdue' && n > 0
        return (
          <div
            key={key}
            className="desk-glass desk-pill"
            style={hot ? { borderColor: 'rgba(248,113,113,0.6)', background: 'rgba(60,8,8,0.62)' } : undefined}
          >
            <span className="desk-pill-icon" style={{ textShadow: 'none' }}>{icon}</span>
            <span className="desk-pill-label">{label}</span>
            <span className="desk-pill-count tabular-nums" style={{ color: n > 0 ? color : 'rgba(255,255,255,0.55)' }}>{n}</span>
          </div>
        )
      })}
    </div>
  )
}

// ── Task row ────────────────────────────────────────────────────────────────
// Title, project tag and due label — shared by the live row and the drag ghost.
function RowText({ task, today, checked = false }) {
  const due = relativeDue(task, today)
  return (
    <>
      <span className="flex-1 min-w-0 flex items-center gap-2.5">
        <span
          className="desk-row-title truncate line-through"
          title={task.title}
          style={{ textDecorationColor: checked ? 'rgba(255,255,255,0.85)' : 'transparent', textDecorationThickness: 2, transition: 'text-decoration-color 0.35s ease' }}
        >
          {task.title}
        </span>
        {categoryOf(task) === 'project' && task.project_name && (
          <span className="desk-tag shrink-0">{task.project_name}</span>
        )}
      </span>
      <span className="desk-due shrink-0 tabular-nums font-semibold" style={{ color: due.color }}>{due.label}</span>
    </>
  )
}

const CheckSvg = ({ on }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="#0A0A0A" strokeWidth={3.5} strokeLinecap="round" strokeLinejoin="round"
    className="w-1/2 h-1/2 transition-opacity duration-200" style={{ opacity: on ? 1 : 0 }}>
    <polyline points="20 6 9 17 4 12" />
  </svg>
)

// The whole row is the drag activator (mouse: after 8px of movement, touch:
// after a 250ms hold, keyboard: focus + Space), so a plain tap on the checkbox
// still completes the task. The checkbox and ⋯ buttons aren't the activator
// node, so Space/Enter on them never starts a drag.
function DeskTaskRow({ task, today, onComplete, onMoveMenu, flash }) {
  const [phase, setPhase] = useState(null) // null → 'checking' → 'leaving'
  const rowRef = useRef(null)
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, isDragging } = useDraggable({
    id: task.id, data: { task }, disabled: !!phase,
  })
  const setRef = useCallback((el) => { rowRef.current = el; setNodeRef(el); setActivatorNodeRef(el) }, [setNodeRef, setActivatorNodeRef])

  // A freshly dropped row may land below the fold of an expanded list.
  useEffect(() => {
    if (flash) rowRef.current?.scrollIntoView?.({ block: 'nearest' })
  }, [flash])

  function handleTap(e) {
    e.stopPropagation()
    if (phase) return
    setPhase('checking')
    // Gold fill + strike-through, then the row folds away, then it's done.
    setTimeout(() => setPhase('leaving'), 480)
    setTimeout(() => onComplete(task), 820)
  }

  const checked = !!phase
  return (
    <div
      ref={setRef}
      {...attributes}
      {...listeners}
      aria-label={`${task.title}. Press Space to move to another category.`}
      data-task-id={task.id}
      className={`desk-row desk-row-drag ${phase === 'leaving' ? 'desk-row-leaving' : ''} ${isDragging ? 'desk-row-source' : ''} ${flash ? 'desk-row-flash' : ''}`}
    >
      <button
        type="button"
        onClick={handleTap}
        aria-label={`Mark "${task.title}" done`}
        className="desk-check shrink-0 border-2 flex items-center justify-center transition-all duration-300"
        style={{
          borderColor: checked ? '#D4AF37' : 'rgba(212,175,55,0.75)',
          background: checked ? 'linear-gradient(135deg, #D4AF37, #B8960C)' : 'rgba(255,255,255,0.06)',
          boxShadow: checked ? '0 0 16px rgba(212,175,55,0.5)' : 'none',
          transform: phase === 'checking' ? 'scale(1.12)' : 'scale(1)',
        }}
      >
        <CheckSvg on={checked} />
      </button>
      <RowText task={task} today={today} checked={checked} />
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); onMoveMenu(task) }}
        aria-label={`Move "${task.title}" to…`}
        title="Move to…"
        className="desk-row-menu shrink-0"
      >⋯</button>
    </div>
  )
}

// What follows the cursor while dragging (rendered in <DragOverlay>).
function DeskRowGhost({ task, today }) {
  return (
    <div className="desk-row desk-row-ghost">
      <span className="desk-check shrink-0 border-2 flex items-center justify-center" style={{ borderColor: 'rgba(212,175,55,0.75)', background: 'rgba(255,255,255,0.06)' }} />
      <RowText task={task} today={today} />
      <span className="desk-row-menu shrink-0" aria-hidden="true">⋯</span>
    </div>
  )
}

// ── Category section ────────────────────────────────────────────────────────
// Shows as many rows as fit; if the list overflows, the last visible slot
// becomes "+N more", which expands the section (scrollable, no scrollbar).
// Portrait passes `slots` (rows allotted by PortraitSections); landscape
// columns measure their own height instead.
// The whole section (header, rows, "+N more", collapsed or not) is one drop
// target for tasks dragged in from another category.
function CategorySection({ cat, tasks, today, onComplete, onMoveMenu, flashId, dragFrom, slots, style, expanded, onExpand, measureKey }) {
  const meta = CATEGORY_META[cat]
  const listRef = useRef(null)
  const { setNodeRef: setDropRef, isOver } = useDroppable({ id: `cat:${cat}`, data: { cat } })
  const dropHere = isOver && dragFrom && dragFrom !== cat
  const [measured, setMeasured] = useState(Infinity)
  const cap = slots ?? measured

  useLayoutEffect(() => {
    const el = listRef.current
    if (!el || slots != null) return
    const measure = () => {
      const row = el.querySelector('.desk-row')
      if (!row) return
      const gap = parseFloat(getComputedStyle(el).rowGap) || 0
      const rowH = row.offsetHeight || 1
      setMeasured(Math.max(1, Math.floor((el.clientHeight + gap) / (rowH + gap))))
    }
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [tasks.length > 0, measureKey, slots != null])

  const overflow = !expanded && tasks.length > cap
  const visible = overflow ? tasks.slice(0, Math.max(0, cap - 1)) : tasks
  const hidden = tasks.length - visible.length
  const flashHidden = flashId != null && !visible.some(t => t.id === flashId) && tasks.some(t => t.id === flashId)

  return (
    <section
      ref={setDropRef}
      data-cat={cat}
      className={`desk-glass desk-section ${expanded ? 'desk-section-expanded' : ''} ${dropHere ? 'desk-section-over' : ''}`}
      style={{ '--cat': meta.color, ...style }}
    >
      <button className="desk-section-head" onClick={() => tasks.length > cap || expanded ? onExpand(expanded ? null : cat) : null}>
        <span className="desk-section-title" style={{ color: meta.color }}>{meta.label}</span>
        <span className="desk-section-count">· {tasks.length} open</span>
        {expanded && <span className="ml-auto desk-section-count">Show less ▲</span>}
      </button>
      <div ref={listRef} className={`desk-list ${expanded ? 'desk-scroll' : ''}`}>
        {tasks.length === 0 && <p className="desk-empty">All clear ✨</p>}
        {visible.map(t => (
          <DeskTaskRow key={t.id} task={t} today={today} onComplete={onComplete} onMoveMenu={onMoveMenu} flash={t.id === flashId} />
        ))}
        {overflow && hidden > 0 && (
          <button className={`desk-row desk-more ${flashHidden ? 'desk-row-flash' : ''}`} onClick={() => onExpand(cat)}>
            <span>+{hidden} more</span><span className="opacity-60">tap to expand ▼</span>
          </button>
        )}
      </div>
    </section>
  )
}

// ── Portrait sections ───────────────────────────────────────────────────────
// Splits the available height into whole row "slots" so no section ends with
// a dead half-row and none collapses to just "+N more". Each category first
// gets min(open, 2) slots (1 if empty, for "All clear"); the rest are dealt out
// in proportion to how many rows each still needs, never more than it needs.
// Leftover pixels (less than a row per section when lists overflow) are shared
// by flex-grow. An expanded section takes every slot the others don't need.
const MIN_SLOTS = 2
function allocateSlots(counts, total, expandedIdx) {
  const need = counts.map(n => Math.max(1, n))
  let slots = need.map((n, i) => expandedIdx === -1 ? Math.min(n, MIN_SLOTS) : i === expandedIdx ? 0 : 1)
  // Very short screens: drop to one slot each rather than clip rows
  if (slots.reduce((a, b) => a + b, 0) > total) slots = need.map((_, i) => (i === expandedIdx ? 0 : 1))
  let left = total - slots.reduce((a, b) => a + b, 0)
  if (expandedIdx !== -1) { slots[expandedIdx] = Math.max(1, left); return slots }
  // D'Hondt-style: each spare slot goes to the section with the highest
  // need-per-slot, so shares end up proportional to open counts.
  while (left > 0) {
    let best = -1, bestScore = 0
    need.forEach((n, i) => {
      if (slots[i] >= n) return
      const score = n / (slots[i] + 1)
      if (score > bestScore) { bestScore = score; best = i }
    })
    if (best === -1) break
    slots[best]++; left--
  }
  return slots
}

function PortraitSections({ byCategory, renderSection, expanded }) {
  const wrapRef = useRef(null)
  const probeRef = useRef(null)
  const [geo, setGeo] = useState(null) // { H, chrome, rowH, rowGap, gap }

  useLayoutEffect(() => {
    const wrap = wrapRef.current, probe = probeRef.current
    if (!wrap || !probe) return
    const measure = () => {
      const row = probe.querySelector('.desk-row')
      const list = probe.querySelector('.desk-list')
      const rowH = row.offsetHeight
      setGeo({
        H: wrap.clientHeight,
        rowH,
        chrome: probe.offsetHeight - rowH,
        rowGap: parseFloat(getComputedStyle(list).rowGap) || 0,
        gap: parseFloat(getComputedStyle(wrap).rowGap) || 0,
      })
    }
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(wrap)
    return () => ro.disconnect()
  }, [])

  const counts = CATEGORIES.map(c => byCategory[c.id].length)
  let slots = null, heights = null
  if (geo && geo.rowH > 0) {
    const { H, chrome, rowH, rowGap, gap } = geo
    const usable = H - 2 * gap - 3 * (chrome - rowGap)
    const total = Math.max(3, Math.floor(usable / (rowH + rowGap)))
    slots = allocateSlots(counts, total, CATEGORIES.findIndex(c => c.id === expanded))
    heights = slots.map(n => chrome + n * rowH + (n - 1) * rowGap)
  }

  return (
    <main ref={wrapRef} className="dp-sections">
      {/* Invisible probe: one header + one row, to measure real sizes */}
      <section ref={probeRef} aria-hidden="true" className="desk-glass desk-section desk-probe">
        <div className="desk-section-head"><span className="desk-section-title">X</span></div>
        <div className="desk-list"><div className="desk-row"><span className="desk-check" /><span className="desk-row-title">X</span></div></div>
      </section>
      {CATEGORIES.map((c, i) => renderSection(c.id, slots && {
        slots: slots[i],
        style: { flex: `${slots[i]} 1 ${heights[i]}px` },
      }))}
    </main>
  )
}

// ── Ideas panel ─────────────────────────────────────────────────────────────
// A grid of small cards tinted by category; whatever doesn't fit collapses
// into a "+N more" tile. Tapping opens the overlay.
function IdeasPanel({ ideas, onOpen, measureKey, className = '' }) {
  const gridRef = useRef(null)
  const [cap, setCap] = useState(Infinity)

  useLayoutEffect(() => {
    const el = gridRef.current
    if (!el) return
    const measure = () => {
      const cs = getComputedStyle(el)
      const cols = cs.gridTemplateColumns.split(' ').filter(Boolean).length || 1
      const gap = parseFloat(cs.rowGap) || 0
      const rowH = parseFloat(cs.gridAutoRows) || 56
      const rows = Math.max(1, Math.floor((el.clientHeight + gap) / (rowH + gap)))
      setCap(cols * rows)
    }
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [measureKey])

  const overflow = ideas.length > cap
  const visible = overflow ? ideas.slice(0, Math.max(0, cap - 1)) : ideas

  return (
    <section className={`desk-glass desk-ideas ${className}`}>
      <div className="desk-section-head !cursor-default">
        <span className="desk-section-title" style={{ color: '#D4AF37' }}>💡 Ideas</span>
        <span className="desk-section-count">· {ideas.length}</span>
      </div>
      <div ref={gridRef} className="desk-ideas-grid">
        {ideas.length === 0 && <p className="desk-empty col-span-full">No ideas yet — the next spark goes below.</p>}
        {visible.map(idea => {
          const c = CATEGORY_META[categoryOf(idea)]
          return (
            <button
              key={idea.id}
              onClick={() => onOpen(idea.id)}
              className="desk-idea"
              style={{ '--cat': c.color }}
              title={idea.title}
            >
              <span className="truncate">{idea.title}</span>
            </button>
          )
        })}
        {overflow && (
          <button className="desk-idea desk-idea-more" onClick={() => onOpen(null)}>+{ideas.length - visible.length} more</button>
        )}
      </div>
    </section>
  )
}

function IdeasOverlay({ ideas, focusId, onClose }) {
  const [open, setOpen] = useState(focusId)
  const focusRef = useRef(null)
  useEffect(() => { focusRef.current?.scrollIntoView({ block: 'center' }) }, [])
  return (
    <div className="desk-overlay" onClick={onClose}>
      <div className="desk-glass desk-overlay-card" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between gap-4 mb-4">
          <h2 className="desk-section-title" style={{ color: '#D4AF37' }}>💡 Ideas · {ideas.length}</h2>
          <button onClick={onClose} className="px-4 h-10 rounded-xl bg-white/10 hover:bg-white/20 font-semibold">Close</button>
        </div>
        <div className="desk-scroll flex-1 min-h-0 space-y-2.5">
          {ideas.map(idea => {
            const c = CATEGORY_META[categoryOf(idea)]
            const isOpen = open === idea.id
            return (
              <button
                key={idea.id}
                ref={idea.id === focusId ? focusRef : null}
                onClick={() => setOpen(isOpen ? null : idea.id)}
                className="desk-idea !h-auto w-full !items-start flex-col !py-3 text-left"
                style={{ '--cat': c.color }}
              >
                <span className="font-semibold break-words w-full">
                  {idea.title}
                  {categoryOf(idea) === 'project' && idea.project_name && <span className="desk-tag ml-2 align-middle">{idea.project_name}</span>}
                </span>
                {isOpen && (
                  <span className="block mt-1.5 opacity-90 whitespace-pre-wrap break-words text-[0.85em] w-full">
                    {idea.description || <span className="italic opacity-70">No description</span>}
                    <span className="block mt-2 opacity-60 text-[0.85em]">
                      {c.label} · {new Date(idea.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                    </span>
                  </span>
                )}
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}

// ── Quick-add bar ───────────────────────────────────────────────────────────
const DUE_OPTIONS = [['today', 'Today'], ['tomorrow', 'Tomorrow'], ['pick', '📅 Pick date'], ['none', 'No date']]

function QuickAdd({ inputRef, today, onAdd, children }) {
  const [text, setText]         = useState('')
  const [type, setType]         = useState('task')
  const [category, setCategory] = useState(readLastCategory)
  const [dueMode, setDueMode]   = useState('none')
  const [pickDate, setPickDate] = useState('')
  const [saving, setSaving]     = useState(false)
  const pickRef = useRef(null)

  // ESC handling in the page clears a half-typed entry via this hook.
  useEffect(() => {
    const el = inputRef.current
    if (!el) return
    el.clearDraft = () => setText('')
  }, [inputRef])

  function chooseDue(id) {
    setDueMode(id)
    if (id === 'pick') setTimeout(() => { try { pickRef.current?.showPicker() } catch { pickRef.current?.focus() } }, 0)
    else inputRef.current?.focus()
  }

  async function submit(e) {
    e?.preventDefault()
    const title = text.trim()
    if (!title || saving) return
    const due_date = type !== 'task' ? null
      : dueMode === 'today' ? today
      : dueMode === 'tomorrow' ? addDays(today, 1)
      : dueMode === 'pick' ? (pickDate || null)
      : null
    setSaving(true)
    try {
      await onAdd({ title, type, category, due_date })
      writeLastCategory(category)
      setText('')
      setDueMode('none')
      setPickDate('')
    } catch (err) {
      console.error(err)
    } finally {
      setSaving(false)
      inputRef.current?.focus()
    }
  }

  return (
    <form onSubmit={submit} className="desk-glass desk-quickadd">
      <div className="flex items-center gap-3">
        <input
          ref={inputRef}
          autoFocus
          value={text}
          onChange={e => setText(e.target.value)}
          enterKeyHint="done"
          placeholder={type === 'idea' ? '💡 Capture an idea…' : '📝 Add a task…'}
          className="desk-input flex-1 min-w-0 px-5 rounded-2xl bg-white/10 border border-white/20 text-white"
          style={{ textShadow: 'none' }}
        />
        <button
          type="submit"
          disabled={!text.trim() || saving}
          className="desk-add btn-gold px-8 rounded-2xl font-bold disabled:opacity-40"
          style={{ textShadow: 'none' }}
        >{saving ? '…' : 'Add'}</button>
      </div>
      <div className="flex flex-wrap items-center gap-2.5">
        <CategoryChips value={category} onChange={(c) => { setCategory(c); inputRef.current?.focus() }} variant="desk" />
        <div className="flex p-1 rounded-2xl bg-white/10 border border-white/15">
          {[['task', '📝 Task'], ['idea', '💡 Idea']].map(([id, label]) => (
            <button
              key={id} type="button" onClick={() => { setType(id); inputRef.current?.focus() }}
              className="desk-chip px-4 rounded-xl font-semibold transition-colors"
              style={type === id ? { backgroundColor: 'rgba(212,175,55,0.9)', color: '#0A0A0A', textShadow: 'none' } : { color: 'rgba(255,255,255,0.85)' }}
            >{label}</button>
          ))}
        </div>
        {type === 'task' && (
          <div className="flex flex-wrap items-center gap-1.5">
            {DUE_OPTIONS.map(([id, label]) => (
              <button
                key={id} type="button" onClick={() => chooseDue(id)}
                className="desk-chip px-3.5 rounded-xl font-semibold transition-colors"
                style={dueMode === id
                  ? { backgroundColor: 'rgba(212,175,55,0.22)', boxShadow: 'inset 0 0 0 2px rgba(212,175,55,0.85)', color: '#fff' }
                  : { backgroundColor: 'rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.75)' }}
              >{id === 'pick' && pickDate && dueMode === 'pick' ? `📅 ${pickDate.slice(8)}/${pickDate.slice(5, 7)}` : label}</button>
            ))}
            {dueMode === 'pick' && (
              <input
                ref={pickRef} type="date" value={pickDate} min={today}
                onChange={e => { setPickDate(e.target.value); inputRef.current?.focus() }}
                className="desk-chip px-3 rounded-xl bg-white/10 border border-white/20 text-white [color-scheme:dark]"
                style={{ textShadow: 'none' }}
              />
            )}
          </div>
        )}
        {children}
      </div>
    </form>
  )
}

// ── Drag between category boxes ─────────────────────────────────────────────
const CAT_IDS = CATEGORIES.map(c => c.id)
const dropCat = (id) => (typeof id === 'string' && id.startsWith('cat:') ? id.slice(4) : null)

// Mouse/touch: the box under the pointer. Keyboard (no pointer): whichever box
// the moved row overlaps most.
function deskCollision(args) {
  if (args.pointerCoordinates) return pointerWithin(args)
  return rectIntersection(args)
}

// Keyboard drag: each arrow jumps the row to the centre of the previous/next
// box (Job → Personal → Personal Project). Down/Right = next, Up/Left = previous.
function boxKeyboardCoordinates(event, { context }) {
  const dir = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[event.code]
  if (!dir) return undefined
  event.preventDefault()
  const { droppableRects, collisionRect, over, active } = context
  const from = dropCat(over?.id) || categoryOf(active?.data.current?.task)
  const i = CAT_IDS.indexOf(from)
  const next = CAT_IDS[Math.min(CAT_IDS.length - 1, Math.max(0, i + dir))]
  const rect = droppableRects.get(`cat:${next}`)
  if (!rect || !collisionRect) return undefined
  return {
    x: rect.left + rect.width / 2 - collisionRect.width / 2,
    y: rect.top + rect.height / 2 - collisionRect.height / 2,
  }
}

const catLabel = (id) => CATEGORY_META[id]?.label || id
const dragTitle = (active) => active?.data.current?.task?.title || 'task'
const ANNOUNCEMENTS = {
  onDragStart: ({ active }) => `Picked up "${dragTitle(active)}" from ${catLabel(categoryOf(active.data.current?.task))}. Arrow keys move between Job, Personal and Personal Project. Space drops, Escape cancels.`,
  onDragOver: ({ active, over }) => over ? `"${dragTitle(active)}" is over ${catLabel(dropCat(over.id))}.` : `"${dragTitle(active)}" is not over a category.`,
  onDragEnd: ({ active, over }) => over ? `"${dragTitle(active)}" dropped on ${catLabel(dropCat(over.id))}.` : `"${dragTitle(active)}" dropped. Not moved.`,
  onDragCancel: ({ active }) => `Move cancelled. "${dragTitle(active)}" stays where it was.`,
}
const SCREEN_READER = {
  draggable: 'To move this task to another category, press Space, use the arrow keys to choose a category, then press Space again. Escape cancels.',
}

// ── After-move date popup ───────────────────────────────────────────────────
// Shown when an undated task is moved. Into Personal Project it also offers an
// optional project name. Esc / tapping outside = Skip (the move itself is
// already saved; this is a second, optional update).
const MOVE_DATE_CHIPS = [['today', 'Today'], ['tomorrow', 'Tomorrow'], ['week', 'Next week'], ['pick', '📅 Pick date']]

function MoveDetailsPopup({ prompt, today, projectNames, onSave, onSkip }) {
  const toProject = prompt.toCat === 'project'
  const meta = CATEGORY_META[prompt.toCat]
  const [dateMode, setDateMode] = useState(null)
  const [pickDate, setPickDate] = useState('')
  const [name, setName] = useState('')
  const pickRef = useRef(null)
  const firstRef = useRef(null)
  useEffect(() => { firstRef.current?.focus() }, [])

  const dateFor = (mode) => mode === 'today' ? today
    : mode === 'tomorrow' ? addDays(today, 1)
    : mode === 'week' ? addDays(today, 7)
    : mode === 'pick' ? (pickDate || null)
    : null

  function chooseChip(mode) {
    if (mode === 'pick') {
      setDateMode('pick')
      setTimeout(() => { try { pickRef.current?.showPicker() } catch { pickRef.current?.focus() } }, 0)
      return
    }
    // Without a name field a chip is the whole answer — save straight away.
    if (!toProject) return onSave({ due_date: dateFor(mode) })
    setDateMode(m => (m === mode ? null : mode))
  }

  function onPick(value) {
    setPickDate(value)
    if (value && !toProject) onSave({ due_date: value })
  }

  function save(e) {
    e?.preventDefault()
    const fields = {}
    const d = dateMode === 'pick' ? pickDate : dateFor(dateMode)
    if (d) fields.due_date = d
    if (name.trim()) fields.project_name = name.trim()
    onSave(fields)
  }

  const suggestions = projectNames.filter(n => !name || n.toLowerCase().includes(name.trim().toLowerCase())).slice(0, 6)
  const chipStyle = (on) => on
    ? { backgroundColor: 'rgba(212,175,55,0.22)', boxShadow: 'inset 0 0 0 2px rgba(212,175,55,0.85)', color: '#fff' }
    : { backgroundColor: 'rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.85)' }

  return (
    <div className="desk-overlay" onClick={onSkip}>
      <form
        role="dialog" aria-modal="true" aria-labelledby="desk-move-title"
        className="desk-glass desk-pop desk-move-card" style={{ '--cat': meta.color }}
        onClick={e => e.stopPropagation()} onSubmit={save}
      >
        <p className="desk-move-kicker" style={{ color: meta.color }}>Moved to {meta.label}</p>
        <h2 id="desk-move-title" className="desk-move-title">Add a due date for this task?</h2>
        <p className="desk-move-task truncate" title={prompt.title}>{prompt.title}</p>
        <div className="flex flex-wrap items-center gap-2">
          {MOVE_DATE_CHIPS.map(([id, label], i) => (
            <button
              key={id} type="button" ref={i === 0 ? firstRef : null} onClick={() => chooseChip(id)}
              className="desk-chip px-4 rounded-xl font-semibold transition-colors" style={chipStyle(dateMode === id)}
            >{id === 'pick' && pickDate ? `📅 ${pickDate.slice(8)}/${pickDate.slice(5, 7)}` : label}</button>
          ))}
          {dateMode === 'pick' && (
            <input
              ref={pickRef} type="date" value={pickDate} min={today} aria-label="Due date"
              onChange={e => onPick(e.target.value)}
              className="desk-chip px-3 rounded-xl bg-white/10 border border-white/20 text-white [color-scheme:dark]"
              style={{ textShadow: 'none' }}
            />
          )}
        </div>
        {toProject && (
          <div className="mt-4">
            <label htmlFor="desk-move-project" className="desk-move-label">Project name <span className="opacity-60">(optional)</span></label>
            <input
              id="desk-move-project" value={name} onChange={e => setName(e.target.value)} maxLength={60}
              placeholder="e.g. Lifelog" autoComplete="off" enterKeyHint="done"
              className="desk-input w-full mt-1.5 px-4 rounded-2xl bg-white/10 border border-white/20 text-white" style={{ textShadow: 'none' }}
            />
            {suggestions.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mt-2">
                {suggestions.map(n => (
                  <button key={n} type="button" onClick={() => setName(n)} className="desk-tag desk-tag-btn" aria-pressed={name.trim() === n}>{n}</button>
                ))}
              </div>
            )}
          </div>
        )}
        <div className="flex items-center justify-end gap-2 mt-5">
          <button type="button" onClick={onSkip} className="desk-chip px-5 rounded-xl font-semibold bg-white/10 hover:bg-white/20">Skip</button>
          {toProject && (
            <button
              type="submit" disabled={!dateMode && !name.trim() || (dateMode === 'pick' && !pickDate && !name.trim())}
              className="desk-chip btn-gold px-6 rounded-xl font-bold disabled:opacity-40" style={{ textShadow: 'none' }}
            >Save</button>
          )}
        </div>
      </form>
    </div>
  )
}

// "Move to…" fallback for people who don't drag — same move, same popup.
function MoveMenu({ task, onPick, onClose }) {
  const from = categoryOf(task)
  const firstId = CAT_IDS.find(id => id !== from)
  const firstRef = useRef(null)
  useEffect(() => { firstRef.current?.focus() }, [])
  return (
    <div className="desk-overlay" onClick={onClose}>
      <div role="dialog" aria-modal="true" aria-labelledby="desk-moveto-title" className="desk-glass desk-pop desk-move-card" onClick={e => e.stopPropagation()}>
        <h2 id="desk-moveto-title" className="desk-move-title">Move to…</h2>
        <p className="desk-move-task truncate" title={task.title}>{task.title}</p>
        <div className="flex flex-col gap-2">
          {CATEGORIES.map(c => {
            const current = c.id === from
            return (
              <button
                key={c.id} type="button" disabled={current}
                ref={c.id === firstId ? firstRef : null}
                onClick={() => onPick(task, c.id)}
                className="desk-move-option" style={{ '--cat': c.color }}
              >
                <span className="font-bold" style={{ color: c.color }}>{c.label}</span>
                {current && <span className="ml-auto text-[0.8em] opacity-70">current</span>}
              </button>
            )
          })}
        </div>
        <div className="flex justify-end mt-4">
          <button type="button" onClick={onClose} className="desk-chip px-5 rounded-xl font-semibold bg-white/10 hover:bg-white/20">Cancel</button>
        </div>
      </div>
    </div>
  )
}

// ── Settings popover (⚙️) ───────────────────────────────────────────────────
const SCENE_OPTIONS = [
  ['auto', 'Auto (live weather)'], ['clear', '☀️ Clear'], ['cloudy', '🌤️ Cloudy'], ['rain', '🌧️ Rain'],
  ['storm', '⛈️ Storm'], ['fog', '🌫️ Fog'], ['snow', '❄️ Snow'], ['night', '🌙 Night'],
]
const LAYOUT_OPTIONS = [['auto', 'Auto (by orientation)'], ['portrait', '▯ Portrait'], ['landscape', '▭ Landscape']]

function SettingsPanel({ override, onOverride, layout, onLayout, onClose }) {
  const [isFull, setIsFull] = useState(!!document.fullscreenElement)
  async function toggleFullscreen() {
    try {
      if (document.fullscreenElement) await document.exitFullscreen()
      else await document.documentElement.requestFullscreen()
    } catch {}
    setIsFull(!!document.fullscreenElement)
  }
  const Option = ({ on, label, onClick }) => (
    <button type="button" onClick={onClick} className="w-full text-left px-3 py-1.5 rounded-xl hover:bg-white/10 flex items-center justify-between">
      {label}{on && <span>✓</span>}
    </button>
  )
  return (
    <div className="desk-glass absolute bottom-12 right-0 z-50 w-60 p-3 text-sm max-h-[80vh] overflow-y-auto desk-scroll" style={{ background: 'rgba(8,8,8,0.92)' }} onClick={e => e.stopPropagation()}>
      {document.fullscreenEnabled && (
        <button type="button" onClick={toggleFullscreen} className="w-full text-left px-3 py-2 rounded-xl hover:bg-white/10 font-semibold">
          {isFull ? '⤡ Exit full screen' : '⤢ Full screen'}
        </button>
      )}
      <p className="px-3 pt-2 pb-1 text-[10px] font-bold uppercase tracking-widest opacity-60">Layout</p>
      {LAYOUT_OPTIONS.map(([id, label]) => (
        <Option key={id} on={layout === id} label={label} onClick={() => { onLayout(id); onClose() }} />
      ))}
      <p className="px-3 pt-2 pb-1 text-[10px] font-bold uppercase tracking-widest opacity-60">Background</p>
      {SCENE_OPTIONS.map(([id, label]) => (
        <Option key={id} on={override === id} label={label} onClick={() => { onOverride(id); onClose() }} />
      ))}
    </div>
  )
}

function Controls({ onExit, onRefresh, refreshing, showSettings, setShowSettings, settingsProps }) {
  return (
    <div className="flex items-center gap-1.5" onClick={e => e.stopPropagation()}>
      <button type="button" onClick={onExit} title="Exit Desk Mode (Esc)" className="desk-glass h-10 px-3 !rounded-xl text-xs font-semibold flex items-center gap-1.5 hover:bg-white/20">
        <span className="text-sm leading-none">↙</span> Exit
      </button>
      <button type="button" onClick={onRefresh} title="Refresh" className="desk-glass w-10 h-10 !rounded-xl flex items-center justify-center hover:bg-white/20">
        <span className="inline-block transition-transform duration-500" style={{ transform: refreshing ? 'rotate(360deg)' : 'none' }}>🔄</span>
      </button>
      <div className="relative">
        <button type="button" onClick={() => setShowSettings(s => !s)} title="Settings" className="desk-glass w-10 h-10 !rounded-xl flex items-center justify-center hover:bg-white/20">⚙️</button>
        {showSettings && <SettingsPanel {...settingsProps} onClose={() => setShowSettings(false)} />}
      </div>
    </div>
  )
}

// ── Page ────────────────────────────────────────────────────────────────────
const BURST_HOLD_MS = 450 // gold burst plays before the item leaves the overdue list
const wait = (ms) => new Promise(r => setTimeout(r, ms))

// onOpenTimeline({ year, open, filter }): leave Desk Mode for the Life Timeline.
export default function DeskMode({ profileName, onExit, onOpenTimeline }) {
  const [now, setNow]           = useState(() => new Date())
  const [items, setItems]       = useState([])
  const [weather, setWeather]   = useState(null)
  const [override, setOverride] = useState(readOverride)
  const [layoutPref, setLayoutPref] = useState(readLayout)
  const [refreshing, setRefreshing] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [cursorVisible, setCursorVisible] = useState(true)
  const [expanded, setExpanded] = useState(null)      // category id or null
  const [ideasOverlay, setIdeasOverlay] = useState(undefined) // undefined = closed; null/id = open
  // { kind: 'done', task } | { kind: 'move', id, title, toCat, prev }
  const [undo, setUndo] = useState(null)
  const [shift, setShift] = useState(0)
  const [dragTask, setDragTask] = useState(null)      // task being dragged
  const [flashId, setFlashId] = useState(null)        // just-moved row
  const [movePrompt, setMovePrompt] = useState(null)  // date popup after a move
  const [moveMenu, setMoveMenu] = useState(null)      // "Move to…" for this task
  const [toast, setToast] = useState(null)            // error message
  // Life Timeline card: the payload, or null (not loaded / request failed —
  // the card is then simply not shown).
  const [timeline, setTimeline] = useState(null)
  const [achievePop, setAchievePop] = useState(null)  // { item, anchor }
  const [bursts, setBursts] = useState([])            // [{ id, x, y }]
  const inputRef = useRef(null)
  const cursorTimer = useRef(null)
  const undoTimer = useRef(null)
  const flashTimer = useRef(null)
  const dragActive = useRef(false)
  const refreshHoldUntil = useRef(0)
  // Bumped on every optimistic move; a refresh that started before the bump
  // is stale and must not overwrite the moved task.
  const mutationSeq = useRef(0)
  const portraitMQ = usePortraitQuery()
  const portrait = layoutPref === 'auto' ? portraitMQ : layoutPref === 'portrait'

  // Clock
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(id)
  }, [])

  // Data — every 60 seconds, skipped while a drag is in progress and for 2s
  // after a drop so a refresh can't snap a moved task back.
  const loadData = useCallback(async () => {
    const seq = mutationSeq.current
    try {
      const rows = await bridge.getTasks() || []
      if (seq === mutationSeq.current) setItems(rows)
    } catch (e) { console.error(e) }
  }, [])
  // Life Timeline card (admin only, like the page — Desk Mode is admin only).
  // Any failure just hides the card; it must never break Desk Mode.
  const loadTimeline = useCallback(async () => {
    try { setTimeline(await bridge.getLifeTimeline()) } catch (e) { console.error('Desk Mode life timeline', e); setTimeline(null) }
  }, [])
  useEffect(() => {
    loadData()
    loadTimeline()
    const id = setInterval(() => {
      loadTimeline()
      if (dragActive.current || Date.now() < refreshHoldUntil.current) return
      loadData()
    }, DATA_REFRESH_MS)
    return () => clearInterval(id)
  }, [loadData, loadTimeline])

  const saveAchieved = useCallback(async ({ date, note }) => {
    const { item, anchor } = achievePop
    await setAchieved(item, true, { date, note })
    setAchievePop(null)
    const r = anchor.getBoundingClientRect()
    setBursts(b => [...b, { id: Date.now() + Math.random(), x: r.left + r.width / 2, y: r.top + r.height / 2 }])
    await Promise.all([loadTimeline(), wait(BURST_HOLD_MS)])
  }, [achievePop, loadTimeline])
  const closeAchieve = useCallback(() => setAchievePop(null), [])
  const openTimeline = useCallback((params) => (onOpenTimeline ? onOpenTimeline(params) : onExit()), [onOpenTimeline, onExit])
  const timelineCard = (cls) => timeline && (
    <DeskTimelineCard
      data={timeline} now={now} className={cls}
      onOpen={openTimeline}
      onMark={(item, anchor) => setAchievePop({ item, anchor })}
    />
  )

  // Weather — every 30 minutes
  const loadWeather = useCallback(async () => {
    try {
      const res = await fetch(WEATHER_URL)
      if (!res.ok) return
      const { current } = await res.json()
      if (current) setWeather({ temperature: current.temperature_2m, code: current.weathercode, windspeed: current.windspeed_10m })
    } catch {}
  }, [])
  useEffect(() => {
    loadWeather()
    const id = setInterval(loadWeather, WEATHER_REFRESH_MS)
    return () => clearInterval(id)
  }, [loadWeather])

  // Burn-in guard — nudge the whole layout a few px every 10 minutes
  useEffect(() => {
    // Never mid-drag: shifting the layout would move the drop targets under the cursor.
    const id = setInterval(() => { if (!dragActive.current) setShift(s => (s + 1) % SHIFTS.length) }, SHIFT_MS)
    return () => clearInterval(id)
  }, [])

  // An expanded section folds back on its own so the ambient view returns
  useEffect(() => {
    if (!expanded || dragTask) return
    const id = setTimeout(() => setExpanded(null), EXPAND_IDLE_MS)
    return () => clearTimeout(id)
  }, [expanded, dragTask])

  // ESC: cancel a keyboard drag (dnd-kit handles it and marks the event),
  // close popups/overlays/menus, then clear a half-typed entry, then exit
  useEffect(() => {
    function onKey(e) {
      if (e.key !== 'Escape') return
      if (e.defaultPrevented || dragActive.current) return
      if (achievePop) return setAchievePop(null) // (the popover normally handles this itself)
      if (movePrompt) return skipMoveDetails()
      if (moveMenu) return setMoveMenu(null)
      if (showSettings) return setShowSettings(false)
      if (ideasOverlay !== undefined) return setIdeasOverlay(undefined)
      if (expanded) return setExpanded(null)
      const el = inputRef.current
      if (document.activeElement === el && el.value) return el.clearDraft?.()
      onExit()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onExit, showSettings, ideasOverlay, expanded, movePrompt, moveMenu, achievePop])

  // Cursor hidden while idle; shown on mouse move/touch for 3s
  useEffect(() => {
    function wake() {
      setCursorVisible(true)
      clearTimeout(cursorTimer.current)
      cursorTimer.current = setTimeout(() => setCursorVisible(false), 3000)
    }
    wake()
    window.addEventListener('mousemove', wake)
    window.addEventListener('touchstart', wake, { passive: true })
    return () => {
      clearTimeout(cursorTimer.current)
      window.removeEventListener('mousemove', wake)
      window.removeEventListener('touchstart', wake)
    }
  }, [])

  // `today` comes from the ticking clock, so every relative label and count
  // recomputes the moment the date rolls over; reload at midnight as well.
  const today = localDateStr(now)
  const firstDay = useRef(today)
  useEffect(() => {
    if (today !== firstDay.current) { firstDay.current = today; loadData() }
  }, [today, loadData])

  const night = isNightHour(now.getHours())
  const liveCondition = weather ? conditionFromCode(weather.code) : 'clear'
  const forcedNight = override === 'night'
  const scene = override === 'auto' || forcedNight ? liveCondition : override
  const sceneForBg = forcedNight ? 'clear' : scene
  const nightForBg = forcedNight || (override === 'auto' && night)

  const byCategory = useMemo(() => {
    const groups = { job: [], personal: [], project: [] }
    for (const t of items) {
      if (t.type === 'task' && t.status === 'pending') groups[categoryOf(t)].push(t)
    }
    for (const k in groups) groups[k].sort(sortByDeadline)
    return groups
  }, [items])
  const counts = useMemo(() => deadlineCounts(items, today), [items, today])
  const CAT_ORDER = { job: 0, personal: 1, project: 2 }
  const ideas = useMemo(() => items
    .filter(t => t.type === 'idea' && t.status !== 'archived')
    .sort((a, b) => (CAT_ORDER[categoryOf(a)] - CAT_ORDER[categoryOf(b)])
      || (b.created_at || '').localeCompare(a.created_at || '')), [items])

  const projectNames = useMemo(() => [...new Set(items
    .map(t => (t.project_name || '').trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b)), [items])

  function showUndo(u) {
    setUndo(u)
    clearTimeout(undoTimer.current)
    undoTimer.current = setTimeout(() => setUndo(null), UNDO_MS)
  }
  function flash(id) {
    setFlashId(id)
    clearTimeout(flashTimer.current)
    flashTimer.current = setTimeout(() => setFlashId(null), FLASH_MS)
  }
  const patchItem = (id, fields) => setItems(list => list.map(t => t.id === id ? { ...t, ...fields } : t))
  function markMutation() {
    mutationSeq.current++
    refreshHoldUntil.current = Math.max(refreshHoldUntil.current, Date.now() + REFRESH_HOLD_MS)
  }

  async function completeTask(task) {
    const done_at = new Date().toISOString()
    patchItem(task.id, { status: 'done', done_at })
    showUndo({ kind: 'done', task })
    try { await bridge.updateTask({ id: task.id, status: 'done' }) } catch { loadData() }
  }

  async function undoComplete(task) {
    setUndo(null)
    patchItem(task.id, { status: 'pending', done_at: null })
    try { await bridge.updateTask({ id: task.id, status: 'pending' }) } catch { loadData() }
  }

  // Move a task to another category: UI first, then PUT { category } only.
  // Leaving Project drops project_name (same rule as the server). An undated
  // task then gets the optional date popup; the undo toast follows it.
  async function moveTask(task, toCat) {
    setMoveMenu(null)
    const fromCat = categoryOf(task)
    if (!CATEGORY_META[toCat] || toCat === fromCat) return
    const prev = { category: fromCat, due_date: task.due_date ?? null, project_name: task.project_name ?? null }
    const move = { kind: 'move', id: task.id, title: task.title, toCat, prev }
    markMutation()
    patchItem(task.id, { category: toCat, project_name: toCat === 'project' ? (task.project_name ?? null) : null })
    flash(task.id)
    clearTimeout(undoTimer.current)
    setUndo(null)
    if (task.due_date) showUndo(move)
    else setMovePrompt(move)
    try {
      await bridge.updateTask({ id: task.id, category: toCat })
    } catch (e) {
      console.error(e)
      mutationSeq.current++
      patchItem(task.id, prev)
      setMovePrompt(p => (p?.id === task.id ? null : p))
      setUndo(u => (u?.kind === 'move' && u.id === task.id ? null : u))
      setToast(`Couldn't move "${task.title}" — it's back in ${catLabel(fromCat)}`)
    }
  }

  // Second, optional update from the date popup: only the fields that were set.
  async function saveMoveDetails(fields) {
    const move = movePrompt
    if (!move) return
    setMovePrompt(null)
    showUndo(move)
    if (!Object.keys(fields).length) return
    const before = items.find(t => t.id === move.id)
    markMutation()
    patchItem(move.id, fields)
    flash(move.id)
    try {
      await bridge.updateTask({ id: move.id, ...fields })
    } catch (e) {
      console.error(e)
      mutationSeq.current++
      if (before) patchItem(move.id, { due_date: before.due_date ?? null, project_name: before.project_name ?? null })
      setToast(`Couldn't save the ${fields.due_date ? 'due date' : 'project name'} for "${move.title}"`)
    }
  }
  function skipMoveDetails() { saveMoveDetails({}) }

  // Puts the task back exactly as it was before the move.
  async function undoMove(u) {
    setUndo(null)
    setMovePrompt(null)
    markMutation()
    patchItem(u.id, u.prev)
    flash(u.id)
    try {
      await bridge.updateTask({ id: u.id, ...u.prev })
    } catch (e) {
      console.error(e)
      setToast(`Couldn't undo the move of "${u.title}"`)
      mutationSeq.current++
      loadData()
    }
  }

  // ── Drag handlers ──
  const sensors = useSensors(
    // Mouse: 8px of travel first, so a click (or the checkbox tap) stays a click.
    useSensor(MouseSensor, { activationConstraint: { distance: 8 } }),
    // Touch: a 250ms press-and-hold, so a swipe still scrolls.
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: boxKeyboardCoordinates }),
  )
  function endDrag() {
    dragActive.current = false
    refreshHoldUntil.current = Date.now() + REFRESH_HOLD_MS
    setDragTask(null)
  }
  function onDragStart({ active }) {
    dragActive.current = true
    setShowSettings(false)
    setDragTask(active.data.current?.task || null)
  }
  function onDragEnd({ active, over }) {
    const task = active.data.current?.task
    endDrag()
    const toCat = dropCat(over?.id)
    if (task && toCat && toCat !== categoryOf(task)) moveTask(task, toCat)
  }

  async function addItem(payload) {
    await bridge.createTask(payload)
    await loadData()
  }

  async function handleRefresh() {
    setRefreshing(true)
    await Promise.all([loadData(), loadWeather(), loadTimeline()])
    setTimeout(() => setRefreshing(false), 600)
  }

  function changeOverride(v) { setOverride(v); writeOverride(v) }
  function changeLayout(v) { setLayoutPref(v); writeLayout(v); setExpanded(null) }

  const hour = now.getHours()
  const firstName = (profileName || '').trim().split(/\s+/)[0]
  const greeting = hour < 12 ? ['Good Morning', '☀️'] : hour < 17 ? ['Good Afternoon', '🌤️'] : hour < 22 ? ['Good Evening', '🌇'] : ['Good Night', '🌙']
  const greetingText = `${greeting[0]}${firstName ? `, ${firstName}` : ''}`

  const measureKey = `${portrait}-${expanded}`

  const controls = (
    <Controls
      onExit={onExit} onRefresh={handleRefresh} refreshing={refreshing}
      showSettings={showSettings} setShowSettings={setShowSettings}
      settingsProps={{ override, onOverride: changeOverride, layout: layoutPref, onLayout: changeLayout }}
    />
  )

  const renderSection = (cat, extra) => (
    <CategorySection
      key={cat} cat={cat} tasks={byCategory[cat]} today={today}
      onComplete={completeTask} onMoveMenu={setMoveMenu} flashId={flashId}
      dragFrom={dragTask ? categoryOf(dragTask) : null} {...extra}
      expanded={expanded === cat} onExpand={setExpanded} measureKey={measureKey}
    />
  )

  const [dx, dy] = SHIFTS[shift]

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={deskCollision}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onDragCancel={endDrag}
      accessibility={{ announcements: ANNOUNCEMENTS, screenReaderInstructions: SCREEN_READER, container: document.body }}
    >
    <div
      className={`desk-root ${portrait ? 'desk-portrait' : 'desk-landscape'} ${cursorVisible || dragTask ? '' : 'desk-hide-cursor'} ${dragTask ? 'desk-dragging' : ''}`}
      onClick={() => setShowSettings(false)}
    >
      <WeatherBackground scene={sceneForBg} night={nightForBg} />
      <div className="desk-scrim" />

      <div className="desk-layout" style={{ transform: `translate(${dx}px, ${dy}px)` }}>
        {portrait ? (
          <>
            <PortraitHeader now={now} greeting={greetingText} weather={weather} scene={scene} night={nightForBg} />
            <SummaryStrip counts={counts} />
            {timelineCard('dp-lt')}
            <PortraitSections byCategory={byCategory} expanded={expanded} renderSection={renderSection} />
            <IdeasPanel ideas={ideas} onOpen={setIdeasOverlay} measureKey={measureKey} className="dp-ideas" />
          </>
        ) : (
          <>
            <header className="flex items-end justify-between gap-4 shrink-0">
              <h1 className="text-2xl sm:text-4xl font-semibold tracking-tight">
                {greetingText} <span style={{ textShadow: 'none' }}>{greeting[1]}</span>
              </h1>
              <p className="desk-header-date text-base sm:text-xl font-medium opacity-90 text-right">
                {now.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}
              </p>
            </header>
            <main className="desk-main flex-1 min-h-0">
              {/* With the Life Timeline card: it runs across the top of the three task columns */}
              <div className={`dl-grid${timeline ? ' has-lt' : ''}`}>
                <aside className="dl-side">
                  <ClockCard now={now} weather={weather} scene={scene} night={nightForBg} />
                  <SummaryStrip counts={counts} />
                  <IdeasPanel ideas={ideas} onOpen={setIdeasOverlay} measureKey={measureKey} className="flex-1 min-h-0" />
                </aside>
                {timelineCard('dl-lt')}
                {CATEGORIES.map(c => renderSection(c.id))}
              </div>
            </main>
          </>
        )}

        <div className="relative shrink-0">
          {undo && (
            <div className="desk-undo-wrap">
              <div key={`${undo.kind}-${undo.id ?? undo.task?.id}`} className="desk-glass desk-pop desk-undo" role="status">
                {undo.kind === 'move' ? (
                  <span className="truncate">
                    Moved to <b style={{ color: CATEGORY_META[undo.toCat].color }}>{catLabel(undo.toCat)}</b>
                  </span>
                ) : (
                  <span className="truncate">✓ Done: {undo.task.title}</span>
                )}
                <span className="opacity-50 shrink-0" aria-hidden="true">—</span>
                <button
                  type="button"
                  onClick={() => (undo.kind === 'move' ? undoMove(undo) : undoComplete(undo.task))}
                  className="font-bold shrink-0" style={{ color: '#D4AF37' }}
                >Undo</button>
              </div>
            </div>
          )}
          <div className={portrait ? '' : 'lg:mr-[200px]'}>
            <QuickAdd inputRef={inputRef} today={today} onAdd={addItem}>
              {portrait && <div className="ml-auto transition-opacity duration-500" style={{ opacity: showSettings ? 1 : cursorVisible ? 0.9 : 0.35 }}>{controls}</div>}
            </QuickAdd>
          </div>
        </div>
      </div>

      {/* Corner controls (landscape) */}
      {!portrait && (
        <div
          className="absolute right-4 bottom-4 sm:right-6 sm:bottom-6 z-10 transition-opacity duration-500 hover:opacity-100"
          style={{ opacity: showSettings ? 1 : cursorVisible ? 0.85 : 0.3 }}
        >
          {controls}
        </div>
      )}

      {ideasOverlay !== undefined && (
        <IdeasOverlay ideas={ideas} focusId={ideasOverlay} onClose={() => setIdeasOverlay(undefined)} />
      )}

      {/* Outside .desk-layout: its burn-in transform would offset a fixed overlay */}
      <DragOverlay dropAnimation={null}>
        {dragTask && <DeskRowGhost task={dragTask} today={today} />}
      </DragOverlay>

      {/* Outside .desk-layout too (burn-in transform), like the drag overlay */}
      {achievePop && <AchievePopover item={achievePop.item} anchor={achievePop.anchor} onSave={saveAchieved} onClose={closeAchieve} touch />}
      {bursts.map(b => <Burst key={b.id} x={b.x} y={b.y} onDone={() => setBursts(list => list.filter(x => x.id !== b.id))} />)}

      {moveMenu && <MoveMenu task={moveMenu} onPick={moveTask} onClose={() => setMoveMenu(null)} />}
      {movePrompt && (
        <MoveDetailsPopup
          key={movePrompt.id} prompt={movePrompt} today={today} projectNames={projectNames}
          onSave={saveMoveDetails} onSkip={skipMoveDetails}
        />
      )}
      <Toast message={toast || ''} type="error" visible={!!toast} onHide={() => setToast(null)} />
    </div>
    </DndContext>
  )
}
