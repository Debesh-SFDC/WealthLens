import { useState, useEffect, useCallback, useRef } from 'react'

const CATEGORIES = [
  { name: 'Food',          icon: '🍔', color: '#FF6B6B', bg: '#FFF0F0' },
  { name: 'Transport',     icon: '🚗', color: '#06B6D4', bg: '#ECFEFF' },
  { name: 'Shopping',      icon: '🛍️', color: '#A855F7', bg: '#FAF5FF' },
  { name: 'Health',        icon: '💊', color: '#10B981', bg: '#ECFDF5' },
  { name: 'Bills',         icon: '📄', color: '#6366F1', bg: '#EEF2FF' },
  { name: 'Entertainment', icon: '🎬', color: '#EC4899', bg: '#FDF2F8' },
  { name: 'Fuel',          icon: '⛽', color: '#F59E0B', bg: '#FFFBEB' },
  { name: 'Dining',        icon: '🍽️', color: '#F97316', bg: '#FFF7ED' },
  { name: 'Others',        icon: '💸', color: '#8B93A5', bg: '#F8FAFC' },
]

const fmt  = v => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(v || 0)
const fmtK = v => v >= 1000 ? `${(v / 1000).toFixed(1)}k` : String(Math.round(v))

function currentYM() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}
function offsetMonth(offset) {
  const d = new Date()
  d.setMonth(d.getMonth() + offset)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}
function monthLabel(ym) {
  const [y, m] = ym.split('-')
  return new Date(+y, +m - 1).toLocaleString('en-IN', { month: 'long', year: 'numeric' })
}
function shortMonth(ym) {
  const [y, m] = ym.split('-')
  return new Date(+y, +m - 1).toLocaleString('en-IN', { month: 'short' })
}
function daysInMonth(ym) {
  const [y, m] = ym.split('-')
  return new Date(+y, +m, 0).getDate()
}

function datesBetween(from, to) {
  const dates = []
  const cur = new Date(from + 'T00:00:00')
  const end = new Date(to   + 'T00:00:00')
  while (cur <= end) { dates.push(cur.toISOString().split('T')[0]); cur.setDate(cur.getDate() + 1) }
  return dates
}

function LineChart({ logs, from, to, height = 160 }) {
  const today = new Date().toISOString().split('T')[0]
  const dates  = datesBetween(from, to)
  const logMap = {}
  for (const l of logs) logMap[l.date] = l.weight_kg
  const pts    = dates.map(d => ({ date: d, w: logMap[d] ?? null, isToday: d === today }))
  const filled = pts.filter(p => p.w !== null)

  if (!filled.length) {
    return (
      <div className="flex flex-col items-center justify-center text-center" style={{ height }}>
        <span className="text-3xl mb-2">⚖️</span>
        <p className="text-sm text-gray-300">No weight logs for this period</p>
      </div>
    )
  }

  const svgW = 560, padL = 40, padR = 12, padT = 16, padB = 24
  const svgH = height + padT + padB
  const cW = svgW - padL - padR, cH = height
  const n  = dates.length

  const wvals = filled.map(p => p.w)
  const minW  = Math.min(...wvals), maxW = Math.max(...wvals)
  const rng   = maxW - minW
  const yMin  = minW - (rng > 0 ? rng * 0.25 : 2)
  const yMax  = maxW + (rng > 0 ? rng * 0.25 : 2)

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
  const step   = n <= 7 ? 1 : n <= 14 ? 2 : 5

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
      {segs.map((s, si) => (
        <polyline key={si} points={s} fill="none" stroke="#10B981" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />
      ))}
      {pts.map((p, i) => {
        if (p.w === null) return null
        const x = gx(i), y = gy(p.w)
        return (
          <g key={i}>
            <circle cx={x} cy={y} r={p.isToday ? 6 : 4} fill={p.isToday ? '#F59E0B' : '#10B981'} />
            <circle cx={x} cy={y} r={p.isToday ? 9 : 7} fill="none" stroke={p.isToday ? '#F59E0B' : '#10B981'} strokeWidth={1} opacity={0.25} />
            <title>{`${p.date}: ${p.w} kg`}</title>
          </g>
        )
      })}
      {pts.map((p, i) => {
        if (n > 7 && i % step !== 0 && i !== n - 1) return null
        const d     = new Date(p.date + 'T12:00:00')
        const label = n <= 7
          ? d.toLocaleDateString('en-IN', { weekday: 'short' }).slice(0, 3)
          : String(d.getDate())
        return (
          <text key={i} x={gx(i)} y={svgH - 4} textAnchor="middle"
            fill={p.isToday ? '#F59E0B' : '#9CA3AF'} fontSize={9}
            fontWeight={p.isToday ? '700' : '400'}>
            {label}
          </text>
        )
      })}
    </svg>
  )
}

