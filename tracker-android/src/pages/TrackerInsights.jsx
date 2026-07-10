import { useState, useEffect, useCallback } from 'react'
import { getAllExpenses } from '../db/index.js'

const fmt = v => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(v || 0)

function monthStr(offset = 0) {
  const d = new Date()
  d.setMonth(d.getMonth() + offset)
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`
}

function Card({ title, delay = 0, children }) {
  return (
    <div className="bg-white rounded-3xl p-4 shadow-sm"
      style={{ animation: `fadeInUp 0.35s ease ${delay}ms both` }}>
      <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-3">{title}</p>
      {children}
    </div>
  )
}

export default function TrackerInsights() {
  const [thisMonth, setThis]  = useState([])
  const [lastMonth, setLast]  = useState([])

  useEffect(() => {
    getAllExpenses({ month: monthStr(0)  }).then(setThis).catch(() => {})
    getAllExpenses({ month: monthStr(-1) }).then(setLast).catch(() => {})
  }, [])

  const thisTotal = thisMonth.reduce((s, e) => s + e.amount, 0)
  const lastTotal = lastMonth.reduce((s, e) => s + e.amount, 0)
  const delta     = thisTotal - lastTotal
  const daysInMonth = new Date().getDate()
  const avgPerDay    = daysInMonth > 0 ? thisTotal / daysInMonth : 0
  const daysLeft     = new Date(new Date().getFullYear(), new Date().getMonth()+1, 0).getDate() - daysInMonth
  const projection   = thisTotal + avgPerDay * daysLeft

  // Category breakdown
  const catMap = thisMonth.reduce((acc, e) => { acc[e.category] = (acc[e.category]||0) + e.amount; return acc }, {})
  const sorted  = Object.entries(catMap).sort((a,b) => b[1]-a[1])
  const topCat  = sorted[0]

  // Streak: consecutive days with at least 1 expense
  const today = new Date()
  let streak = 0
  for (let i = 0; ; i++) {
    const d = new Date(today); d.setDate(d.getDate() - i)
    const ds = d.toISOString().split('T')[0]
    if (thisMonth.some(e => e.date === ds) || lastMonth.some(e => e.date === ds)) {
      streak++
    } else break
  }

  // Savings tip
  function savingsTip() {
    if (!topCat) return null
    const [cat, amount] = topCat
    const pct = thisTotal > 0 ? (amount / thisTotal * 100) : 0
    if (pct > 40) return `${cat} is eating ${pct.toFixed(0)}% of your budget. Try setting a weekly cap.`
    if (delta > 0) return `You're spending ${fmt(delta)} more than last month. Small cuts in ${cat} can help.`
    if (delta < 0) return `Great! You saved ${fmt(Math.abs(delta))} vs last month. Keep it up!`
    return 'Your spending is steady. Review subscriptions in Bills for hidden savings.'
  }

  const tip = savingsTip()
  const maxBar = Math.max(thisTotal, lastTotal, 1)

  return (
    <div className="pb-24 px-4 pt-5" style={{ minHeight: '100vh', background: '#F8F9FF' }}>
      <style>{`@keyframes fadeInUp{from{opacity:0;transform:translateY(16px)}to{opacity:1;transform:translateY(0)}}`}</style>

      <p className="text-xl font-extrabold text-gray-900 mb-5" style={{ animation: 'fadeInUp 0.3s ease' }}>Insights</p>

      <div className="flex flex-col gap-4">

        {/* Month comparison */}
        <Card title="This vs Last Month" delay={0}>
          <div className="flex flex-col gap-3">
            {[['This month', thisTotal, '#6C63FF'], ['Last month', lastTotal, '#E5E7EB']].map(([label, val, color]) => (
              <div key={label}>
                <div className="flex justify-between mb-1">
                  <p className="text-sm font-semibold text-gray-700">{label}</p>
                  <p className="text-sm font-bold text-gray-900">{fmt(val)}</p>
                </div>
                <div className="h-2.5 rounded-full bg-gray-100">
                  <div className="h-full rounded-full transition-all duration-700"
                    style={{ width: `${(val/maxBar*100)}%`, backgroundColor: color }} />
                </div>
              </div>
            ))}
            <p className="text-xs font-semibold mt-1" style={{ color: delta > 0 ? '#EF4444' : '#10B981' }}>
              {delta === 0 ? 'Same as last month'
                : delta > 0 ? `▲ ${fmt(delta)} more than last month`
                : `▼ ${fmt(Math.abs(delta))} less than last month`}
            </p>
          </div>
        </Card>

        {/* Projection */}
        <Card title="Daily Average & Projection" delay={60}>
          <div className="flex gap-4">
            <div className="flex-1 bg-purple-50 rounded-2xl p-3 text-center">
              <p className="text-xs text-purple-400 font-semibold mb-1">Avg / Day</p>
              <p className="text-lg font-extrabold text-purple-700">{fmt(avgPerDay)}</p>
            </div>
            <div className="flex-1 rounded-2xl p-3 text-center" style={{ backgroundColor: '#FFFBEB' }}>
              <p className="text-xs font-semibold mb-1" style={{ color: '#D97706' }}>Projected</p>
              <p className="text-lg font-extrabold" style={{ color: '#D97706' }}>{fmt(projection)}</p>
              <p className="text-xs text-gray-400">end of month</p>
            </div>
          </div>
        </Card>

        {/* Category podium */}
        {sorted.length > 0 && (
          <Card title="Category Podium" delay={120}>
            <div className="flex flex-col gap-2">
              {sorted.slice(0,3).map(([name, amt], i) => {
                const medals = ['🥇','🥈','🥉']
                const pct = thisTotal > 0 ? (amt / thisTotal * 100) : 0
                return (
                  <div key={name} className="flex items-center gap-3">
                    <span className="text-xl shrink-0">{medals[i]}</span>
                    <div className="flex-1">
                      <div className="flex justify-between mb-0.5">
                        <p className="text-sm font-semibold text-gray-800">{name}</p>
                        <p className="text-sm font-bold text-gray-900">{fmt(amt)}</p>
                      </div>
                      <div className="h-1.5 rounded-full bg-gray-100">
                        <div className="h-full rounded-full" style={{
                          width: `${pct}%`,
                          backgroundColor: i === 0 ? '#FFD700' : i === 1 ? '#C0C0C0' : '#CD7F32',
                        }} />
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          </Card>
        )}

        {/* Savings tip */}
        {tip && (
          <Card title="Savings Tip" delay={180}>
            <div className="flex items-start gap-3">
              <span className="text-2xl shrink-0">💡</span>
              <p className="text-sm text-gray-700 leading-relaxed">{tip}</p>
            </div>
          </Card>
        )}

        {/* Streak */}
        <Card title="Tracking Streak" delay={240}>
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-2xl flex items-center justify-center text-3xl"
              style={{ backgroundColor: streak >= 7 ? '#FFF7ED' : '#F9FAFB' }}>
              {streak >= 7 ? '🔥' : streak >= 3 ? '✨' : '📝'}
            </div>
            <div>
              <p className="text-2xl font-extrabold text-gray-900">{streak} <span className="text-base font-semibold text-gray-400">days</span></p>
              <p className="text-xs text-gray-400">
                {streak >= 7 ? "You're on fire! Amazing streak."
                  : streak >= 3 ? 'Building a great habit!'
                  : streak === 0 ? 'Log today to start a streak.'
                  : 'Keep going!'}
              </p>
            </div>
          </div>
        </Card>

      </div>
    </div>
  )
}
