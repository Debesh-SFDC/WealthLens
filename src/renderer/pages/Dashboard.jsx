import { useState, useEffect, useRef } from 'react'

function AdminSyncButton({ onAfterSync }) {
  const [state, setState]   = useState('idle')
  const [merged, setMerged] = useState(0)
  const timerRef            = useRef(null)

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

  const busy  = state === 'pushing' || state === 'pulling'
  const label = busy                ? (state === 'pushing' ? 'Uploading…' : 'Fetching…')
    : state === 'done'              ? (merged > 0 ? `↓ ${merged} new expense${merged !== 1 ? 's' : ''}` : '✓ Up to date')
    : state === 'error'             ? '✗ Drive not connected'
    : '↓ Sync Expenses'

  const bg = state === 'done' ? '#10B981' : state === 'error' ? '#EF4444' : '#6C63FF'

  return (
    <button onClick={sync} disabled={busy}
      className="flex items-center gap-2 px-4 py-2 rounded-xl text-white text-sm font-semibold transition-all disabled:opacity-70"
      style={{ backgroundColor: bg }}>
      {busy && (
        <svg className="animate-spin" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5">
          <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/>
        </svg>
      )}
      {label}
    </button>
  )
}

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

// ── Quick-log weight inline ───────────────────────────────────────────────
function QuickWeightCard({ userId, onSaved }) {
  const today = new Date().toISOString().slice(0, 10)
  const [input, setInput]         = useState('')
  const [saving, setSaving]       = useState(false)
  const [saved, setSaved]         = useState(false)
  const [todayWeight, setTodayWeight] = useState(null)

  useEffect(() => {
    if (!userId) return
    window.electronAPI.getWeightLogs({ userId, from: today, to: today })
      .then(logs => { if (logs?.length) setTodayWeight(logs[0].weight_kg) })
      .catch(() => {})
  }, [userId])

  async function save() {
    const kg = parseFloat(input)
    if (!userId || isNaN(kg) || kg <= 0) return
    setSaving(true)
    try {
      await window.electronAPI.logWeight({ userId, weightKg: kg, date: today })
      setTodayWeight(kg)
      setInput('')
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
      onSaved?.()
    } catch {}
    setSaving(false)
  }

  return (
    <div className="bg-white rounded-2xl p-5 border border-gray-100 shadow-sm flex-1">
      <div className="flex items-center gap-2 mb-3">
        <div className="w-9 h-9 rounded-xl flex items-center justify-center text-lg" style={{ backgroundColor: '#ecfdf5' }}>⚖️</div>
        <div>
          <p className="text-sm font-semibold text-gray-800">Today's Weight</p>
          <p className="text-xs text-gray-400">{todayWeight ? `Logged: ${todayWeight} kg` : 'Not logged yet'}</p>
        </div>
      </div>
      <div className="flex gap-2">
        <input
          type="number" placeholder="e.g. 70.5 kg" step="0.1" min="20" max="300"
          value={input} onChange={e => setInput(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') save() }}
          className="flex-1 px-3 py-2 rounded-xl border border-gray-200 text-sm font-bold text-gray-900 focus:outline-none focus:border-[#10B981] focus:ring-2 focus:ring-[#10B981]/20"
        />
        <button
          onClick={save} disabled={!input || saving}
          className="px-4 py-2 rounded-xl text-white text-sm font-semibold hover:opacity-90 transition-opacity disabled:opacity-40"
          style={{ backgroundColor: saved ? '#059669' : '#10B981' }}
        >
          {saving ? '…' : saved ? '✓' : 'Save'}
        </button>
      </div>
    </div>
  )
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
function parseGoalDate(d) {
  if (!d) return null
  const dt = new Date(d)
  return isNaN(dt.getTime()) ? null : dt
}

function daysUntil(targetDate) {
  const t = parseGoalDate(targetDate)
  if (!t) return null
  const now = new Date()
  t.setHours(0, 0, 0, 0)
  now.setHours(0, 0, 0, 0)
  return Math.round((t - now) / (24 * 60 * 60 * 1000))
}

function miniCountdown(days) {
  if (days === null) return 'No deadline'
  if (days < 0) return `${Math.abs(days)}d overdue`
  if (days === 0) return 'Due today'
  if (days < 90) return `${days} days left`
  const months = Math.round(days / 30.44)
  if (months < 24) return `${months} months left`
  return `${(days / 365.25).toFixed(1)} yr left`
}

function effectiveGoalTarget(g) {
  if (g.type === 'life_goal' && g.inflation_adjust) {
    const t = parseGoalDate(g.target_date)
    const years = t ? Math.max(0, (t - new Date()) / (365.25 * 24 * 60 * 60 * 1000)) : 0
    return (g.target_amount || 0) * Math.pow(1 + (g.inflation_rate || 6) / 100, years)
  }
  return g.target_amount || 0
}

function goalProgressPct(g) {
  const target = effectiveGoalTarget(g)
  if (target <= 0) return 0
  return Math.min(100, Math.max(0, ((g.current_amount || 0) / target) * 100))
}

function MiniRing({ pct, color, size = 40, stroke = 4.5 }) {
  const r = (size - stroke * 2) / 2
  const circ = 2 * Math.PI * r
  const offset = circ * (1 - Math.min(pct / 100, 1))
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ transform: 'rotate(-90deg)' }}>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#f3f4f6" strokeWidth={stroke} />
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={stroke}
        strokeDasharray={`${circ} ${circ}`} strokeDashoffset={offset} strokeLinecap="round" />
    </svg>
  )
}

