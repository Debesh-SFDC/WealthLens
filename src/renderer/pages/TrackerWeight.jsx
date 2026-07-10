import { useState, useEffect, useCallback } from 'react'

const todayStr = () => new Date().toISOString().split('T')[0]

function calcAge(dob) {
  if (!dob) return null
  const b = new Date(dob)
  const t = new Date()
  let age = t.getFullYear() - b.getFullYear()
  const m = t.getMonth() - b.getMonth()
  if (m < 0 || (m === 0 && t.getDate() < b.getDate())) age--
  return age
}

function calcBMI(weightKg, heightCm) {
  if (!weightKg || !heightCm || heightCm < 50) return null
  const h = heightCm / 100
  return weightKg / (h * h)
}

function bmiMeta(bmi) {
  if (!bmi) return null
  if (bmi < 18.5) return { label: 'Underweight', color: '#3B82F6', bg: '#EFF6FF' }
  if (bmi < 25)   return { label: 'Normal',      color: '#10B981', bg: '#ECFDF5' }
  if (bmi < 30)   return { label: 'Overweight',  color: '#F59E0B', bg: '#FFFBEB' }
  return              { label: 'Obese',           color: '#EF4444', bg: '#FEF2F2' }
}

function idealRange(heightCm) {
  if (!heightCm || heightCm < 50) return null
  const h = heightCm / 100
  return {
    min:    (18.5 * h * h).toFixed(1),
    max:    (24.9 * h * h).toFixed(1),
    target: (22   * h * h).toFixed(1),
  }
}

// Period helpers
function weekRange(offset = 0) {
  const now = new Date()
  const dow = (now.getDay() + 6) % 7 // 0=Mon
  const mon = new Date(now)
  mon.setDate(now.getDate() - dow + offset * 7)
  mon.setHours(0, 0, 0, 0)
  const sun = new Date(mon)
  sun.setDate(mon.getDate() + 6)
  return {
    from:  mon.toISOString().split('T')[0],
    to:    sun.toISOString().split('T')[0],
  }
}

function monthRange(offset = 0) {
  const d = new Date()
  const year  = d.getFullYear()
  const month = d.getMonth() + offset
  const first = new Date(year, month, 1)
  const last  = new Date(year, month + 1, 0)
  return {
    from:  first.toISOString().split('T')[0],
    to:    last.toISOString().split('T')[0],
    label: first.toLocaleString('en-IN', { month: 'long', year: 'numeric' }),
  }
}

function datesBetween(from, to) {
  const dates = []
  const cur = new Date(from + 'T00:00:00')
  const end = new Date(to   + 'T00:00:00')
  while (cur <= end) {
    dates.push(cur.toISOString().split('T')[0])
    cur.setDate(cur.getDate() + 1)
  }
  return dates
}

function periodStats(logs, from, to) {
  const inRange = logs.filter(l => l.date >= from && l.date <= to)
  if (!inRange.length) return null
  const weights = inRange.map(l => l.weight_kg)
  return {
    start: inRange[0].weight_kg,
    end:   inRange[inRange.length - 1].weight_kg,
    min:   Math.min(...weights),
    max:   Math.max(...weights),
    avg:   weights.reduce((s, v) => s + v, 0) / weights.length,
    count: inRange.length,
  }
}

