import { useState, useEffect, useCallback } from 'react'
import { getAllExpenses, getTrackerBudget, getWeightLogs, getWeightProfile } from '../db/index.js'

const fmt = v => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(v || 0)

function monthLabel(m) {
  const [y, mo] = m.split('-')
  return new Date(Number(y), Number(mo)-1).toLocaleDateString('en-IN', { month: 'short' })
}

function getLast6Months() {
  const months = []
  const d = new Date()
  for (let i = 5; i >= 0; i--) {
    const t = new Date(d.getFullYear(), d.getMonth() - i, 1)
    months.push(`${t.getFullYear()}-${String(t.getMonth()+1).padStart(2,'0')}`)
  }
  return months
}

function BarChart({ data, valueKey = 'total', labelKey = 'label', highlightLast = false, color = '#6C63FF', height = 180 }) {
  const max = Math.max(...data.map(d => d[valueKey]), 1)
  const W = 320, BAR_W = Math.min(32, (W - 20) / data.length - 6)

  return (
    <svg viewBox={`0 0 ${W} ${height + 30}`} style={{ width: '100%', overflow: 'visible' }}>
      {[0, 0.5, 1].map(frac => (
        <line key={frac} x1={10} y1={height * (1-frac)} x2={W-10} y2={height * (1-frac)}
          stroke="#F3F4F6" strokeWidth={1} />
      ))}
      {data.map((d, i) => {
        const barH = Math.max(4, (d[valueKey] / max) * height)
        const x = 10 + i * ((W-20) / data.length) + ((W-20)/data.length - BAR_W) / 2
        const y = height - barH
        const isLast = i === data.length - 1
        const fill = (highlightLast && isLast) ? '#F59E0B' : color
        return (
          <g key={i}>
            <rect x={x} y={y} width={BAR_W} height={barH} rx={BAR_W/2} fill={fill} opacity={0.9} />
            <text x={x + BAR_W/2} y={height + 18} textAnchor="middle" fill="#9CA3AF" fontSize={9} fontWeight="600">
              {d[labelKey]}
            </text>
          </g>
        )
      })}
    </svg>
  )
}

