import { useState, useEffect } from 'react'

const TRACKER_CATEGORIES = [
  { name: 'Food',          icon: '🍔', color: '#FF6B6B' },
  { name: 'Transport',     icon: '🚗', color: '#4ECDC4' },
  { name: 'Shopping',      icon: '🛍️', color: '#45B7D1' },
  { name: 'Health',        icon: '💊', color: '#FF85A1' },
  { name: 'Bills',         icon: '📄', color: '#6366F1' },
  { name: 'Entertainment', icon: '🎬', color: '#96CEB4' },
  { name: 'Fuel',          icon: '⛽', color: '#F59E0B' },
  { name: 'Dining',        icon: '🍽️', color: '#EC4899' },
  { name: 'Others',        icon: '💸', color: '#AEB6BF' },
]

const fmt = v => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(v || 0)

function monthLabel(ym) {
  const [y, m] = ym.split('-')
  return new Date(+y, +m - 1).toLocaleString('en-IN', { month: 'long', year: 'numeric' })
}

export default function TrackerMonth({ user }) {
  const now = new Date()
  const currentYM = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  const [month, setMonth]   = useState(currentYM)
  const [expenses, setExpenses] = useState([])
  const [budget, setBudget] = useState(0)

  useEffect(() => {
    window.electronAPI.getAllExpenses({ month, logged_by: user.id }).then(setExpenses).catch(() => {})
    window.electronAPI.getTrackerBudget().then(setBudget).catch(() => {})
  }, [month, user.id])

  const total = expenses.reduce((s, e) => s + e.amount, 0)
  const overBudget = budget > 0 && total > budget

  // Category breakdown
  const catBreakdown = TRACKER_CATEGORIES.map(cat => {
    const val = expenses.filter(e => e.category === cat.name).reduce((s, e) => s + e.amount, 0)
    return { ...cat, value: val }
  }).filter(c => c.value > 0).sort((a, b) => b.value - a.value)
  const maxCat = catBreakdown[0]?.value || 1

  // Day-wise grouping
  const byDay = {}
  expenses.forEach(e => {
    const d = e.date
    if (!byDay[d]) byDay[d] = []
    byDay[d].push(e)
  })
  const days = Object.keys(byDay).sort((a, b) => b.localeCompare(a))

  function prevMonth() {
    const [y, m] = month.split('-').map(Number)
    const d = new Date(y, m - 2)
    setMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`)
  }
  function nextMonth() {
    if (month >= currentYM) return
    const [y, m] = month.split('-').map(Number)
    const d = new Date(y, m)
    setMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`)
  }

  return (
    <div className="p-4 max-w-lg mx-auto">
      {/* Month picker */}
      <div className="flex items-center justify-between mb-4 mt-4">
        <button onClick={prevMonth} className="p-2 rounded-xl hover:bg-gray-100 text-gray-600 text-lg">‹</button>
        <p className="text-base font-bold text-gray-900">{monthLabel(month)}</p>
        <button onClick={nextMonth} disabled={month >= currentYM}
          className="p-2 rounded-xl hover:bg-gray-100 text-gray-600 text-lg disabled:opacity-30">›</button>
      </div>

      {/* Total + budget */}
      <div className={`rounded-2xl p-5 mb-4 text-center border ${overBudget ? 'border-red-200 bg-red-50' : 'bg-white border-gray-100 shadow-sm'}`}>
        <p className="text-xs text-gray-400 mb-1">Total Spent</p>
        <p className="text-4xl font-bold" style={{ color: overBudget ? '#EF4444' : '#111827' }}>{fmt(total)}</p>
        {budget > 0 && (
          <p className="text-sm font-semibold mt-2" style={{ color: overBudget ? '#EF4444' : '#6B7280' }}>
            {overBudget ? `Over budget by ${fmt(total - budget)}` : `Budget: ${fmt(budget)} · ${fmt(budget - total)} left`}
          </p>
        )}
      </div>

      {/* Category breakdown */}
      {catBreakdown.length > 0 && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 mb-4">
          <p className="text-sm font-bold text-gray-800 mb-3">By Category</p>
          <div className="space-y-2.5">
            {catBreakdown.map(cat => (
              <div key={cat.name} className="flex items-center gap-3">
                <span className="text-lg w-6 text-center">{cat.icon}</span>
                <div className="flex-1">
                  <div className="flex justify-between mb-0.5">
                    <span className="text-xs font-medium text-gray-700">{cat.name}</span>
                    <span className="text-xs font-semibold text-gray-800">{fmt(cat.value)}</span>
                  </div>
                  <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                    <div className="h-full rounded-full transition-all duration-500"
                      style={{ width: `${(cat.value / maxCat) * 100}%`, backgroundColor: cat.color }} />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Day-wise list */}
      {days.length === 0 ? (
        <p className="text-sm text-gray-400 text-center py-10">No expenses this month</p>
      ) : (
        <div className="space-y-3">
          {days.map(day => {
            const dayExps = byDay[day]
            const dayTotal = dayExps.reduce((s, e) => s + e.amount, 0)
            const dateLabel = new Date(day + 'T00:00:00').toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' })
            return (
              <div key={day} className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                <div className="flex items-center justify-between px-4 py-2.5 bg-gray-50 border-b border-gray-100">
                  <p className="text-xs font-bold text-gray-500">{dateLabel}</p>
                  <p className="text-xs font-bold text-gray-700">{fmt(dayTotal)}</p>
                </div>
                <div className="divide-y divide-gray-50">
                  {dayExps.map(exp => {
                    const cat = TRACKER_CATEGORIES.find(c => c.name === exp.category)
                    return (
                      <div key={exp.id} className="flex items-center gap-3 px-4 py-2.5">
                        <span className="text-lg">{cat?.icon || '💸'}</span>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-gray-800">{exp.category}</p>
                          {exp.note && <p className="text-xs text-gray-400 truncate">{exp.note}</p>}
                        </div>
                        <p className="text-sm font-bold text-gray-900">{fmt(exp.amount)}</p>
                      </div>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
