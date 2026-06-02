import { useState, useEffect, useMemo } from 'react'

const INR = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 })
const fmt = (v) => INR.format(v || 0)
const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December']

function getCatColor(name, categories) {
  const cat = categories.find(c => c.name === name)
  return cat?.color || '#AEB6BF'
}

function getCatIcon(name, categories) {
  const cat = categories.find(c => c.name === name)
  return cat?.icon || '💸'
}

// ── Expense add/edit modal ────────────────────────────────────────────────
function ExpenseModal({ expense, categories, onSave, onClose }) {
  const today = new Date().toISOString().slice(0, 10)
  const [form, setForm] = useState(
    expense
      ? { ...expense, amount: String(expense.amount) }
      : { amount: '', category: categories[0]?.name || 'Food & Dining', note: '', date: today }
  )

  const isEdit = Boolean(expense?.id)
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  async function handleSubmit(e) {
    e.preventDefault()
    if (!form.amount || !form.category || !form.date) return
    const data = { ...form, amount: parseFloat(form.amount) }
    if (isEdit) await window.electronAPI.updateExpense(data)
    else await window.electronAPI.createExpense(data)
    onSave()
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
              value={form.category} onChange={e => set('category', e.target.value)}
              className="w-full px-4 py-2.5 rounded-xl border border-gray-200 bg-white text-sm font-medium text-gray-800 focus:outline-none focus:border-[#6C63FF] focus:ring-2 focus:ring-[#6C63FF]/20"
            >
              {categories.map(c => (
                <option key={c.id} value={c.name}>{c.icon} {c.name}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5 block">Date *</label>
            <input
              type="date" required value={form.date} onChange={e => set('date', e.target.value)}
              className="w-full px-4 py-2.5 rounded-xl border border-gray-200 text-sm font-medium text-gray-800 focus:outline-none focus:border-[#6C63FF] focus:ring-2 focus:ring-[#6C63FF]/20"
            />
          </div>

          <div>
            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5 block">Note</label>
            <input
              type="text" placeholder="e.g. Pizza at Domino's"
              value={form.note || ''} onChange={e => set('note', e.target.value)}
              className="w-full px-4 py-2.5 rounded-xl border border-gray-200 text-sm text-gray-800 focus:outline-none focus:border-[#6C63FF] focus:ring-2 focus:ring-[#6C63FF]/20"
            />
          </div>

          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose} className="flex-1 py-2.5 rounded-xl border border-gray-200 text-sm font-semibold text-gray-600 hover:bg-gray-50 transition-colors">
              Cancel
            </button>
            <button type="submit" className="flex-1 py-2.5 rounded-xl text-white text-sm font-semibold hover:opacity-90 transition-opacity" style={{ backgroundColor: '#6C63FF' }}>
              {isEdit ? 'Update' : 'Add Expense'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ── Category donut ────────────────────────────────────────────────────────
function CategoryDonut({ byCategory, categories, total }) {
  if (!byCategory.length) return null

  let cum = 0
  const segs = byCategory.slice(0, 6).map(({ category, amount }) => {
    const pct = total > 0 ? (amount / total) * 100 : 0
    const color = getCatColor(category, categories)
    const start = cum
    cum += pct
    return { category, amount, pct, color, start }
  })

  const gradient = segs.length > 1
    ? segs.map(s => `${s.color} ${s.start}% ${s.start + s.pct}%`).join(', ')
    : segs[0]?.color

  return (
    <div className="flex flex-col gap-5">
      <div className="relative mx-auto w-28 h-28">
        <div className="w-28 h-28 rounded-full" style={{ background: `conic-gradient(${gradient})` }} />
        <div className="absolute inset-4 bg-white rounded-full flex flex-col items-center justify-center">
          <p className="text-[10px] font-bold text-gray-500">SPEND</p>
        </div>
      </div>

      <div className="space-y-2.5">
        {segs.map((s, i) => (
          <div key={i}>
            <div className="flex items-center justify-between mb-1">
              <div className="flex items-center gap-1.5">
                <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: s.color }} />
                <span className="text-xs text-gray-600 truncate max-w-[90px]">{s.category}</span>
              </div>
              <span className="text-xs font-bold text-gray-800">{fmt(s.amount)}</span>
            </div>
            <div className="h-1 bg-gray-100 rounded-full overflow-hidden">
              <div className="h-full rounded-full" style={{ width: `${s.pct}%`, backgroundColor: s.color }} />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────
export default function Expenses({ onQuickAdd }) {
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

  async function loadData() {
    setLoading(true)
    try {
      const [exps, cats, stats, allocs, profile] = await Promise.all([
        window.electronAPI.getAllExpenses({ month, year }),
        window.electronAPI.getExpenseCategories(),
        window.electronAPI.getExpenseMonthlyStats({ month, year }),
        window.electronAPI.getSalaryAllocations(),
        window.electronAPI.getProfile(),
      ])
      setExpenses(exps || [])
      setCategories(cats || [])
      setMonthlyStats(stats || null)

      const needsRow = (allocs || []).find(r => r.bank === '__bucket__' && r.label === 'Needs')
      if (needsRow && profile?.monthly_salary) {
        setNeedsBudget((needsRow.percentage / 100) * profile.monthly_salary)
      }
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { loadData() }, [month, year])

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
    await window.electronAPI.deleteExpense(id)
    loadData()
  }

  function handleSaved() {
    setShowModal(false)
    setEditTarget(null)
    loadData()
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
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1">Total Spend</p>
            <p className="text-2xl font-bold text-gray-900">{fmt(totalSpend)}</p>
            <p className="text-xs text-gray-400 mt-1">{MONTHS[month - 1]} {year}</p>
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

      <div className="grid grid-cols-3 gap-5">
        {/* Category donut */}
        {(monthlyStats?.byCategory?.length > 0) && (
          <div className="bg-white rounded-2xl p-6 border border-gray-100 shadow-sm">
            <h3 className="text-sm font-semibold text-gray-700 mb-5">By Category</h3>
            <CategoryDonut
              byCategory={monthlyStats.byCategory}
              categories={categories}
              total={totalSpend}
            />
          </div>
        )}

        {/* Expense list */}
        <div className={monthlyStats?.byCategory?.length > 0 ? 'col-span-2' : 'col-span-3'}>
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
            {categories.map(c => (
              <button
                key={c.id}
                onClick={() => setCatFilter(catFilter === c.name ? 'all' : c.name)}
                className="px-3 py-1 rounded-full text-xs font-semibold border transition-colors"
                style={catFilter === c.name
                  ? { backgroundColor: c.color, color: '#fff', borderColor: 'transparent' }
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
                          <p className="text-sm font-semibold text-gray-800 truncate">{exp.note || exp.category}</p>
                          {exp.note && <p className="text-xs text-gray-400">{exp.category}</p>}
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
          onSave={handleSaved}
          onClose={() => { setShowModal(false); setEditTarget(null) }}
        />
      )}
    </div>
  )
}
