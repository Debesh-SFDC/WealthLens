import { useState, useEffect, useCallback } from 'react'

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

const fmt = v => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(v || 0)

function ym(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
}

function offsetMonth(base, offset) {
  const d = new Date(base.getFullYear(), base.getMonth() + offset, 1)
  return ym(d)
}

function monthLabel(ymStr) {
  const [y, m] = ymStr.split('-')
  return new Date(+y, +m - 1).toLocaleString('en-IN', { month: 'long', year: 'numeric' })
}

function shortMonthLabel(ymStr) {
  const [y, m] = ymStr.split('-')
  return new Date(+y, +m - 1).toLocaleString('en-IN', { month: 'short' })
}

function daysInMonth(ymStr) {
  const [y, m] = ymStr.split('-')
  return new Date(+y, +m, 0).getDate()
}

export default function TrackerDashboard({ user }) {
  const now = new Date()
  const currentYM = ym(now)

  const [period, setPeriod]           = useState('month')
  const [monthOffset, setMonthOffset] = useState(0)
  const [expenses, setExpenses]       = useState([])
  const [budget, setBudget]           = useState(0)
  const [loading, setLoading]         = useState(true)

  const targetMonth = offsetMonth(now, monthOffset)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const b = await window.electronAPI.getTrackerBudget().catch(() => 0)
      setBudget(b || 0)

      if (period === 'week' || period === 'month') {
        const m = period === 'week' ? currentYM : targetMonth
        const data = await window.electronAPI.getAllExpenses({ month: m })
        setExpenses(data)
      } else if (period === '3m') {
        const months = [0, -1, -2].map(o => offsetMonth(now, o))
        const all = await Promise.all(months.map(m => window.electronAPI.getAllExpenses({ month: m })))
        setExpenses(all.flat())
      } else {
        const months = Array.from({ length: 12 }, (_, i) => offsetMonth(now, -i))
        const all = await Promise.all(months.map(m => window.electronAPI.getAllExpenses({ month: m })))
        setExpenses(all.flat())
      }
    } catch {}
    setLoading(false)
  }, [period, monthOffset])

  useEffect(() => { load() }, [load])

  const filteredExpenses = (() => {
    if (period === 'week') {
      const cutoff = new Date()
      cutoff.setDate(cutoff.getDate() - 6)
      const cutoffStr = cutoff.toISOString().split('T')[0]
      return expenses.filter(e => e.date >= cutoffStr)
    }
    if (period === 'month') return expenses.filter(e => e.date.startsWith(targetMonth))
    return expenses
  })()

  const total = filteredExpenses.reduce((s, e) => s + e.amount, 0)

  const days = period === 'week'
    ? Math.min(7, new Set(filteredExpenses.map(e => e.date)).size || 1)
    : period === 'month'
    ? Math.min(now.getDate(), daysInMonth(targetMonth))
    : period === '3m' ? 90 : 365

  const avgPerDay = total / (days || 1)

  const catTotals = CATEGORIES.map(cat => ({
    ...cat,
    value: filteredExpenses.filter(e => e.category === cat.name).reduce((s, e) => s + e.amount, 0),
  })).sort((a, b) => b.value - a.value)

  const topCat = catTotals[0]

  const budgetPct = budget > 0 && period === 'month' ? Math.min((total / budget) * 100, 100) : 0
  const budgetBarColor = budgetPct >= 90 ? '#EF4444' : budgetPct >= 70 ? '#F59E0B' : '#6C63FF'

  const chartData = (() => {
    if (period === 'week') {
      const result = []
      for (let i = 6; i >= 0; i--) {
        const d = new Date()
        d.setDate(d.getDate() - i)
        const dateStr = d.toISOString().split('T')[0]
        const dayTotal = filteredExpenses.filter(e => e.date === dateStr).reduce((s, e) => s + e.amount, 0)
        result.push({ label: d.toLocaleDateString('en-IN', { weekday: 'short' }).slice(0, 3), value: dayTotal })
      }
      return result
    }
    if (period === 'month') {
      const nDays = daysInMonth(targetMonth)
      return Array.from({ length: nDays }, (_, i) => {
        const day = String(i + 1).padStart(2, '0')
        const dateStr = `${targetMonth}-${day}`
        const dayTotal = filteredExpenses.filter(e => e.date === dateStr).reduce((s, e) => s + e.amount, 0)
        return { label: i % 5 === 0 ? String(i + 1) : '', value: dayTotal }
      })
    }
    if (period === '3m') {
      return [0, -1, -2].reverse().map(o => {
        const m = offsetMonth(now, o)
        const val = expenses.filter(e => e.date.startsWith(m)).reduce((s, e) => s + e.amount, 0)
        return { label: shortMonthLabel(m), value: val }
      })
    }
    return Array.from({ length: 12 }, (_, i) => {
      const m = offsetMonth(now, -(11 - i))
      const val = expenses.filter(e => e.date.startsWith(m)).reduce((s, e) => s + e.amount, 0)
      return { label: shortMonthLabel(m), value: val }
    })
  })()

  const maxBar = Math.max(...chartData.map(d => d.value), 1)

  const svgW = 560
  const svgH = 180
  const padL = 8
  const padR = 8
  const padT = 10
  const padB = 28
  const chartW = svgW - padL - padR
  const chartH = svgH - padT - padB
  const n = chartData.length
  const barW = Math.max(4, Math.floor((chartW / n) * 0.6))
  const gap = chartW / n

  const guideVals = [0, Math.round(maxBar * 0.33), Math.round(maxBar * 0.66), maxBar]

  const PERIODS = ['week', 'month', '3m', 'year']
  const PERIOD_LABELS = { week: 'Week', month: 'Month', '3m': '3M', year: 'Year' }

  return (
    <>
      <style>{`
        @keyframes fadeInUp {
          from { opacity: 0; transform: translateY(18px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        .tracker-dash { animation: fadeInUp 0.3s ease; }
      `}</style>

      <div className="tracker-dash p-6 max-w-2xl mx-auto">
        <div className="mb-6">
          <p className="text-xl font-bold text-gray-900">Dashboard</p>
          <p className="text-sm text-gray-400 mt-0.5">Your spending overview</p>
        </div>

        <div className="flex items-center gap-2 mb-5">
          {PERIODS.map(p => (
            <button
              key={p}
              onClick={() => { setPeriod(p); setMonthOffset(0) }}
              className="px-4 py-2 rounded-full text-sm font-semibold transition-all duration-150"
              style={{
                backgroundColor: period === p ? '#6C63FF' : 'transparent',
                color: period === p ? '#ffffff' : '#6B7280',
                border: `2px solid ${period === p ? '#6C63FF' : '#E5E7EB'}`,
              }}
            >
              {PERIOD_LABELS[p]}
            </button>
          ))}

          {period === 'month' && (
            <div className="flex items-center gap-2 ml-auto">
              <button
                onClick={() => setMonthOffset(o => o - 1)}
                className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 text-gray-600 font-bold text-lg transition-colors"
              >
                ‹
              </button>
              <span className="text-sm font-semibold text-gray-800 whitespace-nowrap">{monthLabel(targetMonth)}</span>
              <button
                onClick={() => setMonthOffset(o => o + 1)}
                disabled={targetMonth >= currentYM}
                className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 text-gray-600 font-bold text-lg transition-colors disabled:opacity-30"
              >
                ›
              </button>
            </div>
          )}
        </div>

        <div className="grid grid-cols-3 gap-3 mb-5">
          {[
            { label: 'Total Spent', value: fmt(total) },
            { label: 'Avg / Day', value: fmt(avgPerDay) },
            { label: 'Top Category', value: topCat?.value > 0 ? `${topCat.icon} ${topCat.name}` : '—' },
          ].map(card => (
            <div key={card.label} className="bg-white rounded-2xl shadow-sm p-4 text-center">
              <p className="text-xs text-gray-400 mb-1">{card.label}</p>
              <p className="text-base font-bold text-gray-900">{card.value}</p>
            </div>
          ))}
        </div>

        {period === 'month' && budget > 0 && (
          <div className="bg-white rounded-2xl shadow-sm p-4 mb-5">
            <div className="flex justify-between mb-2">
              <span className="text-sm font-semibold text-gray-700">{fmt(total)} of {fmt(budget)}</span>
              <span className="text-sm font-semibold" style={{ color: budgetBarColor }}>{Math.round(budgetPct)}%</span>
            </div>
            <div className="h-3 rounded-full" style={{ backgroundColor: '#F3F4F6' }}>
              <div
                className="h-full rounded-full transition-all duration-500"
                style={{ width: `${budgetPct}%`, backgroundColor: budgetBarColor }}
              />
            </div>
            <p className="text-xs text-gray-400 mt-1.5">
              {total > budget
                ? `Over budget by ${fmt(total - budget)}`
                : `${fmt(budget - total)} remaining`}
            </p>
          </div>
        )}

        <div className="bg-white rounded-2xl shadow-sm p-5 mb-5">
          <p className="text-sm font-bold text-gray-800 mb-4">Spending Chart</p>
          {loading ? (
            <div className="flex items-center justify-center h-40 text-gray-300 text-sm">Loading…</div>
          ) : (
            <svg
              viewBox={`0 0 ${svgW} ${svgH}`}
              preserveAspectRatio="xMidYMid meet"
              className="w-full"
              style={{ height: 180 }}
            >
              {guideVals.map((gv, gi) => {
                const y = padT + chartH - (gv / maxBar) * chartH
                return (
                  <g key={gi}>
                    <line
                      x1={padL} y1={y} x2={svgW - padR} y2={y}
                      stroke="#F3F4F6" strokeWidth={1}
                    />
                    {gv > 0 && (
                      <text x={padL} y={y - 3} fill="#D1D5DB" fontSize={9} textAnchor="start">
                        {gv >= 1000 ? `${Math.round(gv / 1000)}k` : gv}
                      </text>
                    )}
                  </g>
                )
              })}

              {chartData.map((d, i) => {
                const barH = maxBar > 0 ? Math.max(2, (d.value / maxBar) * chartH) : 2
                const x = padL + i * gap + (gap - barW) / 2
                const y = padT + chartH - barH
                return (
                  <g key={i}>
                    <rect
                      x={x} y={y} width={barW} height={barH}
                      rx={3}
                      fill={d.value > 0 ? '#6C63FF' : '#E5E7EB'}
                      opacity={d.value > 0 ? 1 : 0.4}
                    >
                      <title>{d.value > 0 ? fmt(d.value) : '₹0'}</title>
                    </rect>
                    {d.label ? (
                      <text
                        x={x + barW / 2}
                        y={svgH - 6}
                        textAnchor="middle"
                        fill="#9CA3AF"
                        fontSize={period === 'month' ? 8 : 10}
                      >
                        {d.label}
                      </text>
                    ) : null}
                  </g>
                )
              })}
            </svg>
          )}
        </div>

        <div className="bg-white rounded-2xl shadow-sm p-5">
          <p className="text-sm font-bold text-gray-800 mb-4">By Category</p>
          <div className="space-y-3">
            {catTotals.map(cat => {
              const pct = total > 0 ? (cat.value / total) * 100 : 0
              const hasSpend = cat.value > 0
              return (
                <div key={cat.name} className="flex items-center gap-3" style={{ opacity: hasSpend ? 1 : 0.35 }}>
                  <div
                    className="flex items-center justify-center rounded-xl shrink-0 text-xl"
                    style={{ width: 40, height: 40, backgroundColor: cat.bg }}
                  >
                    {cat.icon}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex justify-between mb-1">
                      <span className="text-sm font-medium text-gray-700">{cat.name}</span>
                      <span className="text-sm font-bold text-gray-900">{fmt(cat.value)}</span>
                    </div>
                    <div className="h-2 rounded-full" style={{ backgroundColor: '#F3F4F6' }}>
                      <div
                        className="h-full rounded-full transition-all duration-500"
                        style={{ width: `${pct}%`, backgroundColor: cat.color }}
                      />
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </div>
    </>
  )
}
