import { useState, useEffect, useMemo } from 'react'
import { PieChart, Pie, Cell, Tooltip as ReTooltip, ResponsiveContainer } from 'recharts'
import bridge from '../lib/bridge'
import Toast from '../components/Toast'
import ExpenseDateChips, { expenseDateShortLabel } from '../components/ExpenseDateChips'
import BucketToggle from '../components/BucketToggle'
import { BUCKET_META, bucketForCategory } from '../lib/bucket'

const INR = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 })
const fmt = (v) => INR.format(v || 0)
const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December']

// Distinct chart palette by category name — keeps the donut readable even when
// several DB categories share a colour. Falls back to the category's own colour,
// then to a cycled palette for anything unnamed here.
const CATEGORY_COLORS = {
  'Gaming Related': '#6366F1', 'Gaming': '#6366F1',
  'Grocery': '#22C55E', 'Groceries': '#22C55E',
  'Food': '#F97316',
  'Food & Dining': '#EF4444', 'Dining': '#EF4444',
  'Others': '#94A3B8', 'Other': '#94A3B8',
  'Transport': '#3B82F6', 'Transportation': '#3B82F6',
  'Shopping': '#EC4899',
  'Bills': '#F59E0B', 'Utilities': '#F59E0B',
  'Health': '#14B8A6', 'Healthcare': '#14B8A6',
  'Entertainment': '#8B5CF6',
}
const FALLBACK_PALETTE = ['#6366F1', '#22C55E', '#F97316', '#EF4444', '#3B82F6', '#EC4899', '#F59E0B', '#14B8A6', '#8B5CF6', '#94A3B8']

function getCatColor(name, categories, index = 0) {
  return CATEGORY_COLORS[name]
    || categories.find(c => c.name === name)?.color
    || FALLBACK_PALETTE[index % FALLBACK_PALETTE.length]
}

function getCatIcon(name, categories) {
  const cat = categories.find(c => c.name === name)
  return cat?.icon || '💸'
}

const CHART_TOOLTIP_STYLE = { borderRadius: 12, border: '1px solid #E5E7EB', fontSize: 12 }

// One "🔴 Needs  ₹4,738  40%" row with a colour-coded progress bar. Shared by
// the This Month summary card and the Needs vs Wants chart.
function BucketStatRow({ emoji, label, amount, pct, color }) {
  return (
    <div>
      <div className="flex items-center justify-between text-sm mb-1">
        <span className="flex items-center gap-1.5 text-gray-600">
          <span>{emoji}</span>{label}
        </span>
        <span className="font-bold text-gray-900">
          {fmt(amount)} <span className="text-xs font-medium text-gray-400">{pct}%</span>
        </span>
      </div>
      <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
        <div className="h-full rounded-full transition-all duration-500" style={{ width: `${pct}%`, backgroundColor: color }} />
      </div>
    </div>
  )
}

// Insight line under the Needs vs Wants chart.
function spendingInsight(needsPct, wantsPct, total) {
  if (total <= 0) return null
  if (wantsPct > 50) return { tone: 'warn', text: `⚠️ Your wants spending (${wantsPct}%) is higher than needs this month` }
  if (needsPct > 80) return { tone: 'ok', text: '✅ Great! Most spending is on essentials' }
  if (needsPct >= 40 && needsPct <= 60) return { tone: 'info', text: '📊 Balanced spending this month' }
  return null
}
const INSIGHT_STYLE = {
  warn: { backgroundColor: '#FFFBEB', color: '#B45309' },
  ok:   { backgroundColor: '#F0FDF4', color: '#15803D' },
  info: { backgroundColor: '#F3F4F6', color: '#4B5563' },
}

// Small coloured dot marking an expense's Need/Want bucket.
function BucketDot({ bucket }) {
  const m = BUCKET_META[bucket === 'want' ? 'want' : 'need']
  return (
    <span
      title={m.label}
      className="inline-block w-2 h-2 rounded-full shrink-0"
      style={{ backgroundColor: m.color }}
    />
  )
}

function overrideHint(category, autoBucket) {
  const label = autoBucket === 'want' ? 'Want' : 'Need'
  const tail = autoBucket === 'want' ? 'mark it a Need if it was essential' : 'change if this was a treat 🍽️'
  return `${category} is usually a ${label} — ${tail}`
}

