import { useState, useEffect, useMemo, useRef, useCallback } from 'react'
import bridge from '../lib/bridge'
import { localDateStr, todaysTasks, isOverdue, formatDue, sortTasks, ideaColor } from '../lib/tasks'
import '../desk.css'

// Desk Mode — full-screen ambient display for a spare monitor or tablet: live
// clock, today's tasks, recent ideas and a weather-reactive animated
// background. No sidebar/nav; ESC or the corner control exits.

const WEATHER_URL = 'https://api.open-meteo.com/v1/forecast?latitude=20.47&longitude=85.84'
  + '&current=temperature_2m,weathercode,windspeed_10m&timezone=Asia%2FKolkata'
const LOCATION = 'Bhubaneswar'
const DATA_REFRESH_MS    = 5 * 60 * 1000
const WEATHER_REFRESH_MS = 30 * 60 * 1000
const OVERRIDE_KEY = 'desk_weather_override'

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

// ── Clock card ──────────────────────────────────────────────────────────────
function ClockCard({ now, weather, scene, night }) {
  const h = now.getHours()
  const hh = String(h % 12 || 12)
  const mm = String(now.getMinutes()).padStart(2, '0')
  const meta = CONDITION_META[scene] || CONDITION_META.cloudy
  const icon = night && meta.nightIcon ? meta.nightIcon : meta.icon
  return (
    <div className="desk-glass h-full flex flex-col items-center justify-center text-center px-6 py-8">
      <div className="flex items-start leading-none">
        <span className="desk-clock font-light tracking-tight tabular-nums">
          {hh}<span className="desk-colon">:</span>{mm}
        </span>
        <span className="ml-2 mt-2 text-xl sm:text-2xl font-semibold opacity-80">{h >= 12 ? 'PM' : 'AM'}</span>
      </div>
      <p className="mt-4 text-lg font-medium opacity-90">
        {now.toLocaleDateString('en-IN', { weekday: 'long' })}, {now.toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })}
      </p>
      <div className="mt-6 pt-5 w-full border-t border-white/20 flex flex-col items-center gap-1">
        {weather ? (
          <>
            <div className="flex items-center gap-3">
              <span className="text-5xl" style={{ textShadow: 'none' }}>{icon}</span>
              <span className="text-4xl font-semibold tabular-nums">{Math.round(weather.temperature)}°C</span>
            </div>
            <p className="text-sm font-medium opacity-90">{meta.label}</p>
            <p className="text-xs opacity-70">📍 {LOCATION} · 💨 {Math.round(weather.windspeed)} km/h</p>
          </>
        ) : (
          <p className="text-sm opacity-70">📍 {LOCATION} · weather loading…</p>
        )}
      </div>
    </div>
  )
}

