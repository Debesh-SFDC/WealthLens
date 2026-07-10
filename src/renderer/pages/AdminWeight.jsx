import { useState, useEffect, useCallback } from 'react'

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
  return { min: (18.5 * h * h).toFixed(1), max: (24.9 * h * h).toFixed(1), target: (22 * h * h).toFixed(1) }
}

function weekRange(offset = 0) {
  const now = new Date()
  const dow = (now.getDay() + 6) % 7
  const mon = new Date(now)
  mon.setDate(now.getDate() - dow + offset * 7)
  mon.setHours(0, 0, 0, 0)
  const sun = new Date(mon)
  sun.setDate(mon.getDate() + 6)
  return { from: mon.toISOString().split('T')[0], to: sun.toISOString().split('T')[0] }
}

function monthRange(offset = 0) {
  const d = new Date()
  const year = d.getFullYear(), month = d.getMonth() + offset
  const first = new Date(year, month, 1), last = new Date(year, month + 1, 0)
  return { from: first.toISOString().split('T')[0], to: last.toISOString().split('T')[0] }
}

function datesBetween(from, to) {
  const dates = []
  const cur = new Date(from + 'T00:00:00'), end = new Date(to + 'T00:00:00')
  while (cur <= end) { dates.push(cur.toISOString().split('T')[0]); cur.setDate(cur.getDate() + 1) }
  return dates
}

function periodStats(logs, from, to) {
  const inRange = logs.filter(l => l.date >= from && l.date <= to)
  if (!inRange.length) return null
  const wts = inRange.map(l => l.weight_kg)
  return { start: inRange[0].weight_kg, end: inRange[inRange.length - 1].weight_kg, min: Math.min(...wts), max: Math.max(...wts), avg: wts.reduce((s, v) => s + v, 0) / wts.length, count: inRange.length }
}

function getPeriodRange(id) {
  if (id === 'thisWeek')  return weekRange(0)
  if (id === 'lastWeek')  return weekRange(-1)
  if (id === 'thisMonth') return monthRange(0)
  if (id === 'lastMonth') return monthRange(-1)
  return weekRange(0)
}

const PERIOD_TABS = [
  { id: 'thisWeek', label: 'This Week' }, { id: 'lastWeek', label: 'Last Week' },
  { id: 'thisMonth', label: 'This Month' }, { id: 'lastMonth', label: 'Last Month' },
]

function LineChart({ logs, from, to }) {
  const today = new Date().toISOString().split('T')[0]
  const dates  = datesBetween(from, to)
  const logMap = {}
  for (const l of logs) logMap[l.date] = l.weight_kg
  const pts = dates.map(d => ({ date: d, w: logMap[d] ?? null, isToday: d === today }))
  const filled = pts.filter(p => p.w !== null)

  if (!filled.length) {
    return (
      <div className="flex flex-col items-center justify-center py-10 text-center">
        <span className="text-3xl mb-2">⚖️</span>
        <p className="text-sm text-gray-400">No logs for this period</p>
      </div>
    )
  }

  const svgW = 560, svgH = 200, padL = 42, padR = 12, padT = 16, padB = 28
  const cW = svgW - padL - padR, cH = svgH - padT - padB, n = dates.length
  const wvals = filled.map(p => p.w)
  const minW = Math.min(...wvals), maxW = Math.max(...wvals)
  const rng = maxW - minW
  const yMin = minW - (rng > 0 ? rng * 0.25 : 2), yMax = maxW + (rng > 0 ? rng * 0.25 : 2)
  const gx = i => padL + (n > 1 ? (i / (n - 1)) * cW : cW / 2)
  const gy = w => padT + cH - ((w - yMin) / (yMax - yMin)) * cH

  const segs = []
  let seg = []
  for (let i = 0; i < pts.length; i++) {
    if (pts[i].w !== null) seg.push(`${gx(i).toFixed(1)},${gy(pts[i].w).toFixed(1)}`)
    else if (seg.length) { segs.push(seg.join(' ')); seg = [] }
  }
  if (seg.length) segs.push(seg.join(' '))

  const guides = [0.25, 0.5, 0.75, 1].map(r => yMin + (yMax - yMin) * r)
  const step = n <= 7 ? 1 : n <= 14 ? 2 : 5

  return (
    <svg viewBox={`0 0 ${svgW} ${svgH}`} preserveAspectRatio="xMidYMid meet" className="w-full" style={{ height: svgH }}>
      {guides.map((gv, i) => {
        const y = gy(gv)
        return (
          <g key={i}>
            <line x1={padL} y1={y} x2={svgW - padR} y2={y} stroke="#F3F4F6" strokeWidth={1} />
            <text x={padL - 4} y={y + 3.5} fill="#D1D5DB" fontSize={8} textAnchor="end">{gv.toFixed(1)}</text>
          </g>
        )
      })}
      {segs.map((s, si) => <polyline key={si} points={s} fill="none" stroke="#6C63FF" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />)}
      {pts.map((p, i) => {
        if (p.w === null) return null
        const x = gx(i), y = gy(p.w)
        return (
          <g key={i}>
            <circle cx={x} cy={y} r={p.isToday ? 6 : 4} fill={p.isToday ? '#F59E0B' : '#6C63FF'} />
            <circle cx={x} cy={y} r={p.isToday ? 9 : 7} fill="none" stroke={p.isToday ? '#F59E0B' : '#6C63FF'} strokeWidth={1} opacity={0.25} />
            <title>{`${p.date}: ${p.w} kg`}</title>
          </g>
        )
      })}
      {pts.map((p, i) => {
        if (n > 7 && i % step !== 0 && i !== n - 1) return null
        const d = new Date(p.date + 'T12:00:00')
        const label = n <= 7 ? d.toLocaleDateString('en-IN', { weekday: 'short' }).slice(0, 3) : String(d.getDate())
        return <text key={i} x={gx(i)} y={svgH - 4} textAnchor="middle" fill={p.isToday ? '#F59E0B' : '#9CA3AF'} fontSize={9} fontWeight={p.isToday ? '700' : '400'}>{label}</text>
      })}
    </svg>
  )
}