function BarChart({ data, height = 160, barColor = '#6C63FF', labelFontSize = 9 }) {
  const svgW = 560, padL = 4, padR = 4, padT = 16, padB = 24
  const svgH = height + padB + padT
  const chartW = svgW - padL - padR
  const chartH = height
  const maxVal = Math.max(...data.map(d => d.value), 1)
  const n = data.length
  const slot = chartW / n
  const barW = Math.max(3, Math.min(slot * 0.55, 28))
  const guides = [0.33, 0.66, 1].map(r => Math.round(maxVal * r))

  return (
    <svg viewBox={`0 0 ${svgW} ${svgH}`} preserveAspectRatio="xMidYMid meet" className="w-full" style={{ height: svgH }}>
      {/* Guide lines */}
      {guides.map((gv, i) => {
        const y = padT + chartH - (gv / maxVal) * chartH
        return (
          <g key={i}>
            <line x1={padL} y1={y} x2={svgW - padR} y2={y} stroke="#F3F4F6" strokeWidth={1} />
            <text x={padL + 2} y={y - 3} fill="#D1D5DB" fontSize={8} textAnchor="start">{fmtK(gv)}</text>
          </g>
        )
      })}
      {/* Bars */}
      {data.map((d, i) => {
        const barH = Math.max(d.value > 0 ? 3 : 0, (d.value / maxVal) * chartH)
        const x = padL + i * slot + (slot - barW) / 2
        const y = padT + chartH - barH
        const isToday = d.isToday
        return (
          <g key={i}>
            <rect x={x} y={y} width={barW} height={barH} rx={3}
              fill={isToday ? '#F59E0B' : d.value > 0 ? barColor : '#E5E7EB'}
              opacity={d.value > 0 ? 1 : 0.3}>
              <title>{fmt(d.value)}</title>
            </rect>
            {d.label && (
              <text x={x + barW / 2} y={svgH - 6} textAnchor="middle" fill={isToday ? '#F59E0B' : '#9CA3AF'} fontSize={labelFontSize} fontWeight={isToday ? '700' : '400'}>
                {d.label}
              </text>
            )}
          </g>
        )
      })}
    </svg>
  )
}

function SyncButton({ onAfterSync }) {
  const [state, setState] = useState('idle') // idle | pushing | pulling | done | error
  const [merged, setMerged] = useState(0)
  const timerRef = useRef(null)

  async function sync() {
    if (state === 'pushing' || state === 'pulling') return
    setState('pushing')
    try {
      await window.electronAPI.driveSyncPush()
      setState('pulling')
      const result = await window.electronAPI.driveSyncPull()
      setMerged(result.merged)
      setState('done')
      if (onAfterSync) onAfterSync()
      timerRef.current = setTimeout(() => setState('idle'), 4000)
    } catch {
      setState('error')
      timerRef.current = setTimeout(() => setState('idle'), 4000)
    }
  }

  useEffect(() => () => clearTimeout(timerRef.current), [])

  const label = state === 'pushing' ? 'Uploading…'
    : state === 'pulling'  ? 'Fetching…'
    : state === 'done'     ? (merged > 0 ? `✓ ${merged} new` : '✓ Up to date')
    : state === 'error'    ? '✗ Drive not connected'
    : '↓ Sync from Drive'

  const bg = state === 'done'  ? '#10B981'
    : state === 'error'        ? '#EF4444'
    : '#6C63FF'

  return (
    <button onClick={sync}
      disabled={state === 'pushing' || state === 'pulling'}
      className="flex items-center gap-2 px-4 py-2 rounded-2xl text-white text-sm font-semibold transition-all disabled:opacity-70"
      style={{ background: bg }}>
      {(state === 'pushing' || state === 'pulling') && (
        <svg className="animate-spin" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5">
          <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/>
        </svg>
      )}
      {label}
    </button>
  )
}

