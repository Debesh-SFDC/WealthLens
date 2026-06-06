import { useState, useEffect } from 'react'

const INR = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 })
const fmt = (v) => INR.format(v || 0)

const STAT_CARDS = [
  { key: 'netWorth',       label: 'Net Worth',         icon: '💎', accent: '#6C63FF', bg: '#f0efff', description: 'Current market value of all investments' },
  { key: 'totalInvested',  label: 'Total Invested',    icon: '📈', accent: '#10B981', bg: '#ecfdf5', description: 'Total amount invested across all assets' },
  { key: 'thisMonthSpend', label: 'This Month Spend',  icon: '💳', accent: '#F59E0B', bg: '#fffbeb', description: 'Total expenses recorded this month' },
  { key: 'goalsActive',    label: 'Goals Active',      icon: '🎯', accent: '#3B82F6', bg: '#eff6ff', description: 'Financial goals currently in progress', raw: true },
]

const CATEGORY_META = {
  needs:      { label: 'Needs',       color: '#3B82F6', icon: '🏠' },
  wants:      { label: 'Wants',       color: '#8B5CF6', icon: '🎭' },
  investment: { label: 'Investment',  color: '#10B981', icon: '📈' },
}

function getGreeting(name) {
  const hour = new Date().getHours()
  const time = hour < 12 ? 'morning' : hour < 17 ? 'afternoon' : 'evening'
  return name ? `Good ${time}, ${name.split(' ')[0]} 👋` : `Good ${time} 👋`
}