// ── Expense add/edit modal ────────────────────────────────────────────────
function ExpenseModal({ expense, categories, currentUser, onSave, onClose }) {
  const today = new Date().toISOString().slice(0, 10)
  const [form, setForm] = useState(() => {
    if (expense) {
      return {
        ...expense,
        amount: String(expense.amount),
        bucket: expense.bucket === 'want' ? 'want' : expense.bucket === 'need'
          ? 'need' : bucketForCategory(expense.category, categories),
      }
    }
    const cat = categories[0]?.name || 'Food & Dining'
    return { amount: '', category: cat, note: '', date: today, bucket: bucketForCategory(cat, categories) }
  })

  const isEdit = Boolean(expense?.id)
  const [saving, setSaving] = useState(false)
  const [error, setError]   = useState('')
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))
  // Changing the category re-arms the auto-selected bucket (Option C).
  const setCategory = (name) =>
    setForm(f => ({ ...f, category: name, bucket: bucketForCategory(name, categories) }))

  const autoBucket = bucketForCategory(form.category, categories)
  const bucketOverridden = form.bucket !== autoBucket

  async function handleSubmit(e) {
    e.preventDefault()
    if (!form.amount || !form.category || !form.date || saving) return
    const data = {
      ...form,
      amount: parseFloat(form.amount),
      logged_by_user_id: currentUser?.id ?? null,
    }
    setSaving(true)
    setError('')
    try {
      const result = isEdit ? await bridge.updateExpense(data) : await bridge.createExpense(data)
      console.log(isEdit ? 'Expense updated:' : 'Expense saved:', result)
      onSave(isEdit ? null : form.date)
    } catch (err) {
      console.error('Expense save failed:', err)
      setError(err?.message || 'Could not save expense. Please try again.')
      setSaving(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm"
      onClick={e => e.target === e.currentTarget && onClose()}
    >
      <div className="bg-white rounded-2xl w-[440px] shadow-2xl overflow-hidden">
        <div className="px-6 py-5 border-b border-gray-100 flex items-center justify-between">
          <h2 className="text-lg font-bold text-gray-900">{isEdit ? 'Edit Expense' : 'Add Expense'}</h2>
          <button onClick={onClose} className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-gray-100 transition-colors">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4 text-gray-500">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5 block">Amount (₹) *</label>
            <input
              autoFocus
              type="number" min="0" step="0.01" placeholder="0.00" required
              value={form.amount} onChange={e => set('amount', e.target.value)}
              className="w-full px-4 py-3 rounded-xl border border-gray-200 text-2xl font-bold text-gray-900 focus:outline-none focus:border-[#6C63FF] focus:ring-2 focus:ring-[#6C63FF]/20"
            />
          </div>

          <div>
            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5 block">Category *</label>
            <select
              value={form.category} onChange={e => setCategory(e.target.value)}
              className="w-full px-4 py-2.5 rounded-xl border border-gray-200 bg-white text-sm font-medium text-gray-800 focus:outline-none focus:border-[#6C63FF] focus:ring-2 focus:ring-[#6C63FF]/20"
            >
              {categories.map(c => (
                <option key={c.id} value={c.name}>{c.icon} {c.name}</option>
              ))}
            </select>
          </div>

          <BucketToggle
            value={form.bucket}
            onChange={b => set('bucket', b)}
            hint={bucketOverridden ? overrideHint(form.category, autoBucket) : null}
          />

          <div>
            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5 block">Date *</label>
            <ExpenseDateChips value={form.date} onChange={d => set('date', d)} />
          </div>

          <div>
            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5 block">Note</label>
            <input
              type="text" placeholder="e.g. Pizza at Domino's"
              value={form.note || ''} onChange={e => set('note', e.target.value)}
              className="w-full px-4 py-2.5 rounded-xl border border-gray-200 text-sm text-gray-800 focus:outline-none focus:border-[#6C63FF] focus:ring-2 focus:ring-[#6C63FF]/20"
            />
          </div>

          {error && <p className="text-xs font-semibold text-red-500">{error}</p>}
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose} className="flex-1 py-2.5 rounded-xl border border-gray-200 text-sm font-semibold text-gray-600 hover:bg-gray-50 transition-colors">
              Cancel
            </button>
            <button type="submit" disabled={saving} className="flex-1 py-2.5 rounded-xl text-white text-sm font-semibold hover:opacity-90 transition-opacity disabled:opacity-60" style={{ backgroundColor: '#6C63FF' }}>
              {saving ? 'Saving…' : isEdit ? 'Update' : 'Add Expense'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ── Donut chart card (shared shell for both charts) ───────────────────────
function DonutCard({ title, centerLabel, centerValue, data, children }) {
  return (
    <div className="bg-white rounded-2xl p-6 border border-gray-100 shadow-sm">
      <h3 className="text-sm font-semibold text-gray-700 mb-4">{title}</h3>
      <div className="relative mx-auto w-full max-w-[300px]" style={{ height: 240 }}>
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={data} dataKey="value" nameKey="name"
              cx="50%" cy="50%" innerRadius="60%" outerRadius="92%"
              paddingAngle={2} strokeWidth={0} animationDuration={700}
            >
              {data.map(d => <Cell key={d.name} fill={d.color} />)}
            </Pie>
            <ReTooltip
              formatter={(value, name, entry) => [`${fmt(value)} · ${entry?.payload?.pct ?? 0}%`, name]}
              contentStyle={CHART_TOOLTIP_STYLE}
            />
          </PieChart>
        </ResponsiveContainer>
        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
          <p className="text-[10px] font-bold uppercase tracking-wide text-gray-400">{centerLabel}</p>
          <p className="text-xl font-bold text-gray-900">{centerValue}</p>
        </div>
      </div>
      {children}
    </div>
  )
}

// ── By Category donut ─────────────────────────────────────────────────────
function CategoryDonut({ byCategory, categories, total }) {
  if (!byCategory.length) return null
  const pct = (v) => total > 0 ? Math.round((v / total) * 100) : 0

  const top = byCategory.slice(0, 7)
  const restSum = byCategory.slice(7).reduce((s, c) => s + c.amount, 0)
  const segs = [
    ...top.map(({ category, amount }, i) => ({
      name: category, value: amount, pct: pct(amount), color: getCatColor(category, categories, i),
    })),
    ...(restSum > 0 ? [{ name: 'Other', value: restSum, pct: pct(restSum), color: '#94A3B8' }] : []),
  ]

  return (
    <DonutCard title="By Category" centerLabel="Spend" centerValue={fmt(total)} data={segs}>
      <div className="mt-4 space-y-2">
        {segs.map(s => (
          <div key={s.name} className="flex items-center justify-between text-sm gap-2">
            <span className="flex items-center gap-1.5 text-gray-600 min-w-0">
              <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: s.color }} />
              <span className="truncate">{s.name}</span>
            </span>
            <span className="font-bold text-gray-900 shrink-0">
              {fmt(s.value)} <span className="text-xs font-medium text-gray-400">{s.pct}%</span>
            </span>
          </div>
        ))}
      </div>
    </DonutCard>
  )
}

// ── Needs vs Wants donut ──────────────────────────────────────────────────
function NeedsWantsChart({ needs, wants, total }) {
  const pct = (v) => total > 0 ? Math.round((v / total) * 100) : 0
  const needsPct = pct(needs)
  const wantsPct = pct(wants)
  const data = [
    { name: 'Needs', value: needs, pct: needsPct, color: BUCKET_META.need.color },
    { name: 'Wants', value: wants, pct: wantsPct, color: BUCKET_META.want.color },
  ].filter(d => d.value > 0)
  const insight = spendingInsight(needsPct, wantsPct, total)

  return (
    <DonutCard title="Needs vs Wants" centerLabel="Total" centerValue={fmt(total)} data={data}>
      <div className="mt-4 space-y-3">
        <BucketStatRow emoji={BUCKET_META.need.dot} label="Needs" amount={needs} pct={needsPct} color={BUCKET_META.need.color} />
        <BucketStatRow emoji={BUCKET_META.want.dot} label="Wants" amount={wants} pct={wantsPct} color={BUCKET_META.want.color} />
      </div>
      {insight && (
        <p className="mt-4 px-3 py-2 rounded-lg text-xs font-medium" style={INSIGHT_STYLE[insight.tone]}>
          {insight.text}
        </p>
      )}
    </DonutCard>
  )
}

// ── Main component ────────────────────────────────────────────────────────
export default function Expenses({ onSyncRefresh, currentUser }) {
  const now = new Date()
  const [month, setMonth]         = useState(now.getMonth() + 1)
  const [year, setYear]           = useState(now.getFullYear())
  const [expenses, setExpenses]   = useState([])
  const [categories, setCategories] = useState([])
  const [monthlyStats, setMonthlyStats] = useState(null)
  const [needsBudget, setNeedsBudget]   = useState(0)
  const [loading, setLoading]     = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [editTarget, setEditTarget] = useState(null)
  const [search, setSearch]       = useState('')
  const [catFilter, setCatFilter] = useState('all')
  const [userFilter, setUserFilter] = useState('all') // 'all' | userId string
  const [allUsers, setAllUsers]   = useState([])
  const [toast, setToast]         = useState({ visible: false, message: '', type: 'success' })

  async function loadData() {
    setLoading(true)
    try {
      // Build expense filter: month/year for stats, but for list use YYYY-MM format
      const ym = `${year}-${String(month).padStart(2, '0')}`
      const expFilter = { month: ym }
      if (userFilter !== 'all') expFilter.logged_by = Number(userFilter)

      // Settle each call independently — a failure in one of the side calls
      // (stats, salary plan, users) must not blank out the expense list.
      const [exps, cats, stats, activePlan, users] = await Promise.all([
        bridge.getAllExpenses(expFilter).catch(err => { console.error('getAllExpenses failed:', err); return null }),
        bridge.getExpenseCategories().catch(err => { console.error('getExpenseCategories failed:', err); return null }),
        bridge.getExpenseMonthlyStats({ month, year }).catch(err => { console.error('getExpenseMonthlyStats failed:', err); return null }),
        bridge.getActivePlan().catch(err => { console.error('getActivePlan failed:', err); return null }),
        bridge.getUsers().catch(err => { console.error('getUsers failed:', err); return null }),
      ])
      if (exps) setExpenses(exps)
      else setToast({ visible: true, type: 'error', message: 'Could not load expenses — check your connection and try again' })
      if (cats) setCategories(cats)
      setMonthlyStats(stats || null)
      if (users) setAllUsers(users)

      const needsTotal = (activePlan?.items || [])
        .filter(i => i.category === 'needs')
        .reduce((s, i) => s + i.amount, 0)
      setNeedsBudget(needsTotal)
    } catch (err) {
      console.error('Failed to load expenses:', err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { loadData() }, [month, year, userFilter])

  function prevMonth() {
    if (month === 1) { setMonth(12); setYear(y => y - 1) }
    else setMonth(m => m - 1)
  }

  function nextMonth() {
    if (year > now.getFullYear() || (year === now.getFullYear() && month >= now.getMonth() + 1)) return
    if (month === 12) { setMonth(1); setYear(y => y + 1) }
    else setMonth(m => m + 1)
  }

  async function handleDelete(id) {
    if (!confirm('Delete this expense?')) return
    await bridge.deleteExpense(id)
    loadData()
  }

  function handleSaved(addedDate) {
    setShowModal(false)
    setEditTarget(null)
    if (addedDate) {
      // Jump the month view to the saved expense's month so it's always visible
      // after saving (e.g. when a past date was picked). Changing month/year
      // triggers loadData() via the effect below; otherwise refresh in place.
      const [y, m] = addedDate.split('-').map(Number)
      if (Number.isFinite(y) && Number.isFinite(m) && (y !== year || m !== month)) {
        setYear(y)
        setMonth(m)
      } else {
        loadData()
      }
      setToast({ visible: true, type: 'success', message: `✅ Expense added for ${expenseDateShortLabel(addedDate)}` })
    } else {
      loadData()
    }
  }

  const isCurrentMonth = year === now.getFullYear() && month === now.getMonth() + 1
  const totalSpend = monthlyStats?.total || 0
  const budgetWarning = needsBudget > 0 && totalSpend > needsBudget * 0.5

  const filtered = useMemo(() => {
    let list = expenses
    if (catFilter !== 'all') list = list.filter(e => e.category === catFilter)
    if (search.trim()) {
      const q = search.trim().toLowerCase()
      list = list.filter(e => e.note?.toLowerCase().includes(q) || e.category.toLowerCase().includes(q))
    }
    return list
  }, [expenses, catFilter, search])

  const grouped = useMemo(() => {
    const map = {}
    for (const e of filtered) {
      if (!map[e.date]) map[e.date] = []
      map[e.date].push(e)
    }
    return Object.entries(map).sort((a, b) => b[0].localeCompare(a[0]))
  }, [filtered])

  const formatDate = (dateStr) => {
    const d = new Date(dateStr + 'T00:00:00')
    const today = new Date(); today.setHours(0, 0, 0, 0)
    const yesterday = new Date(today); yesterday.setDate(today.getDate() - 1)
    if (d.getTime() === today.getTime()) return 'Today'
    if (d.getTime() === yesterday.getTime()) return 'Yesterday'
    return d.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' })
  }

  const adminUser   = allUsers.find(u => u.role === 'admin')
  const trackerUser = allUsers.find(u => u.role === 'tracker')

  return (
    <div className="p-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-4">
          <div>
            <h2 className="text-2xl font-bold text-gray-900">Expenses</h2>
            <p className="text-sm text-gray-500 mt-0.5">Track your monthly spending</p>
          </div>

          {/* Month picker */}
          <div className="flex items-center gap-1 px-3 py-1.5 rounded-xl border border-gray-200 bg-white">
            <button onClick={prevMonth} className="p-1 rounded-lg hover:bg-gray-100 transition-colors">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4 text-gray-500">
                <polyline points="15 18 9 12 15 6"/>
              </svg>
            </button>
            <span className="text-sm font-semibold text-gray-700 w-36 text-center">{MONTHS[month - 1]} {year}</span>
            <button onClick={nextMonth} disabled={isCurrentMonth} className="p-1 rounded-lg hover:bg-gray-100 transition-colors disabled:opacity-30">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4 text-gray-500">
                <polyline points="9 18 15 12 9 6"/>
              </svg>
            </button>
          </div>
        </div>

        <button
          onClick={() => { setEditTarget(null); setShowModal(true) }}
          className="flex items-center gap-2 px-4 py-2 rounded-xl text-white text-sm font-semibold hover:opacity-90 transition-opacity"
          style={{ backgroundColor: '#6C63FF' }}
        >
          <span className="text-lg leading-none">+</span>
          Add Expense
        </button>
      </div>

      {/* User filter tabs */}
      {allUsers.length > 1 && (
        <div className="flex gap-2 mb-5">
          <button
            onClick={() => setUserFilter('all')}
            className="px-4 py-1.5 rounded-full text-sm font-semibold border transition-colors"
            style={userFilter === 'all'
              ? { backgroundColor: '#6C63FF', color: '#fff', borderColor: 'transparent' }
              : { backgroundColor: '#fff', color: '#4B5563', borderColor: '#E5E7EB' }}
          >
            All
          </button>
          {adminUser && (
            <button
              onClick={() => setUserFilter(userFilter === String(adminUser.id) ? 'all' : String(adminUser.id))}
              className="flex items-center gap-1.5 px-4 py-1.5 rounded-full text-sm font-semibold border transition-colors"
              style={userFilter === String(adminUser.id)
                ? { backgroundColor: adminUser.avatar_color || '#6C63FF', color: '#fff', borderColor: 'transparent' }
                : { backgroundColor: '#fff', color: '#4B5563', borderColor: '#E5E7EB' }}
            >
              <span className="w-4 h-4 rounded-full inline-flex items-center justify-center text-white text-[9px] font-bold"
                style={{ backgroundColor: adminUser.avatar_color || '#6C63FF' }}>
                {adminUser.name.charAt(0).toUpperCase()}
              </span>
              {adminUser.name}
            </button>
          )}
          {trackerUser && (
            <button
              onClick={() => setUserFilter(userFilter === String(trackerUser.id) ? 'all' : String(trackerUser.id))}
              className="flex items-center gap-1.5 px-4 py-1.5 rounded-full text-sm font-semibold border transition-colors"
              style={userFilter === String(trackerUser.id)
                ? { backgroundColor: trackerUser.avatar_color || '#EC4899', color: '#fff', borderColor: 'transparent' }
                : { backgroundColor: '#fff', color: '#4B5563', borderColor: '#E5E7EB' }}
            >
              <span className="w-4 h-4 rounded-full inline-flex items-center justify-center text-white text-[9px] font-bold"
                style={{ backgroundColor: trackerUser.avatar_color || '#EC4899' }}>
                {trackerUser.name.charAt(0).toUpperCase()}
              </span>
              {trackerUser.name}
            </button>
          )}
        </div>
      )}

      {/* Budget warning */}
      {budgetWarning && (
        <div className="mb-5 flex items-center gap-3 px-4 py-3 rounded-xl border border-yellow-200 bg-yellow-50">
          <span className="text-xl shrink-0">⚠️</span>
          <div>
            <p className="text-sm font-semibold text-yellow-800">Spending Alert</p>
            <p className="text-xs text-yellow-700 mt-0.5">
              You've spent {fmt(totalSpend)} — over 50% of your Needs budget ({fmt(needsBudget)}) this month.
            </p>
          </div>
        </div>
      )}

      {/* Summary stats */}
      {monthlyStats && (
        <div className="grid grid-cols-3 gap-4 mb-6">
          <div className="bg-white rounded-2xl p-5 border border-gray-100 shadow-sm">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">
              {isCurrentMonth ? 'This Month' : `${MONTHS[month - 1]} ${year}`}
            </p>
            {(() => {
              const needs = monthlyStats.needs ?? 0
              const wants = monthlyStats.wants ?? 0
              const pct = (v) => totalSpend > 0 ? Math.round((v / totalSpend) * 100) : 0
              return (
                <div className="space-y-3">
                  <BucketStatRow emoji={BUCKET_META.need.dot} label="Needs" amount={needs} pct={pct(needs)} color={BUCKET_META.need.color} />
                  <BucketStatRow emoji={BUCKET_META.want.dot} label="Wants" amount={wants} pct={pct(wants)} color={BUCKET_META.want.color} />
                  <div className="flex items-center justify-between pt-2 border-t border-gray-100 text-sm">
                    <span className="text-gray-400 font-semibold">Total</span>
                    <span className="font-bold text-gray-900">{fmt(totalSpend)}</span>
                  </div>
                </div>
              )
            })()}
          </div>
          <div className="bg-white rounded-2xl p-5 border border-gray-100 shadow-sm">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1">Daily Average</p>
            <p className="text-2xl font-bold text-gray-900">{fmt(monthlyStats.dailyAvg)}</p>
            <p className="text-xs text-gray-400 mt-1">per day</p>
          </div>
          <div className="bg-white rounded-2xl p-5 border border-gray-100 shadow-sm">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1">Highest Spend Day</p>
            <p className="text-2xl font-bold text-gray-900">{monthlyStats.topDay ? fmt(monthlyStats.topDay.amount) : '—'}</p>
            <p className="text-xs text-gray-400 mt-1">
              {monthlyStats.topDay
                ? new Date(monthlyStats.topDay.date + 'T00:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })
                : 'No data'}
            </p>
          </div>
        </div>
      )}

      {/* Charts — Needs vs Wants (left) + By Category (right); stacked on mobile */}
      {monthlyStats && totalSpend > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 mb-6">
          <NeedsWantsChart
            needs={monthlyStats.needs ?? 0}
            wants={monthlyStats.wants ?? 0}
            total={totalSpend}
          />
          {monthlyStats.byCategory?.length > 0 && (
            <CategoryDonut
              byCategory={monthlyStats.byCategory}
              categories={categories}
              total={totalSpend}
            />
          )}
        </div>
      )}

      <div>
        {/* Expense list */}
        <div>
          {/* Search */}
          <div className="relative mb-3">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"
              className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400">
              <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
            </svg>
            <input
              placeholder="Search by note or category…"
              value={search} onChange={e => setSearch(e.target.value)}
              className="w-full pl-9 pr-4 py-2 rounded-xl border border-gray-200 text-sm bg-white text-gray-800 focus:outline-none focus:border-[#6C63FF]"
            />
          </div>

          {/* Category chips */}
          <div className="flex gap-2 flex-wrap mb-4">
            <button
              onClick={() => setCatFilter('all')}
              className="px-3 py-1 rounded-full text-xs font-semibold border transition-colors"
              style={catFilter === 'all' ? { backgroundColor: '#6C63FF', color: '#fff', borderColor: 'transparent' } : { backgroundColor: '#fff', color: '#4B5563', borderColor: '#E5E7EB' }}
            >
              All
            </button>
            {categories.map((c, i) => (
              <button
                key={c.id}
                onClick={() => setCatFilter(catFilter === c.name ? 'all' : c.name)}
                className="px-3 py-1 rounded-full text-xs font-semibold border transition-colors"
                style={catFilter === c.name
                  ? { backgroundColor: getCatColor(c.name, categories, i), color: '#fff', borderColor: 'transparent' }
                  : { backgroundColor: '#fff', color: '#4B5563', borderColor: '#E5E7EB' }}
              >
                {c.icon} {c.name}
              </button>
            ))}
          </div>

          {/* List */}
          {loading ? (
            <div className="space-y-3">
              {[1, 2, 3].map(i => <div key={i} className="h-16 bg-gray-100 rounded-xl animate-pulse" />)}
            </div>
          ) : grouped.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-52 rounded-2xl bg-white border border-dashed border-gray-200">
              <p className="text-4xl mb-3">💳</p>
              <p className="text-base font-semibold text-gray-700">No expenses found</p>
              <p className="text-sm text-gray-400 mt-1">Add your first expense for {MONTHS[month - 1]}</p>
            </div>
          ) : (
            <div className="space-y-4">
              {grouped.map(([date, items]) => (
                <div key={date} className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                  <div className="px-5 py-2.5 bg-gray-50 border-b border-gray-100 flex items-center justify-between">
                    <span className="text-xs font-bold text-gray-500 uppercase tracking-wide">{formatDate(date)}</span>
                    <span className="text-xs font-semibold text-gray-600">{fmt(items.reduce((s, e) => s + e.amount, 0))}</span>
                  </div>
                  <div className="divide-y divide-gray-50">
                    {items.map(exp => (
                      <div key={exp.id} className="flex items-center gap-4 px-5 py-3 hover:bg-gray-50/50 group transition-colors">
                        <div
                          className="w-9 h-9 rounded-xl flex items-center justify-center text-base shrink-0"
                          style={{ backgroundColor: getCatColor(exp.category, categories) + '20' }}
                        >
                          {getCatIcon(exp.category, categories)}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-gray-800 truncate flex items-center gap-1.5">
                            <BucketDot bucket={exp.bucket} />
                            <span className="truncate">{exp.note || exp.category}</span>
                          </p>
                          <div className="flex items-center gap-1.5">
                            {exp.note && <p className="text-xs text-gray-400">{exp.category}</p>}
                            {exp.logged_by_name && (
                              <span className="text-xs text-gray-300 font-medium">· {exp.logged_by_name}</span>
                            )}
                          </div>
                        </div>
                        <p className="text-sm font-bold text-gray-900 shrink-0">{fmt(exp.amount)}</p>
                        <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button
                            onClick={() => { setEditTarget(exp); setShowModal(true) }}
                            className="w-7 h-7 rounded-lg flex items-center justify-center hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors"
                          >
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="w-3.5 h-3.5">
                              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                            </svg>
                          </button>
                          <button
                            onClick={() => handleDelete(exp.id)}
                            className="w-7 h-7 rounded-lg flex items-center justify-center hover:bg-red-50 text-gray-400 hover:text-red-500 transition-colors"
                          >
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="w-3.5 h-3.5">
                              <polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>
                            </svg>
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {showModal && (
        <ExpenseModal
          expense={editTarget}
          categories={categories}
          currentUser={currentUser}
          onSave={handleSaved}
          onClose={() => { setShowModal(false); setEditTarget(null) }}
        />
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
