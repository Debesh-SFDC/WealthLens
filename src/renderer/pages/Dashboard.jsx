import { useState, useEffect } from 'react'

const INR = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 })
const fmt = (v) => INR.format(v || 0)

const STAT_CARDS = [
  { key: 'netWorth', label: 'Net Worth', icon: '💎', accent: '#6C63FF', bg: '#f0efff', description: 'Current market value of all investments' },
  { key: 'totalInvested', label: 'Total Invested', icon: '📈', accent: '#10B981', bg: '#ecfdf5', description: 'Total amount invested across all assets' },
  { key: 'thisMonthSpend', label: 'This Month Spend', icon: '💳', accent: '#F59E0B', bg: '#fffbeb', description: 'Total expenses recorded this month' },
  { key: 'goalsActive', label: 'Goals Active', icon: '🎯', accent: '#3B82F6', bg: '#eff6ff', description: 'Financial goals currently in progress', raw: true },
]

// ── Salary donut chart ────────────────────────────────────────────────────
const BUCKET_META = {
  Needs:               { color: '#3B82F6', icon: '🏠' },
  Wants:               { color: '#8B5CF6', icon: '🎭' },
  'Savings & Investments': { color: '#10B981', icon: '📈' },
  Savings:             { color: '#10B981', icon: '📈' },  // fallback
}