export default function TrackerDashboard({ user }) {
  const now        = new Date()
  const todayStr   = now.toISOString().split('T')[0]
  const cymStr     = currentYM()

  const [monthOffset,   setMonthOffset]   = useState(0)
  const [dayTab,        setDayTab]        = useState('week') // 'week' | 'month'
  const [weightTab,     setWeightTab]     = useState('week') // 'week' | 'month'
  const [allData,       setAllData]       = useState({})     // { 'YYYY-MM': expenses[] }
  const [budget,        setBudget]        = useState(0)
  const [weightLogs,    setWeightLogs]    = useState([])
  const [weightProfile, setWeightProfile] = useState({ height_cm: 0 })
  const [loading,       setLoading]       = useState(true)

  const targetMonth = offsetMonth(monthOffset)

  // Load 13 months of expense data + all weight logs
  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [b, wLogs, wProf, ...results] = await Promise.all([
        window.electronAPI.getTrackerBudget().catch(() => 0),
        window.electronAPI.getWeightLogs({ userId: user.id }).catch(() => []),
        window.electronAPI.getWeightProfile(user.id).catch(() => ({ height_cm: 0 })),
        ...Array.from({ length: 13 }, (_, i) => {
          const m = offsetMonth(-12 + i)
          return window.electronAPI.getAllExpenses({ month: m }).then(data => [m, data])
        }),
      ])
      setBudget(b || 0)
      setWeightLogs(wLogs || [])
      setWeightProfile(wProf || { height_cm: 0 })
      const map = {}
      results.forEach(([m, data]) => { map[m] = data })
      setAllData(map)
    } catch {}
    setLoading(false)
  }, [user.id])

  useEffect(() => { load() }, [load])

  const monthExpenses = allData[targetMonth] || []
  const total = monthExpenses.reduce((s, e) => s + e.amount, 0)
  const daysElapsed = targetMonth === cymStr ? now.getDate() : daysInMonth(targetMonth)
  const avgPerDay = total / (daysElapsed || 1)
  const budgetPct = budget > 0 ? Math.min((total / budget) * 100, 100) : 0
  const budgetColor = budgetPct >= 90 ? '#EF4444' : budgetPct >= 70 ? '#F59E0B' : '#6C63FF'

  const catTotals = CATEGORIES.map(cat => ({
    ...cat,
    value: monthExpenses.filter(e => e.category === cat.name).reduce((s, e) => s + e.amount, 0),
  })).sort((a, b) => b.value - a.value)

  const topCat = catTotals.find(c => c.value > 0)

  // ── Day-by-day chart data ────────────────────────────────────────────────
  const dailyData = (() => {
    if (dayTab === 'week') {
      return Array.from({ length: 7 }, (_, i) => {
        const d = new Date()
        d.setDate(d.getDate() - (6 - i))
        const ds = d.toISOString().split('T')[0]
        const ym = ds.slice(0, 7)
        const val = (allData[ym] || []).filter(e => e.date === ds).reduce((s, e) => s + e.amount, 0)
        const isToday = ds === todayStr
        return {
          label: d.toLocaleDateString('en-IN', { weekday: 'short' }).slice(0, 3),
          value: val,
          isToday,
        }
      })
    }
    // month view
    const n = daysInMonth(targetMonth)
    return Array.from({ length: n }, (_, i) => {
      const day = String(i + 1).padStart(2, '0')
      const ds  = `${targetMonth}-${day}`
      const val = monthExpenses.filter(e => e.date === ds).reduce((s, e) => s + e.amount, 0)
      const isToday = ds === todayStr
      const showLabel = (i + 1) % 5 === 1 || i + 1 === n
      return { label: showLabel ? String(i + 1) : '', value: val, isToday }
    })
  })()

  // ── Month-by-month chart (last 6 months) ─────────────────────────────────
  const monthlyData = Array.from({ length: 6 }, (_, i) => {
    const m   = offsetMonth(-(5 - i))
    const val = (allData[m] || []).reduce((s, e) => s + e.amount, 0)
    const isCurrent = m === cymStr
    return { label: shortMonth(m), value: val, isToday: isCurrent }
  })

  const prevMonth    = offsetMonth(-1)
  const prevTotal    = (allData[prevMonth] || []).reduce((s, e) => s + e.amount, 0)
  const monthDelta   = total - prevTotal
  const deltaSign    = monthDelta >= 0 ? '+' : ''
  const deltaColor   = monthDelta > 0 ? '#EF4444' : '#10B981'

  // ── Weight computed values ──────────────────────────────────────────────
  const sortedWt    = [...weightLogs].sort((a, b) => a.date.localeCompare(b.date))
  const latestWt    = sortedWt.length ? sortedWt[sortedWt.length - 1] : null
  const currentWt   = latestWt?.weight_kg ?? null

  const bmi = currentWt && weightProfile.height_cm > 50
    ? currentWt / ((weightProfile.height_cm / 100) ** 2)
    : null
  const bmiInfo = !bmi ? null
    : bmi < 18.5 ? { label: 'Underweight', color: '#3B82F6' }
    : bmi < 25   ? { label: 'Normal',      color: '#10B981' }
    : bmi < 30   ? { label: 'Overweight',  color: '#F59E0B' }
    :              { label: 'Obese',        color: '#EF4444' }

  const thisMonthWt   = sortedWt.filter(l => l.date.slice(0, 7) === cymStr)
  const wtMonthStart  = thisMonthWt[0]?.weight_kg ?? null
  const wtMonthChange = wtMonthStart && currentWt ? currentWt - wtMonthStart : null

  // Weight chart date range
  const wtWeekFrom = (() => { const d = new Date(); d.setDate(d.getDate() - 6); return d.toISOString().split('T')[0] })()
  const wtWeekTo   = todayStr
  const wtMonthFrom = `${targetMonth}-01`
  const wtMonthTo   = `${targetMonth}-${String(daysInMonth(targetMonth)).padStart(2, '0')}`
  const wtFrom = weightTab === 'week' ? wtWeekFrom : wtMonthFrom
  const wtTo   = weightTab === 'week' ? wtWeekTo   : wtMonthTo

  return (
    <>
      <style>{`
        @keyframes fadeInUp {
          from { opacity: 0; transform: translateY(14px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        .dash-page { animation: fadeInUp 0.3s ease; }
      `}</style>

      <div className="dash-page p-6 space-y-5 max-w-3xl mx-auto">

        {/* Header + month nav */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-gray-900">Dashboard</h1>
            <p className="text-sm text-gray-400">Your spending overview</p>
          </div>
          <div className="flex items-center gap-2">
            <SyncButton onAfterSync={load} />
            <div className="flex items-center gap-2 bg-white border border-gray-100 rounded-2xl px-3 py-2 shadow-sm">
              <button onClick={() => setMonthOffset(o => o - 1)}
                className="w-7 h-7 flex items-center justify-center rounded-xl hover:bg-gray-100 text-gray-500 font-bold transition-colors">‹</button>
              <span className="text-sm font-semibold text-gray-800 min-w-[110px] text-center">{monthLabel(targetMonth)}</span>
              <button onClick={() => setMonthOffset(o => o + 1)}
                disabled={targetMonth >= cymStr}
                className="w-7 h-7 flex items-center justify-center rounded-xl hover:bg-gray-100 text-gray-500 font-bold transition-colors disabled:opacity-30">›</button>
            </div>
          </div>
        </div>

        {/* Stats row */}
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: 'Month Total',  value: fmt(total),    sub: targetMonth === cymStr ? 'This month' : monthLabel(targetMonth) },
            { label: 'Daily Average', value: fmt(avgPerDay), sub: `over ${daysElapsed} days` },
            { label: 'vs Last Month', value: `${deltaSign}${fmt(Math.abs(monthDelta))}`, sub: prevTotal > 0 ? `Last: ${fmt(prevTotal)}` : 'No data', color: prevTotal > 0 ? deltaColor : '#9CA3AF' },
          ].map(c => (
            <div key={c.label} className="bg-white rounded-2xl shadow-sm p-4 text-center border border-gray-50">
              <p className="text-xs text-gray-400 mb-1">{c.label}</p>
              <p className="text-lg font-bold" style={{ color: c.color || '#111827' }}>{c.value}</p>
              <p className="text-xs text-gray-400 mt-0.5">{c.sub}</p>
            </div>
          ))}
        </div>

        {/* Budget bar */}
        {budget > 0 && (
          <div className="bg-white rounded-2xl shadow-sm p-4 border border-gray-50">
            <div className="flex justify-between mb-2">
              <span className="text-sm font-semibold text-gray-700">Monthly Budget</span>
              <span className="text-sm font-bold" style={{ color: budgetColor }}>{Math.round(budgetPct)}% used</span>
            </div>
            <div className="h-3 bg-gray-100 rounded-full overflow-hidden mb-1.5">
              <div className="h-full rounded-full transition-all duration-700"
                style={{ width: `${budgetPct}%`, backgroundColor: budgetColor }} />
            </div>
            <div className="flex justify-between text-xs text-gray-400">
              <span>{fmt(total)} spent</span>
              <span>{total > budget ? `${fmt(total - budget)} over` : `${fmt(budget - total)} left`}</span>
            </div>
          </div>
        )}

        {/* ── Day-by-Day chart ─────────────────────────────────────────────── */}
        <div className="bg-white rounded-2xl shadow-sm p-5 border border-gray-50">
          <div className="flex items-center justify-between mb-4">
            <p className="text-sm font-bold text-gray-800">Day-by-Day Spend</p>
            <div className="flex gap-1 bg-gray-100 rounded-xl p-1">
              {[['week', 'Last 7 days'], ['month', 'This month']].map(([id, label]) => (
                <button key={id} onClick={() => setDayTab(id)}
                  className="px-3 py-1 rounded-lg text-xs font-semibold transition-all duration-150"
                  style={{
                    backgroundColor: dayTab === id ? '#6C63FF' : 'transparent',
                    color: dayTab === id ? 'white' : '#6B7280',
                  }}>
                  {label}
                </button>
              ))}
            </div>
          </div>
          {loading
            ? <div className="h-40 flex items-center justify-center text-gray-300 text-sm">Loading…</div>
            : <BarChart data={dailyData} height={160} barColor="#6C63FF" labelFontSize={dayTab === 'month' ? 8 : 10} />
          }
          <p className="text-xs text-gray-400 mt-2 text-center">
            {dayTab === 'week' ? '🟡 = today' : '🟡 = today  · Every 5th day labeled'}
          </p>
        </div>

        {/* ── Month-by-Month chart ─────────────────────────────────────────── */}
        <div className="bg-white rounded-2xl shadow-sm p-5 border border-gray-50">
          <div className="flex items-center justify-between mb-4">
            <p className="text-sm font-bold text-gray-800">Month-by-Month</p>
            <span className="text-xs text-gray-400 bg-gray-50 px-2 py-1 rounded-lg">Last 6 months</span>
          </div>
          {loading
            ? <div className="h-40 flex items-center justify-center text-gray-300 text-sm">Loading…</div>
            : <BarChart data={monthlyData} height={160} barColor="#6C63FF" labelFontSize={11} />
          }
          <p className="text-xs text-gray-400 mt-2 text-center">🟡 = current month</p>
        </div>

        {/* Category breakdown */}
        <div className="bg-white rounded-2xl shadow-sm p-5 border border-gray-50">
          <p className="text-sm font-bold text-gray-800 mb-4">By Category · {monthLabel(targetMonth)}</p>
          {monthExpenses.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-6">No expenses this month</p>
          ) : (
            <div className="space-y-3">
              {catTotals.map(cat => {
                const pct = total > 0 ? (cat.value / total) * 100 : 0
                return (
                  <div key={cat.name} className="flex items-center gap-3"
                    style={{ opacity: cat.value > 0 ? 1 : 0.3 }}>
                    <div className="w-10 h-10 rounded-2xl flex items-center justify-center text-xl shrink-0"
                      style={{ backgroundColor: cat.bg }}>{cat.icon}</div>
                    <div className="flex-1 min-w-0">
                      <div className="flex justify-between mb-1">
                        <span className="text-sm font-medium text-gray-700">{cat.name}</span>
                        <span className="text-sm font-bold text-gray-900">{fmt(cat.value)}</span>
                      </div>
                      <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                        <div className="h-full rounded-full transition-all duration-500"
                          style={{ width: `${pct}%`, backgroundColor: cat.color }} />
                      </div>
                    </div>
                    <span className="text-xs text-gray-400 w-8 text-right shrink-0">{Math.round(pct)}%</span>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* ── Weight section divider ── */}
        <div className="flex items-center gap-3">
          <div className="flex-1 h-px bg-gray-200" />
          <span className="text-xs font-bold text-gray-400 uppercase tracking-widest">Weight</span>
          <div className="flex-1 h-px bg-gray-200" />
        </div>

        {/* ── Weight stats row ── */}
        <div className="grid grid-cols-3 gap-3">
          {[
            {
              label: 'Current Weight',
              value: currentWt ? `${currentWt} kg` : '—',
              sub:   latestWt ? latestWt.date : 'No logs yet',
            },
            {
              label: 'BMI',
              value: bmi ? bmi.toFixed(1) : '—',
              sub:   bmiInfo?.label ?? (weightProfile.height_cm > 0 ? '' : 'Set height first'),
              color: bmiInfo?.color,
            },
            {
              label: 'This Month Change',
              value: wtMonthChange !== null
                ? `${wtMonthChange >= 0 ? '+' : ''}${wtMonthChange.toFixed(1)} kg`
                : '—',
              sub:   wtMonthStart ? `Started at ${wtMonthStart} kg` : 'No logs this month',
              color: wtMonthChange !== null
                ? wtMonthChange < 0 ? '#10B981' : wtMonthChange > 0 ? '#EF4444' : '#6B7280'
                : undefined,
            },
          ].map(c => (
            <div key={c.label} className="bg-white rounded-2xl shadow-sm p-4 text-center border border-gray-50">
              <p className="text-xs text-gray-400 mb-1">{c.label}</p>
              <p className="text-lg font-bold" style={{ color: c.color || '#111827' }}>{c.value}</p>
              <p className="text-xs text-gray-400 mt-0.5">{c.sub}</p>
            </div>
          ))}
        </div>

        {/* ── Weight trend chart ── */}
        <div className="bg-white rounded-2xl shadow-sm p-5 border border-gray-50">
          <div className="flex items-center justify-between mb-4">
            <p className="text-sm font-bold text-gray-800">Weight Trend</p>
            <div className="flex gap-1 bg-gray-100 rounded-xl p-1">
              {[['week', 'Last 7 days'], ['month', 'This month']].map(([id, label]) => (
                <button key={id} onClick={() => setWeightTab(id)}
                  className="px-3 py-1 rounded-lg text-xs font-semibold transition-all duration-150"
                  style={{
                    backgroundColor: weightTab === id ? '#10B981' : 'transparent',
                    color: weightTab === id ? 'white' : '#6B7280',
                  }}>
                  {label}
                </button>
              ))}
            </div>
          </div>
          {loading
            ? <div className="h-40 flex items-center justify-center text-gray-300 text-sm">Loading…</div>
            : <LineChart logs={sortedWt} from={wtFrom} to={wtTo} height={160} />
          }
          <p className="text-xs text-gray-400 mt-2 text-center">🟡 = today · Green line = weight trend</p>
        </div>

      </div>
    </>
  )
}
