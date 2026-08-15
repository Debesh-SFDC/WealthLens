import { useState, useEffect } from 'react'
import bridge from '../lib/bridge'
import {
  BarChart, Bar, Cell, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine, ResponsiveContainer,
} from 'recharts'

const IS_ELECTRON = typeof window !== 'undefined' && window.electronAPI !== undefined

const INR = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 })
const fmt = (v) => INR.format(v || 0)

function getGreeting(name) {
  const hour = new Date().getHours()
  const time = hour < 12 ? 'morning' : hour < 17 ? 'afternoon' : 'evening'
  return name ? `Good ${time}, ${name.split(' ')[0]} 👋` : `Good ${time} 👋`
}

function todayLong() {
  return new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
}

// ── BMI helpers (mirrors src/renderer/pages/TrackerWeight.jsx) ─────────────
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
  return { target: (22 * h * h).toFixed(1) }
}

const DEFAULT_CATS = [
  { id: 'food',    name: 'Food & Dining', icon: '🍔' },
  { id: 'travel',  name: 'Travel',        icon: '🚗' },
  { id: 'shopping',name: 'Shopping',      icon: '🛍️' },
  { id: 'bills',   name: 'Bills',         icon: '📄' },
  { id: 'other',   name: 'Other',         icon: '🔖' },
]