function SalaryDonut({ allocations, salary }) {
  if (!allocations.length) return null

  const buckets = allocations.filter(r => r.bank === '__bucket__')
  if (!buckets.length) return null

  let cum = 0
  const segs = buckets.map(b => {
    const meta = BUCKET_META[b.label] || { color: '#6C63FF', icon: '●' }
    const start = cum
    cum += b.percentage
    return { ...b, ...meta, start }
  })

  const gradient = segs.map(s => `${s.color} ${s.start}% ${s.start + s.percentage}%`).join(', ')

  return (
    <div className="bg-white rounded-2xl p-6 border border-gray-100 shadow-sm">
      <h3 className="text-base font-semibold text-gray-800 mb-0.5">Salary Allocation</h3>
      <p className="text-xs text-gray-400 mb-5">{fmt(salary)}/month · 50/30/20 breakdown</p>

      <div className="flex items-center gap-6">
        <div className="relative shrink-0 w-28 h-28">
          <div className="w-28 h-28 rounded-full" style={{ background: `conic-gradient(${gradient})` }} />
          <div className="absolute inset-4 bg-white rounded-full flex flex-col items-center justify-center">
            <p className="text-xs font-bold text-gray-600">{fmt(salary)}</p>
          </div>
        </div>

        <div className="flex-1 space-y-2.5">
          {segs.map((s, i) => (
            <div key={i}>
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-2">
                  <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: s.color }} />
                  <span className="text-xs font-medium text-gray-700">{s.icon} {s.label}</span>
                </div>
                <span className="text-xs font-bold text-gray-800">{s.percentage}%</span>
              </div>
              <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                <div className="h-full rounded-full" style={{ width: `${s.percentage}%`, backgroundColor: s.color }} />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// ── Stat card ─────────────────────────────────────────────────────────────
function StatCard({ label, value, icon, accent, bg, description, loading }) {
  return (
    <div className="bg-white rounded-2xl p-6 border border-gray-100 shadow-sm hover:shadow-md transition-shadow duration-200">
      <div className="flex items-start justify-between mb-4">
        <div className="w-12 h-12 rounded-xl flex items-center justify-center text-2xl" style={{ backgroundColor: bg }}>
          {icon}
        </div>
        <div className="flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-semibold" style={{ backgroundColor: bg, color: accent }}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="w-3 h-3">
            <polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/>
          </svg>
          Live
        </div>
      </div>
      <div className="space-y-1">
        {loading
          ? <div className="h-8 w-32 bg-gray-100 rounded-lg animate-pulse" />
          : <p className="text-2xl font-bold text-gray-900">{value}</p>
        }
        <p className="text-sm font-semibold text-gray-700">{label}</p>
        <p className="text-xs text-gray-400">{description}</p>
      </div>
    </div>
  )
}

// ── Goals progress mini list ──────────────────────────────────────────────
function GoalsMini({ goals, investments }) {
  if (!goals.length) {
    return (
      <div className="flex items-center justify-center h-28 rounded-xl bg-gray-50 border border-dashed border-gray-200">
        <p className="text-sm text-gray-400">No active goals</p>
      </div>
    )
  }

  const curYear = new Date().getFullYear()
  const active = goals.filter(g => !g.is_achieved).slice(0, 3)

  return (
    <div className="space-y-3">
      {active.map(g => {
        const linked = investments.filter(i => i.goal_id === g.id)
        const saved = linked.reduce((s, i) => s + (i.current_value || 0), 0)
        const years = Math.max(0, (g.target_year || curYear) - curYear)
        const target = (g.target_amount || 0) * Math.pow(1 + (g.inflation_rate || 6) / 100, years)
        const pct = target > 0 ? Math.min(100, (saved / target) * 100) : 0
        const accent = g.color || '#6C63FF'
        return (
          <div key={g.id} className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl flex items-center justify-center text-lg shrink-0" style={{ backgroundColor: accent + '18' }}>
              {g.emoji || '🎯'}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex justify-between mb-1">
                <p className="text-sm font-medium text-gray-800 truncate">{g.title}</p>
                <p className="text-xs font-semibold text-gray-500 shrink-0 ml-2">{pct.toFixed(0)}%</p>
              </div>
              <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, backgroundColor: accent }} />
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ── Dashboard ─────────────────────────────────────────────────────────────
export default function Dashboard() {
  const [stats, setStats] = useState({ netWorth: 0, totalInvested: 0, thisMonthSpend: 0, goalsActive: 0 })
  const [allocations, setAllocations] = useState([])
  const [salary, setSalary] = useState(0)
  const [goals, setGoals] = useState([])
  const [investments, setInvestments] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([
      window.electronAPI.getDashboardStats(),
      window.electronAPI.getSalaryAllocations(),
      window.electronAPI.getProfile(),
      window.electronAPI.getAllGoals(),
      window.electronAPI.getAllInvestments(),
    ])
      .then(([s, allocs, profile, g, inv]) => {
        setStats(s || {})
        setAllocations(allocs || [])
        setSalary(profile?.monthly_salary || 0)
        setGoals(g || [])
        setInvestments(inv || [])
      })
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [])

  const hasAllocations = allocations.some(r => r.bank === '__bucket__')

  return (
    <div className="p-8">
      <div className="mb-8">
        <h2 className="text-2xl font-bold text-gray-900">Good morning 👋</h2>
        <p className="mt-1 text-sm text-gray-500">Here's a snapshot of your financial health.</p>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-5 mb-8">
        {STAT_CARDS.map(c => (
          <StatCard
            key={c.key}
            label={c.label}
            value={c.raw ? String(stats[c.key] || 0) : fmt(stats[c.key])}
            icon={c.icon}
            accent={c.accent}
            bg={c.bg}
            description={c.description}
            loading={loading}
          />
        ))}
      </div>

      {/* Bottom row */}
      <div className="grid grid-cols-3 gap-5">
        {/* Goals mini */}
        <div className="col-span-2 bg-white rounded-2xl p-6 border border-gray-100 shadow-sm">
          <h3 className="text-base font-semibold text-gray-800 mb-0.5">Active Goals</h3>
          <p className="text-xs text-gray-400 mb-5">Top 3 in-progress goals</p>
          {loading
            ? <div className="h-24 bg-gray-100 rounded-xl animate-pulse" />
            : <GoalsMini goals={goals} investments={investments} />
          }
        </div>

        {/* Salary donut */}
        <div>
          {loading ? (
            <div className="bg-white rounded-2xl p-6 border border-gray-100 shadow-sm h-full">
              <div className="h-4 w-32 bg-gray-100 rounded animate-pulse mb-2" />
              <div className="h-3 w-24 bg-gray-100 rounded animate-pulse mb-6" />
              <div className="h-28 w-28 rounded-full bg-gray-100 animate-pulse mx-auto" />
            </div>
          ) : hasAllocations ? (
            <SalaryDonut allocations={allocations} salary={salary} />
          ) : (
            <div className="bg-white rounded-2xl p-6 border border-gray-100 shadow-sm flex flex-col items-center justify-center h-full text-center">
              <p className="text-3xl mb-2">🗂️</p>
              <p className="text-sm font-semibold text-gray-700">No allocation set</p>
              <p className="text-xs text-gray-400 mt-1">Set up the Salary Allocator to see your breakdown</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
