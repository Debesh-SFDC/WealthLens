import { useState, useEffect, useLayoutEffect, useMemo, useRef, useCallback } from 'react'
import bridge from '../lib/bridge'
import {
  localDateStr, addDays, relativeDue, sortByDeadline, deadlineCounts,
  CATEGORIES, CATEGORY_META, categoryOf, readLastCategory, writeLastCategory,
} from '../lib/tasks'
import CategoryChips from '../components/CategoryChips'
import '../desk.css'

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
function DeskTaskRow({ task, today, onComplete }) {
  const [phase, setPhase] = useState(null) // null → 'checking' → 'leaving'
  const due = relativeDue(task, today)

  function handleTap() {
    if (phase) return
    setPhase('checking')
    // Gold fill + strike-through, then the row folds away, then it's done.
    setTimeout(() => setPhase('leaving'), 480)
    setTimeout(() => onComplete(task), 820)
  }

  const checked = !!phase
  return (
    <div className={`desk-row ${phase === 'leaving' ? 'desk-row-leaving' : ''}`}>
      <button
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
        <svg viewBox="0 0 24 24" fill="none" stroke="#0A0A0A" strokeWidth={3.5} strokeLinecap="round" strokeLinejoin="round"
          className="w-1/2 h-1/2 transition-opacity duration-200" style={{ opacity: checked ? 1 : 0 }}>
          <polyline points="20 6 9 17 4 12" />
        </svg>
      </button>
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
    </div>
  )
}

// ── Category section ────────────────────────────────────────────────────────
// Shows as many rows as fit; if the list overflows, the last visible slot
// becomes "+N more", which expands the section (scrollable, no scrollbar).
// Portrait passes `slots` (rows allotted by PortraitSections); landscape
// columns measure their own height instead.
function CategorySection({ cat, tasks, today, onComplete, slots, style, expanded, onExpand, measureKey }) {
  const meta = CATEGORY_META[cat]
  const listRef = useRef(null)
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

  return (
    <section
      className={`desk-glass desk-section ${expanded ? 'desk-section-expanded' : ''}`}
      style={{ '--cat': meta.color, ...style }}
    >
      <button className="desk-section-head" onClick={() => tasks.length > cap || expanded ? onExpand(expanded ? null : cat) : null}>
        <span className="desk-section-title" style={{ color: meta.color }}>{meta.label}</span>
        <span className="desk-section-count">· {tasks.length} open</span>
        {expanded && <span className="ml-auto desk-section-count">Show less ▲</span>}
      </button>
      <div ref={listRef} className={`desk-list ${expanded ? 'desk-scroll' : ''}`}>
        {tasks.length === 0 && <p className="desk-empty">All clear ✨</p>}
        {visible.map(t => <DeskTaskRow key={t.id} task={t} today={today} onComplete={onComplete} />)}
        {overflow && hidden > 0 && (
          <button className="desk-row desk-more" onClick={() => onExpand(cat)}>
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
export default function DeskMode({ profileName, onExit }) {
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
  const [undo, setUndo] = useState(null)              // last completed task
  const [shift, setShift] = useState(0)
  const inputRef = useRef(null)
  const cursorTimer = useRef(null)
  const undoTimer = useRef(null)
  const portraitMQ = usePortraitQuery()
  const portrait = layoutPref === 'auto' ? portraitMQ : layoutPref === 'portrait'

  // Clock
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(id)
  }, [])

  // Data — every 60 seconds
  const loadData = useCallback(async () => {
    try { setItems(await bridge.getTasks() || []) } catch (e) { console.error(e) }
  }, [])
  useEffect(() => {
    loadData()
    const id = setInterval(loadData, DATA_REFRESH_MS)
    return () => clearInterval(id)
  }, [loadData])

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
    const id = setInterval(() => setShift(s => (s + 1) % SHIFTS.length), SHIFT_MS)
    return () => clearInterval(id)
  }, [])

  // An expanded section folds back on its own so the ambient view returns
  useEffect(() => {
    if (!expanded) return
    const id = setTimeout(() => setExpanded(null), EXPAND_IDLE_MS)
    return () => clearTimeout(id)
  }, [expanded])

  // ESC: close overlays/menus first, then clear a half-typed entry, then exit
  useEffect(() => {
    function onKey(e) {
      if (e.key !== 'Escape') return
      if (showSettings) return setShowSettings(false)
      if (ideasOverlay !== undefined) return setIdeasOverlay(undefined)
      if (expanded) return setExpanded(null)
      const el = inputRef.current
      if (document.activeElement === el && el.value) return el.clearDraft?.()
      onExit()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onExit, showSettings, ideasOverlay, expanded])

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

  async function completeTask(task) {
    const done_at = new Date().toISOString()
    setItems(list => list.map(t => t.id === task.id ? { ...t, status: 'done', done_at } : t))
    setUndo(task)
    clearTimeout(undoTimer.current)
    undoTimer.current = setTimeout(() => setUndo(null), 6000)
    try { await bridge.updateTask({ id: task.id, status: 'done' }) } catch { loadData() }
  }

  async function undoComplete() {
    const task = undo
    if (!task) return
    setUndo(null)
    setItems(list => list.map(t => t.id === task.id ? { ...t, status: 'pending', done_at: null } : t))
    try { await bridge.updateTask({ id: task.id, status: 'pending' }) } catch { loadData() }
  }

  async function addItem(payload) {
    await bridge.createTask(payload)
    await loadData()
  }

  async function handleRefresh() {
    setRefreshing(true)
    await Promise.all([loadData(), loadWeather()])
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
      onComplete={completeTask} {...extra}
      expanded={expanded === cat} onExpand={setExpanded} measureKey={measureKey}
    />
  )

  const [dx, dy] = SHIFTS[shift]

  return (
    <div
      className={`desk-root ${portrait ? 'desk-portrait' : 'desk-landscape'} ${cursorVisible ? '' : 'desk-hide-cursor'}`}
      onClick={() => setShowSettings(false)}
    >
      <WeatherBackground scene={sceneForBg} night={nightForBg} />
      <div className="desk-scrim" />

      <div className="desk-layout" style={{ transform: `translate(${dx}px, ${dy}px)` }}>
        {portrait ? (
          <>
            <PortraitHeader now={now} greeting={greetingText} weather={weather} scene={scene} night={nightForBg} />
            <SummaryStrip counts={counts} />
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
              <div className="dl-grid">
                <aside className="dl-side">
                  <ClockCard now={now} weather={weather} scene={scene} night={nightForBg} />
                  <SummaryStrip counts={counts} />
                  <IdeasPanel ideas={ideas} onOpen={setIdeasOverlay} measureKey={measureKey} className="flex-1 min-h-0" />
                </aside>
                {CATEGORIES.map(c => renderSection(c.id))}
              </div>
            </main>
          </>
        )}

        <div className="relative shrink-0">
          {undo && (
            <div className="desk-undo-wrap">
              <div className="desk-glass desk-pop desk-undo">
                <span className="truncate">✓ Done: {undo.title}</span>
                <button type="button" onClick={undoComplete} className="font-bold shrink-0" style={{ color: '#D4AF37' }}>Undo</button>
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
    </div>
  )
}
