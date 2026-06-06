import { useState, useEffect } from 'react'

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

function daysInMonth(ymStr) {
  const [y, m] = ymStr.split('-')
  return new Date(+y, +m, 0).getDate()
}

function catTotalsFor(expenses, month) {
  const filtered = expenses.filter(e => e.date.startsWith(month))
  return CATEGORIES.map(cat => ({
    ...cat,
    value: filtered.filter(e => e.category === cat.name).reduce((s, e) => s + e.amount, 0),
  }))
}

function streak(expenses) {
  const dateSet = new Set(expenses.map(e => e.date))
  let count = 0
  const today = new Date()
  while (true) {
    const d = new Date(today)
    d.setDate(d.getDate() - count)
    const s = d.toISOString().split('T')[0]
    if (dateSet.has(s)) count++
    else break
    if (count > 365) break
  }
  return count
}

function generateTips(catTotals, monthTotal) {
  const tips = []
  const pct = name => {
    const c = catTotals.find(c => c.name === name)
    return monthTotal > 0 ? ((c?.value || 0) / monthTotal) * 100 : 0
  }
  const val = name => catTotals.find(c => c.name === name)?.value || 0

  if (pct('Food') > 30)
    tips.push('🍔 Consider meal prepping — cooking at home can cut food costs by 40–60%')
  if (pct('Dining') > 20)
    tips.push(`🍽️ Try limiting restaurant meals to weekends to save ${fmt(val('Dining') * 0.4)}/month`)
  if (pct('Shopping') > 25)
    tips.push('🛍️ Use a 24-hour rule before purchases to reduce impulse buys')
  if (pct('Entertainment') > 15)
    tips.push('🎬 Look for free or low-cost alternatives for entertainment')
  if (pct('Transport') > 20)
    tips.push('🚗 Consider carpooling or public transport 2–3 days/week')

  if (tips.length < 2)
    tips.push('💡 Log expenses daily to get personalized insights about your habits')
  if (tips.length < 2)
    tips.push('📊 Set a monthly budget to better track your spending goals')

  return tips
}

function InsightCard({ children, delay = 0 }) {
  return (
    <div
      className="bg-white rounded-3xl shadow-sm p-5"
      style={{ animation: `fadeInUp 0.35s ease both`, animationDelay: `${delay}ms` }}
    >
      {children}
    </div>
  )
}