// ── Quick Add Expense modal ─────────────────────────────────────────────────
function QuickAddExpense({ categories, onAdded, onClose }) {
  const today = new Date().toISOString().slice(0, 10)
  const [form, setForm] = useState({ amount: '', category: categories[0]?.name || 'Other', note: '', date: today })
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  async function handleSubmit(e) {
    e.preventDefault()
    if (!form.amount || !form.category) return
    await bridge.createExpense({ ...form, amount: parseFloat(form.amount) })
    onAdded()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="bg-white rounded-2xl w-full max-w-[420px] shadow-2xl overflow-hidden">
        <div className="px-6 py-5 border-b border-gray-100 flex items-center justify-between">
          <h2 className="text-lg font-bold text-gray-900">Add Expense</h2>
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

// ── Quick Log Weight modal ──────────────────────────────────────────────────
function QuickLogWeight({ userId, onSaved, onClose }) {
  const today = new Date().toISOString().slice(0, 10)
  const [input, setInput] = useState('')
  const [saving, setSaving] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    const kg = parseFloat(input)
    // userId is only required for the Electron IPC path (no independent auth
    // context there); the web route always scopes to the JWT's user instead.
    if (isNaN(kg) || kg <= 0 || (IS_ELECTRON && !userId)) return
    setSaving(true)
    try {
      await bridge.logWeight({ userId, weightKg: kg, date: today })
      onSaved()
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="bg-white rounded-2xl w-full max-w-[380px] shadow-2xl overflow-hidden">
        <div className="px-6 py-5 border-b border-gray-100 flex items-center justify-between">
          <h2 className="text-lg font-bold text-gray-900">Log Weight</h2>
          <button onClick={onClose} className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-gray-100 transition-colors">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4 text-gray-500">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <input
            autoFocus type="number" step="0.1" min="20" max="300" placeholder="e.g. 70.5 kg" required
            value={input} onChange={e => setInput(e.target.value)}
            className="w-full px-4 py-3 rounded-xl border border-gray-200 text-2xl font-bold text-gray-900 focus:outline-none focus:border-[#14B8A6] focus:ring-2 focus:ring-[#14B8A6]/20"
          />
          <div className="flex gap-3 pt-1">
            <button type="button" onClick={onClose} className="flex-1 py-2.5 rounded-xl border border-gray-200 text-sm font-semibold text-gray-600 hover:bg-gray-50 transition-colors">Cancel</button>
            <button type="submit" disabled={!input || saving} className="flex-1 py-2.5 rounded-xl text-white text-sm font-semibold hover:opacity-90 transition-opacity disabled:opacity-40" style={{ backgroundColor: '#14B8A6' }}>
              {saving ? 'Saving…' : 'Save'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ── 3. This Month Spending card ─────────────────────────────────────────────
function SpendingCard({ spend, budget }) {
  const pct = budget > 0 ? Math.min(100, (spend / budget) * 100) : 0
  const color = budget <= 0 ? '#9CA3AF' : pct < 50 ? '#10B981' : pct <= 80 ? '#F59E0B' : '#EF4444'

  return (
    <div className="bg-white rounded-2xl p-5 sm:p-6 border border-gray-100 shadow-sm">
      <h3 className="text-base font-semibold text-gray-800 mb-4">This Month's Spending</h3>
      <div className="flex items-end justify-between mb-3 flex-wrap gap-2">
        <p className="text-3xl sm:text-4xl font-bold text-gray-900">{fmt(spend)}</p>
        {budget > 0 && <p className="text-sm text-gray-400">of {fmt(budget)} budget</p>}
      </div>
      {budget > 0 ? (
        <>
          <div className="h-2.5 bg-gray-100 rounded-full overflow-hidden">
            <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, backgroundColor: color }} />
          </div>
          <p className="text-xs font-semibold mt-1.5" style={{ color }}>
            {pct.toFixed(0)}% of budget used
          </p>
        </>
      ) : (
        <p className="text-xs text-gray-400">Set an active salary plan to see a budget here</p>
      )}
    </div>
  )
}

// ── 4. Daily spending chart ──────────────────────────────────────────────────
function DailySpendingChart({ dailySpend, dailyBudget }) {
  const today = new Date().toISOString().slice(0, 10)
  const data = dailySpend.map(d => ({ ...d, day: Number(d.date.slice(-2)) }))

  return (
    <div className="bg-white rounded-2xl p-5 sm:p-6 border border-gray-100 shadow-sm">
      <h3 className="text-base font-semibold text-gray-800 mb-4">Spending This Month</h3>
      <div className="w-full" style={{ height: 200 }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F3F4F6" />
            <XAxis dataKey="day" tick={{ fontSize: 10, fill: '#9CA3AF' }} interval={2} tickLine={false} axisLine={{ stroke: '#E5E7EB' }} />
            <YAxis tick={{ fontSize: 10, fill: '#9CA3AF' }} tickLine={false} axisLine={false} tickFormatter={v => v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v} />
            <Tooltip formatter={v => fmt(v)} labelFormatter={l => `Day ${l}`} contentStyle={{ borderRadius: 12, border: '1px solid #E5E7EB', fontSize: 12 }} />
            {dailyBudget > 0 && <ReferenceLine y={dailyBudget} stroke="#EF4444" strokeDasharray="4 4" strokeWidth={1.5} />}
            <Bar dataKey="amount" radius={[4, 4, 0, 0]}>
              {data.map(d => <Cell key={d.date} fill={d.date === today ? '#6C63FF' : '#C7D2FE'} />)}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}

// ── 5. Weight trend card ─────────────────────────────────────────────────────
function WeightTrendCard({ latestWeight, weightLogs, heightCm }) {
  const bmi = calcBMI(latestWeight, heightCm)
  const meta = bmiMeta(bmi)
  const ideal = idealRange(heightCm)
  const data = weightLogs.map(w => ({ ...w, day: Number(w.date.slice(-2)) }))

  return (
    <div className="bg-white rounded-2xl p-5 sm:p-6 border border-gray-100 shadow-sm">
      <h3 className="text-base font-semibold text-gray-800 mb-4">Weight Trend</h3>
      <div className="flex items-center gap-4 mb-4 flex-wrap">
        <div>
          <p className="text-3xl font-bold text-gray-900">{latestWeight ? `${latestWeight} kg` : '—'}</p>
          <p className="text-xs text-gray-400">Latest weight</p>
        </div>
        {meta && (
          <div className="px-3 py-1.5 rounded-xl" style={{ backgroundColor: meta.bg }}>
            <p className="text-sm font-bold" style={{ color: meta.color }}>BMI {bmi.toFixed(1)}</p>
            <p className="text-xs font-semibold" style={{ color: meta.color }}>{meta.label}</p>
          </div>
        )}
        {ideal && (
          <div className="ml-auto text-right">
            <p className="text-sm font-semibold text-gray-700">{ideal.target} kg</p>
            <p className="text-xs text-gray-400">Target weight</p>
          </div>
        )}
      </div>
      {data.length > 1 ? (
        <div className="w-full" style={{ height: 200 }}>
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F3F4F6" />
              <XAxis dataKey="day" tick={{ fontSize: 10, fill: '#9CA3AF' }} tickLine={false} axisLine={{ stroke: '#E5E7EB' }} />
              <YAxis domain={['dataMin - 2', 'dataMax + 2']} tick={{ fontSize: 10, fill: '#9CA3AF' }} tickLine={false} axisLine={false} />
              <Tooltip formatter={v => `${v} kg`} labelFormatter={l => `Day ${l}`} contentStyle={{ borderRadius: 12, border: '1px solid #E5E7EB', fontSize: 12 }} />
              <Line type="monotone" dataKey="weight_kg" stroke="#14B8A6" strokeWidth={2.5} dot={false} activeDot={{ r: 4 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <div className="flex items-center justify-center h-24 rounded-xl bg-gray-50 border border-dashed border-gray-200">
          <p className="text-sm text-gray-400">Log weight on a few more days to see a trend</p>
        </div>
      )}
    </div>
  )
}

// ── 6. Today's expenses list ─────────────────────────────────────────────────
function fmtTime(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  return isNaN(d.getTime()) ? '' : d.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' })
}

function TodayExpenses({ expenses, categoryIcons, onDelete }) {
  return (
    <div className="bg-white rounded-2xl p-5 sm:p-6 border border-gray-100 shadow-sm">
      <h3 className="text-base font-semibold text-gray-800 mb-4">Today's Expenses</h3>
      {expenses.length === 0 ? (
        <div className="flex items-center justify-center h-20 rounded-xl bg-gray-50 border border-dashed border-gray-200">
          <p className="text-sm text-gray-400">No expenses logged today</p>
        </div>
      ) : (
        <div className="divide-y divide-gray-50">
          {expenses.map(e => (
            <button
              key={e.id}
              onClick={() => onDelete(e)}
              className="w-full flex items-center gap-3 py-3 text-left hover:bg-gray-50 rounded-xl px-2 -mx-2 transition-colors"
            >
              <span className="text-xl shrink-0">{categoryIcons[e.category] || '🔖'}</span>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-800 truncate">{e.note || e.category}</p>
                <p className="text-xs text-gray-400">{e.category}</p>
              </div>
              <div className="text-right shrink-0">
                <p className="text-sm font-bold text-gray-900">{fmt(e.amount)}</p>
                <p className="text-xs text-gray-400">{fmtTime(e.created_at)}</p>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// ── 7. Secondary stats row ───────────────────────────────────────────────────
function SecondaryStat({ label, value, icon }) {
  return (
    <div className="bg-white rounded-xl p-3 sm:p-4 border border-gray-100 flex items-center gap-2.5">
      <span className="text-base">{icon}</span>
      <div className="min-w-0">
        <p className="text-sm font-semibold text-gray-700 truncate">{value}</p>
        <p className="text-[11px] text-gray-400">{label}</p>
      </div>
    </div>
  )
}

// ── Dashboard ─────────────────────────────────────────────────────────────
export default function Dashboard() {
  const [profileName, setProfileName]     = useState('')
  const [currentUserId, setCurrentUserId] = useState(null)
  const [stats, setStats] = useState({
    thisMonthSpend: 0, monthlyBudget: 0, dailySpend: [], todayExpenses: [],
    latestWeight: null, weightLogs: [], heightCm: 0, totalInvested: 0, activeGoals: 0, netWorth: 0,
  })
  const [categories, setCategories] = useState(DEFAULT_CATS)
  const [loading, setLoading]       = useState(true)
  const [showAddExpense, setShowAddExpense] = useState(false)
  const [showLogWeight, setShowLogWeight]   = useState(false)

  async function loadData() {
    setLoading(true)
    try {
      const [s, profile, session, cats] = await Promise.all([
        bridge.getDashboardStats(),
        bridge.getProfile(),
        IS_ELECTRON ? window.electronAPI.getSession() : null,
        window.electronAPI?.getExpenseCategories?.() ?? Promise.resolve(null),
      ])
      setStats(s || {})
      setProfileName(profile?.name || '')
      if (session?.id) setCurrentUserId(session.id)
      if (cats?.length) setCategories(cats)
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { loadData() }, [])

  function handleAdded() {
    setShowAddExpense(false)
    setShowLogWeight(false)
    loadData()
  }

  async function handleDeleteExpense(expense) {
    if (!confirm(`Delete "${expense.note || expense.category}" — ${fmt(expense.amount)}?`)) return
    await bridge.deleteExpense(expense.id)
    loadData()
  }

  const categoryIcons = Object.fromEntries(categories.map(c => [c.name, c.icon]))
  const dailyBudget = stats.monthlyBudget > 0 ? stats.monthlyBudget / 30 : 0

  return (
    <div className="p-4 sm:p-8 max-w-3xl mx-auto space-y-5">
      {/* 1. Header */}
      <div>
        <h2 className="text-xl sm:text-2xl font-bold text-gray-900">{getGreeting(profileName)}</h2>
        <p className="mt-1 text-sm text-gray-500">{todayLong()}</p>
      </div>

      {/* 2. Quick actions */}
      <div className="flex flex-col sm:flex-row gap-3">
        <button
          onClick={() => setShowAddExpense(true)}
          className="flex-1 w-full py-4 rounded-2xl text-white text-base font-bold hover:opacity-90 transition-opacity flex items-center justify-center gap-2 shadow-sm"
          style={{ backgroundColor: '#6C63FF' }}
        >
          <span className="text-lg leading-none">+</span> Add Expense
        </button>
        <button
          onClick={() => setShowLogWeight(true)}
          className="flex-1 w-full py-4 rounded-2xl text-white text-base font-bold hover:opacity-90 transition-opacity flex items-center justify-center gap-2 shadow-sm"
          style={{ backgroundColor: '#14B8A6' }}
        >
          <span className="text-lg leading-none">+</span> Log Weight
        </button>
      </div>

      {loading ? (
        <div className="space-y-5">
          <div className="bg-white rounded-2xl h-32 border border-gray-100 animate-pulse" />
          <div className="bg-white rounded-2xl h-64 border border-gray-100 animate-pulse" />
          <div className="bg-white rounded-2xl h-64 border border-gray-100 animate-pulse" />
        </div>
      ) : (
        <>
          {/* 3. This month spending */}
          <SpendingCard spend={stats.thisMonthSpend} budget={stats.monthlyBudget} />

          {/* 4. Daily spending chart */}
          <DailySpendingChart dailySpend={stats.dailySpend} dailyBudget={dailyBudget} />

          {/* 5. Weight trend */}
          <WeightTrendCard latestWeight={stats.latestWeight} weightLogs={stats.weightLogs} heightCm={stats.heightCm} />

          {/* 6. Today's expenses */}
          <TodayExpenses expenses={stats.todayExpenses} categoryIcons={categoryIcons} onDelete={handleDeleteExpense} />

          {/* 7. Secondary stats */}
          <div className="grid grid-cols-3 gap-3">
            <SecondaryStat label="Total Invested" value={fmt(stats.totalInvested)} icon="📈" />
            <SecondaryStat label="Active Goals" value={String(stats.activeGoals)} icon="🎯" />
            <SecondaryStat label="Net Worth" value={fmt(stats.netWorth)} icon="💎" />
          </div>
        </>
      )}

      {showAddExpense && (
        <QuickAddExpense categories={categories} onAdded={handleAdded} onClose={() => setShowAddExpense(false)} />
      )}
      {showLogWeight && (
        <QuickLogWeight userId={currentUserId} onSaved={handleAdded} onClose={() => setShowLogWeight(false)} />
      )}
    </div>
  )
}
