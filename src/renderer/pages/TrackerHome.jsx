import { useState, useEffect, useCallback } from 'react'

const TRACKER_CATEGORIES = [
  { name: 'Food',          icon: '🍔', color: '#FF6B6B' },
  { name: 'Transport',     icon: '🚗', color: '#4ECDC4' },
  { name: 'Shopping',      icon: '🛍️', color: '#45B7D1' },
  { name: 'Health',        icon: '💊', color: '#FF85A1' },
  { name: 'Bills',         icon: '📄', color: '#6366F1' },
  { name: 'Entertainment', icon: '🎬', color: '#96CEB4' },
  { name: 'Fuel',          icon: '⛽', color: '#F59E0B' },
  { name: 'Dining',        icon: '🍽️', color: '#EC4899' },
  { name: 'Others',        icon: '💸', color: '#AEB6BF' },
]

const fmt = v => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(v || 0)
const todayStr = () => new Date().toISOString().split('T')[0]

function greeting(name) {
  const h = new Date().getHours()
  const time = h < 12 ? 'morning' : h < 17 ? 'afternoon' : 'evening'
  return `Hi ${name}, good ${time}`
}

function timeStr(createdAt) {
  if (!createdAt) return ''
  const d = new Date(createdAt)
  return d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })
}

export default function TrackerHome({ user }) {
  const [amount, setAmount]       = useState('')
  const [category, setCategory]   = useState(TRACKER_CATEGORIES[0].name)
  const [note, setNote]           = useState('')
  const [saving, setSaving]       = useState(false)
  const [expenses, setExpenses]   = useState([])
  const [deleteId, setDeleteId]   = useState(null)
  let longPressTimer = null

  const today = todayStr()
  const currentMonth = today.slice(0, 7)

  const load = useCallback(async () => {
    try {
      const data = await window.electronAPI.getAllExpenses({ month: currentMonth })
      setExpenses(data)
    } catch {}
  }, [currentMonth])

  useEffect(() => { load() }, [load])

  const todayExpenses = expenses.filter(e => e.date === today)
  const todayTotal = todayExpenses.reduce((s, e) => s + e.amount, 0)

  async function save() {
    const amt = parseFloat(amount)
    if (!amt || amt <= 0) return
    setSaving(true)
    try {
      await window.electronAPI.createExpense({
        amount: amt, category, note: note.trim() || null,
        date: today, logged_by_user_id: user.id,
      })
      setAmount('')
      setNote('')
      await load()
    } finally { setSaving(false) }
  }

  async function deleteExpense(id) {
    await window.electronAPI.deleteExpense(id)
    setDeleteId(null)
    await load()
  }

  const selectedCat = TRACKER_CATEGORIES.find(c => c.name === category) || TRACKER_CATEGORIES[0]

  return (
    <div className="p-4 max-w-lg mx-auto">
      {/* Greeting */}
      <p className="text-lg font-semibold text-gray-800 mt-4 mb-1">{greeting(user.name)}</p>

      {/* Today's total */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 mb-4 text-center">
        <p className="text-xs text-gray-400 mb-1">Today's Total</p>
        <p className="text-4xl font-bold text-gray-900">{fmt(todayTotal)}</p>
        <p className="text-xs text-gray-400 mt-1">{todayExpenses.length} expense{todayExpenses.length !== 1 ? 's' : ''} today</p>
      </div>

      {/* Quick Add */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 mb-4">
        <p className="text-sm font-bold text-gray-800 mb-3">Add Expense</p>

        {/* Amount input */}
        <div className="flex items-center gap-2 mb-4">
          <span className="text-2xl font-bold text-gray-400">₹</span>
          <input
            type="number" min="0" step="1" placeholder="0"
            value={amount}
            onChange={e => setAmount(e.target.value)}
            className="flex-1 text-3xl font-bold text-gray-900 border-b-2 border-gray-200 focus:border-indigo-500 outline-none pb-1 bg-transparent"
          />
        </div>

        {/* Category chips */}
        <div className="flex gap-2 overflow-x-auto pb-2 mb-4" style={{ scrollbarWidth: 'none' }}>
          {TRACKER_CATEGORIES.map(cat => (
            <button key={cat.name}
              onClick={() => setCategory(cat.name)}
              className="flex-none flex items-center gap-1.5 px-3 py-2 rounded-full text-sm font-medium transition-all"
              style={{
                backgroundColor: category === cat.name ? cat.color : '#F3F4F6',
                color: category === cat.name ? 'white' : '#374151',
                border: `2px solid ${category === cat.name ? cat.color : 'transparent'}`,
              }}>
              <span>{cat.icon}</span>
              <span>{cat.name}</span>
            </button>
          ))}
        </div>

        {/* Note */}
        <input
          type="text" placeholder="What was this for? (optional)"
          value={note} onChange={e => setNote(e.target.value)}
          className="w-full px-4 py-2.5 rounded-xl border border-gray-200 text-sm text-gray-800 focus:outline-none focus:border-indigo-400 mb-3"
        />

        {/* Save button */}
        <button onClick={save} disabled={saving || !amount}
          className="w-full py-3 rounded-xl text-white text-base font-semibold transition-opacity disabled:opacity-40"
          style={{ backgroundColor: '#10B981' }}>
          {saving ? 'Saving…' : `Add ${amount ? fmt(parseFloat(amount) || 0) : 'Expense'}`}
        </button>
      </div>

      {/* Today's expense list */}
      {todayExpenses.length > 0 && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <p className="px-4 py-3 text-xs font-bold text-gray-400 uppercase tracking-wide border-b border-gray-100">
            Today
          </p>
          <div className="divide-y divide-gray-50">
            {todayExpenses.map(exp => {
              const cat = TRACKER_CATEGORIES.find(c => c.name === exp.category)
              return (
                <div key={exp.id}
                  className="flex items-center gap-3 px-4 py-3 hover:bg-red-50 transition-colors cursor-pointer"
                  onContextMenu={e => { e.preventDefault(); setDeleteId(exp.id) }}
                  onMouseDown={() => { longPressTimer = setTimeout(() => setDeleteId(exp.id), 600) }}
                  onMouseUp={() => clearTimeout(longPressTimer)}
                  onMouseLeave={() => clearTimeout(longPressTimer)}>
                  <span className="text-2xl">{cat?.icon || '💸'}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-800">{exp.category}</p>
                    {exp.note && <p className="text-xs text-gray-400 truncate">{exp.note}</p>}
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-bold text-gray-900">{fmt(exp.amount)}</p>
                    <p className="text-xs text-gray-400">{timeStr(exp.created_at)}</p>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Delete confirm dialog */}
      {deleteId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ backgroundColor: 'rgba(0,0,0,0.4)' }}
          onClick={e => { if (e.target === e.currentTarget) setDeleteId(null) }}>
          <div className="bg-white rounded-2xl p-6 w-full max-w-sm shadow-xl">
            <p className="text-base font-bold text-gray-900 mb-2">Delete expense?</p>
            <p className="text-sm text-gray-400 mb-5">This action cannot be undone.</p>
            <div className="flex gap-3">
              <button onClick={() => setDeleteId(null)}
                className="flex-1 py-2.5 rounded-xl border border-gray-200 text-sm font-semibold text-gray-700">
                Cancel
              </button>
              <button onClick={() => deleteExpense(deleteId)}
                className="flex-1 py-2.5 rounded-xl text-white text-sm font-semibold bg-red-500">
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