function LineChart({ logs, from, to }) {
  const today = todayStr()
  const dates  = datesBetween(from, to)
  const logMap = {}
  for (const l of logs) logMap[l.date] = l.weight_kg

  const pts = dates.map(d => ({ date: d, w: logMap[d] ?? null, isToday: d === today }))
  const filled = pts.filter(p => p.w !== null)

  if (!filled.length) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <span className="text-4xl mb-2">⚖️</span>
        <p className="text-sm text-gray-400">No logs for this period</p>
        <p className="text-xs text-gray-300 mt-0.5">Add your weight above</p>
      </div>
    )
  }

  const svgW = 560, svgH = 200
  const padL = 42, padR = 12, padT = 16, padB = 28
  const cW = svgW - padL - padR
  const cH = svgH - padT - padB
  const n = dates.length

  const wvals = filled.map(p => p.w)
  const minW  = Math.min(...wvals)
  const maxW  = Math.max(...wvals)
  const rng   = maxW - minW
  const yMin  = minW - (rng > 0 ? rng * 0.25 : 2)
  const yMax  = maxW + (rng > 0 ? rng * 0.25 : 2)

  const gx = i => padL + (n > 1 ? (i / (n - 1)) * cW : cW / 2)
  const gy = w => padT + cH - ((w - yMin) / (yMax - yMin)) * cH

  // Build polyline segments (skip gaps)
  const segs = []
  let seg = []
  for (let i = 0; i < pts.length; i++) {
    if (pts[i].w !== null) {
      seg.push(`${gx(i).toFixed(1)},${gy(pts[i].w).toFixed(1)}`)
    } else if (seg.length) {
      segs.push(seg.join(' '))
      seg = []
    }
  }
  if (seg.length) segs.push(seg.join(' '))

  // Y guides
  const guides = [0.25, 0.5, 0.75, 1].map(r => yMin + (yMax - yMin) * r)

  // X label step
  const step = n <= 7 ? 1 : n <= 14 ? 2 : 5
  const xLabel = (d, i) => {
    const dt = new Date(d + 'T12:00:00')
    return n <= 7
      ? dt.toLocaleDateString('en-IN', { weekday: 'short' }).slice(0, 3)
      : String(dt.getDate())
  }

  return (
    <svg viewBox={`0 0 ${svgW} ${svgH}`} preserveAspectRatio="xMidYMid meet" className="w-full" style={{ height: svgH }}>
      {/* Y guides */}
      {guides.map((gv, i) => {
        const y = gy(gv)
        return (
          <g key={i}>
            <line x1={padL} y1={y} x2={svgW - padR} y2={y} stroke="#F3F4F6" strokeWidth={1} />
            <text x={padL - 4} y={y + 3.5} fill="#D1D5DB" fontSize={8} textAnchor="end">{gv.toFixed(1)}</text>
          </g>
        )
      })}
      {/* Line fill (area under curve) */}
      {segs.map((s, si) => (
        <polyline key={`l${si}`} points={s} fill="none"
          stroke="#6C63FF" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />
      ))}
      {/* Dots + labels */}
      {pts.map((p, i) => {
        if (p.w === null) return null
        const x = gx(i), y = gy(p.w)
        return (
          <g key={i}>
            <circle cx={x} cy={y} r={p.isToday ? 6 : 4}
              fill={p.isToday ? '#F59E0B' : '#6C63FF'} />
            <circle cx={x} cy={y} r={p.isToday ? 9 : 7}
              fill="none" stroke={p.isToday ? '#F59E0B' : '#6C63FF'}
              strokeWidth={1} opacity={0.25} />
            <title>{`${p.date}: ${p.w} kg`}</title>
          </g>
        )
      })}
      {/* X labels */}
      {pts.map((p, i) => {
        if (n > 7 && i % step !== 0 && i !== n - 1) return null
        return (
          <text key={i} x={gx(i)} y={svgH - 4}
            textAnchor="middle"
            fill={p.isToday ? '#F59E0B' : '#9CA3AF'}
            fontSize={9} fontWeight={p.isToday ? '700' : '400'}>
            {xLabel(p.date, i)}
          </text>
        )
      })}
    </svg>
  )
}

const PERIOD_TABS = [
  { id: 'thisWeek',  label: 'This Week' },
  { id: 'lastWeek',  label: 'Last Week' },
  { id: 'thisMonth', label: 'This Month' },
  { id: 'lastMonth', label: 'Last Month' },
]

function getPeriodRange(id) {
  if (id === 'thisWeek')  return weekRange(0)
  if (id === 'lastWeek')  return weekRange(-1)
  if (id === 'thisMonth') return monthRange(0)
  if (id === 'lastMonth') return monthRange(-1)
  return weekRange(0)
}