// ── Quick-add expense modal ───────────────────────────────────────────────
function QuickAddExpense({ categories, onAdded, onClose }) {
  const today = new Date().toISOString().slice(0, 10)
  const [form, setForm] = useState({ amount: '', category: categories[0]?.name || 'Food & Dining', note: '', date: today })
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  async function handleSubmit(e) {
    e.preventDefault()
    if (!form.amount || !form.category) return
    await window.electronAPI.createExpense({ ...form, amount: parseFloat(form.amount) })
    onAdded()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="bg-white rounded-2xl w-[420px] shadow-2xl overflow-hidden">
        <div className="px-6 py-5 border-b border-gray-100 flex items-center justify-between">
          <h2 className="text-lg font-bold text-gray-900">Quick Add Expense</h2>
          <button onClick={onClose} className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-gray-100 transition-colors">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4 text-gray-500">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <input
            autoFocus type="number" min="0" step="0.01" placeholder="₹ Amount" required
            value={form.amount} onChange={e => set('amount', e.target.value)}
            className="w-full px-4 py-3 rounded-xl border border-gray-200 text-2xl font-bold text-gray-900 focus:outline-none focus:border-[#6C63FF] focus:ring-2 focus:ring-[#6C63FF]/20"
          />
          <select
            value={form.category} onChange={e => set('category', e.target.value)}
            className="w-full px-4 py-2.5 rounded-xl border border-gray-200 bg-white text-sm font-medium text-gray-800 focus:outline-none focus:border-[#6C63FF]"
          >
            {categories.map(c => <option key={c.id} value={c.name}>{c.icon} {c.name}</option>)}
          </select>
          <input
            type="text" placeholder="Note (optional)"
            value={form.note} onChange={e => set('note', e.target.value)}
            className="w-full px-4 py-2.5 rounded-xl border border-gray-200 text-sm text-gray-800 focus:outline-none focus:border-[#6C63FF]"
          />
          <div className="flex gap-3 pt-1">
            <button type="button" onClick={onClose} className="flex-1 py-2.5 rounded-xl border border-gray-200 text-sm font-semibold text-gray-600 hover:bg-gray-50 transition-colors">Cancel</button>
            <button type="submit" className="flex-1 py-2.5 rounded-xl text-white text-sm font-semibold hover:opacity-90 transition-opacity" style={{ backgroundColor: '#6C63FF' }}>Add</button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ── Salary donut ──────────────────────────────────────────────────────────
function SalaryDonut({ plan }) {
  if (!plan || !plan.items?.length) return null

  const salary = plan.monthly_salary || 0
  const totals = { needs: 0, wants: 0, investment: 0 }
  for (const item of plan.items) {
    if (totals[item.category] !== undefined) totals[item.category] += item.amount
  }

  let cum = 0
  const segs = Object.entries(totals).map(([cat, amount]) => {
    const meta  = CATEGORY_META[cat]
    const pct   = salary > 0 ? (amount / salary) * 100 : 0
    const start = cum; cum += pct
    return { cat, amount, pct, start, ...meta }
  })

  const gradient = segs.map(s => `${s.color} ${s.start.toFixed(2)}% ${(s.start + s.pct).toFixed(2)}%`).join(', ')
  const effectiveFrom = plan.effective_from
    ? new Date(plan.effective_from).toLocaleDateString('en-IN', { month: 'short', year: 'numeric' })
    : ''

  return (
    <div className="bg-white rounded-2xl p-6 border border-gray-100 shadow-sm">
      <h3 className="text-base font-semibold text-gray-800 mb-0.5">Salary Allocation</h3>
      <p className="text-xs text-gray-400 mb-1">{plan.label}</p>
      <p className="text-xs text-gray-400 mb-4">{fmt(salary)}/month · from {effectiveFrom}</p>

      <div className="flex items-center gap-6">
        <div className="relative shrink-0 w-28 h-28">
          <div className="w-28 h-28 rounded-full" style={{ background: `conic-gradient(${gradient})` }} />
          <div className="absolute inset-4 bg-white rounded-full flex items-center justify-center">
            <p className="text-[10px] font-bold text-gray-500 text-center leading-tight">
              {fmt(salary)}<br/>/ mo
            </p>
          </div>
        </div>
        <div className="flex-1 space-y-2.5">
          {segs.map(s => (
            <div key={s.cat}>
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-2">
                  <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: s.color }} />
                  <span className="text-xs font-medium text-gray-700">{s.icon} {s.label}</span>
                </div>
                <span className="text-xs font-bold text-gray-800">{s.pct.toFixed(0)}%</span>
              </div>
              <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                <div className="h-full rounded-full" style={{ width: `${s.pct}%`, backgroundColor: s.color }} />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// ── Goals mini list ───────────────────────────────────────────────────────
function GoalsMini({ goals, investments }) {
  const active = goals.filter(g => !g.is_achieved).slice(0, 3)
  if (!active.length) {
    return (
      <div className="flex items-center justify-center h-28 rounded-xl bg-gray-50 border border-dashed border-gray-200">
        <p className="text-sm text-gray-400">No active goals</p>
      </div>
    )
  }
  const curYear = new Date().getFullYear()
  return (
    <div className="space-y-3">
      {active.map(g => {
        const linked = investments.filter(i => i.goal_id === g.id)
        const saved  = linked.reduce((s, i) => s + (i.current_value || 0), 0)
        const years  = Math.max(0, (g.target_year || curYear) - curYear)
        const target = (g.target_amount || 0) * Math.pow(1 + (g.inflation_rate || 6) / 100, years)
        const pct    = target > 0 ? Math.min(100, (saved / target) * 100) : 0
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

// ── Expenses widget ───────────────────────────────────────────────────────
function ExpensesWidget({ stats, needsBudget, onAddExpense }) {
  if (!stats) return null

  const total = stats.total || 0
  const budgetWarning = needsBudget > 0 && total > needsBudget * 0.5

  return (
    <div className="bg-white rounded-2xl p-6 border border-gray-100 shadow-sm">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-base font-semibold text-gray-800">This Month</h3>
          <p className="text-xs text-gray-400">Expenses overview</p>
        </div>
        <button
          onClick={onAddExpense}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-white text-xs font-semibold hover:opacity-90 transition-opacity"
          style={{ backgroundColor: '#6C63FF' }}
        >
          <span>+</span> Add
        </button>
      </div>

      {budgetWarning && (
        <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-yellow-50 border border-yellow-200 mb-4">
          <span className="text-sm">⚠️</span>
          <p className="text-xs font-semibold text-yellow-800">Over 50% of Needs budget spent</p>
        </div>
      )}

      <p className="text-3xl font-bold text-gray-900 mb-1">{fmt(total)}</p>
      {needsBudget > 0 && (
        <div className="mt-3">
          <div className="flex justify-between text-xs text-gray-400 mb-1">
            <span>Needs budget</span>
            <span>{fmt(needsBudget)}</span>
          </div>
          <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
            <div
              className="h-full rounded-full transition-all"
              style={{
                width: `${Math.min(100, (total / needsBudget) * 100)}%`,
                backgroundColor: budgetWarning ? '#F59E0B' : '#10B981',
              }}
            />
          </div>
          <p className="text-xs text-gray-400 mt-1">
            {needsBudget > total ? `${fmt(needsBudget - total)} remaining` : `${fmt(total - needsBudget)} over budget`}
          </p>
        </div>
      )}

      {stats.byCategory?.length > 0 && (
        <div className="mt-4 space-y-2">
          {stats.byCategory.slice(0, 3).map(({ category, amount }) => (
            <div key={category} className="flex items-center justify-between">
              <span className="text-xs text-gray-500 truncate">{category}</span>
              <span className="text-xs font-semibold text-gray-700 shrink-0 ml-2">{fmt(amount)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Stat card ─────────────────────────────────────────────────────────────
function StatCard({ label, value, icon, accent, bg, description, loading }) {
  return (
    <div className="bg-white rounded-2xl p-6 border border-gray-100 shadow-sm hover:shadow-md transition-shadow duration-200">
      <div className="flex items-start justify-between mb-4">
        <div className="w-12 h-12 rounded-xl flex items-center justify-center text-2xl" style={{ backgroundColor: bg }}>{icon}</div>
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

// ── Dashboard ─────────────────────────────────────────────────────────────
export default function Dashboard({ onLockApp }) {
  const [stats, setStats]             = useState({ netWorth: 0, totalInvested: 0, thisMonthSpend: 0, goalsActive: 0 })
  const [activePlan, setActivePlan]   = useState(null)
  const [goals, setGoals]             = useState([])
  const [investments, setInvestments] = useState([])
  const [profileName, setProfileName] = useState('')
  const [monthlyStats, setMonthlyStats] = useState(null)
  const [needsBudget, setNeedsBudget] = useState(0)
  const [categories, setCategories]   = useState([])
  const [loading, setLoading]         = useState(true)
  const [showQuickAdd, setShowQuickAdd] = useState(false)

  async function loadData() {
    setLoading(true)
    try {
      const now   = new Date()
      const month = now.getMonth() + 1
      const year  = now.getFullYear()

      const [s, plan, profile, g, inv, exStats, cats] = await Promise.all([
        window.electronAPI.getDashboardStats(),
        window.electronAPI.getActivePlan(),
        window.electronAPI.getProfile(),
        window.electronAPI.getAllGoals(),
        window.electronAPI.getAllInvestments(),
        window.electronAPI.getExpenseMonthlyStats({ month, year }),
        window.electronAPI.getExpenseCategories(),
      ])

      setStats(s || {})
      setActivePlan(plan || null)
      setProfileName(profile?.name || '')
      setGoals(g || [])
      setInvestments(inv || [])
      setMonthlyStats(exStats || null)
      setCategories(cats || [])

      if (plan?.items) {
        const needsTotal = plan.items
          .filter(i => i.category === 'needs')
          .reduce((s, i) => s + i.amount, 0)
        setNeedsBudget(needsTotal)
      }
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { loadData() }, [])

  function handleQuickAdded() {
    setShowQuickAdd(false)
    loadData()
  }

  const hasAllocations = activePlan && activePlan.items?.length > 0

  return (
    <div className="p-8">
      {/* Greeting */}
      <div className="mb-8 flex items-start justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">{getGreeting(profileName)}</h2>
          <p className="mt-1 text-sm text-gray-500">Here's a snapshot of your financial health.</p>
        </div>
        {onLockApp && (
          <button
            onClick={onLockApp}
            className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold border transition-all duration-150"
            style={{ backgroundColor: '#f9fafb', color: '#6B7280', borderColor: '#E5E7EB' }}
            onMouseEnter={e => { e.currentTarget.style.backgroundColor = '#fee2e2'; e.currentTarget.style.borderColor = '#fca5a5'; e.currentTarget.style.color = '#dc2626' }}
            onMouseLeave={e => { e.currentTarget.style.backgroundColor = '#f9fafb'; e.currentTarget.style.borderColor = '#E5E7EB'; e.currentTarget.style.color = '#6B7280' }}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
              <rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>
            </svg>
            Lock App
          </button>
        )}
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

      {/* Bottom grid */}
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

        {/* Right column */}
        <div className="flex flex-col gap-5">
          {loading
            ? <div className="bg-white rounded-2xl p-6 border border-gray-100 shadow-sm h-36 animate-pulse" />
            : <ExpensesWidget stats={monthlyStats} needsBudget={needsBudget} onAddExpense={() => setShowQuickAdd(true)} />
          }

          {loading ? (
            <div className="bg-white rounded-2xl p-6 border border-gray-100 shadow-sm flex-1 animate-pulse" />
          ) : hasAllocations ? (
            <SalaryDonut plan={activePlan} />
          ) : (
            <div className="bg-white rounded-2xl p-6 border border-gray-100 shadow-sm flex flex-col items-center justify-center text-center flex-1">
              <p className="text-3xl mb-2">🗂️</p>
              <p className="text-sm font-semibold text-gray-700">No allocation set</p>
              <p className="text-xs text-gray-400 mt-1">Set up the Salary Allocator</p>
            </div>
          )}
        </div>
      </div>

      {showQuickAdd && (
        <QuickAddExpense
          categories={categories}
          onAdded={handleQuickAdded}
          onClose={() => setShowQuickAdd(false)}
        />
      )}
    </div>
  )
}
