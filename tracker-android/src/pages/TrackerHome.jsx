import { useState, useEffect, useCallback } from 'react'
import {
  getAllExpenses, createExpense, deleteExpense,
  getExpenseCategories, getTrackerBudget, getUserName,
  logWeight, getWeightLogs,
} from '../db/index.js'

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
const yesterdayStr = () => { const d = new Date(); d.setDate(d.getDate()-1); return d.toISOString().split('T')[0] }

function getCat(cats, name) { return cats.find(c => c.name === name) || { icon: '💸', color: '#8B93A5', bg: '#F8FAFC' } }

function formatDateLabel(d) {
  if (d === todayStr()) return 'Today'
  if (d === yesterdayStr()) return 'Yesterday'
  return new Date(d + 'T12:00:00').toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' })
}

function getGreeting(name) {
  const h = new Date().getHours()
  const e = h < 12 ? '☀️' : h < 17 ? '🌤️' : h < 21 ? '🌙' : '✨'
  const t = h < 12 ? 'morning' : h < 17 ? 'afternoon' : h < 21 ? 'evening' : 'night'
  return `Good ${t}, ${name} ${e}`
}

function timeStr(c) {
  if (!c) return ''
  return new Date(c).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })
}

export default function TrackerHome() {
  const today     = todayStr()
  const yesterday = yesterdayStr()

  const [userName, setUserName]     = useState('You')
  const [amount, setAmount]         = useState('')
  const [category, setCategory]     = useState('Food')
  const [note, setNote]             = useState('')
  const [selectedDate, setSelectedDate] = useState(today)
  const [showPicker, setShowPicker] = useState(false)
  const [saved, setSaved]           = useState(false)
  const [saving, setSaving]         = useState(false)
  const [expenses, setExpenses]     = useState([])
  const [budget, setBudget]         = useState(0)
  const [cats, setCats]             = useState(DEFAULT_CATS)
  const [deleteId, setDeleteId]     = useState(null)
  const [showForm, setShowForm]     = useState(false)
  const [weightInput, setWeightInput]   = useState('')
  const [weightSaving, setWeightSaving] = useState(false)
  const [weightSaved, setWeightSaved]   = useState(false)
  const [todayWeight, setTodayWeight]   = useState(null)

  const month = selectedDate.slice(0, 7)

  const load = useCallback(async () => {
    try {
      const [data, b, name, dbCats, wLogs] = await Promise.all([
        getAllExpenses({ month }),
        getTrackerBudget(),
        getUserName(),
        getExpenseCategories(),
        getWeightLogs({ from: today, to: today }),
      ])
      setExpenses(data)
      setBudget(b || 0)
      setUserName(name)
      if (wLogs?.[0]) {
        setTodayWeight(wLogs[0])
        setWeightInput(String(wLogs[0].weight_kg))
      }
      if (dbCats?.length) {
        const merged = [...DEFAULT_CATS]
        for (const c of dbCats) {
          if (!merged.find(m => m.name === c.name)) merged.push({ name: c.name, icon: c.icon || '💸', color: c.color || '#8B93A5', bg: '#F8FAFC' })
        }
        setCats(merged)
      }
    } catch {}
  }, [month])

  useEffect(() => { load() }, [load])

  const dateExpenses = expenses.filter(e => e.date === selectedDate)
  const dateTotal    = dateExpenses.reduce((s, e) => s + e.amount, 0)
  const monthTotal   = expenses.reduce((s, e) => s + e.amount, 0)
  const budgetPct    = budget > 0 ? Math.min((monthTotal / budget) * 100, 100) : 0
  const budgetLeft   = budget - monthTotal
  const selCat       = getCat(cats, category)

  async function save() {
    const amt = parseFloat(amount)
    if (!amt || amt <= 0 || saving) return
    setSaving(true)
    try {
      await createExpense({ amount: amt, category, note: note.trim() || null, date: selectedDate })
      setAmount('')
      setNote('')
      setSaved(true)
      setShowForm(false)
      setTimeout(() => setSaved(false), 1800)
      await load()
    } finally { setSaving(false) }
  }

  async function doDelete(id) {
    await deleteExpense(id)
    setDeleteId(null)
    await load()
  }

  async function saveWeight() {
    const kg = parseFloat(weightInput)
    if (!kg || kg <= 0 || weightSaving) return
    setWeightSaving(true)
    try {
      await logWeight({ weightKg: kg, date: today })
      setTodayWeight({ weight_kg: kg, date: today })
      setWeightSaved(true)
      setTimeout(() => setWeightSaved(false), 1800)
    } finally { setWeightSaving(false) }
  }

  return (
    <>
      <style>{`
        @keyframes slideUp {
          from { transform: translateY(100%); }
          to   { transform: translateY(0); }
        }
        @keyframes fadeIn {
          from { opacity: 0; }
          to   { opacity: 1; }
        }
        .slide-up { animation: slideUp 0.3s cubic-bezier(0.34,1.56,0.64,1); }
        .fade-in  { animation: fadeIn  0.25s ease; }
        .cat-btn:active { transform: scale(0.93) !important; }
      `}</style>

      <div className="pb-20" style={{ minHeight: '100vh', background: '#F8F9FF' }}>

        {/* Header */}
        <div
          className="px-5 pt-14 pb-5 relative overflow-hidden"
          style={{ background: 'linear-gradient(135deg, #6C63FF 0%, #4338CA 100%)' }}
        >
          <div className="absolute rounded-full" style={{ width: 200, height: 200, top: -80, right: -50, background: 'rgba(255,255,255,0.06)' }} />
          <p className="text-white/70 text-sm font-medium relative z-10">{getGreeting(userName)}</p>
          <div className="flex items-end justify-between mt-3 relative z-10">
            <div>
              <p className="text-white/60 text-xs mb-1">{formatDateLabel(selectedDate)}'s spend</p>
              <p className="text-white text-4xl font-extrabold">{fmt(dateTotal)}</p>
              <p className="text-white/50 text-xs mt-1">{dateExpenses.length} transaction{dateExpenses.length !== 1 ? 's' : ''}</p>
            </div>
            {budget > 0 && (
              <div className="text-right">
                <p className="text-white/50 text-xs">Month</p>
                <p className="text-white text-xl font-bold">{fmt(monthTotal)}</p>
                <p className="text-xs font-semibold" style={{ color: budgetLeft < 0 ? '#FCA5A5' : '#86EFAC' }}>
                  {budgetLeft < 0 ? `Over ${fmt(Math.abs(budgetLeft))}` : `${fmt(budgetLeft)} left`}
                </p>
              </div>
            )}
          </div>
          {budget > 0 && (
            <div className="mt-4 relative z-10">
              <div className="h-1.5 rounded-full" style={{ backgroundColor: 'rgba(255,255,255,0.2)' }}>
                <div className="h-full rounded-full transition-all duration-700"
                  style={{
                    width: `${budgetPct}%`,
                    backgroundColor: budgetPct >= 90 ? '#FCA5A5' : budgetPct >= 70 ? '#FDE68A' : 'rgba(255,255,255,0.9)',
                  }}
                />
              </div>
            </div>
          )}
        </div>

        {/* Morning Weight card */}
        <div className="px-4 pt-4 pb-2">
          <div className="bg-white rounded-3xl p-4 shadow-sm">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <span style={{ fontSize: 20 }}>⚖️</span>
                <p className="text-sm font-bold text-gray-800">Morning Weight</p>
              </div>
              {todayWeight && (
                <span className="text-xs font-semibold px-2.5 py-1 rounded-full"
                  style={{ backgroundColor: '#ECFDF5', color: '#059669' }}>
                  {todayWeight.weight_kg} kg ✓
                </span>
              )}
            </div>
            <div className="flex gap-3">
              <div className="flex items-center gap-2 flex-1 px-4 py-3 rounded-2xl"
                style={{ backgroundColor: '#F9FAFB' }}>
                <input
                  type="number" placeholder="0.0" step="0.1" min="20" max="300"
                  value={weightInput} onChange={e => setWeightInput(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') saveWeight() }}
                  className="flex-1 text-sm font-bold text-gray-900 bg-transparent outline-none"
                  style={{ minWidth: 0 }}
                />
                <span className="text-xs font-semibold text-gray-400">kg</span>
              </div>
              <button onClick={saveWeight}
                disabled={!weightInput || weightSaving}
                className="px-5 py-3 rounded-2xl text-white text-sm font-bold disabled:opacity-40"
                style={{ background: weightSaved ? 'linear-gradient(135deg,#10B981,#059669)' : 'linear-gradient(135deg,#6C63FF,#4338CA)' }}>
                {weightSaved ? '✓' : todayWeight ? 'Update' : 'Log'}
              </button>
            </div>
          </div>
        </div>

        {/* Date tabs */}
        <div className="flex gap-2 px-4 pt-2 pb-2 overflow-x-auto" style={{ scrollbarWidth: 'none' }}>
          {[{ label: 'Today', val: today }, { label: 'Yesterday', val: yesterday }].map(({ label, val }) => (
            <button
              key={val}
              onClick={() => { setSelectedDate(val); setShowPicker(false) }}
              className="shrink-0 px-4 py-2 rounded-full text-xs font-bold transition-all"
              style={{
                backgroundColor: selectedDate === val && !showPicker ? '#6C63FF' : 'white',
                color: selectedDate === val && !showPicker ? 'white' : '#6B7280',
                boxShadow: '0 1px 4px rgba(0,0,0,0.08)',
              }}
            >
              {label}
            </button>
          ))}
          <button
            onClick={() => setShowPicker(v => !v)}
            className="shrink-0 px-4 py-2 rounded-full text-xs font-bold transition-all flex items-center gap-1"
            style={{
              backgroundColor: showPicker || (selectedDate !== today && selectedDate !== yesterday) ? '#6C63FF' : 'white',
              color: showPicker || (selectedDate !== today && selectedDate !== yesterday) ? 'white' : '#6B7280',
              boxShadow: '0 1px 4px rgba(0,0,0,0.08)',
            }}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" style={{ width: 12, height: 12 }}>
              <rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>
            </svg>
            {showPicker || (selectedDate !== today && selectedDate !== yesterday)
              ? formatDateLabel(selectedDate)
              : 'Pick date'}
          </button>
          {showPicker && (
            <input
              type="date" value={selectedDate} max={today}
              onChange={e => { if (e.target.value) setSelectedDate(e.target.value) }}
              className="shrink-0 text-xs text-gray-700 outline-none border border-gray-200 rounded-xl px-3 py-2 bg-white"
            />
          )}
        </div>

        {/* Expense list */}
        <div className="px-4 pb-4">
          {dateExpenses.length > 0 ? (
            <div className="bg-white rounded-3xl overflow-hidden shadow-sm">
              <div className="px-5 py-3 border-b border-gray-50 flex justify-between">
                <p className="text-xs font-bold text-gray-400 uppercase tracking-widest">Expenses</p>
                <p className="text-xs font-bold text-gray-700">{fmt(dateTotal)}</p>
              </div>
              <div className="divide-y divide-gray-50">
                {dateExpenses.map(exp => {
                  const cat = getCat(cats, exp.category)
                  return (
                    <div key={exp.id} className="flex items-center gap-3 px-5 py-3.5">
                      <div className="flex items-center justify-center rounded-2xl shrink-0 text-xl"
                        style={{ width: 44, height: 44, backgroundColor: cat.bg }}>
                        {cat.icon}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-gray-900">{exp.category}</p>
                        <p className="text-xs text-gray-400">{exp.note || timeStr(exp.created_at)}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-bold text-gray-900">{fmt(exp.amount)}</p>
                        {exp.note && <p className="text-xs text-gray-300">{timeStr(exp.created_at)}</p>}
                      </div>
                      <button onClick={() => setDeleteId(exp.id)} className="p-2 rounded-xl" style={{ color: '#EF4444' }}>
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
                          <polyline points="3 6 5 6 21 6"/>
                          <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6M10 11v6M14 11v6M9 6V4h6v2"/>
                        </svg>
                      </button>
                    </div>
                  )
                })}
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center py-16 text-center">
              <span className="text-5xl mb-3">🧾</span>
              <p className="text-sm font-semibold text-gray-400">No expenses for {formatDateLabel(selectedDate).toLowerCase()}</p>
            </div>
          )}
        </div>
      </div>

      {/* FAB */}
      <button
        onClick={() => setShowForm(true)}
        className="fixed flex items-center gap-2 px-5 py-3.5 rounded-full text-white font-bold shadow-lg"
        style={{
          bottom: 82, right: 20, zIndex: 90,
          background: 'linear-gradient(135deg, #6C63FF, #4338CA)',
          boxShadow: '0 8px 24px rgba(108,99,255,0.4)',
          fontSize: 15,
        }}
      >
        <span style={{ fontSize: 20, lineHeight: 1 }}>+</span> Add Expense
      </button>

      {/* Add Expense bottom sheet */}
      {showForm && (
        <div
          className="fixed inset-0 z-50 flex flex-col justify-end fade-in"
          style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}
          onClick={e => { if (e.target === e.currentTarget) setShowForm(false) }}
        >
          <div className="bg-white rounded-t-3xl px-5 pt-5 pb-10 slide-up" style={{ maxHeight: '90vh', overflowY: 'auto' }}>
            <div className="flex items-center justify-between mb-5">
              <p className="text-base font-bold text-gray-900">Add Expense</p>
              <button onClick={() => setShowForm(false)} className="p-2 rounded-xl" style={{ backgroundColor: '#F3F4F6', color: '#6B7280' }}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
                  <path d="M18 6L6 18M6 6l12 12"/>
                </svg>
              </button>
            </div>

            {/* Amount */}
            <div className="flex items-center gap-2 rounded-2xl px-4 py-3 mb-4"
              style={{ backgroundColor: '#F9FAFB', border: '2px solid #EEF2FF' }}>
              <span className="text-3xl font-black" style={{ color: '#6C63FF' }}>₹</span>
              <input
                type="number" min="0" step="1" placeholder="0" autoFocus
                value={amount}
                onChange={e => setAmount(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') save() }}
                className="flex-1 text-4xl font-extrabold text-gray-900 bg-transparent outline-none"
                style={{ minWidth: 0 }}
              />
            </div>

            {/* Date */}
            <div className="flex items-center gap-2 mb-4 flex-wrap">
              <span className="text-xs font-semibold text-gray-500">Date:</span>
              {[{ label: 'Today', val: today }, { label: 'Yesterday', val: yesterday }].map(({ label, val }) => (
                <button key={val} onClick={() => setSelectedDate(val)}
                  className="px-3 py-1.5 rounded-full text-xs font-semibold"
                  style={{ backgroundColor: selectedDate === val ? '#EEF2FF' : '#F3F4F6', color: selectedDate === val ? '#6C63FF' : '#6B7280' }}>
                  {label}
                </button>
              ))}
              <input
                type="date" value={selectedDate} max={today}
                onChange={e => { if (e.target.value) setSelectedDate(e.target.value) }}
                className="text-xs text-gray-700 outline-none border border-gray-200 rounded-xl px-2 py-1.5 bg-white"
              />
            </div>

            {/* Categories */}
            <div className="grid gap-2 mb-4" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(70px, 1fr))' }}>
              {cats.map(cat => {
                const isActive = category === cat.name
                return (
                  <button key={cat.name} onClick={() => setCategory(cat.name)}
                    className="cat-btn flex flex-col items-center py-2.5 rounded-2xl transition-all"
                    style={{
                      backgroundColor: isActive ? cat.bg : '#F9FAFB',
                      border: `2px solid ${isActive ? cat.color : 'transparent'}`,
                      boxShadow: isActive ? `0 4px 12px ${cat.color}30` : 'none',
                    }}>
                    <span className="text-2xl mb-0.5">{cat.icon}</span>
                    <span className="font-semibold text-center" style={{ fontSize: 10, color: isActive ? cat.color : '#9CA3AF' }}>
                      {cat.name}
                    </span>
                  </button>
                )
              })}
            </div>

            {/* Note */}
            <input
              type="text" placeholder="Add a note (optional)"
              value={note} onChange={e => setNote(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') save() }}
              className="w-full px-4 py-3 rounded-2xl text-sm text-gray-800 outline-none mb-4"
              style={{ backgroundColor: '#F9FAFB', border: '2px solid transparent' }}
            />

            {/* Save */}
            <button
              onClick={save}
              disabled={!amount || saving}
              className="w-full py-4 rounded-2xl text-white text-sm font-bold disabled:opacity-40"
              style={{
                background: saved
                  ? 'linear-gradient(135deg, #10B981, #059669)'
                  : 'linear-gradient(135deg, #6C63FF, #4338CA)',
                boxShadow: '0 8px 20px rgba(108,99,255,0.3)',
              }}
            >
              {saved ? '✓ Saved!' : saving ? 'Saving…' : `Add ${amount ? fmt(parseFloat(amount) || 0) : ''} · ${selCat.icon} ${category}`}
            </button>
          </div>
        </div>
      )}

      {/* Delete confirm */}
      {deleteId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 fade-in"
          style={{ backgroundColor: 'rgba(0,0,0,0.45)' }}
          onClick={e => { if (e.target === e.currentTarget) setDeleteId(null) }}>
          <div className="bg-white rounded-3xl p-6 w-full max-w-sm shadow-2xl">
            <p className="text-base font-bold text-gray-900 mb-1">Delete expense?</p>
            <p className="text-sm text-gray-400 mb-5">This cannot be undone.</p>
            <div className="flex gap-3">
              <button onClick={() => setDeleteId(null)}
                className="flex-1 py-3 rounded-2xl text-sm font-semibold text-gray-700 border border-gray-200">Cancel</button>
              <button onClick={() => doDelete(deleteId)}
                className="flex-1 py-3 rounded-2xl text-white text-sm font-bold"
                style={{ background: 'linear-gradient(135deg,#EF4444,#DC2626)' }}>Delete</button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
