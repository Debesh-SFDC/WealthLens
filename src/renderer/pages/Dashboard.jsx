import { useState, useEffect } from 'react'
import bridge from '../lib/bridge'
import Toast from '../components/Toast'
import {
  BarChart, Bar, Cell, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine, ResponsiveContainer,
} from 'recharts'

const IS_ELECTRON = typeof window !== 'undefined' && window.electronAPI !== undefined

const INR = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 })
const fmt = (v) => INR.format(v || 0)
const fmtCompact = (v) => (v || 0) >= 100000 ? `₹${((v || 0) / 100000).toFixed(1)}L` : fmt(v)

function getGreeting(name) {
  const hour = new Date().getHours()
  const time = hour < 12 ? 'morning' : hour < 17 ? 'afternoon' : 'evening'
  return name ? `Good ${time}, ${name.split(' ')[0]} 👋` : `Good ${time} 👋`
}

function todayShort() {
  return new Date().toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' })
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
    const amount = parseFloat(form.amount)
    await bridge.createExpense({ ...form, amount })
    onAdded({ amount, category: form.category })
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
function isoDaysAgo(n) {
  const d = new Date()
  d.setDate(d.getDate() - n)
  return d.toISOString().slice(0, 10)
}

function shortDateLabel(dateStr, todayStr) {
  if (dateStr === todayStr) return 'Today'
  return new Date(dateStr + 'T12:00:00').toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric' })
}

function QuickLogWeight({ userId, weightLogs, onSaved, onClose }) {
  const today = isoDaysAgo(0)
  const minDate = isoDaysAgo(30)
  const [input, setInput] = useState('')
  const [logDate, setLogDate] = useState(today)
  const [saving, setSaving] = useState(false)
  const [confirmSwap, setConfirmSwap] = useState(null) // { date, kg, existingKg } | null

  const logsByDate = {}
  for (const l of weightLogs || []) logsByDate[l.date] = l
  const last7 = Array.from({ length: 7 }, (_, i) => isoDaysAgo(i))

  async function doSave(date, kg) {
    setSaving(true)
    try {
      // userId is only required for the Electron IPC path (no independent auth
      // context there); the web route always scopes to the JWT's user instead.
      await bridge.logWeight({ userId, weightKg: kg, date })
      onSaved({ kg, date })
    } finally {
      setSaving(false)
    }
  }

  async function handleSubmit(e) {
    e.preventDefault()
    const kg = parseFloat(input)
    if (isNaN(kg) || kg <= 0 || (IS_ELECTRON && !userId)) return

    const existing = logsByDate[logDate]
    if (existing && logDate !== today) {
      setConfirmSwap({ date: logDate, kg, existingKg: existing.weight_kg })
      return
    }
    await doSave(logDate, kg)
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
          <div className="flex items-center gap-2">
            <input
              autoFocus type="number" step="0.01" min="20" max="300" inputMode="decimal" placeholder="e.g. 70.5" required
              value={input} onChange={e => setInput(e.target.value)}
              className="flex-1 min-w-0 px-4 py-3 rounded-xl border border-gray-200 text-xl font-bold text-gray-900 focus:outline-none focus:border-[#14B8A6] focus:ring-2 focus:ring-[#14B8A6]/20"
            />
            <div className="relative shrink-0">
              <input
                type="date" value={logDate} max={today} min={minDate}
                onChange={e => e.target.value && setLogDate(e.target.value)}
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
              />
              <div className="pointer-events-none flex items-center gap-1 px-3 py-3 rounded-xl border border-gray-200 bg-gray-50 text-sm font-semibold text-gray-700 whitespace-nowrap">
                {shortDateLabel(logDate, today)}
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="w-3 h-3">
                  <polyline points="6 9 12 15 18 9" />
                </svg>
              </div>
            </div>
            <button type="submit" disabled={!input || saving} className="shrink-0 px-4 py-3 rounded-xl text-white text-sm font-semibold hover:opacity-90 transition-opacity disabled:opacity-40" style={{ backgroundColor: '#14B8A6' }}>
              {saving ? '…' : 'Save'}
            </button>
          </div>

          {/* Last 7 days quick reference — helps pick which day to backfill */}
          <div className="rounded-xl border border-gray-100 divide-y divide-gray-50 overflow-hidden">
            {last7.map(d => {
              const log = logsByDate[d]
              return (
                <button
                  type="button" key={d} onClick={() => setLogDate(d)}
                  className="w-full flex items-center justify-between px-3 py-2 text-xs transition-colors"
                  style={{ backgroundColor: logDate === d ? '#F0FDFA' : 'transparent' }}
                >
                  <span className="font-semibold text-gray-600">{shortDateLabel(d, today)}</span>
                  <span className={log ? 'font-bold text-gray-900' : 'text-gray-300'}>
                    {log ? `${log.weight_kg} kg` : '—— not logged'}
                  </span>
                </button>
              )
            })}
          </div>
        </form>
      </div>

      {confirmSwap && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4" onClick={e => e.target === e.currentTarget && setConfirmSwap(null)}>
          <div className="bg-white rounded-2xl p-6 w-full max-w-[320px] shadow-2xl">
            <p className="text-sm font-bold text-gray-900 mb-1">Already logged</p>
            <p className="text-sm text-gray-500 mb-5">
              You already logged {confirmSwap.existingKg}kg on {shortDateLabel(confirmSwap.date, today)}. Update it to {confirmSwap.kg}kg?
            </p>
            <div className="flex gap-3">
              <button onClick={() => setConfirmSwap(null)} className="flex-1 py-2.5 rounded-xl border border-gray-200 text-sm font-semibold text-gray-600 hover:bg-gray-50 transition-colors">Cancel</button>
              <button
                onClick={() => { const c = confirmSwap; setConfirmSwap(null); doSave(c.date, c.kg) }}
                className="flex-1 py-2.5 rounded-xl text-white text-sm font-semibold hover:opacity-90 transition-opacity" style={{ backgroundColor: '#14B8A6' }}
              >
                Update
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ── 3. Two stat cards side by side ──────────────────────────────────────────
function MonthSpendCard({ spend, budget }) {
  const pct = budget > 0 ? Math.min(100, (spend / budget) * 100) : 0
  const color = budget <= 0 ? '#9CA3AF' : pct < 50 ? '#10B981' : pct <= 80 ? '#F59E0B' : '#EF4444'

  return (
    <div className="bg-white rounded-2xl p-3.5 sm:p-4 border border-gray-100 shadow-sm min-w-0">
      <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide mb-1">This Month</p>
      <p className="text-lg sm:text-xl font-bold text-gray-900 truncate">
        {fmtCompact(spend)}{budget > 0 && <span className="text-xs font-medium text-gray-400"> / {fmtCompact(budget)}</span>}
      </p>
      {budget > 0 && (
        <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden mt-2">
          <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, backgroundColor: color }} />
        </div>
      )}
    </div>
  )
}

function TodaySpendCard({ spend, count }) {
  return (
    <div className="bg-white rounded-2xl p-3.5 sm:p-4 border border-gray-100 shadow-sm min-w-0">
      <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide mb-1">Today</p>
      <p className="text-lg sm:text-xl font-bold text-gray-900 truncate">{fmtCompact(spend)}</p>
      <p className="text-xs text-gray-400 mt-2">{count} expense{count !== 1 ? 's' : ''} logged</p>
    </div>
  )
}

// ── 4. Charts ────────────────────────────────────────────────────────────────
function DailySpendingChart({ dailySpend, dailyBudget }) {
  const today = new Date().toISOString().slice(0, 10)
  const data = dailySpend.map(d => ({ ...d, day: Number(d.date.slice(-2)) }))

  return (
    <div className="bg-white rounded-2xl p-3.5 sm:p-4 border border-gray-100 shadow-sm min-w-0">
      <h3 className="text-sm font-semibold text-gray-800 mb-2">Spending This Month</h3>
      <div className="w-full h-[160px] md:h-[180px]">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 4, right: 4, left: -24, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F3F4F6" />
            <XAxis dataKey="day" tick={{ fontSize: 9, fill: '#9CA3AF' }} interval={4} tickLine={false} axisLine={{ stroke: '#E5E7EB' }} />
            <YAxis tick={{ fontSize: 9, fill: '#9CA3AF' }} tickLine={false} axisLine={false} tickFormatter={v => v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v} />
            <Tooltip formatter={v => fmt(v)} labelFormatter={l => `Day ${l}`} contentStyle={{ borderRadius: 12, border: '1px solid #E5E7EB', fontSize: 12 }} />
            {dailyBudget > 0 && <ReferenceLine y={dailyBudget} stroke="#EF4444" strokeDasharray="4 4" strokeWidth={1.5} />}
            <Bar dataKey="amount" radius={[3, 3, 0, 0]}>
              {data.map(d => <Cell key={d.date} fill={d.date === today ? '#6C63FF' : '#C7D2FE'} />)}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}

function WeightTrendChart({ latestWeight, weightLogs, heightCm }) {
  const bmi = calcBMI(latestWeight, heightCm)
  const meta = bmiMeta(bmi)
  const data = weightLogs.map(w => ({ ...w, day: Number(w.date.slice(-2)) }))

  return (
    <div className="bg-white rounded-2xl p-3.5 sm:p-4 border border-gray-100 shadow-sm min-w-0">
      <div className="flex items-center justify-between mb-2 gap-2 flex-wrap">
        <h3 className="text-sm font-semibold text-gray-800">Weight Trend</h3>
        {latestWeight && (
          <p className="text-xs font-medium text-gray-500">
            {latestWeight} kg
            {meta && <span className="ml-1.5 font-semibold" style={{ color: meta.color }}>· BMI {bmi.toFixed(1)} {meta.label}</span>}
          </p>
        )}
      </div>
      {data.length > 1 ? (
        <div className="w-full h-[160px] md:h-[180px]">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data} margin={{ top: 4, right: 4, left: -24, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F3F4F6" />
              <XAxis dataKey="day" tick={{ fontSize: 9, fill: '#9CA3AF' }} tickLine={false} axisLine={{ stroke: '#E5E7EB' }} />
              <YAxis domain={['dataMin - 2', 'dataMax + 2']} tick={{ fontSize: 9, fill: '#9CA3AF' }} tickLine={false} axisLine={false} />
              <Tooltip formatter={v => `${v} kg`} labelFormatter={l => `Day ${l}`} contentStyle={{ borderRadius: 12, border: '1px solid #E5E7EB', fontSize: 12 }} />
              <Line type="monotone" dataKey="weight_kg" stroke="#14B8A6" strokeWidth={2.5} dot={false} activeDot={{ r: 4 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <div className="flex items-center justify-center h-[160px] md:h-[180px] rounded-xl bg-gray-50 border border-dashed border-gray-200">
          <p className="text-xs text-gray-400 text-center px-4">Log weight on a few more days to see a trend</p>
        </div>
      )}
    </div>
  )
}

// ── 5. Today's expenses (compact) ───────────────────────────────────────────
function TodayExpensesCompact({ expenses, categoryIcons, onDelete, onViewAll }) {
  const shown = expenses.slice(0, 5)
  return (
    <div className="bg-white rounded-2xl p-3.5 sm:p-4 border border-gray-100 shadow-sm">
      <div className="flex items-center justify-between mb-1.5">
        <h3 className="text-sm font-semibold text-gray-800">Today's Expenses</h3>
        {onViewAll && (
          <button onClick={onViewAll} className="text-xs font-semibold shrink-0" style={{ color: '#6C63FF' }}>
            View all →
          </button>
        )}
      </div>
      {shown.length === 0 ? (
        <p className="text-sm text-gray-400 py-3 text-center">No expenses today</p>
      ) : (
        <div className="divide-y divide-gray-50">
          {shown.map(e => (
            <button
              key={e.id}
              onClick={() => onDelete(e)}
              className="w-full flex items-center gap-2.5 min-h-[44px] text-left hover:bg-gray-50 rounded-lg px-1.5 -mx-1.5 transition-colors"
            >
              <span className="text-base shrink-0">{categoryIcons[e.category] || '🔖'}</span>
              <span className="flex-1 min-w-0 text-sm text-gray-700 truncate">{e.note || e.category}</span>
              <span className="text-sm font-bold text-gray-900 shrink-0">{fmt(e.amount)}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// ── 6. Secondary chips row ───────────────────────────────────────────────────
function Chip({ icon, label }) {
  return (
    <div className="shrink-0 flex items-center gap-1.5 px-3.5 py-2 rounded-full bg-gray-100 text-xs font-semibold text-gray-600 whitespace-nowrap">
      <span>{icon}</span>{label}
    </div>
  )
}

// ── Dashboard ─────────────────────────────────────────────────────────────
export default function Dashboard({ onNavigate }) {
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
  const [toast, setToast] = useState({ visible: false, message: '', type: 'success' })

  function showToast(message, type = 'success') {
    setToast({ visible: true, message, type })
  }

  async function loadData() {
    setLoading(true)
    try {
      const [s, profile, session, cats] = await Promise.all([
        bridge.getDashboardStats(),
        bridge.getProfile(),
        IS_ELECTRON ? window.electronAPI.getSession() : null,
        bridge.getExpenseCategories(),
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

  function handleAdded(info) {
    setShowAddExpense(false)
    setShowLogWeight(false)
    loadData()
    if (info?.kg != null) {
      showToast(`✅ Weight logged — ${info.kg} kg for ${shortDateLabel(info.date, isoDaysAgo(0))}`)
    } else if (info?.amount != null) {
      showToast(`✅ Expense added — ${fmt(info.amount)} ${info.category}`)
    }
  }

  async function handleDeleteExpense(expense) {
    if (!confirm(`Delete "${expense.note || expense.category}" — ${fmt(expense.amount)}?`)) return
    await bridge.deleteExpense(expense.id)
    loadData()
  }

  const categoryIcons = Object.fromEntries(categories.map(c => [c.name, c.icon]))
  const dailyBudget = stats.monthlyBudget > 0 ? stats.monthlyBudget / 30 : 0

  return (
    <div className="p-3 sm:p-6 max-w-3xl mx-auto space-y-3 sm:space-y-4">
      {/* 1. Header — single line */}
      <div className="flex items-center gap-2 flex-wrap">
        <h2 className="text-lg sm:text-xl font-bold text-gray-900">{getGreeting(profileName)}</h2>
        <span className="text-gray-300">•</span>
        <span className="text-sm text-gray-500">{todayShort()}</span>
      </div>

      {/* 2. Quick actions */}
      <div className="grid grid-cols-2 gap-3">
        <button
          onClick={() => setShowAddExpense(true)}
          className="h-[52px] md:h-12 rounded-xl text-white text-sm font-bold hover:opacity-90 transition-opacity flex items-center justify-center gap-1.5 shadow-sm"
          style={{ backgroundColor: '#6C63FF' }}
        >
          <span className="text-base leading-none">+</span> Add Expense
        </button>
        <button
          onClick={() => setShowLogWeight(true)}
          className="h-[52px] md:h-12 rounded-xl text-white text-sm font-bold hover:opacity-90 transition-opacity flex items-center justify-center gap-1.5 shadow-sm"
          style={{ backgroundColor: '#14B8A6' }}
        >
          <span className="text-base leading-none">+</span> Log Weight
        </button>
      </div>

      {loading ? (
        <div className="space-y-3 sm:space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-white rounded-2xl h-20 border border-gray-100 animate-pulse" />
            <div className="bg-white rounded-2xl h-20 border border-gray-100 animate-pulse" />
          </div>
          <div className="bg-white rounded-2xl h-48 border border-gray-100 animate-pulse" />
          <div className="bg-white rounded-2xl h-32 border border-gray-100 animate-pulse" />
        </div>
      ) : (
        <>
          {/* 3. Two stat cards side by side */}
          <div className="grid grid-cols-2 gap-3">
            <MonthSpendCard spend={stats.thisMonthSpend} budget={stats.monthlyBudget} />
            <TodaySpendCard
              spend={stats.todayExpenses.reduce((s, e) => s + e.amount, 0)}
              count={stats.todayExpenses.length}
            />
          </div>

          {/* 4. Charts — stacked mobile, side by side md+ */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 sm:gap-4">
            <DailySpendingChart dailySpend={stats.dailySpend} dailyBudget={dailyBudget} />
            <WeightTrendChart latestWeight={stats.latestWeight} weightLogs={stats.weightLogs} heightCm={stats.heightCm} />
          </div>

          {/* 5. Today's expenses (compact) */}
          <TodayExpensesCompact
            expenses={stats.todayExpenses}
            categoryIcons={categoryIcons}
            onDelete={handleDeleteExpense}
            onViewAll={onNavigate ? () => onNavigate('expenses') : null}
          />

          {/* 6. Secondary chips row — horizontally scrollable */}
          <div className="flex gap-2 overflow-x-auto -mx-3 px-3 sm:mx-0 sm:px-0 [&::-webkit-scrollbar]:hidden" style={{ scrollbarWidth: 'none' }}>
            <Chip icon="💰" label={`Invested ${fmtCompact(stats.totalInvested)}`} />
            <Chip icon="🎯" label={`${stats.activeGoals} Goals`} />
            <Chip icon="📈" label={`Net Worth ${fmtCompact(stats.netWorth)}`} />
          </div>
        </>
      )}

      {showAddExpense && (
        <QuickAddExpense categories={categories} onAdded={handleAdded} onClose={() => setShowAddExpense(false)} />
      )}
      {showLogWeight && (
        <QuickLogWeight userId={currentUserId} weightLogs={stats.weightLogs} onSaved={handleAdded} onClose={() => setShowLogWeight(false)} />
      )}

      <Toast
        message={toast.message}
        type={toast.type}
        visible={toast.visible}
        onHide={() => setToast(t => ({ ...t, visible: false }))}
      />
    </div>
  )
}