function GoalsMini({ goals, onContribute }) {
  const sorted = goals
    .filter(g => !g.is_achieved)
    .sort((a, b) => {
      const da = daysUntil(a.target_date)
      const db_ = daysUntil(b.target_date)
      if (da === null && db_ === null) return 0
      if (da === null) return 1
      if (db_ === null) return -1
      return da - db_
    })
    .slice(0, 3)

  if (!sorted.length) {
    return (
      <div className="flex items-center justify-center h-28 rounded-xl bg-gray-50 border border-dashed border-gray-200">
        <p className="text-sm text-gray-400">No active goals</p>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {sorted.map(g => {
        const pct = goalProgressPct(g)
        const days = daysUntil(g.target_date)
        const accent = g.color || '#6C63FF'
        return (
          <div key={g.id} className="flex items-center gap-3">
            <div className="relative shrink-0">
              <MiniRing pct={pct} color={accent} />
              <div className="absolute inset-0 flex items-center justify-center">
                <span className="text-[9px] font-bold" style={{ color: accent }}>{Math.round(pct)}%</span>
              </div>
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-medium text-gray-800 truncate">{g.emoji || '🎯'} {g.title}</p>
                <span className={`text-xs font-medium shrink-0 ${days !== null && days < 0 ? 'text-red-500' : 'text-gray-400'}`}>{miniCountdown(days)}</span>
              </div>
              <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden mt-1.5">
                <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, backgroundColor: accent }} />
              </div>
            </div>
            <button
              onClick={() => onContribute(g)}
              title="Add contribution"
              className="w-7 h-7 rounded-lg flex items-center justify-center text-white text-sm font-bold shrink-0 hover:opacity-90 transition-opacity"
              style={{ backgroundColor: accent }}
            >
              +
            </button>
          </div>
        )
      })}
    </div>
  )
}