export default function AdminWeight() {
  const [users,     setUsers]     = useState([])
  const [allLogs,   setAllLogs]   = useState([])
  const [selUserId, setSelUserId] = useState(null)
  const [period,    setPeriod]    = useState('thisWeek')
  const [loading,   setLoading]   = useState(true)
  const [weightInput, setWeightInput] = useState('')
  const [weightSaving, setWeightSaving] = useState(false)
  const [weightSaved, setWeightSaved] = useState(false)
  const [profileHeight, setProfileHeight] = useState('')
  const [profileDob, setProfileDob] = useState('')
  const [profileSaving, setProfileSaving] = useState(false)
  const [profileSaved, setProfileSaved] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [us, ls] = await Promise.all([
        window.electronAPI.getUsersWithWeightProfile(),
        window.electronAPI.getAllWeightLogsAdmin(),
      ])
      setUsers(us || [])
      setAllLogs(ls || [])
      if (!selUserId && us?.length) {
        setSelUserId(us[0].id)
      }
    } catch {}
    setLoading(false)
  }, [selUserId])

  useEffect(() => { load() }, [load])

  useEffect(() => {
    const u = users.find(u => u.id === selUserId)
    setProfileHeight(u?.height_cm ? String(u.height_cm) : '')
    setProfileDob(u?.date_of_birth || '')
    setProfileSaved(false)
  }, [selUserId, users])

  async function saveWeight() {
    const kg = parseFloat(weightInput)
    if (!selUserId || isNaN(kg) || kg <= 0) return
    setWeightSaving(true)
    try {
      const today = new Date().toISOString().split('T')[0]
      await window.electronAPI.logWeight({ userId: selUserId, weightKg: kg, date: today })
      setWeightSaved(true)
      setWeightInput('')
      setTimeout(() => setWeightSaved(false), 2000)
      load()
    } catch {}
    setWeightSaving(false)
  }

  async function saveProfile() {
    const h = parseFloat(profileHeight)
    if (!selUserId || isNaN(h) || h <= 0) return
    setProfileSaving(true)
    try {
      await window.electronAPI.saveWeightProfile({ userId: selUserId, heightCm: h, dateOfBirth: profileDob || null })
      setProfileSaved(true)
      setTimeout(() => setProfileSaved(false), 2000)
      load()
    } catch {}
    setProfileSaving(false)
  }

  const selUser    = users.find(u => u.id === selUserId)
  const userLogs   = allLogs.filter(l => l.user_id === selUserId).sort((a, b) => a.date.localeCompare(b.date))
  const latestLog  = userLogs.length ? userLogs[userLogs.length - 1] : null
  const bmi        = latestLog ? calcBMI(latestLog.weight_kg, selUser?.height_cm) : null
  const bmiInfo    = bmiMeta(bmi)
  const ideal      = idealRange(selUser?.height_cm)
  const age        = calcAge(selUser?.date_of_birth)

  const { from, to } = getPeriodRange(period)
  const stats = periodStats(userLogs, from, to)

  const recentLogs = [...userLogs].reverse().slice(0, 30)

  return (
    <>
      <style>{`
        @keyframes fadeInUp { from { opacity:0; transform:translateY(14px); } to { opacity:1; transform:translateY(0); } }
        .aw-page { animation: fadeInUp 0.3s ease; }
      `}</style>

      <div className="aw-page p-6 space-y-5 max-w-3xl mx-auto">

        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-gray-900">Health &amp; Weight</h1>
            <p className="text-sm text-gray-400">Family weight progress</p>
          </div>
          {/* User selector */}
          <div className="flex gap-2">
            {users.map(u => (
              <button key={u.id} onClick={() => { setSelUserId(u.id); setWeightInput(''); setWeightSaved(false); setProfileSaved(false) }}
                className="flex items-center gap-2 px-4 py-2 rounded-2xl text-sm font-semibold transition-all"
                style={{
                  backgroundColor: selUserId === u.id ? '#6C63FF' : '#F3F4F6',
                  color: selUserId === u.id ? 'white' : '#374151',
                }}>
                <div className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold text-white"
                  style={{ backgroundColor: u.avatar_color || '#6C63FF' }}>
                  {u.name.charAt(0).toUpperCase()}
                </div>
                {u.name}
              </button>
            ))}
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-20 text-gray-300">Loading…</div>
        ) : !selUser ? (
          <div className="text-center py-20 text-gray-400">No users found</div>
        ) : (
          <>
            {/* Log weight card */}
            <div className="bg-white rounded-2xl shadow-sm p-5 border border-gray-50">
              <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-3">Log Today's Weight · {selUser.name}</p>
              <div className="flex gap-3 items-center">
                <div className="flex items-center gap-2 flex-1 px-4 py-2.5 rounded-xl border border-gray-200 bg-gray-50">
                  <span className="text-sm font-semibold text-gray-400">kg</span>
                  <input
                    type="number" placeholder="e.g. 65.5" step="0.1" min="20" max="300"
                    value={weightInput}
                    onChange={e => setWeightInput(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') saveWeight() }}
                    className="flex-1 bg-transparent outline-none text-sm font-bold text-gray-900"
                  />
                </div>
                <button
                  onClick={saveWeight}
                  disabled={!weightInput || weightSaving}
                  className="px-5 py-2.5 rounded-xl text-white text-sm font-semibold hover:opacity-90 transition-opacity disabled:opacity-40"
                  style={{ backgroundColor: weightSaved ? '#10B981' : '#6C63FF' }}
                >
                  {weightSaving ? 'Saving…' : weightSaved ? '✓ Saved' : 'Save'}
                </button>
              </div>
            </div>

            {/* Height & DOB profile card */}
            <div className="bg-white rounded-2xl shadow-sm p-5 border border-gray-50">
              <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-3">Health Profile · {selUser.name}</p>
              <div className="flex gap-3 items-end">
                <div className="flex-1">
                  <label className="text-xs font-semibold text-gray-500 mb-1.5 block">Height (cm)</label>
                  <input
                    type="number" placeholder="e.g. 170" min="50" max="250" step="0.1"
                    value={profileHeight}
                    onChange={e => setProfileHeight(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') saveProfile() }}
                    className="w-full px-4 py-2.5 rounded-xl border border-gray-200 bg-gray-50 outline-none text-sm font-bold text-gray-900 focus:border-[#6C63FF] focus:ring-2 focus:ring-[#6C63FF]/20"
                  />
                </div>
                <div className="flex-1">
                  <label className="text-xs font-semibold text-gray-500 mb-1.5 block">Date of Birth</label>
                  <input
                    type="date"
                    value={profileDob}
                    onChange={e => setProfileDob(e.target.value)}
                    className="w-full px-4 py-2.5 rounded-xl border border-gray-200 bg-gray-50 outline-none text-sm font-bold text-gray-900 focus:border-[#6C63FF] focus:ring-2 focus:ring-[#6C63FF]/20"
                  />
                </div>
                <button
                  onClick={saveProfile}
                  disabled={!profileHeight || profileSaving}
                  className="px-5 py-2.5 rounded-xl text-white text-sm font-semibold hover:opacity-90 transition-opacity disabled:opacity-40"
                  style={{ backgroundColor: profileSaved ? '#10B981' : '#6C63FF' }}
                >
                  {profileSaving ? 'Saving…' : profileSaved ? '✓ Saved' : 'Save'}
                </button>
              </div>
            </div>

            {/* Stats cards */}
            <div className="grid grid-cols-4 gap-3">
              {[
                { label: 'Latest Weight', value: latestLog ? `${latestLog.weight_kg} kg` : '—', sub: latestLog ? latestLog.date : 'No logs yet' },
                { label: 'BMI',   value: bmi ? bmi.toFixed(1) : '—', sub: bmiInfo?.label || (selUser.height_cm ? '' : 'Height not set'), color: bmiInfo?.color },
                { label: 'Target Weight', value: ideal ? `${ideal.target} kg` : '—', sub: ideal ? `Range: ${ideal.min}–${ideal.max}` : 'Set height first' },
                { label: 'Age', value: age !== null ? `${age} yrs` : '—', sub: selUser.height_cm ? `${selUser.height_cm} cm tall` : 'Profile incomplete' },
              ].map(c => (
                <div key={c.label} className="bg-white rounded-2xl shadow-sm p-4 text-center border border-gray-50">
                  <p className="text-xs text-gray-400 mb-1">{c.label}</p>
                  <p className="text-lg font-bold" style={{ color: c.color || '#111827' }}>{c.value}</p>
                  <p className="text-xs text-gray-400 mt-0.5">{c.sub}</p>
                </div>
              ))}
            </div>

            {/* Chart section */}
            <div className="bg-white rounded-2xl shadow-sm p-5 border border-gray-50">
              <div className="flex items-center justify-between mb-4">
                <p className="text-sm font-bold text-gray-800">Weight Progress · {selUser.name}</p>
                <span className="text-xs text-gray-400">{userLogs.length} total logs</span>
              </div>

              <div className="flex gap-1 bg-gray-100 rounded-xl p-1 mb-4">
                {PERIOD_TABS.map(t => (
                  <button key={t.id} onClick={() => setPeriod(t.id)}
                    className="flex-1 py-1.5 rounded-lg text-xs font-semibold transition-all duration-150"
                    style={{ backgroundColor: period === t.id ? '#6C63FF' : 'transparent', color: period === t.id ? 'white' : '#6B7280' }}>
                    {t.label}
                  </button>
                ))}
              </div>

              <LineChart logs={userLogs} from={from} to={to} />

              {stats && (
                <div className="grid grid-cols-3 gap-2 mt-4">
                  {[
                    { label: 'Start', value: `${stats.start.toFixed(1)} kg` },
                    { label: 'End',   value: `${stats.end.toFixed(1)} kg` },
                    { label: 'Change', value: `${stats.end - stats.start >= 0 ? '+' : ''}${(stats.end - stats.start).toFixed(1)} kg`, color: stats.end - stats.start < 0 ? '#10B981' : stats.end - stats.start > 0 ? '#EF4444' : '#6B7280' },
                    { label: 'Min', value: `${stats.min.toFixed(1)} kg` },
                    { label: 'Max', value: `${stats.max.toFixed(1)} kg` },
                    { label: 'Avg', value: `${stats.avg.toFixed(1)} kg` },
                  ].map(s => (
                    <div key={s.label} className="text-center py-2.5 rounded-2xl bg-gray-50">
                      <p className="text-xs text-gray-400 mb-0.5">{s.label}</p>
                      <p className="text-sm font-bold" style={{ color: s.color || '#111827' }}>{s.value}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Log history */}
            <div className="bg-white rounded-2xl shadow-sm border border-gray-50 overflow-hidden">
              <div className="flex items-center justify-between px-5 py-3.5 border-b border-gray-50">
                <p className="text-xs font-bold text-gray-400 uppercase tracking-widest">Log History</p>
                <p className="text-xs text-gray-400">{selUser.name}</p>
              </div>
              {recentLogs.length > 0 ? (
                <div className="divide-y divide-gray-50">
                  {recentLogs.map(log => {
                    const d = new Date(log.date + 'T12:00:00')
                    const b = calcBMI(log.weight_kg, selUser.height_cm)
                    const m = bmiMeta(b)
                    return (
                      <div key={log.id} className="flex items-center gap-3 px-5 py-3.5 hover:bg-gray-50 transition-colors">
                        <div className="flex items-center justify-center rounded-2xl shrink-0 text-xl"
                          style={{ width: 40, height: 40, backgroundColor: '#F9FAFB' }}>⚖️</div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-bold text-gray-900">{log.weight_kg} kg</p>
                          <p className="text-xs text-gray-400">
                            {d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                            {log.note && ` · ${log.note}`}
                          </p>
                        </div>
                        {b && m && (
                          <span className="text-xs font-semibold px-2 py-0.5 rounded-full"
                            style={{ backgroundColor: m.bg, color: m.color }}>
                            BMI {b.toFixed(1)}
                          </span>
                        )}
                      </div>
                    )
                  })}
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center py-10">
                  <span className="text-3xl mb-2">⚖️</span>
                  <p className="text-sm text-gray-400">No weight logs for {selUser.name}</p>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </>
  )
}
