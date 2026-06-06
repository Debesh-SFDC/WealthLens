import { useState, useEffect, useCallback } from 'react'

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
const todayStr = () => new Date().toISOString().split('T')[0]

function getGreeting(name) {
  const h = new Date().getHours()
  const emoji = h < 12 ? '☀️' : h < 17 ? '🌤️' : '🌙'
  const time = h < 12 ? 'morning' : h < 17 ? 'afternoon' : 'evening'
  return `Good ${time}, ${name} ${emoji}`
}

function todayLabel() {
  return new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
}

function timeStr(createdAt) {
  if (!createdAt) return ''
  return new Date(createdAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })
}

export default function TrackerHome({ user }) {
  const [amount, setAmount]     = useState('')
  const [category, setCategory] = useState(CATEGORIES[0].name)
  const [note, setNote]         = useState('')
  const [saved, setSaved]       = useState(false)
  const [saving, setSaving]     = useState(false)
  const [expenses, setExpenses] = useState([])
  const [budget, setBudget]     = useState(0)
  const [deleteId, setDeleteId] = useState(null)
  const [hoverRow, setHoverRow] = useState(null)
  const [amtFocused, setAmtFocused] = useState(false)

  const today = todayStr()
  const currentMonth = today.slice(0, 7)

  const load = useCallback(async () => {
    try {
      const [data, b] = await Promise.all([
        window.electronAPI.getAllExpenses({ month: currentMonth }),
        window.electronAPI.getTrackerBudget().catch(() => 0),
      ])
      setExpenses(data)
      setBudget(b || 0)
    } catch {}
  }, [currentMonth])

  useEffect(() => { load() }, [load])

  const todayExpenses = expenses.filter(e => e.date === today)
  const todayTotal = todayExpenses.reduce((s, e) => s + e.amount, 0)
  const monthTotal = expenses.reduce((s, e) => s + e.amount, 0)
  const budgetPct = budget > 0 ? Math.min((monthTotal / budget) * 100, 100) : 0
  const budgetColor = budgetPct >= 90 ? '#EF4444' : budgetPct >= 70 ? '#F59E0B' : '#ffffff'

  async function save() {
    const amt = parseFloat(amount)
    if (!amt || amt <= 0 || saving) return
    setSaving(true)
    try {
      await window.electronAPI.createExpense({
        amount: amt, category, note: note.trim() || null,
        date: today, logged_by_user_id: user.id,
      })
      setAmount('')
      setNote('')
      setSaved(true)
      setTimeout(() => setSaved(false), 1500)
      await load()
    } finally { setSaving(false) }
  }

  async function doDelete(id) {
    await window.electronAPI.deleteExpense(id)
    setDeleteId(null)
    await load()
  }

  const selCat = CATEGORIES.find(c => c.name === category) || CATEGORIES[0]

  return (
    <>
      <style>{`
        @keyframes fadeInUp {
          from { opacity: 0; transform: translateY(18px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        .tracker-home { animation: fadeInUp 0.3s ease; }
      `}</style>

      <div className="tracker-home p-6 max-w-2xl mx-auto">
        <div className="mb-6">
          <p className="text-xl font-bold text-gray-900">{getGreeting(user.name)}</p>
          <p className="text-sm text-gray-400 mt-0.5">{todayLabel()}</p>
        </div>

        <div
          className="rounded-3xl p-6 mb-5 relative overflow-hidden"
          style={{ background: 'linear-gradient(135deg, #6C63FF 0%, #4F46E5 100%)' }}
        >
          <div
            className="absolute rounded-full"
            style={{ width: 180, height: 180, top: -60, right: -40, background: 'rgba(255,255,255,0.07)' }}
          />
          <div
            className="absolute rounded-full"
            style={{ width: 100, height: 100, bottom: -30, left: 20, background: 'rgba(255,255,255,0.05)' }}
          />
          <p className="text-white text-xs font-semibold uppercase tracking-widest mb-1 opacity-70 relative z-10">
            Today's spending
          </p>
          <p className="text-white text-4xl font-bold relative z-10">{fmt(todayTotal)}</p>
          <p className="text-white text-xs opacity-60 mt-1 relative z-10">
            {todayExpenses.length} expense{todayExpenses.length !== 1 ? 's' : ''} logged today
          </p>
          {budget > 0 && (
            <div className="mt-4 relative z-10">
              <div className="flex justify-between mb-1.5">
                <span className="text-white text-xs opacity-70">This month: {fmt(monthTotal)}</span>
                <span className="text-white text-xs opacity-70">Budget: {fmt(budget)}</span>
              </div>
              <div className="h-2 rounded-full" style={{ backgroundColor: 'rgba(255,255,255,0.2)' }}>
                <div
                  className="h-full rounded-full transition-all duration-500"
                  style={{ width: `${budgetPct}%`, backgroundColor: budgetColor }}
                />
              </div>
              <p className="text-xs mt-1" style={{ color: budgetColor === '#ffffff' ? 'rgba(255,255,255,0.6)' : budgetColor }}>
                {monthTotal > budget
                  ? `Over budget by ${fmt(monthTotal - budget)}`
                  : `${fmt(budget - monthTotal)} remaining`}
              </p>
            </div>
          )}
        </div>

        <div className="bg-white rounded-3xl shadow-sm p-6 mb-5">
          <p className="text-base font-bold text-gray-800 mb-4">Add Expense</p>

          <div
            className="flex items-center gap-2 rounded-2xl px-4 py-3 mb-5 transition-all"
            style={{
              backgroundColor: '#F9FAFB',
              border: `2px solid ${amtFocused ? '#6C63FF' : '#F3F4F6'}`,
            }}
          >
            <span className="text-2xl font-bold" style={{ color: '#6C63FF' }}>₹</span>
            <input
              type="number" min="0" step="1" placeholder="0"
              value={amount}
              onChange={e => setAmount(e.target.value)}
              onFocus={() => setAmtFocused(true)}
              onBlur={() => setAmtFocused(false)}
              onKeyDown={e => { if (e.key === 'Enter') save() }}
              className="flex-1 text-3xl font-bold text-gray-900 bg-transparent outline-none"
              style={{ minWidth: 0 }}
            />
          </div>

          <div className="grid grid-cols-3 gap-2 mb-5">
            {CATEGORIES.map(cat => {
              const isActive = category === cat.name
              return (
                <button
                  key={cat.name}
                  onClick={() => setCategory(cat.name)}
                  className="flex flex-col items-center py-3 rounded-2xl transition-all duration-150"
                  style={{
                    backgroundColor: isActive ? cat.bg : 'transparent',
                    border: `2px solid ${isActive ? cat.color : '#F3F4F6'}`,
                    transform: isActive ? 'scale(1.03)' : 'scale(1)',
                  }}
                >
                  <span className="text-2xl mb-1">{cat.icon}</span>
                  <span className="text-xs font-semibold" style={{ color: isActive ? cat.color : '#6B7280' }}>
                    {cat.name}
                  </span>
                </button>
              )
            })}
          </div>

          <input
            type="text"
            placeholder="What was this for? (optional)"
            value={note}
            onChange={e => setNote(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') save() }}
            className="w-full px-4 py-3 rounded-2xl text-sm text-gray-800 outline-none mb-4"
            style={{ backgroundColor: '#F9FAFB', border: '2px solid #F3F4F6' }}
          />

          <button
            onClick={save}
            disabled={!amount || saving}
            className="w-full py-3.5 rounded-2xl text-white text-base font-bold transition-all duration-300 disabled:opacity-40"
            style={{
              background: saved
                ? 'linear-gradient(135deg, #10B981 0%, #059669 100%)'
                : 'linear-gradient(135deg, #6C63FF 0%, #4F46E5 100%)',
            }}
          >
            {saved ? '✓ Saved!' : saving ? 'Saving…' : `Add ${amount ? fmt(parseFloat(amount) || 0) : 'Expense'}`}
          </button>
        </div>

        {todayExpenses.length > 0 ? (
          <div className="bg-white rounded-3xl shadow-sm overflow-hidden">
            <p className="px-5 py-3.5 text-xs font-bold text-gray-400 uppercase tracking-widest border-b border-gray-50">
              Today's Expenses
            </p>
            <div className="divide-y divide-gray-50">
              {todayExpenses.map(exp => {
                const cat = CATEGORIES.find(c => c.name === exp.category) || CATEGORIES[CATEGORIES.length - 1]
                return (
                  <div
                    key={exp.id}
                    className="flex items-center gap-3 px-5 py-3.5 transition-colors"
                    style={{ backgroundColor: hoverRow === exp.id ? '#FEF2F2' : 'transparent' }}
                    onMouseEnter={() => setHoverRow(exp.id)}
                    onMouseLeave={() => setHoverRow(null)}
                  >
                    <div
                      className="flex items-center justify-center rounded-2xl shrink-0 text-xl"
                      style={{ width: 44, height: 44, backgroundColor: cat.bg }}
                    >
                      {cat.icon}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-gray-800">{exp.category}</p>
                      {exp.note && <p className="text-xs text-gray-400 truncate">{exp.note}</p>}
                    </div>
                    <div className="text-right mr-2">
                      <p className="text-sm font-bold text-gray-900">{fmt(exp.amount)}</p>
                      <p className="text-xs text-gray-400">{timeStr(exp.created_at)}</p>
                    </div>
                    <button
                      onClick={() => setDeleteId(exp.id)}
                      className="p-1.5 rounded-lg transition-all"
                      style={{
                        opacity: hoverRow === exp.id ? 1 : 0,
                        color: '#EF4444',
                        backgroundColor: hoverRow === exp.id ? '#FEE2E2' : 'transparent',
                      }}
                    >
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
                        <polyline points="3 6 5 6 21 6" />
                        <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
                        <path d="M10 11v6M14 11v6" />
                        <path d="M9 6V4h6v2" />
                      </svg>
                    </button>
                  </div>
                )
              })}
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <span className="text-5xl mb-3">💰</span>
            <p className="text-sm font-semibold text-gray-500">No expenses logged today</p>
            <p className="text-xs text-gray-400 mt-1">Add your first expense above</p>
          </div>
        )}
      </div>

      {deleteId && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ backgroundColor: 'rgba(0,0,0,0.4)' }}
          onClick={e => { if (e.target === e.currentTarget) setDeleteId(null) }}
        >
          <div className="bg-white rounded-3xl p-6 w-full max-w-sm shadow-2xl">
            <p className="text-base font-bold text-gray-900 mb-2">Delete expense?</p>
            <p className="text-sm text-gray-400 mb-5">This action cannot be undone.</p>
            <div className="flex gap-3">
              <button
                onClick={() => setDeleteId(null)}
                className="flex-1 py-3 rounded-2xl border border-gray-200 text-sm font-semibold text-gray-700 hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => doDelete(deleteId)}
                className="flex-1 py-3 rounded-2xl text-white text-sm font-semibold bg-red-500 hover:bg-red-600 transition-colors"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
