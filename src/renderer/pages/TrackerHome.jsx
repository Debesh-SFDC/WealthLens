import { useState, useEffect, useCallback } from 'react'

const DEFAULT_CATS = [
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
const yesterdayStr = () => {
  const d = new Date(); d.setDate(d.getDate() - 1); return d.toISOString().split('T')[0]
}

function getGreeting(name) {
  const h = new Date().getHours()
  const emoji = h < 12 ? '☀️' : h < 17 ? '🌤️' : h < 21 ? '🌙' : '✨'
  const time = h < 12 ? 'morning' : h < 17 ? 'afternoon' : h < 21 ? 'evening' : 'night'
  return { greeting: `Good ${time}`, name, emoji }
}

function formatDateLabel(dateStr) {
  const today = todayStr()
  const yesterday = yesterdayStr()
  if (dateStr === today) return 'Today'
  if (dateStr === yesterday) return 'Yesterday'
  return new Date(dateStr + 'T12:00:00').toLocaleDateString('en-IN', {
    weekday: 'short', day: 'numeric', month: 'short',
  })
}

function timeStr(createdAt) {
  if (!createdAt) return ''
  return new Date(createdAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })
}

function getCatMeta(allCats, name) {
  return allCats.find(c => c.name === name) || { icon: '💸', color: '#8B93A5', bg: '#F8FAFC' }
}