function LineChart({ data, color = '#10B981', height = 120 }) {
  if (!data.length) return (
    <div style={{ height, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <p style={{ fontSize: 12, color: '#9CA3AF' }}>No data for this period</p>
    </div>
  )
  const values = data.map(d => d.value)
  const minV = Math.min(...values), maxV = Math.max(...values)
  const range = maxV - minV || 1
  const W = 320, PAD = 16
  const today = new Date().toISOString().split('T')[0]

  const pts = data.map((d, i) => {
    const x = PAD + (i / Math.max(data.length - 1, 1)) * (W - PAD * 2)
    const y = (height - PAD - 4) - ((d.value - minV) / range) * (height - PAD * 2 - 4)
    return [x, y]
  })

  const pathD = pts.map((p, i) => (i === 0 ? `M ${p[0]} ${p[1]}` : `L ${p[0]} ${p[1]}`)).join(' ')
  const areaD = `${pathD} L ${pts[pts.length-1][0]} ${height} L ${pts[0][0]} ${height} Z`

  return (
    <svg viewBox={`0 0 ${W} ${height}`} style={{ width: '100%', overflow: 'visible' }}>
      <defs>
        <linearGradient id="wt-area" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.18" />
          <stop offset="100%" stopColor={color} stopOpacity="0.01" />
        </linearGradient>
      </defs>
      <path d={areaD} fill="url(#wt-area)" />
      <path d={pathD} fill="none" stroke={color} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />
      {pts.map((p, i) => {
        const isToday = data[i]?.date === today
        return (
          <circle key={i} cx={p[0]} cy={p[1]} r={isToday ? 5.5 : 4}
            fill={isToday ? '#F59E0B' : color} stroke="white" strokeWidth={1.5} />
        )
      })}
      {data.map((d, i) => {
        if (data.length > 8 && i !== 0 && i !== Math.floor(data.length/2) && i !== data.length-1) return null
        return (
          <text key={i} x={pts[i][0]} y={height - 1} textAnchor="middle" fill="#9CA3AF" fontSize={8.5} fontWeight="600">
            {d.label}
          </text>
        )
      })}
    </svg>
  )
}


export default function TrackerDashboard() {
  const [expenses, setExpenses] = useState([])
  const [budget, setBudget]     = useState(0)
  const [viewMode, setViewMode] = useState('week') // week | month

  const months = getLast6Months()
  const currentMonth = months[months.length - 1]
  const [selMonth, setSelMonth] = useState(currentMonth)

  const [weightLogs, setWeightLogs]       = useState([])
  const [weightProfile, setWeightProfile] = useState({ heightCm: 0, dateOfBirth: null })
  const [weightTab, setWeightTab]         = useState('week')

  const load = useCallback(async () => {
    try {
      const [data, b] = await Promise.all([
        getAllExpenses({ month: selMonth }),
        getTrackerBudget(),
      ])
      setExpenses(data)
      setBudget(b || 0)
    } catch {}
  }, [selMonth])

  useEffect(() => { load() }, [load])

  useEffect(() => {
    getWeightLogs({}).then(setWeightLogs).catch(() => {})
    getWeightProfile().then(setWeightProfile).catch(() => {})
  }, [])

  // Day-by-day (last 7 days in current month or week view)
  const today = new Date().toISOString().split('T')[0]
  const dayData = (() => {
    if (viewMode === 'week') {
      const days = []
      for (let i = 6; i >= 0; i--) {
        const d = new Date(); d.setDate(d.getDate() - i)
        const ds = d.toISOString().split('T')[0]
        const total = expenses.filter(e => e.date === ds).reduce((s, e) => s + e.amount, 0)
        days.push({ label: d.toLocaleDateString('en-IN', { weekday: 'short' }).slice(0,2), total, date: ds })
      }
      return days
    } else {
      const [y, m] = selMonth.split('-')
      const daysInMonth = new Date(Number(y), Number(m), 0).getDate()
      return Array.from({ length: daysInMonth }, (_, i) => {
        const day = String(i+1).padStart(2,'0')
        const ds = `${selMonth}-${day}`
        const total = expenses.filter(e => e.date === ds).reduce((s, e) => s + e.amount, 0)
        return { label: String(i+1), total, date: ds }
      })
    }
  })()

  // Month-by-month
  const [allExpenses, setAllExpenses] = useState([])
  useEffect(() => {
    getAllExpenses({}).then(setAllExpenses).catch(() => {})
  }, [])

  const monthData = months.map(m => {
    const total = allExpenses.filter(e => e.date?.startsWith(m)).reduce((s, e) => s + e.amount, 0)
    return { label: monthLabel(m), total, month: m }
  })

  const monthTotal    = expenses.reduce((s, e) => s + e.amount, 0)
  const budgetPct     = budget > 0 ? Math.min((monthTotal / budget) * 100, 100) : 0
  const avgPerDay     = expenses.length
    ? (monthTotal / new Set(expenses.map(e => e.date)).size).toFixed(0)
    : 0

  // Category breakdown
  const catTotals = Object.entries(
    expenses.reduce((acc, e) => { acc[e.category] = (acc[e.category]||0)+e.amount; return acc }, {})
  ).sort((a,b) => b[1]-a[1]).slice(0,5)

  const prevMonthIdx = months.indexOf(selMonth) - 1
  const prevMonth    = prevMonthIdx >= 0 ? months[prevMonthIdx] : null
  const prevTotal    = prevMonth
    ? allExpenses.filter(e => e.date?.startsWith(prevMonth)).reduce((s, e) => s + e.amount, 0)
    : 0
  const delta = monthTotal - prevTotal

  // ── Weight computed values ──────────────────────────────────────────────────
  const sortedWt   = [...weightLogs].sort((a, b) => a.date.localeCompare(b.date))
  const latestWt   = sortedWt.length ? sortedWt[sortedWt.length - 1].weight_kg : null
  const heightM    = weightProfile?.heightCm ? weightProfile.heightCm / 100 : 0
  const bmi        = (latestWt && heightM) ? latestWt / (heightM * heightM) : null
  const bmiLabel   = !bmi ? null : bmi < 18.5 ? 'Underweight' : bmi < 25 ? 'Normal' : bmi < 30 ? 'Overweight' : 'Obese'
  const bmiColor   = !bmi ? '#9CA3AF' : bmi < 18.5 ? '#3B82F6' : bmi < 25 ? '#10B981' : bmi < 30 ? '#F59E0B' : '#EF4444'

  const wtChartData = (() => {
    const d = new Date()
    const todayS = d.toISOString().split('T')[0]
    let from, to
    if (weightTab === 'week') {
      const f = new Date(d); f.setDate(d.getDate() - 6)
      from = f.toISOString().split('T')[0]; to = todayS
    } else if (weightTab === 'lastweek') {
      const t = new Date(d); t.setDate(d.getDate() - 7)
      const f = new Date(d); f.setDate(d.getDate() - 13)
      from = f.toISOString().split('T')[0]; to = t.toISOString().split('T')[0]
    } else if (weightTab === 'month') {
      from = todayS.slice(0, 7) + '-01'; to = todayS
    } else {
      const lm = new Date(d.getFullYear(), d.getMonth() - 1, 1)
      const lmEnd = new Date(d.getFullYear(), d.getMonth(), 0)
      from = lm.toISOString().split('T')[0]; to = lmEnd.toISOString().split('T')[0]
    }
    return sortedWt
      .filter(l => l.date >= from && l.date <= to)
      .map(l => ({
        value: l.weight_kg,
        label: new Date(l.date + 'T12:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }),
        date: l.date,
      }))
  })()

  const thisMonthWtLogs = sortedWt.filter(l => l.date.startsWith(today.slice(0, 7)))
  const wtMonthChange   = thisMonthWtLogs.length >= 2
    ? thisMonthWtLogs[thisMonthWtLogs.length-1].weight_kg - thisMonthWtLogs[0].weight_kg
    : null

  return (
    <div className="pb-24 px-4 pt-5" style={{ minHeight: '100vh', background: '#F8F9FF' }}>
      <style>{`@keyframes fadeInUp { from{opacity:0;transform:translateY(16px)} to{opacity:1;transform:translateY(0)} } .anim{animation:fadeInUp 0.3s ease both}`}</style>

      {/* Header */}
      <div className="flex items-center justify-between mb-5 anim">
        <div>
          <p className="text-xl font-extrabold text-gray-900">Dashboard</p>
          <p className="text-xs text-gray-400 mt-0.5">Spending overview</p>
        </div>
      </div>

      {/* Month selector */}
      <div className="flex gap-2 overflow-x-auto pb-2 mb-4 anim" style={{ scrollbarWidth: 'none' }}>
        {months.map(m => (
          <button key={m} onClick={() => setSelMonth(m)}
            className="shrink-0 px-4 py-2 rounded-full text-xs font-bold transition-all"
            style={{
              backgroundColor: selMonth === m ? '#6C63FF' : 'white',
              color: selMonth === m ? 'white' : '#6B7280',
              boxShadow: '0 1px 4px rgba(0,0,0,0.08)',
            }}
          >
            {monthLabel(m)} {m.split('-')[0]}
          </button>
        ))}
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-3 gap-3 mb-4 anim">
        {[
          { label: 'Month Total', value: fmt(monthTotal), sub: budget > 0 ? `of ${fmt(budget)}` : '' },
          { label: 'Avg / Day',   value: fmt(Number(avgPerDay)), sub: '' },
          { label: 'vs Last Mo.', value: fmt(Math.abs(delta)), sub: delta === 0 ? '—' : delta > 0 ? '▲ more' : '▼ less', subColor: delta > 0 ? '#EF4444' : '#10B981' },
        ].map(({ label, value, sub, subColor }) => (
          <div key={label} className="bg-white rounded-2xl p-3 shadow-sm">
            <p className="text-xs text-gray-400 mb-1">{label}</p>
            <p className="text-sm font-extrabold text-gray-900">{value}</p>
            {sub && <p className="text-xs mt-0.5" style={{ color: subColor || '#9CA3AF' }}>{sub}</p>}
          </div>
        ))}
      </div>

      {budget > 0 && (
        <div className="bg-white rounded-2xl p-4 mb-4 shadow-sm anim">
          <div className="flex justify-between mb-2">
            <p className="text-xs font-bold text-gray-600">Budget Used</p>
            <p className="text-xs font-bold" style={{ color: budgetPct >= 90 ? '#EF4444' : '#6C63FF' }}>{Math.round(budgetPct)}%</p>
          </div>
          <div className="h-2.5 rounded-full bg-gray-100">
            <div className="h-full rounded-full transition-all duration-700"
              style={{ width: `${budgetPct}%`, backgroundColor: budgetPct >= 90 ? '#EF4444' : budgetPct >= 70 ? '#F59E0B' : '#6C63FF' }} />
          </div>
        </div>
      )}

      {/* Day chart */}
      <div className="bg-white rounded-3xl p-4 mb-4 shadow-sm anim">
        <div className="flex items-center justify-between mb-3">
          <p className="text-sm font-bold text-gray-800">Day-by-Day</p>
          <div className="flex gap-1">
            {['week','month'].map(m => (
              <button key={m} onClick={() => setViewMode(m)}
                className="px-3 py-1 rounded-full text-xs font-semibold"
                style={{ backgroundColor: viewMode === m ? '#EEF2FF' : '#F3F4F6', color: viewMode === m ? '#6C63FF' : '#9CA3AF' }}>
                {m === 'week' ? '7 days' : 'Month'}
              </button>
            ))}
          </div>
        </div>
        <BarChart data={dayData} valueKey="total" labelKey="label" highlightLast={viewMode === 'week'} />
      </div>

      {/* Month chart */}
      <div className="bg-white rounded-3xl p-4 mb-4 shadow-sm anim">
        <p className="text-sm font-bold text-gray-800 mb-3">Month by Month</p>
        <BarChart data={monthData} valueKey="total" labelKey="label" highlightLast color="#A78BFA" height={140} />
      </div>

      {/* Category breakdown */}
      {catTotals.length > 0 && (
        <div className="bg-white rounded-3xl p-4 mb-4 shadow-sm anim">
          <p className="text-sm font-bold text-gray-800 mb-3">Top Categories</p>
          <div className="flex flex-col gap-3">
            {catTotals.map(([name, total]) => {
              const pct = monthTotal > 0 ? (total / monthTotal * 100) : 0
              return (
                <div key={name}>
                  <div className="flex justify-between mb-1">
                    <p className="text-xs font-semibold text-gray-700">{name}</p>
                    <p className="text-xs font-bold text-gray-900">{fmt(total)} <span className="text-gray-400 font-normal">({pct.toFixed(0)}%)</span></p>
                  </div>
                  <div className="h-2 rounded-full bg-gray-100">
                    <div className="h-full rounded-full transition-all duration-500" style={{ width: `${pct}%`, backgroundColor: '#6C63FF' }} />
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* ── WEIGHT SECTION ── */}
      <div className="flex items-center gap-3 mb-4 anim">
        <div className="flex-1 h-px" style={{ backgroundColor: '#E5E7EB' }} />
        <p className="text-xs font-bold text-gray-400 uppercase tracking-widest">⚖️ Weight</p>
        <div className="flex-1 h-px" style={{ backgroundColor: '#E5E7EB' }} />
      </div>

      {/* Weight stat cards */}
      <div className="grid grid-cols-3 gap-3 mb-4 anim">
        <div className="bg-white rounded-2xl p-3 shadow-sm">
          <p className="text-xs text-gray-400 mb-1">Current</p>
          <p className="text-sm font-extrabold text-gray-900">{latestWt ? `${latestWt} kg` : '—'}</p>
        </div>
        <div className="bg-white rounded-2xl p-3 shadow-sm">
          <p className="text-xs text-gray-400 mb-1">BMI</p>
          <p className="text-sm font-extrabold" style={{ color: bmiColor }}>{bmi ? bmi.toFixed(1) : '—'}</p>
          {bmiLabel && <p className="text-xs mt-0.5" style={{ color: bmiColor }}>{bmiLabel}</p>}
        </div>
        <div className="bg-white rounded-2xl p-3 shadow-sm">
          <p className="text-xs text-gray-400 mb-1">This Month</p>
          <p className="text-sm font-extrabold" style={{ color: wtMonthChange == null ? '#9CA3AF' : wtMonthChange <= 0 ? '#10B981' : '#EF4444' }}>
            {wtMonthChange == null ? '—' : `${wtMonthChange > 0 ? '+' : ''}${wtMonthChange.toFixed(1)} kg`}
          </p>
        </div>
      </div>

      {/* Weight trend chart */}
      <div className="bg-white rounded-3xl p-4 shadow-sm anim">
        <div className="flex items-center justify-between mb-3">
          <p className="text-sm font-bold text-gray-800">Weight Trend</p>
          <div className="flex gap-1 flex-wrap justify-end">
            {[
              { key: 'week', label: 'This Week' },
              { key: 'lastweek', label: 'Last Week' },
              { key: 'month', label: 'This Month' },
              { key: 'lastmonth', label: 'Last Month' },
            ].map(({ key, label }) => (
              <button key={key} onClick={() => setWeightTab(key)}
                className="px-2.5 py-1 rounded-full text-xs font-semibold"
                style={{ backgroundColor: weightTab === key ? '#ECFDF5' : '#F3F4F6', color: weightTab === key ? '#059669' : '#9CA3AF' }}>
                {label}
              </button>
            ))}
          </div>
        </div>
        <LineChart data={wtChartData} color="#10B981" height={130} />
      </div>
    </div>
  )
}