export default function TrackerWeight({ user }) {
  const today = todayStr()

  const [logs,        setLogs]        = useState([])
  const [weightInput, setWeightInput] = useState('')
  const [noteInput,   setNoteInput]   = useState('')
  const [saving,      setSaving]      = useState(false)
  const [saved,       setSaved]       = useState(false)
  const [period,      setPeriod]      = useState('thisWeek')
  const [profile,     setProfile]     = useState({ height_cm: 0, date_of_birth: '' })
  const [showModal,   setShowModal]   = useState(false)
  const [modalH,      setModalH]      = useState('')
  const [modalDob,    setModalDob]    = useState('')
  const [savingProf,  setSavingProf]  = useState(false)
  const [deleteId,    setDeleteId]    = useState(null)
  const [wtFocused,   setWtFocused]   = useState(false)

  const load = useCallback(async () => {
    try {
      const [ls, prof] = await Promise.all([
        window.electronAPI.getWeightLogs({ userId: user.id }),
        window.electronAPI.getWeightProfile(user.id),
      ])
      setLogs(ls || [])
      setProfile(prof || { height_cm: 0, date_of_birth: '' })
    } catch {}
  }, [user.id])

  useEffect(() => { load() }, [load])

  const todayLog = logs.find(l => l.date === today)

  async function handleSave() {
    const kg = parseFloat(weightInput)
    if (!kg || kg < 10 || kg > 300 || saving) return
    setSaving(true)
    try {
      await window.electronAPI.logWeight({
        userId: user.id, weightKg: kg, date: today, note: noteInput.trim() || null,
      })
      setWeightInput('')
      setNoteInput('')
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
      await load()
    } finally { setSaving(false) }
  }

  async function handleDelete(id) {
    await window.electronAPI.deleteWeightLog(id)
    setDeleteId(null)
    await load()
  }

  async function handleSaveProfile() {
    const h = parseFloat(modalH)
    if (!h || h < 50 || h > 250) return
    setSavingProf(true)
    try {
      await window.electronAPI.saveWeightProfile({
        userId: user.id, heightCm: h, dateOfBirth: modalDob || null,
      })
      await load()
      setShowModal(false)
    } finally { setSavingProf(false) }
  }

  function openModal() {
    setModalH(profile.height_cm ? String(profile.height_cm) : '')
    setModalDob(profile.date_of_birth || '')
    setShowModal(true)
  }

  const { from, to } = getPeriodRange(period)
  const stats = periodStats(logs, from, to)

  // BMI calculations
  const latestLog = logs.length ? logs[logs.length - 1] : null
  const bmi       = latestLog ? calcBMI(latestLog.weight_kg, profile.height_cm) : null
  const bmiInfo   = bmiMeta(bmi)
  const ideal     = idealRange(profile.height_cm)
  const age       = calcAge(profile.date_of_birth)

  const recentLogs = [...logs].reverse().slice(0, 30)

  return (
    <>
      <style>{`
        @keyframes fadeInUp {
          from { opacity: 0; transform: translateY(18px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes popIn {
          from { opacity: 0; transform: scale(0.94); }
          to   { opacity: 1; transform: scale(1); }
        }
        .wt-page { animation: fadeInUp 0.3s ease; }
      `}</style>

      <div className="wt-page p-5 max-w-xl mx-auto pb-12">

        {/* Header */}
        <div className="flex items-center justify-between mb-5">
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-gray-400 mb-0.5">Track</p>
            <p className="text-2xl font-extrabold text-gray-900">Weight</p>
          </div>
          <button
            onClick={openModal}
            className="flex items-center gap-2 px-4 py-2 rounded-2xl text-sm font-semibold transition-all"
            style={{ backgroundColor: '#EEF2FF', color: '#6C63FF' }}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" style={{ width: 14, height: 14 }}>
              <circle cx="12" cy="8" r="4" /><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7" />
            </svg>
            {profile.height_cm > 0 ? 'Edit Profile' : 'Setup Profile'}
          </button>
        </div>

        {/* Profile nudge if not set */}
        {!profile.height_cm && (
          <div
            className="rounded-2xl px-4 py-3 mb-4 flex items-center gap-3"
            style={{ backgroundColor: '#FFFBEB', border: '1px solid #FDE68A' }}
          >
            <span className="text-xl">💡</span>
            <p className="text-sm text-amber-700">
              Set your height &amp; date of birth to see BMI and ideal weight.
            </p>
          </div>
        )}

        {/* Log Today */}
        <div className="bg-white rounded-3xl shadow-sm border border-gray-100 p-5 mb-4">
          <div className="flex items-center justify-between mb-4">
            <p className="text-sm font-bold text-gray-800">Today's Weight</p>
            <span className="text-xs text-gray-400">
              {new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
            </span>
          </div>

          {todayLog && (
            <div className="flex items-center gap-3 mb-4 px-4 py-2.5 rounded-2xl"
              style={{ backgroundColor: '#ECFDF5' }}>
              <span className="text-lg">✅</span>
              <div>
                <p className="text-sm font-bold text-emerald-700">Logged: {todayLog.weight_kg} kg</p>
                {todayLog.note && <p className="text-xs text-emerald-500">{todayLog.note}</p>}
              </div>
              <p className="text-xs text-emerald-400 ml-auto">Update below</p>
            </div>
          )}

          <div
            className="flex items-center gap-2 rounded-2xl px-4 py-3 mb-3"
            style={{
              backgroundColor: '#F9FAFB',
              border: `2px solid ${wtFocused ? '#6C63FF' : 'transparent'}`,
              boxShadow: wtFocused ? '0 0 0 4px rgba(108,99,255,0.08)' : 'none',
              transition: 'border-color 0.2s, box-shadow 0.2s',
            }}
          >
            <span className="text-2xl">⚖️</span>
            <input
              type="number" min="10" max="300" step="0.1"
              placeholder="0.0"
              value={weightInput}
              onChange={e => setWeightInput(e.target.value)}
              onFocus={() => setWtFocused(true)}
              onBlur={() => setWtFocused(false)}
              onKeyDown={e => { if (e.key === 'Enter') handleSave() }}
              className="flex-1 text-3xl font-extrabold text-gray-900 bg-transparent outline-none"
              style={{ minWidth: 0 }}
            />
            <span className="text-base font-semibold text-gray-400">kg</span>
          </div>

          <input
            type="text"
            placeholder="Add a note (optional)"
            value={noteInput}
            onChange={e => setNoteInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') handleSave() }}
            className="w-full px-4 py-3 rounded-2xl text-sm text-gray-800 outline-none mb-3"
            style={{ backgroundColor: '#F9FAFB', border: '2px solid transparent', transition: 'border-color 0.2s' }}
            onFocus={e => { e.target.style.borderColor = '#E5E7EB' }}
            onBlur={e => { e.target.style.borderColor = 'transparent' }}
          />

          <button
            onClick={handleSave}
            disabled={!weightInput || saving}
            className="w-full py-3.5 rounded-2xl text-white text-sm font-bold transition-all duration-300 disabled:opacity-40 disabled:cursor-not-allowed"
            style={{
              background: saved
                ? 'linear-gradient(135deg, #10B981 0%, #059669 100%)'
                : 'linear-gradient(135deg, #6C63FF 0%, #4338CA 100%)',
              boxShadow: saved
                ? '0 8px 20px rgba(16,185,129,0.3)'
                : weightInput ? '0 8px 20px rgba(108,99,255,0.3)' : 'none',
            }}
          >
            {saved ? '✓ Logged!' : saving ? 'Saving…' : todayLog ? 'Update Weight' : 'Log Weight'}
          </button>
        </div>

        {/* BMI Card */}
        {profile.height_cm > 0 && latestLog && (
          <div
            className="rounded-3xl p-5 mb-4 relative overflow-hidden"
            style={{ background: 'linear-gradient(135deg, #6C63FF 0%, #4338CA 100%)' }}
          >
            <div className="absolute rounded-full" style={{ width: 160, height: 160, top: -60, right: -40, background: 'rgba(255,255,255,0.06)' }} />
            <div className="relative z-10">
              <p className="text-white text-xs font-semibold uppercase tracking-widest opacity-60 mb-3">BMI Status</p>
              <div className="flex items-end gap-3 mb-3">
                <div>
                  <p className="text-white text-5xl font-extrabold">{bmi ? bmi.toFixed(1) : '—'}</p>
                  <p className="text-white text-sm font-semibold opacity-80 mt-0.5">BMI</p>
                </div>
                <div className="mb-1.5">
                  {bmiInfo && (
                    <span className="px-3 py-1 rounded-full text-sm font-bold"
                      style={{ backgroundColor: 'rgba(255,255,255,0.2)', color: '#fff' }}>
                      {bmiInfo.label}
                    </span>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-4 text-white text-xs opacity-70">
                <span>📏 {profile.height_cm} cm</span>
                {age !== null && <span>🎂 {age} yrs</span>}
                <span>⚖️ {latestLog.weight_kg} kg</span>
              </div>

              {ideal && (
                <div className="mt-4">
                  <div className="flex justify-between text-white text-xs opacity-60 mb-1.5">
                    <span>Ideal range</span>
                    <span>{ideal.min} – {ideal.max} kg</span>
                  </div>
                  {/* range bar */}
                  <div className="h-2 rounded-full" style={{ backgroundColor: 'rgba(255,255,255,0.2)' }}>
                    <div
                      className="h-full rounded-full"
                      style={{
                        width: `${Math.min(100, Math.max(2, ((latestLog.weight_kg - parseFloat(ideal.min)) / (parseFloat(ideal.max) - parseFloat(ideal.min))) * 100))}%`,
                        backgroundColor: bmiInfo?.color || '#fff',
                        transition: 'width 0.6s ease',
                      }}
                    />
                  </div>
                  <p className="text-white text-xs opacity-50 mt-1.5">Target: {ideal.target} kg</p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Progress Chart */}
        <div className="bg-white rounded-3xl shadow-sm border border-gray-100 p-5 mb-4">
          <div className="flex items-center justify-between mb-4">
            <p className="text-sm font-bold text-gray-800">Progress</p>
          </div>

          {/* Period tabs */}
          <div className="flex gap-1 bg-gray-100 rounded-xl p-1 mb-4">
            {PERIOD_TABS.map(t => (
              <button key={t.id} onClick={() => setPeriod(t.id)}
                className="flex-1 py-1.5 rounded-lg text-xs font-semibold transition-all duration-150"
                style={{
                  backgroundColor: period === t.id ? '#6C63FF' : 'transparent',
                  color: period === t.id ? 'white' : '#6B7280',
                }}>
                {t.label}
              </button>
            ))}
          </div>

          <LineChart logs={logs} from={from} to={to} />

          {/* Stats row */}
          {stats && (
            <div className="grid grid-cols-3 gap-2 mt-4">
              {[
                { label: 'Start',  value: `${stats.start.toFixed(1)} kg` },
                { label: 'End',    value: `${stats.end.toFixed(1)} kg` },
                {
                  label: 'Change',
                  value: `${stats.end - stats.start >= 0 ? '+' : ''}${(stats.end - stats.start).toFixed(1)} kg`,
                  color: stats.end - stats.start < 0 ? '#10B981' : stats.end - stats.start > 0 ? '#EF4444' : '#6B7280',
                },
                { label: 'Min',  value: `${stats.min.toFixed(1)} kg` },
                { label: 'Max',  value: `${stats.max.toFixed(1)} kg` },
                { label: 'Avg',  value: `${stats.avg.toFixed(1)} kg` },
              ].map(s => (
                <div key={s.label} className="text-center py-2.5 rounded-2xl"
                  style={{ backgroundColor: '#F9FAFB' }}>
                  <p className="text-xs text-gray-400 mb-0.5">{s.label}</p>
                  <p className="text-sm font-bold" style={{ color: s.color || '#111827' }}>{s.value}</p>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Log History */}
        <div className="bg-white rounded-3xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="flex items-center justify-between px-5 py-3.5 border-b border-gray-50">
            <p className="text-xs font-bold text-gray-400 uppercase tracking-widest">Log History</p>
            <p className="text-xs text-gray-400">{logs.length} entries</p>
          </div>
          {recentLogs.length > 0 ? (
            <div className="divide-y divide-gray-50">
              {recentLogs.map(log => {
                const d = new Date(log.date + 'T12:00:00')
                const isToday = log.date === today
                return (
                  <div key={log.id}
                    className="flex items-center gap-3 px-5 py-3.5 group hover:bg-gray-50 transition-colors">
                    <div className="flex items-center justify-center rounded-2xl shrink-0"
                      style={{ width: 44, height: 44, backgroundColor: isToday ? '#EEF2FF' : '#F9FAFB' }}>
                      <span className="text-lg">⚖️</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold text-gray-900">{log.weight_kg} kg</p>
                      <p className="text-xs text-gray-400">
                        {isToday ? 'Today' : d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                        {log.note && ` · ${log.note}`}
                      </p>
                    </div>
                    {calcBMI(log.weight_kg, profile.height_cm) && (() => {
                      const b = calcBMI(log.weight_kg, profile.height_cm)
                      const m = bmiMeta(b)
                      return (
                        <span className="text-xs font-semibold px-2 py-0.5 rounded-full"
                          style={{ backgroundColor: m.bg, color: m.color }}>
                          {b.toFixed(1)}
                        </span>
                      )
                    })()}
                    <button
                      onClick={() => setDeleteId(log.id)}
                      className="opacity-0 group-hover:opacity-100 p-1.5 rounded-xl transition-all"
                      style={{ color: '#EF4444', backgroundColor: '#FEE2E2' }}
                    >
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
                        <polyline points="3 6 5 6 21 6" />
                        <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
                        <path d="M10 11v6M14 11v6M9 6V4h6v2" />
                      </svg>
                    </button>
                  </div>
                )
              })}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-12">
              <span className="text-4xl mb-3">⚖️</span>
              <p className="text-sm font-semibold text-gray-400">No weight logs yet</p>
              <p className="text-xs text-gray-300 mt-1">Log your weight above to get started</p>
            </div>
          )}
        </div>

      </div>

      {/* Profile Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ backgroundColor: 'rgba(0,0,0,0.45)' }}
          onClick={e => { if (e.target === e.currentTarget) setShowModal(false) }}>
          <div className="bg-white rounded-3xl p-6 w-full max-w-sm shadow-2xl"
            style={{ animation: 'popIn 0.2s ease' }}>
            <div className="flex items-center justify-between mb-5">
              <p className="text-base font-bold text-gray-900">Your Profile</p>
              <button onClick={() => setShowModal(false)}
                className="w-8 h-8 flex items-center justify-center rounded-xl text-gray-400 hover:bg-gray-100">
                ×
              </button>
            </div>

            <label className="block text-xs font-semibold text-gray-500 mb-1.5">Height (cm)</label>
            <input type="number" min="50" max="250" step="0.5"
              placeholder="e.g. 175"
              value={modalH}
              onChange={e => setModalH(e.target.value)}
              className="w-full px-4 py-3 rounded-2xl text-sm text-gray-800 outline-none mb-4"
              style={{ backgroundColor: '#F9FAFB', border: '2px solid transparent' }}
              onFocus={e => { e.target.style.borderColor = '#6C63FF' }}
              onBlur={e => { e.target.style.borderColor = 'transparent' }}
            />

            <label className="block text-xs font-semibold text-gray-500 mb-1.5">Date of Birth</label>
            <input type="date"
              value={modalDob}
              max={new Date(new Date().setFullYear(new Date().getFullYear() - 5)).toISOString().split('T')[0]}
              onChange={e => setModalDob(e.target.value)}
              className="w-full px-4 py-3 rounded-2xl text-sm text-gray-800 outline-none mb-5"
              style={{ backgroundColor: '#F9FAFB', border: '2px solid transparent' }}
              onFocus={e => { e.target.style.borderColor = '#6C63FF' }}
              onBlur={e => { e.target.style.borderColor = 'transparent' }}
            />

            <div className="flex gap-3">
              <button onClick={() => setShowModal(false)}
                className="flex-1 py-3 rounded-2xl text-sm font-semibold text-gray-700"
                style={{ border: '2px solid #F3F4F6' }}>
                Cancel
              </button>
              <button
                onClick={handleSaveProfile}
                disabled={!modalH || savingProf}
                className="flex-1 py-3 rounded-2xl text-white text-sm font-bold disabled:opacity-40"
                style={{ background: 'linear-gradient(135deg, #6C63FF 0%, #4338CA 100%)' }}>
                {savingProf ? 'Saving…' : 'Save Profile'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete confirm modal */}
      {deleteId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ backgroundColor: 'rgba(0,0,0,0.45)' }}
          onClick={e => { if (e.target === e.currentTarget) setDeleteId(null) }}>
          <div className="bg-white rounded-3xl p-6 w-full max-w-sm shadow-2xl"
            style={{ animation: 'popIn 0.2s ease' }}>
            <div className="flex items-center justify-center w-12 h-12 rounded-2xl mb-4"
              style={{ backgroundColor: '#FEE2E2' }}>
              <svg viewBox="0 0 24 24" fill="none" stroke="#EF4444" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="w-6 h-6">
                <polyline points="3 6 5 6 21 6" />
                <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
                <path d="M10 11v6M14 11v6M9 6V4h6v2" />
              </svg>
            </div>
            <p className="text-base font-bold text-gray-900 mb-1">Delete this log?</p>
            <p className="text-sm text-gray-400 mb-5">This cannot be undone.</p>
            <div className="flex gap-3">
              <button onClick={() => setDeleteId(null)}
                className="flex-1 py-3 rounded-2xl text-sm font-semibold text-gray-700"
                style={{ border: '2px solid #F3F4F6' }}>
                Cancel
              </button>
              <button onClick={() => handleDelete(deleteId)}
                className="flex-1 py-3 rounded-2xl text-white text-sm font-bold"
                style={{ background: 'linear-gradient(135deg, #EF4444 0%, #DC2626 100%)' }}>
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