// ── Tasks card ──────────────────────────────────────────────────────────────
function TasksCard({ tasks, today, onToggle }) {
  const [animating, setAnimating] = useState({})
  const done = tasks.filter(t => t.status === 'done').length
  const total = tasks.length
  const allDone = total > 0 && done === total
  const ordered = [...tasks].sort((a, b) => {
    if (a.status !== b.status) return a.status === 'done' ? 1 : -1
    return sortTasks(a, b)
  })

  function handleTap(task) {
    if (animating[task.id]) return
    const toDone = task.status !== 'done'
    setAnimating(a => ({ ...a, [task.id]: toDone ? 'done' : 'pending' }))
    // Let the fill + strike-through play before the row re-sorts.
    setTimeout(async () => {
      await onToggle(task, toDone ? 'done' : 'pending')
      setAnimating(a => { const n = { ...a }; delete n[task.id]; return n })
    }, toDone ? 550 : 0)
  }

  return (
    <div className="desk-glass h-full flex flex-col p-5 sm:p-6 min-h-0">
      <div className="flex items-baseline justify-between gap-3 mb-1">
        <h2 className="text-xs font-bold uppercase tracking-[0.2em] opacity-80">Today's Tasks</h2>
        {total > 0 && <span className="text-sm font-semibold opacity-90 tabular-nums">{done} of {total} done today</span>}
      </div>
      {total > 0 && (
        <div className="h-1.5 rounded-full bg-white/15 overflow-hidden mb-4 mt-2">
          <div className="h-full rounded-full bg-emerald-400 transition-all duration-700 ease-out" style={{ width: `${(done / total) * 100}%` }} />
        </div>
      )}

      {allDone && (
        <div className="desk-pop mb-4 px-4 py-3 rounded-2xl bg-emerald-400/20 border border-emerald-300/40 text-center">
          <p className="text-lg font-bold">🎉 All tasks done! Great work!</p>
        </div>
      )}

      <div className="desk-scroll flex-1 min-h-0 -mx-2 px-2 space-y-1.5">
        {total === 0 && (
          <div className="h-full flex flex-col items-center justify-center text-center py-8 opacity-80">
            <p className="text-3xl mb-2">🌱</p>
            <p className="text-base font-medium">Nothing on the list today.</p>
            <p className="text-sm opacity-75 mt-1">Add a task below to get started.</p>
          </div>
        )}
        {ordered.map(t => {
          const state = animating[t.id]
          const checked = state ? state === 'done' : t.status === 'done'
          const overdue = isOverdue(t, today)
          return (
            <button
              key={t.id}
              onClick={() => handleTap(t)}
              className="w-full flex items-center gap-4 px-3 py-3 rounded-2xl text-left hover:bg-white/10 transition-colors"
              style={{ opacity: t.status === 'done' && !state ? 0.6 : 1 }}
            >
              <span
                className="w-8 h-8 shrink-0 rounded-xl border-2 flex items-center justify-center transition-all duration-300"
                style={{
                  borderColor: checked ? '#34D399' : 'rgba(255,255,255,0.7)',
                  backgroundColor: checked ? '#34D399' : 'rgba(255,255,255,0.06)',
                  transform: state === 'done' ? 'scale(1.12)' : 'scale(1)',
                }}
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth={3.5} strokeLinecap="round" strokeLinejoin="round"
                  className="w-4 h-4 transition-opacity duration-200" style={{ opacity: checked ? 1 : 0 }}>
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              </span>
              <span className="flex-1 min-w-0">
                <span
                  className="block text-lg font-medium break-words line-through"
                  style={{ textDecorationColor: checked ? 'rgba(255,255,255,0.85)' : 'transparent', textDecorationThickness: 2, transition: 'text-decoration-color 0.35s ease' }}
                >
                  {t.title}
                </span>
                {t.due_date && t.status !== 'done' && (
                  <span className="block text-xs mt-0.5" style={{ color: overdue ? '#FCA5A5' : 'rgba(255,255,255,0.65)' }}>
                    {overdue ? 'Overdue · ' : ''}{formatDue(t.due_date, today)}
                  </span>
                )}
              </span>
              {t.priority === 'high' && t.status !== 'done' && (
                <span className="w-2.5 h-2.5 rounded-full bg-red-400 shrink-0" title="High priority" />
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}

// ── Ideas card ──────────────────────────────────────────────────────────────
function IdeasCard({ ideas, onNewIdea }) {
  const [expanded, setExpanded] = useState(null)
  return (
    <div className="desk-glass h-full flex flex-col p-5 sm:p-6 min-h-0">
      <div className="flex items-center justify-between gap-3 mb-4">
        <h2 className="text-xs font-bold uppercase tracking-[0.2em] opacity-80">Recent Ideas</h2>
        <button
          onClick={onNewIdea}
          className="px-3 py-1.5 rounded-full text-xs font-semibold bg-white/15 border border-white/25 hover:bg-white/25 transition-colors"
        >+ New Idea</button>
      </div>
      <div className="desk-scroll flex-1 min-h-0 space-y-2.5">
        {ideas.length === 0 && (
          <div className="h-full flex flex-col items-center justify-center text-center py-8 opacity-80">
            <p className="text-3xl mb-2">💡</p>
            <p className="text-base font-medium">No ideas yet.</p>
            <p className="text-sm opacity-75 mt-1">The next spark goes here.</p>
          </div>
        )}
        {ideas.map(idea => {
          const open = expanded === idea.id
          const c = ideaColor(idea.id)
          return (
            <button
              key={idea.id}
              onClick={() => setExpanded(open ? null : idea.id)}
              className="w-full text-left px-4 py-3 rounded-2xl border transition-colors hover:brightness-110"
              style={{ backgroundColor: c.bg + '33', borderColor: c.border + '55' }}
            >
              <p className={`text-base font-semibold ${open ? 'break-words' : 'truncate'}`}>💡 {idea.title}</p>
              {open && (
                <p className="text-sm mt-1.5 opacity-90 whitespace-pre-wrap break-words">
                  {idea.description || <span className="italic opacity-70">No description</span>}
                </p>
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}

// ── Settings popover (⚙️) ───────────────────────────────────────────────────
const SCENE_OPTIONS = [
  ['auto', 'Auto (live weather)'], ['clear', '☀️ Clear'], ['cloudy', '🌤️ Cloudy'], ['rain', '🌧️ Rain'],
  ['storm', '⛈️ Storm'], ['fog', '🌫️ Fog'], ['snow', '❄️ Snow'], ['night', '🌙 Night'],
]

function SettingsPanel({ override, onOverride, onClose }) {
  const [isFull, setIsFull] = useState(!!document.fullscreenElement)
  async function toggleFullscreen() {
    try {
      if (document.fullscreenElement) await document.exitFullscreen()
      else await document.documentElement.requestFullscreen()
    } catch {}
    setIsFull(!!document.fullscreenElement)
  }
  return (
    <div className="desk-glass absolute bottom-12 right-0 w-60 p-3 text-sm" style={{ background: 'rgba(0,0,0,0.55)' }} onClick={e => e.stopPropagation()}>
      {document.fullscreenEnabled && (
        <button onClick={toggleFullscreen} className="w-full text-left px-3 py-2 rounded-xl hover:bg-white/10 font-semibold">
          {isFull ? '⤡ Exit full screen' : '⤢ Full screen'}
        </button>
      )}
      <p className="px-3 pt-2 pb-1 text-[10px] font-bold uppercase tracking-widest opacity-60">Background</p>
      {SCENE_OPTIONS.map(([id, label]) => (
        <button
          key={id}
          onClick={() => { onOverride(id); onClose() }}
          className="w-full text-left px-3 py-1.5 rounded-xl hover:bg-white/10 flex items-center justify-between"
        >
          {label}
          {override === id && <span>✓</span>}
        </button>
      ))}
    </div>
  )
}

// ── Page ────────────────────────────────────────────────────────────────────
export default function DeskMode({ profileName, onExit }) {
  const [now, setNow]           = useState(() => new Date())
  const [items, setItems]       = useState([])
  const [weather, setWeather]   = useState(null)
  const [override, setOverride] = useState(readOverride)
  const [addType, setAddType]   = useState('task')
  const [text, setText]         = useState('')
  const [saving, setSaving]     = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [cursorVisible, setCursorVisible] = useState(true)
  const inputRef = useRef(null)
  const cursorTimer = useRef(null)

  // Clock
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(id)
  }, [])

  // Data — every 5 minutes
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

  // ESC exits (first clears a half-typed entry)
  useEffect(() => {
    function onKey(e) {
      if (e.key !== 'Escape') return
      if (showSettings) return setShowSettings(false)
      if (document.activeElement === inputRef.current && inputRef.current.value) return setText('')
      onExit()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onExit, showSettings])

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

  const today = localDateStr(now)
  const night = isNightHour(now.getHours())
  const liveCondition = weather ? conditionFromCode(weather.code) : 'clear'
  const forcedNight = override === 'night'
  const scene = override === 'auto' || forcedNight ? liveCondition : override
  const sceneForBg = forcedNight ? 'clear' : scene
  const nightForBg = forcedNight || (override === 'auto' && night)

  const deskTasks = useMemo(() => todaysTasks(items, today), [items, today])
  const ideas = useMemo(() => items
    .filter(t => t.type === 'idea' && t.status !== 'archived')
    .sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''))
    .slice(0, 20), [items])

  async function toggleTask(task, status) {
    setItems(list => list.map(t => t.id === task.id
      ? { ...t, status, done_at: status === 'done' ? new Date().toISOString() : null } : t))
    try { await bridge.updateTask({ id: task.id, status }) } catch { loadData() }
  }

  async function handleAdd(e) {
    e?.preventDefault()
    const title = text.trim()
    if (!title || saving) return
    setSaving(true)
    try {
      await bridge.createTask({ title, type: addType })
      setText('')
      await loadData()
    } catch (err) {
      console.error(err)
    } finally {
      setSaving(false)
      inputRef.current?.focus()
    }
  }

  async function handleRefresh() {
    setRefreshing(true)
    await Promise.all([loadData(), loadWeather()])
    setTimeout(() => setRefreshing(false), 600)
  }

  function startNewIdea() {
    setAddType('idea')
    inputRef.current?.focus()
  }

  function changeOverride(v) {
    setOverride(v)
    writeOverride(v)
  }

  const hour = now.getHours()
  const firstName = (profileName || '').trim().split(/\s+/)[0]
  const greeting = hour < 12 ? ['Good Morning', '☀️'] : hour < 17 ? ['Good Afternoon', '🌤️'] : hour < 22 ? ['Good Evening', '🌇'] : ['Good Night', '🌙']

  return (
    <div className={`desk-root ${cursorVisible ? '' : 'desk-hide-cursor'}`} onClick={() => setShowSettings(false)}>
      <WeatherBackground scene={sceneForBg} night={nightForBg} />
      <div className="desk-scrim" />

      <div className="desk-layout">
        {/* Header */}
        <header className="flex items-end justify-between gap-4 shrink-0">
          <h1 className="text-2xl sm:text-4xl font-semibold tracking-tight">
            {greeting[0]}{firstName ? `, ${firstName}` : ''} <span style={{ textShadow: 'none' }}>{greeting[1]}</span>
          </h1>
          <p className="desk-header-date text-base sm:text-xl font-medium opacity-90 text-right">
            {now.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}
          </p>
        </header>

        {/* Main grid */}
        <main className="desk-main flex-1 min-h-0 flex flex-col">
          <div className="desk-grid">
            <section className="desk-area-tasks"><TasksCard tasks={deskTasks} today={today} onToggle={toggleTask} /></section>
            <section className="desk-area-time"><ClockCard now={now} weather={weather} scene={scene} night={nightForBg} /></section>
            <section className="desk-area-ideas"><IdeasCard ideas={ideas} onNewIdea={startNewIdea} /></section>
          </div>
        </main>

        {/* Quick add */}
        <form onSubmit={handleAdd} className="desk-glass shrink-0 flex flex-wrap sm:flex-nowrap items-center gap-2 sm:gap-3 p-2.5 sm:p-3 lg:mr-[200px]">
          <input
            ref={inputRef}
            autoFocus
            value={text}
            onChange={e => setText(e.target.value)}
            enterKeyHint="done"
            placeholder={addType === 'idea' ? '💡 Capture an idea…' : '📝 Add task or 💡 idea…'}
            className="desk-input flex-1 min-w-[180px] h-14 px-5 rounded-2xl bg-white/10 border border-white/20 text-lg text-white"
            style={{ textShadow: 'none' }}
          />
          <div className="flex p-1 rounded-2xl bg-white/10 border border-white/15">
            {[['task', '📝 Task'], ['idea', '💡 Idea']].map(([id, label]) => (
              <button
                key={id} type="button" onClick={() => { setAddType(id); inputRef.current?.focus() }}
                className="px-4 h-11 rounded-xl text-sm font-semibold transition-colors"
                style={addType === id ? { backgroundColor: 'rgba(255,255,255,0.9)', color: '#1a1a2e', textShadow: 'none' } : { color: 'rgba(255,255,255,0.85)' }}
              >{label}</button>
            ))}
          </div>
          <button
            type="submit"
            disabled={!text.trim() || saving}
            className="h-14 px-7 rounded-2xl text-base font-bold bg-white text-[#1a1a2e] hover:bg-white/90 transition-colors disabled:opacity-40"
            style={{ textShadow: 'none' }}
          >{saving ? '…' : 'Add'}</button>
        </form>
      </div>

      {/* Corner controls */}
      <div
        className="absolute right-4 bottom-4 sm:right-6 sm:bottom-6 z-10 flex items-center gap-1.5 transition-opacity duration-500 hover:opacity-100"
        style={{ opacity: cursorVisible || showSettings ? 0.85 : 0.3 }}
        onClick={e => e.stopPropagation()}
      >
        <button onClick={onExit} title="Exit Desk Mode (Esc)" className="desk-glass h-10 px-3 !rounded-xl text-xs font-semibold flex items-center gap-1.5 hover:bg-white/20">
          <span className="text-sm leading-none">↙</span> Exit
        </button>
        <button onClick={handleRefresh} title="Refresh" className="desk-glass w-10 h-10 !rounded-xl flex items-center justify-center hover:bg-white/20">
          <span className="inline-block transition-transform duration-500" style={{ transform: refreshing ? 'rotate(360deg)' : 'none' }}>🔄</span>
        </button>
        <div className="relative">
          <button onClick={() => setShowSettings(s => !s)} title="Settings" className="desk-glass w-10 h-10 !rounded-xl flex items-center justify-center hover:bg-white/20">⚙️</button>
          {showSettings && <SettingsPanel override={override} onOverride={changeOverride} onClose={() => setShowSettings(false)} />}
        </div>
      </div>
    </div>
  )
}