export default function TrackerInsights({ user }) {
  const now = new Date()
  const thisMonth = ym(now)
  const lastMonth = offsetMonth(now, -1)

  const [thisExpenses, setThisExpenses] = useState([])
  const [lastExpenses, setLastExpenses] = useState([])
  const [loading, setLoading]           = useState(true)

  useEffect(() => {
    async function load() {
      setLoading(true)
      try {
        const [t, l] = await Promise.all([
          window.electronAPI.getAllExpenses({ month: thisMonth }),
          window.electronAPI.getAllExpenses({ month: lastMonth }),
        ])
        setThisExpenses(t)
        setLastExpenses(l)
      } catch {}
      setLoading(false)
    }
    load()
  }, [])

  const allExpenses = [...thisExpenses, ...lastExpenses]

  const thisCats = catTotalsFor(thisExpenses, thisMonth)
  const lastCats = catTotalsFor(lastExpenses, lastMonth)

  const thisTotal = thisExpenses.reduce((s, e) => s + e.amount, 0)
  const lastTotal = lastExpenses.reduce((s, e) => s + e.amount, 0)

  const sortedCats = [...thisCats].sort((a, b) => b.value - a.value)
  const topCat = sortedCats[0]

  const daysElapsed = Math.max(now.getDate(), 1)
  const avgPerDay = thisTotal / daysElapsed
  const projectedEnd = avgPerDay * daysInMonth(thisMonth)

  const tips = generateTips(thisCats, thisTotal)
  const streakCount = streak(allExpenses)

  const topThree = sortedCats.slice(0, 3)
  const medals = ['🥇', '🥈', '🥉']

  const monthDiff = thisTotal - lastTotal
  const diffAbs = Math.abs(monthDiff)
  const diffUp = monthDiff > 0

  const lastMonthLabel = new Date(now.getFullYear(), now.getMonth() - 1, 1)
    .toLocaleString('en-IN', { month: 'short' })
  const thisMonthLabel = now.toLocaleString('en-IN', { month: 'short' })

  const maxMoBar = Math.max(thisTotal, lastTotal, 1)

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64 text-gray-300 text-sm">
        Loading insights…
      </div>
    )
  }

  return (
    <>
      <style>{`
        @keyframes fadeInUp {
          from { opacity: 0; transform: translateY(18px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>

      <div className="p-6 max-w-2xl mx-auto">
        <div className="mb-6">
          <p className="text-xl font-bold text-gray-900">Smart Insights 💡</p>
          <p className="text-sm text-gray-400 mt-0.5">Based on your spending patterns</p>
        </div>

        <div className="space-y-4">
          <InsightCard delay={0}>
            <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-3">Top Spender</p>
            {topCat && topCat.value > 0 ? (
              <div className="flex items-center gap-4">
                <div
                  className="flex items-center justify-center rounded-2xl text-4xl"
                  style={{ width: 64, height: 64, backgroundColor: topCat.bg }}
                >
                  {topCat.icon}
                </div>
                <div>
                  <p className="text-lg font-bold" style={{ color: topCat.color }}>{topCat.name}</p>
                  <p className="text-2xl font-bold text-gray-900">{fmt(topCat.value)}</p>
                  <p className="text-xs text-gray-400 mt-0.5">
                    {thisTotal > 0 ? Math.round((topCat.value / thisTotal) * 100) : 0}% of this month's spending
                  </p>
                </div>
              </div>
            ) : (
              <p className="text-sm text-gray-400">No spending data for this month yet.</p>
            )}
          </InsightCard>

          <InsightCard delay={60}>
            <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-3">Month vs Last Month</p>
            <div className="flex items-center gap-2 mb-4">
              <span className="text-2xl font-bold text-gray-900">{fmt(thisTotal)}</span>
              {lastTotal > 0 && (
                <span
                  className="flex items-center gap-1 text-sm font-semibold px-2 py-0.5 rounded-full"
                  style={{
                    backgroundColor: diffUp ? '#FEE2E2' : '#DCFCE7',
                    color: diffUp ? '#EF4444' : '#16A34A',
                  }}
                >
                  {diffUp ? '↑' : '↓'} {fmt(diffAbs)} {diffUp ? 'more' : 'less'}
                </span>
              )}
            </div>
            <div className="space-y-2">
              {[
                { label: thisMonthLabel, value: thisTotal, color: '#6C63FF' },
                { label: lastMonthLabel, value: lastTotal, color: '#D1D5DB' },
              ].map(row => (
                <div key={row.label} className="flex items-center gap-3">
                  <span className="text-xs font-semibold text-gray-500 w-8">{row.label}</span>
                  <div className="flex-1 h-3 rounded-full" style={{ backgroundColor: '#F3F4F6' }}>
                    <div
                      className="h-full rounded-full transition-all duration-500"
                      style={{ width: `${(row.value / maxMoBar) * 100}%`, backgroundColor: row.color }}
                    />
                  </div>
                  <span className="text-xs font-semibold text-gray-700 w-20 text-right">{fmt(row.value)}</span>
                </div>
              ))}
            </div>
          </InsightCard>

          <InsightCard delay={120}>
            <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-3">Daily Average</p>
            <p className="text-3xl font-bold text-gray-900">{fmt(avgPerDay)}</p>
            <p className="text-sm text-gray-500 mt-1">per day on average this month</p>
            <div className="mt-3 pt-3 border-t border-gray-50">
              <p className="text-sm text-gray-700">
                Projected month-end:{' '}
                <span className="font-bold" style={{ color: '#6C63FF' }}>{fmt(projectedEnd)}</span>
              </p>
              <p className="text-xs text-gray-400 mt-0.5">
                Based on {daysElapsed} day{daysElapsed !== 1 ? 's' : ''} of data
              </p>
            </div>
          </InsightCard>

          <InsightCard delay={180}>
            <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-3">Category Trend</p>
            {topThree.some(c => c.value > 0) ? (
              <div className="space-y-3">
                {topThree.map((cat, i) => (
                  <div key={cat.name} className="flex items-center gap-3">
                    <span className="text-xl">{medals[i]}</span>
                    <div
                      className="flex items-center justify-center rounded-xl text-xl shrink-0"
                      style={{ width: 40, height: 40, backgroundColor: cat.bg }}
                    >
                      {cat.icon}
                    </div>
                    <div className="flex-1">
                      <p className="text-sm font-semibold text-gray-800">{cat.name}</p>
                      <p className="text-xs text-gray-400">
                        {thisTotal > 0 ? Math.round((cat.value / thisTotal) * 100) : 0}% of spending
                      </p>
                    </div>
                    <p className="text-sm font-bold text-gray-900">{fmt(cat.value)}</p>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-gray-400">No spending recorded this month.</p>
            )}
          </InsightCard>

          <InsightCard delay={240}>
            <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-3">Savings Tips</p>
            <div className="space-y-3">
              {tips.map((tip, i) => (
                <div
                  key={i}
                  className="flex gap-3 pl-4 py-2 rounded-2xl"
                  style={{
                    borderLeft: '3px solid #6C63FF',
                    backgroundColor: '#F8F7FF',
                  }}
                >
                  <p className="text-sm text-gray-700">{tip}</p>
                </div>
              ))}
            </div>
          </InsightCard>

          <InsightCard delay={300}>
            <div className="flex items-center gap-4">
              <div
                className="flex items-center justify-center rounded-2xl text-4xl shrink-0"
                style={{ width: 64, height: 64, backgroundColor: '#FFF7ED' }}
              >
                🔥
              </div>
              <div>
                <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-1">Spending Streak</p>
                <p className="text-3xl font-bold text-gray-900">{streakCount} day{streakCount !== 1 ? 's' : ''}</p>
                <p className="text-sm text-gray-500 mt-0.5">Keep tracking!</p>
              </div>
            </div>
          </InsightCard>
        </div>
      </div>
    </>
  )
}