// ── Quick "Add Contribution" modal ───────────────────────────────────────
function QuickContributionModal({ goal, onSave, onClose }) {
  const isDebt = goal.type === 'debt_payoff'
  const outstanding = Math.max(0, (goal.target_amount || 0) - (goal.current_amount || 0))
  const [amount, setAmount] = useState('')
  const [newOutstanding, setNewOutstanding] = useState(outstanding ? String(Math.round(outstanding)) : '')
  const [saving, setSaving] = useState(false)
  const accent = goal.color || '#6C63FF'

  const handleSave = async () => {
    setSaving(true)
    try {
      const today = new Date().toISOString().slice(0, 10)
      if (isDebt) {
        const updated = Number(newOutstanding) || 0
        const delta = outstanding - updated
        await onSave({ goal_id: goal.id, amount: delta, note: `Balance updated to ${fmt(updated)}`, contributed_at: today, contribution_type: 'manual' })
      } else {
        await onSave({ goal_id: goal.id, amount: Number(amount) || 0, note: null, contributed_at: today, contribution_type: 'manual' })
      }
    } finally {
      setSaving(false)
    }
  }

  const disabled = isDebt ? newOutstanding === '' : !amount || Number(amount) === 0

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <h3 className="font-bold text-gray-900">{goal.emoji || '🎯'} {isDebt ? 'Update Outstanding Balance' : `Add to ${goal.title}`}</h3>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-gray-100 text-gray-400">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>
        <div className="p-5">
          {isDebt ? (
            <>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">New Outstanding Balance (₹)</label>
              <input type="number" autoFocus className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2"
                value={newOutstanding} onChange={e => setNewOutstanding(e.target.value)} />
              <p className="text-xs text-gray-400 mt-1">Currently {fmt(outstanding)} outstanding</p>
            </>
          ) : (
            <>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Amount (₹)</label>
              <input type="number" autoFocus className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2"
                placeholder="e.g. 5000" value={amount} onChange={e => setAmount(e.target.value)} />
            </>
          )}
        </div>
        <div className="flex items-center justify-end gap-3 px-5 py-4 border-t border-gray-100">
          <button onClick={onClose} className="px-4 py-2 rounded-xl text-sm font-semibold text-gray-600 hover:bg-gray-100 transition-colors">Cancel</button>
          <button onClick={handleSave} disabled={saving || disabled}
            className="px-4 py-2 rounded-xl text-sm font-semibold text-white disabled:opacity-50 transition-opacity" style={{ backgroundColor: accent }}>
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
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
  const [profileName, setProfileName] = useState('')
  const [monthlyStats, setMonthlyStats] = useState(null)
  const [needsBudget, setNeedsBudget] = useState(0)
  const [categories, setCategories]   = useState([])
  const [loading, setLoading]         = useState(true)
  const [showQuickAdd, setShowQuickAdd] = useState(false)
  const [currentUserId, setCurrentUserId] = useState(null)
  const [contribGoal, setContribGoal] = useState(null)

  async function loadData() {
    setLoading(true)
    try {
      const now   = new Date()
      const month = now.getMonth() + 1
      const year  = now.getFullYear()

      const [s, plan, profile, g, exStats, cats, session] = await Promise.all([
        window.electronAPI.getDashboardStats(),
        window.electronAPI.getActivePlan(),
        window.electronAPI.getProfile(),
        window.electronAPI.getAllGoals(),
        window.electronAPI.getExpenseMonthlyStats({ month, year }),
        window.electronAPI.getExpenseCategories(),
        window.electronAPI.getCurrentSession(),
      ])

      setStats(s || {})
      setActivePlan(plan || null)
      setProfileName(profile?.name || '')
      setGoals(g || [])
      setMonthlyStats(exStats || null)
      setCategories(cats || [])
      if (session?.id) setCurrentUserId(session.id)

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

  async function handleAddContribution(payload) {
    await window.electronAPI.addGoalContribution(payload)
    setContribGoal(null)
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
        <div className="flex items-center gap-2">
          <AdminSyncButton onAfterSync={loadData} />
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

      {/* Quick Log row */}
      <div className="flex gap-5 mb-8">
        <QuickWeightCard userId={currentUserId} onSaved={loadData} />
        <div className="bg-white rounded-2xl p-5 border border-gray-100 shadow-sm flex-1">
          <div className="flex items-center gap-2 mb-3">
            <div className="w-9 h-9 rounded-xl flex items-center justify-center text-lg" style={{ backgroundColor: '#f0efff' }}>💳</div>
            <div>
              <p className="text-sm font-semibold text-gray-800">Log Expense</p>
              <p className="text-xs text-gray-400">Add to today's spending</p>
            </div>
          </div>
          <button
            onClick={() => setShowQuickAdd(true)}
            className="w-full py-2 rounded-xl text-white text-sm font-semibold hover:opacity-90 transition-opacity flex items-center justify-center gap-2"
            style={{ backgroundColor: '#6C63FF' }}
          >
            <span className="text-base leading-none">+</span> Add Expense
          </button>
        </div>
      </div>

      {/* Bottom grid */}
      <div className="grid grid-cols-3 gap-5">
        {/* Goals mini */}
        <div className="col-span-2 bg-white rounded-2xl p-6 border border-gray-100 shadow-sm">
          <h3 className="text-base font-semibold text-gray-800 mb-0.5">Active Goals</h3>
          <p className="text-xs text-gray-400 mb-5">Top 3 in-progress goals</p>
          {loading
            ? <div className="h-24 bg-gray-100 rounded-xl animate-pulse" />
            : <GoalsMini goals={goals} onContribute={setContribGoal} />
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

      {contribGoal && (
        <QuickContributionModal
          goal={contribGoal}
          onSave={handleAddContribution}
          onClose={() => setContribGoal(null)}
        />
      )}
    </div>
  )
}