export default function TrackerHome({ user }) {
  const [amount, setAmount]         = useState('')
  const [category, setCategory]     = useState('')
  const [note, setNote]             = useState('')
  const [saved, setSaved]           = useState(false)
  const [saving, setSaving]         = useState(false)
  const [expenses, setExpenses]     = useState([])
  const [budget, setBudget]         = useState(0)
  const [deleteId, setDeleteId]     = useState(null)
  const [hoverRow, setHoverRow]     = useState(null)
  const [amtFocused, setAmtFocused] = useState(false)
  const [categories, setCategories] = useState(DEFAULT_CATS)
  const [selectedDate, setSelectedDate] = useState(todayStr())
  const [showPicker, setShowPicker] = useState(false)

  // Weight state
  const [weightInput,   setWeightInput]   = useState('')
  const [weightSaving,  setWeightSaving]  = useState(false)
  const [weightSaved,   setWeightSaved]   = useState(false)
  const [todayWeightLog, setTodayWeightLog] = useState(null)
  const [wtFocused,     setWtFocused]     = useState(false)

  const today = todayStr()
  const yesterday = yesterdayStr()
  const currentMonth = selectedDate.slice(0, 7)

  const loadCategories = useCallback(async () => {
    try {
      const cats = await window.electronAPI.getExpenseCategories()
      if (cats?.length) {
        const merged = [...DEFAULT_CATS]
        for (const c of cats) {
          if (!merged.find(m => m.name === c.name)) {
            merged.push({ name: c.name, icon: c.icon || '💸', color: c.color || '#8B93A5', bg: '#F8FAFC' })
          }
        }
        setCategories(merged)
        if (!category) setCategory(merged[0].name)
      } else {
        if (!category) setCategory(DEFAULT_CATS[0].name)
      }
    } catch {
      if (!category) setCategory(DEFAULT_CATS[0].name)
    }
  }, [])

  useEffect(() => { loadCategories() }, [loadCategories])

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

  const loadWeight = useCallback(async () => {
    try {
      const logs = await window.electronAPI.getWeightLogs({ userId: user.id, from: today, to: today })
      setTodayWeightLog(logs?.[0] ?? null)
    } catch {}
  }, [user.id, today])

  useEffect(() => { loadWeight() }, [loadWeight])

  async function saveWeight() {
    const kg = parseFloat(weightInput)
    if (!kg || kg < 10 || kg > 300 || weightSaving) return
    setWeightSaving(true)
    try {
      await window.electronAPI.logWeight({ userId: user.id, weightKg: kg, date: today })
      setWeightInput('')
      setWeightSaved(true)
      setTimeout(() => setWeightSaved(false), 2000)
      await loadWeight()
    } finally { setWeightSaving(false) }
  }

  const dateExpenses = expenses.filter(e => e.date === selectedDate)
  const dateTotal    = dateExpenses.reduce((s, e) => s + e.amount, 0)
  const monthTotal   = expenses.reduce((s, e) => s + e.amount, 0)
  const budgetPct    = budget > 0 ? Math.min((monthTotal / budget) * 100, 100) : 0
  const budgetLeft   = budget - monthTotal

  const { greeting, name: uname, emoji } = getGreeting(user.name)

  async function save() {
    const amt = parseFloat(amount)
    if (!amt || amt <= 0 || saving) return
    setSaving(true)
    try {
      await window.electronAPI.createExpense({
        amount: amt, category, note: note.trim() || null,
        date: selectedDate, logged_by_user_id: user.id,
      })
      setAmount('')
      setNote('')
      setSaved(true)
      setTimeout(() => setSaved(false), 1800)
      await load()
    } finally { setSaving(false) }
  }

  async function doDelete(id) {
    await window.electronAPI.deleteExpense(id)
    setDeleteId(null)
    await load()
  }

  const selCat = getCatMeta(categories, category)

  return (
    <>
      <style>{`
        @keyframes fadeInUp {
          from { opacity: 0; transform: translateY(20px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes popIn {
          from { opacity: 0; transform: scale(0.94); }
          to   { opacity: 1; transform: scale(1); }
        }
        .tracker-home { animation: fadeInUp 0.32s ease; }
        .expense-row { transition: background 0.15s; }
        .cat-chip { transition: all 0.15s ease; }
        .cat-chip:active { transform: scale(0.94) !important; }
        input[type='date']::-webkit-calendar-picker-indicator { opacity: 0.5; cursor: pointer; }
      `}</style>

      <div className="tracker-home p-5 max-w-xl mx-auto pb-10">

        {/* ── Greeting ── */}
        <div className="flex items-start justify-between mb-5">
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-gray-400 mb-0.5">{greeting}</p>
            <p className="text-2xl font-extrabold text-gray-900">{uname} {emoji}</p>
          </div>
          <div className="text-right">
            <p className="text-xs text-gray-400">
              {new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
            </p>
            {budget > 0 && (
              <p className="text-xs font-semibold mt-0.5" style={{ color: budgetLeft < 0 ? '#EF4444' : '#10B981' }}>
                {budgetLeft < 0 ? `Over by ${fmt(Math.abs(budgetLeft))}` : `${fmt(budgetLeft)} left`}
              </p>
            )}
          </div>
        </div>

        {/* ── Hero card ── */}
        <div
          className="rounded-3xl p-5 mb-5 relative overflow-hidden"
          style={{ background: 'linear-gradient(135deg, #6C63FF 0%, #4338CA 100%)' }}
        >
          {/* decorative circles */}
          <div className="absolute rounded-full" style={{ width: 200, height: 200, top: -80, right: -50, background: 'rgba(255,255,255,0.06)' }} />
          <div className="absolute rounded-full" style={{ width: 120, height: 120, bottom: -40, left: -20, background: 'rgba(255,255,255,0.04)' }} />

          <div className="relative z-10 flex items-start justify-between mb-3">
            <div>
              <p className="text-white text-xs font-semibold uppercase tracking-widest opacity-60 mb-1">
                {formatDateLabel(selectedDate)} · Spent
              </p>
              <p className="text-white text-4xl font-extrabold tracking-tight">{fmt(dateTotal)}</p>
              <p className="text-white text-xs opacity-50 mt-1">
                {dateExpenses.length} transaction{dateExpenses.length !== 1 ? 's' : ''}
              </p>
            </div>
            {budget > 0 && (
              <div className="text-right">
                <p className="text-white text-xs opacity-60">Month</p>
                <p className="text-white text-lg font-bold">{fmt(monthTotal)}</p>
                <p className="text-white text-xs opacity-50">of {fmt(budget)}</p>
              </div>
            )}
          </div>

          {budget > 0 && (
            <div className="relative z-10">
              <div className="h-1.5 rounded-full" style={{ backgroundColor: 'rgba(255,255,255,0.2)' }}>
                <div
                  className="h-full rounded-full transition-all duration-700"
                  style={{
                    width: `${budgetPct}%`,
                    backgroundColor: budgetPct >= 90 ? '#FCA5A5' : budgetPct >= 70 ? '#FDE68A' : 'rgba(255,255,255,0.9)',
                  }}
                />
              </div>
            </div>
          )}
        </div>

        {/* ── Weight log card ── */}
        <div className="bg-white rounded-3xl shadow-sm border border-gray-100 p-5 mb-4">
          <div className="flex items-center justify-between mb-3">
            <p className="text-sm font-bold text-gray-800">Morning Weight</p>
            {todayWeightLog && (
              <span className="flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full"
                style={{ backgroundColor: '#ECFDF5', color: '#059669' }}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" style={{ width: 11, height: 11 }}>
                  <polyline points="20 6 9 17 4 12" />
                </svg>
                {todayWeightLog.weight_kg} kg logged
              </span>
            )}
          </div>

          <div className="flex items-center gap-2">
            <div
              className="flex items-center gap-2 rounded-2xl px-3 py-2.5 flex-1"
              style={{
                backgroundColor: '#F9FAFB',
                border: `2px solid ${wtFocused ? '#6C63FF' : 'transparent'}`,
                boxShadow: wtFocused ? '0 0 0 4px rgba(108,99,255,0.08)' : 'none',
                transition: 'border-color 0.2s, box-shadow 0.2s',
              }}
            >
              <span className="text-xl leading-none">⚖️</span>
              <input
                type="number" min="10" max="300" step="0.1"
                placeholder={todayWeightLog ? `${todayWeightLog.weight_kg}` : '0.0'}
                value={weightInput}
                onChange={e => setWeightInput(e.target.value)}
                onFocus={() => setWtFocused(true)}
                onBlur={() => setWtFocused(false)}
                onKeyDown={e => { if (e.key === 'Enter') saveWeight() }}
                className="flex-1 text-xl font-extrabold text-gray-900 bg-transparent outline-none min-w-0"
              />
              <span className="text-sm font-semibold text-gray-400">kg</span>
            </div>

            <button
              onClick={saveWeight}
              disabled={!weightInput || weightSaving}
              className="px-4 py-2.5 rounded-2xl text-white text-sm font-bold transition-all duration-300 disabled:opacity-40 disabled:cursor-not-allowed shrink-0"
              style={{
                background: weightSaved
                  ? 'linear-gradient(135deg, #10B981 0%, #059669 100%)'
                  : 'linear-gradient(135deg, #6C63FF 0%, #4338CA 100%)',
                boxShadow: weightSaved ? '0 6px 16px rgba(16,185,129,0.3)' : weightInput ? '0 6px 16px rgba(108,99,255,0.3)' : 'none',
              }}
            >
              {weightSaved ? '✓' : weightSaving ? '…' : todayWeightLog ? 'Update' : 'Log'}
            </button>
          </div>
        </div>

        {/* ── Add Expense card ── */}
        <div className="bg-white rounded-3xl shadow-sm border border-gray-100 p-5 mb-4">
          <p className="text-sm font-bold text-gray-800 mb-4">Add Expense</p>

          {/* Amount input */}
          <div
            className="flex items-center gap-2 rounded-2xl px-4 py-3 mb-4"
            style={{
              backgroundColor: '#F9FAFB',
              border: `2px solid ${amtFocused ? '#6C63FF' : 'transparent'}`,
              boxShadow: amtFocused ? '0 0 0 4px rgba(108,99,255,0.08)' : 'none',
              transition: 'border-color 0.2s, box-shadow 0.2s',
            }}
          >
            <span className="text-3xl font-black" style={{ color: '#6C63FF', lineHeight: 1 }}>₹</span>
            <input
              type="number" min="0" step="1" placeholder="0"
              value={amount}
              onChange={e => setAmount(e.target.value)}
              onFocus={() => setAmtFocused(true)}
              onBlur={() => setAmtFocused(false)}
              onKeyDown={e => { if (e.key === 'Enter') save() }}
              className="flex-1 text-4xl font-extrabold text-gray-900 bg-transparent outline-none"
              style={{ minWidth: 0 }}
            />
          </div>

          {/* Date selector */}
          <div className="flex items-center gap-2 mb-4">
            <span className="text-xs font-semibold text-gray-500">Date:</span>
            <button
              onClick={() => { setSelectedDate(today); setShowPicker(false) }}
              className="px-3 py-1.5 rounded-full text-xs font-semibold transition-all"
              style={{
                backgroundColor: selectedDate === today && !showPicker ? '#EEF2FF' : '#F3F4F6',
                color: selectedDate === today && !showPicker ? '#6C63FF' : '#6B7280',
              }}
            >
              Today
            </button>
            <button
              onClick={() => { setSelectedDate(yesterday); setShowPicker(false) }}
              className="px-3 py-1.5 rounded-full text-xs font-semibold transition-all"
              style={{
                backgroundColor: selectedDate === yesterday && !showPicker ? '#EEF2FF' : '#F3F4F6',
                color: selectedDate === yesterday && !showPicker ? '#6C63FF' : '#6B7280',
              }}
            >
              Yesterday
            </button>
            <button
              onClick={() => setShowPicker(v => !v)}
              className="px-3 py-1.5 rounded-full text-xs font-semibold transition-all flex items-center gap-1"
              style={{
                backgroundColor: showPicker || (selectedDate !== today && selectedDate !== yesterday) ? '#EEF2FF' : '#F3F4F6',
                color: showPicker || (selectedDate !== today && selectedDate !== yesterday) ? '#6C63FF' : '#6B7280',
              }}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" style={{ width: 12, height: 12 }}>
                <rect x="3" y="4" width="18" height="18" rx="2" />
                <path d="M16 2v4M8 2v4M3 10h18" />
              </svg>
              {showPicker || (selectedDate !== today && selectedDate !== yesterday)
                ? formatDateLabel(selectedDate)
                : 'Pick date'}
            </button>
            {showPicker && (
              <input
                type="date"
                value={selectedDate}
                max={today}
                onChange={e => { if (e.target.value) setSelectedDate(e.target.value) }}
                className="text-xs text-gray-700 outline-none border border-gray-200 rounded-xl px-2 py-1.5 bg-white"
                style={{ maxWidth: 130 }}
              />
            )}
          </div>

          {/* Category grid */}
          <div className="grid gap-2 mb-4" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(72px, 1fr))' }}>
            {categories.map(cat => {
              const isActive = category === cat.name
              return (
                <button
                  key={cat.name}
                  onClick={() => setCategory(cat.name)}
                  className="cat-chip flex flex-col items-center py-2.5 rounded-2xl"
                  style={{
                    backgroundColor: isActive ? cat.bg : '#F9FAFB',
                    border: `2px solid ${isActive ? cat.color : 'transparent'}`,
                    transform: isActive ? 'scale(1.04)' : 'scale(1)',
                    boxShadow: isActive ? `0 4px 12px ${cat.color}30` : 'none',
                  }}
                >
                  <span className="text-xl mb-0.5">{cat.icon}</span>
                  <span
                    className="text-xs font-semibold leading-tight text-center px-0.5"
                    style={{ color: isActive ? cat.color : '#9CA3AF', fontSize: 10 }}
                  >
                    {cat.name}
                  </span>
                </button>
              )
            })}
          </div>

          {/* Note */}
          <input
            type="text"
            placeholder="Add a note (optional)"
            value={note}
            onChange={e => setNote(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') save() }}
            className="w-full px-4 py-3 rounded-2xl text-sm text-gray-800 outline-none mb-4"
            style={{ backgroundColor: '#F9FAFB', border: '2px solid transparent', transition: 'border-color 0.2s' }}
            onFocus={e => { e.target.style.borderColor = '#E5E7EB' }}
            onBlur={e => { e.target.style.borderColor = 'transparent' }}
          />

          {/* Save button */}
          <button
            onClick={save}
            disabled={!amount || saving}
            className="w-full py-4 rounded-2xl text-white text-sm font-bold transition-all duration-300 disabled:opacity-40 disabled:cursor-not-allowed"
            style={{
              background: saved
                ? 'linear-gradient(135deg, #10B981 0%, #059669 100%)'
                : 'linear-gradient(135deg, #6C63FF 0%, #4338CA 100%)',
              boxShadow: saved ? '0 8px 20px rgba(16,185,129,0.3)' : amount ? '0 8px 20px rgba(108,99,255,0.3)' : 'none',
            }}
          >
            {saved
              ? '✓ Saved!'
              : saving
              ? 'Saving…'
              : `Add ${amount ? fmt(parseFloat(amount) || 0) : 'Expense'} · ${selCat.icon} ${category}`}
          </button>
        </div>

        {/* ── Expense list for selected date ── */}
        <div className="bg-white rounded-3xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="flex items-center justify-between px-5 py-3.5 border-b border-gray-50">
            <p className="text-xs font-bold text-gray-400 uppercase tracking-widest">
              {formatDateLabel(selectedDate)}'s Expenses
            </p>
            {dateExpenses.length > 0 && (
              <p className="text-xs font-bold text-gray-700">{fmt(dateTotal)}</p>
            )}
          </div>

          {dateExpenses.length > 0 ? (
            <div className="divide-y divide-gray-50">
              {dateExpenses.map(exp => {
                const cat = getCatMeta(categories, exp.category)
                return (
                  <div
                    key={exp.id}
                    className="expense-row flex items-center gap-3 px-5 py-3.5"
                    style={{ backgroundColor: hoverRow === exp.id ? '#FEF7FF' : 'transparent' }}
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
                      <p className="text-sm font-semibold text-gray-900">{exp.category}</p>
                      {exp.note
                        ? <p className="text-xs text-gray-400 truncate">{exp.note}</p>
                        : <p className="text-xs text-gray-300">{timeStr(exp.created_at)}</p>
                      }
                    </div>
                    <div className="text-right mr-2">
                      <p className="text-sm font-bold" style={{ color: '#1F2937' }}>{fmt(exp.amount)}</p>
                      {exp.note && <p className="text-xs text-gray-300">{timeStr(exp.created_at)}</p>}
                    </div>
                    <button
                      onClick={() => setDeleteId(exp.id)}
                      className="p-1.5 rounded-xl transition-all"
                      style={{
                        opacity: hoverRow === exp.id ? 1 : 0,
                        color: '#EF4444',
                        backgroundColor: hoverRow === exp.id ? '#FEE2E2' : 'transparent',
                      }}
                    >
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
                        <polyline points="3 6 5 6 21 6" />
                        <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
                        <path d="M10 11v6M14 11v6M9 6V4h6v2" />
                      </svg>
                    </button>
                  </div>
                )
              })}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <span className="text-4xl mb-3">🧾</span>
              <p className="text-sm font-semibold text-gray-400">No expenses for {formatDateLabel(selectedDate).toLowerCase()}</p>
              <p className="text-xs text-gray-300 mt-1">Add one above</p>
            </div>
          )}
        </div>
      </div>

      {/* ── Delete confirm modal ── */}
      {deleteId && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ backgroundColor: 'rgba(0,0,0,0.45)' }}
          onClick={e => { if (e.target === e.currentTarget) setDeleteId(null) }}
        >
          <div className="bg-white rounded-3xl p-6 w-full max-w-sm shadow-2xl" style={{ animation: 'popIn 0.2s ease' }}>
            <div className="flex items-center justify-center w-12 h-12 rounded-2xl mb-4" style={{ backgroundColor: '#FEE2E2' }}>
              <svg viewBox="0 0 24 24" fill="none" stroke="#EF4444" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="w-6 h-6">
                <polyline points="3 6 5 6 21 6" />
                <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
                <path d="M10 11v6M14 11v6M9 6V4h6v2" />
              </svg>
            </div>
            <p className="text-base font-bold text-gray-900 mb-1">Delete this expense?</p>
            <p className="text-sm text-gray-400 mb-5">This cannot be undone.</p>
            <div className="flex gap-3">
              <button
                onClick={() => setDeleteId(null)}
                className="flex-1 py-3 rounded-2xl text-sm font-semibold text-gray-700 transition-colors"
                style={{ border: '2px solid #F3F4F6' }}
              >
                Cancel
              </button>
              <button
                onClick={() => doDelete(deleteId)}
                className="flex-1 py-3 rounded-2xl text-white text-sm font-bold transition-colors"
                style={{ background: 'linear-gradient(135deg, #EF4444 0%, #DC2626 100%)' }}
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
