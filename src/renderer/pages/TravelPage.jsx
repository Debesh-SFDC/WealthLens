import { useState, useEffect, useCallback } from 'react'
import bridge from '../lib/bridge'
import Toast from '../components/Toast'

const fmt = v => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(v || 0)

function fmtDateShort(d) {
  if (!d) return null
  return new Date(d + 'T00:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
}
function dateRangeLabel(start, end) {
  if (!start && !end) return 'Dates not set'
  if (start && end) return `${fmtDateShort(start)} – ${fmtDateShort(end)}`
  return fmtDateShort(start || end)
}

// Same green/amber/red thresholds as Dashboard.jsx's MonthSpendCard.
function budgetColor(spent, budget) {
  const pct = budget > 0 ? Math.min(100, (spent / budget) * 100) : 0
  return budget <= 0 ? '#9CA3AF' : pct < 50 ? '#10B981' : pct <= 80 ? '#F59E0B' : '#EF4444'
}

const STATUS_META = {
  planned:   { label: 'Planned',   color: '#6366F1', bg: '#EEF2FF' },
  ongoing:   { label: 'Ongoing',   color: '#F59E0B', bg: '#FFFBEB' },
  completed: { label: 'Completed', color: '#10B981', bg: '#ECFDF5' },
}

const EMOJIS = ['✈️','🏖️','🏔️','🗺️','🎒','🚗','🚢','🏕️','🌴','🗽','🏰','🎡','🚂','⛰️','🌋','🏝️','🛶','🎿','🧳','🌍']
const COLORS = ['#6C63FF','#3B82F6','#10B981','#F59E0B','#EF4444','#8B5CF6','#EC4899','#14B8A6','#F97316','#6366F1','#84CC16','#06B6D4']

const ITINERARY_CATS = {
  activity:  { label: 'Activity',  icon: '🎯' },
  transport: { label: 'Transport', icon: '🚗' },
  food:      { label: 'Food',      icon: '🍽️' },
  stay:      { label: 'Stay',      icon: '🏨' },
  other:     { label: 'Other',     icon: '📌' },
}
const BUDGET_CATS = {
  flights:    { label: 'Flights',    icon: '✈️' },
  stay:       { label: 'Stay',       icon: '🏨' },
  food:       { label: 'Food',       icon: '🍽️' },
  transport:  { label: 'Transport',  icon: '🚗' },
  activities: { label: 'Activities', icon: '🎟️' },
  shopping:   { label: 'Shopping',   icon: '🛍️' },
  other:      { label: 'Other',      icon: '💸' },
}
const PACKING_CATS = {
  clothing:    { label: 'Clothing',    icon: '👕' },
  documents:   { label: 'Documents',   icon: '📄' },
  electronics: { label: 'Electronics', icon: '🔌' },
  toiletries:  { label: 'Toiletries',  icon: '🧴' },
  other:       { label: 'Other',       icon: '🎒' },
}
const DOC_TYPES = {
  flight:     { label: 'Flight',     icon: '✈️' },
  hotel:      { label: 'Hotel',      icon: '🏨' },
  train:      { label: 'Train',      icon: '🚂' },
  car_rental: { label: 'Car Rental', icon: '🚗' },
  insurance:  { label: 'Insurance',  icon: '🛡️' },
  other:      { label: 'Other',      icon: '📄' },
}

const BLANK_TRIP = {
  title: '', destination: '', emoji: '✈️', color: '#6C63FF',
  start_date: '', end_date: '', status: 'planned', budget_amount: '', notes: '',
}

// ── Icons ────────────────────────────────────────────────────────────────
const EditIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="w-3.5 h-3.5">
    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
  </svg>
)
const TrashIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="w-3.5 h-3.5">
    <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6M9 6V4h6v2"/>
  </svg>
)
const BackIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
    <polyline points="15 18 9 12 15 6"/>
  </svg>
)

// ── Emoji / color picker (same pattern as Goals.jsx's wizard step 2) ──────
function EmojiColorPicker({ emoji, color, onEmoji, onColor }) {
  const [showEmoji, setShowEmoji] = useState(false)
  return (
    <div className="flex gap-3 items-start">
      <div className="relative shrink-0">
        <button type="button" onClick={() => setShowEmoji(v => !v)}
          className="w-14 h-14 rounded-xl border-2 text-2xl flex items-center justify-center transition-colors hover:border-gray-300"
          style={{ borderColor: showEmoji ? color : '#e5e7eb' }}>
          {emoji}
        </button>
        {showEmoji && (
          <div className="absolute top-16 left-0 z-20 bg-white rounded-xl shadow-2xl border border-gray-100 p-3 grid grid-cols-6 gap-1 w-52">
            {EMOJIS.map(e => (
              <button key={e} type="button" onClick={() => { onEmoji(e); setShowEmoji(false) }}
                className="w-7 h-7 text-lg hover:bg-gray-100 rounded-lg flex items-center justify-center">
                {e}
              </button>
            ))}
          </div>
        )}
      </div>
      <div className="flex-1 pt-1">
        <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Color</label>
        <div className="flex gap-2 flex-wrap">
          {COLORS.map(c => (
            <button key={c} type="button" onClick={() => onColor(c)}
              className="w-6 h-6 rounded-full transition-transform hover:scale-110 shrink-0 border-2"
              style={{ backgroundColor: c, borderColor: color === c ? c : 'transparent', outline: color === c ? `2px solid ${c}` : 'none', outlineOffset: 2 }} />
          ))}
        </div>
      </div>
    </div>
  )
}

// ── Trip add/edit modal ─────────────────────────────────────────────────
function TripFormModal({ trip, onSave, onClose }) {
  const [form, setForm] = useState(trip ? {
    ...BLANK_TRIP, ...trip,
    budget_amount: trip.budget_amount ? String(trip.budget_amount) : '',
  } : BLANK_TRIP)
  const [saving, setSaving] = useState(false)
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  async function handleSubmit(e) {
    e.preventDefault()
    if (!form.title.trim()) return
    setSaving(true)
    try {
      await onSave({ ...form, budget_amount: parseFloat(form.budget_amount) || 0 })
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="bg-white rounded-2xl w-full max-w-[480px] shadow-2xl overflow-hidden max-h-[90vh] overflow-y-auto">
        <div className="px-6 py-5 border-b border-gray-100 flex items-center justify-between sticky top-0 bg-white z-10">
          <h2 className="text-lg font-bold text-gray-900">{trip ? 'Edit Trip' : 'New Trip'}</h2>
          <button onClick={onClose} className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-gray-100 transition-colors">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4 text-gray-500">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <EmojiColorPicker emoji={form.emoji} color={form.color} onEmoji={e => set('emoji', e)} onColor={c => set('color', c)} />

          <div>
            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5 block">Trip Title *</label>
            <input autoFocus required type="text" placeholder="e.g. Goa Getaway"
              value={form.title} onChange={e => set('title', e.target.value)}
              className="w-full px-4 py-2.5 rounded-xl border border-gray-200 text-sm font-medium text-gray-800 focus:outline-none focus:border-[#6C63FF] focus:ring-2 focus:ring-[#6C63FF]/20" />
          </div>

          <div>
            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5 block">Destination</label>
            <input type="text" placeholder="e.g. Goa, India"
              value={form.destination || ''} onChange={e => set('destination', e.target.value)}
              className="w-full px-4 py-2.5 rounded-xl border border-gray-200 text-sm text-gray-800 focus:outline-none focus:border-[#6C63FF] focus:ring-2 focus:ring-[#6C63FF]/20" />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5 block">Start Date</label>
              <input type="date" value={form.start_date || ''} onChange={e => set('start_date', e.target.value)}
                className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm text-gray-800 focus:outline-none focus:border-[#6C63FF]" />
            </div>
            <div>
              <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5 block">End Date</label>
              <input type="date" value={form.end_date || ''} onChange={e => set('end_date', e.target.value)}
                className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm text-gray-800 focus:outline-none focus:border-[#6C63FF]" />
            </div>
          </div>

          <div>
            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2 block">Status</label>
            <div className="flex rounded-xl border border-gray-200 overflow-hidden w-fit">
              {Object.entries(STATUS_META).map(([key, meta]) => (
                <button key={key} type="button" onClick={() => set('status', key)}
                  className="px-4 py-2 text-xs font-semibold transition-colors"
                  style={form.status === key
                    ? { backgroundColor: meta.color, color: '#fff' }
                    : { backgroundColor: '#fff', color: '#6B7280' }}>
                  {meta.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5 block">Total Budget (₹)</label>
            <input type="number" min="0" step="1" placeholder="0"
              value={form.budget_amount} onChange={e => set('budget_amount', e.target.value)}
              className="w-full px-4 py-2.5 rounded-xl border border-gray-200 text-lg font-bold text-gray-900 focus:outline-none focus:border-[#6C63FF] focus:ring-2 focus:ring-[#6C63FF]/20" />
          </div>

          <div>
            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5 block">Notes <span className="font-normal normal-case text-gray-400">optional</span></label>
            <textarea rows={2} placeholder="Optional notes…"
              value={form.notes || ''} onChange={e => set('notes', e.target.value)}
              className="w-full px-4 py-2.5 rounded-xl border border-gray-200 text-sm text-gray-800 focus:outline-none focus:border-[#6C63FF] resize-none" />
          </div>

          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose} className="flex-1 py-2.5 rounded-xl border border-gray-200 text-sm font-semibold text-gray-600 hover:bg-gray-50 transition-colors">
              Cancel
            </button>
            <button type="submit" disabled={saving || !form.title.trim()}
              className="flex-1 py-2.5 rounded-xl text-white text-sm font-semibold hover:opacity-90 transition-opacity disabled:opacity-50"
              style={{ backgroundColor: '#6C63FF' }}>
              {saving ? 'Saving…' : trip ? 'Save Changes' : 'Create Trip'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ── Trip list card ──────────────────────────────────────────────────────
function TripCard({ trip, onView, onEdit, onDelete }) {
  const status = STATUS_META[trip.status] || STATUS_META.planned
  const spent = trip.budget_spent || 0
  const budget = trip.budget_amount || 0
  const pct = budget > 0 ? Math.min(100, (spent / budget) * 100) : 0
  const color = budgetColor(spent, budget)

  return (
    <div
      className="bg-white rounded-2xl border border-gray-100 shadow-sm hover:shadow-md transition-all duration-200 cursor-pointer group overflow-hidden"
      onClick={() => onView(trip)}
    >
      <div className="h-1" style={{ backgroundColor: trip.color || '#6C63FF' }} />
      <div className="p-5">
        <div className="flex items-start justify-between mb-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center text-xl shrink-0 select-none" style={{ backgroundColor: (trip.color || '#6C63FF') + '18' }}>
              {trip.emoji || '✈️'}
            </div>
            <div className="min-w-0">
              <h3 className="font-semibold text-gray-900 leading-tight text-sm truncate">{trip.title}</h3>
              {trip.destination && <p className="text-xs text-gray-400 truncate">📍 {trip.destination}</p>}
            </div>
          </div>
          <div className="flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0" onClick={e => e.stopPropagation()}>
            <button onClick={() => onEdit(trip)} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-700 transition-colors"><EditIcon /></button>
            <button onClick={() => onDelete(trip.id)} className="p-1.5 rounded-lg hover:bg-red-50 text-gray-400 hover:text-red-500 transition-colors"><TrashIcon /></button>
          </div>
        </div>

        <span className="inline-block mb-3 px-2 py-0.5 rounded-full text-[10px] font-semibold" style={{ backgroundColor: status.bg, color: status.color }}>
          {status.label}
        </span>

        <p className="text-xs text-gray-400 mb-3">{dateRangeLabel(trip.start_date, trip.end_date)}</p>

        {budget > 0 ? (
          <>
            <div className="flex items-center justify-between mb-1">
              <span className="text-sm font-bold text-gray-900">{fmt(spent)}</span>
              <span className="text-xs text-gray-400">of {fmt(budget)}</span>
            </div>
            <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
              <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, backgroundColor: color }} />
            </div>
          </>
        ) : (
          <p className="text-xs text-gray-300">No budget set</p>
        )}
      </div>
    </div>
  )
}

// ── Itinerary tab ────────────────────────────────────────────────────────
const BLANK_ITINERARY = { day_number: 1, date: '', time: '', title: '', category: 'activity', location: '', notes: '' }

function ItineraryTab({ tripId, items, onReload, showToast }) {
  const [showForm, setShowForm] = useState(false)
  const [editItem, setEditItem] = useState(null)
  const [form, setForm] = useState(BLANK_ITINERARY)
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  function openAdd() { setEditItem(null); setForm(BLANK_ITINERARY); setShowForm(true) }
  function openEdit(item) { setEditItem(item); setForm({ ...BLANK_ITINERARY, ...item }); setShowForm(true) }

  async function save() {
    if (!form.title.trim()) return
    if (editItem) await bridge.updateItineraryItem({ ...form, id: editItem.id })
    else await bridge.createItineraryItem(tripId, form)
    setShowForm(false)
    onReload()
    showToast(editItem ? 'Itinerary item updated' : 'Itinerary item added')
  }

  async function remove(id) {
    if (!confirm('Delete this itinerary item?')) return
    await bridge.deleteItineraryItem(id)
    onReload()
    showToast('Itinerary item deleted')
  }

  const byDay = {}
  for (const item of items) {
    const d = item.day_number || 1
    if (!byDay[d]) byDay[d] = []
    byDay[d].push(item)
  }
  const days = Object.keys(byDay).map(Number).sort((a, b) => a - b)

  return (
    <div className="space-y-4">
      <button onClick={openAdd} className="flex items-center gap-2 px-4 py-2 rounded-xl text-white text-sm font-semibold hover:opacity-90 transition-opacity" style={{ backgroundColor: '#6C63FF' }}>
        <span className="text-base leading-none">+</span> Add Itinerary Item
      </button>

      {days.length === 0 ? (
        <p className="text-sm text-gray-400 text-center py-10">No itinerary items yet</p>
      ) : days.map(day => (
        <div key={day} className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="px-5 py-2.5 bg-gray-50 border-b border-gray-100">
            <span className="text-xs font-bold text-gray-500 uppercase tracking-wide">Day {day}</span>
          </div>
          <div className="divide-y divide-gray-50">
            {byDay[day].map(item => {
              const cat = ITINERARY_CATS[item.category] || ITINERARY_CATS.other
              return (
                <div key={item.id} className="flex items-center gap-3 px-5 py-3 group">
                  <div className="w-9 h-9 rounded-xl flex items-center justify-center text-base shrink-0 bg-gray-50">{cat.icon}</div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-gray-800 truncate">{item.title}</p>
                    <p className="text-xs text-gray-400 truncate">
                      {[item.time, item.location].filter(Boolean).join(' · ') || cat.label}
                    </p>
                  </div>
                  <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button onClick={() => openEdit(item)} className="w-7 h-7 rounded-lg flex items-center justify-center hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors"><EditIcon /></button>
                    <button onClick={() => remove(item.id)} className="w-7 h-7 rounded-lg flex items-center justify-center hover:bg-red-50 text-gray-400 hover:text-red-500 transition-colors"><TrashIcon /></button>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      ))}

      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4" onClick={e => e.target === e.currentTarget && setShowForm(false)}>
          <div className="bg-white rounded-2xl w-full max-w-[420px] shadow-2xl p-6 space-y-3">
            <h3 className="text-base font-bold text-gray-900 mb-1">{editItem ? 'Edit Item' : 'Add Itinerary Item'}</h3>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1 block">Day</label>
                <input type="number" min="1" value={form.day_number} onChange={e => set('day_number', parseInt(e.target.value) || 1)}
                  className="w-full px-3 py-2 rounded-xl border border-gray-200 text-sm" />
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1 block">Time</label>
                <input type="time" value={form.time || ''} onChange={e => set('time', e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-gray-200 text-sm" />
              </div>
            </div>
            <div>
              <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1 block">Title *</label>
              <input autoFocus type="text" value={form.title} onChange={e => set('title', e.target.value)}
                placeholder="e.g. Beach visit" className="w-full px-3 py-2 rounded-xl border border-gray-200 text-sm" />
            </div>
            <div>
              <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1 block">Category</label>
              <select value={form.category} onChange={e => set('category', e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-gray-200 text-sm bg-white">
                {Object.entries(ITINERARY_CATS).map(([k, m]) => <option key={k} value={k}>{m.icon} {m.label}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1 block">Location</label>
              <input type="text" value={form.location || ''} onChange={e => set('location', e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-gray-200 text-sm" />
            </div>
            <div>
              <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1 block">Notes</label>
              <textarea rows={2} value={form.notes || ''} onChange={e => set('notes', e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-gray-200 text-sm resize-none" />
            </div>
            <div className="flex gap-3 pt-2">
              <button onClick={() => setShowForm(false)} className="flex-1 py-2.5 rounded-xl border border-gray-200 text-sm font-semibold text-gray-600 hover:bg-gray-50 transition-colors">Cancel</button>
              <button onClick={save} disabled={!form.title.trim()} className="flex-1 py-2.5 rounded-xl text-white text-sm font-semibold hover:opacity-90 transition-opacity disabled:opacity-50" style={{ backgroundColor: '#6C63FF' }}>Save</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Budget tab ───────────────────────────────────────────────────────────
const BLANK_BUDGET = { category: 'other', label: '', planned_amount: '', actual_amount: '', notes: '' }

function BudgetTab({ tripId, tripBudget, items, onReload, showToast }) {
  const [showForm, setShowForm] = useState(false)
  const [editItem, setEditItem] = useState(null)
  const [form, setForm] = useState(BLANK_BUDGET)
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  function openAdd() { setEditItem(null); setForm(BLANK_BUDGET); setShowForm(true) }
  function openEdit(item) {
    setEditItem(item)
    setForm({ ...item, planned_amount: String(item.planned_amount ?? ''), actual_amount: String(item.actual_amount ?? '') })
    setShowForm(true)
  }

  async function save() {
    if (!form.label.trim()) return
    const payload = { ...form, planned_amount: parseFloat(form.planned_amount) || 0, actual_amount: parseFloat(form.actual_amount) || 0 }
    if (editItem) await bridge.updateBudgetItem({ ...payload, id: editItem.id })
    else await bridge.createBudgetItem(tripId, payload)
    setShowForm(false)
    onReload()
    showToast(editItem ? 'Budget item updated' : 'Budget item added')
  }

  async function remove(id) {
    if (!confirm('Delete this budget item?')) return
    await bridge.deleteBudgetItem(id)
    onReload()
    showToast('Budget item deleted')
  }

  const totalPlanned = items.reduce((s, i) => s + (i.planned_amount || 0), 0)
  const totalActual = items.reduce((s, i) => s + (i.actual_amount || 0), 0)
  const color = budgetColor(totalActual, tripBudget)

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
        <div className="flex items-center justify-between mb-1">
          <span className="text-sm font-bold text-gray-800">{fmt(totalActual)} spent</span>
          <span className="text-xs text-gray-400">of {fmt(tripBudget)} budget</span>
        </div>
        <div className="h-2 bg-gray-100 rounded-full overflow-hidden mb-1">
          <div className="h-full rounded-full transition-all" style={{ width: `${tripBudget > 0 ? Math.min(100, (totalActual / tripBudget) * 100) : 0}%`, backgroundColor: color }} />
        </div>
        <p className="text-xs text-gray-400">Planned total: {fmt(totalPlanned)}</p>
      </div>

      <button onClick={openAdd} className="flex items-center gap-2 px-4 py-2 rounded-xl text-white text-sm font-semibold hover:opacity-90 transition-opacity" style={{ backgroundColor: '#6C63FF' }}>
        <span className="text-base leading-none">+</span> Add Budget Item
      </button>

      {items.length === 0 ? (
        <p className="text-sm text-gray-400 text-center py-10">No budget items yet</p>
      ) : (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm divide-y divide-gray-50 overflow-hidden">
          {items.map(item => {
            const cat = BUDGET_CATS[item.category] || BUDGET_CATS.other
            return (
              <div key={item.id} className="flex items-center gap-3 px-5 py-3 group">
                <div className="w-9 h-9 rounded-xl flex items-center justify-center text-base shrink-0 bg-gray-50">{cat.icon}</div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-gray-800 truncate">{item.label}</p>
                  <p className="text-xs text-gray-400">{cat.label} · planned {fmt(item.planned_amount)}</p>
                </div>
                <p className="text-sm font-bold text-gray-900 shrink-0">{fmt(item.actual_amount)}</p>
                <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                  <button onClick={() => openEdit(item)} className="w-7 h-7 rounded-lg flex items-center justify-center hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors"><EditIcon /></button>
                  <button onClick={() => remove(item.id)} className="w-7 h-7 rounded-lg flex items-center justify-center hover:bg-red-50 text-gray-400 hover:text-red-500 transition-colors"><TrashIcon /></button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4" onClick={e => e.target === e.currentTarget && setShowForm(false)}>
          <div className="bg-white rounded-2xl w-full max-w-[420px] shadow-2xl p-6 space-y-3">
            <h3 className="text-base font-bold text-gray-900 mb-1">{editItem ? 'Edit Budget Item' : 'Add Budget Item'}</h3>
            <div>
              <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1 block">Label *</label>
              <input autoFocus type="text" value={form.label} onChange={e => set('label', e.target.value)}
                placeholder="e.g. Flights" className="w-full px-3 py-2 rounded-xl border border-gray-200 text-sm" />
            </div>
            <div>
              <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1 block">Category</label>
              <select value={form.category} onChange={e => set('category', e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-gray-200 text-sm bg-white">
                {Object.entries(BUDGET_CATS).map(([k, m]) => <option key={k} value={k}>{m.icon} {m.label}</option>)}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1 block">Planned (₹)</label>
                <input type="number" min="0" value={form.planned_amount} onChange={e => set('planned_amount', e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-gray-200 text-sm" />
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1 block">Actual (₹)</label>
                <input type="number" min="0" value={form.actual_amount} onChange={e => set('actual_amount', e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-gray-200 text-sm" />
              </div>
            </div>
            <div>
              <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1 block">Notes</label>
              <textarea rows={2} value={form.notes || ''} onChange={e => set('notes', e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-gray-200 text-sm resize-none" />
            </div>
            <div className="flex gap-3 pt-2">
              <button onClick={() => setShowForm(false)} className="flex-1 py-2.5 rounded-xl border border-gray-200 text-sm font-semibold text-gray-600 hover:bg-gray-50 transition-colors">Cancel</button>
              <button onClick={save} disabled={!form.label.trim()} className="flex-1 py-2.5 rounded-xl text-white text-sm font-semibold hover:opacity-90 transition-opacity disabled:opacity-50" style={{ backgroundColor: '#6C63FF' }}>Save</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Packing tab ──────────────────────────────────────────────────────────
function PackingTab({ tripId, items, onReload, showToast }) {
  const [showForm, setShowForm] = useState(false)
  const [name, setName] = useState('')
  const [category, setCategory] = useState('other')

  async function add() {
    if (!name.trim()) return
    await bridge.createPackingItem(tripId, { item_name: name.trim(), category })
    setName('')
    setShowForm(false)
    onReload()
    showToast('Packing item added')
  }

  async function toggle(item) {
    await bridge.updatePackingItem({ ...item, is_packed: !item.is_packed })
    onReload()
  }

  async function remove(id) {
    await bridge.deletePackingItem(id)
    onReload()
    showToast('Packing item removed')
  }

  const packedCount = items.filter(i => i.is_packed).length
  const byCat = {}
  for (const item of items) {
    const c = item.category || 'other'
    if (!byCat[c]) byCat[c] = []
    byCat[c].push(item)
  }

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 flex items-center justify-between">
        <span className="text-sm font-bold text-gray-800">{packedCount}/{items.length} packed</span>
        <div className="w-32 h-2 bg-gray-100 rounded-full overflow-hidden">
          <div className="h-full rounded-full bg-[#10B981] transition-all" style={{ width: `${items.length ? (packedCount / items.length) * 100 : 0}%` }} />
        </div>
      </div>

      {!showForm ? (
        <button onClick={() => setShowForm(true)} className="flex items-center gap-2 px-4 py-2 rounded-xl text-white text-sm font-semibold hover:opacity-90 transition-opacity" style={{ backgroundColor: '#6C63FF' }}>
          <span className="text-base leading-none">+</span> Add Packing Item
        </button>
      ) : (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 flex gap-2 flex-wrap items-center">
          <input autoFocus type="text" placeholder="Item name" value={name} onChange={e => setName(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && add()}
            className="flex-1 min-w-[140px] px-3 py-2 rounded-xl border border-gray-200 text-sm" />
          <select value={category} onChange={e => setCategory(e.target.value)} className="px-3 py-2 rounded-xl border border-gray-200 text-sm bg-white">
            {Object.entries(PACKING_CATS).map(([k, m]) => <option key={k} value={k}>{m.icon} {m.label}</option>)}
          </select>
          <button onClick={add} disabled={!name.trim()} className="px-4 py-2 rounded-xl text-white text-sm font-semibold hover:opacity-90 transition-opacity disabled:opacity-50" style={{ backgroundColor: '#6C63FF' }}>Add</button>
          <button onClick={() => setShowForm(false)} className="px-3 py-2 rounded-xl text-sm font-semibold text-gray-500 hover:bg-gray-50">Cancel</button>
        </div>
      )}

      {items.length === 0 ? (
        <p className="text-sm text-gray-400 text-center py-10">No packing items yet</p>
      ) : Object.entries(byCat).map(([catKey, catItems]) => {
        const cat = PACKING_CATS[catKey] || PACKING_CATS.other
        return (
          <div key={catKey} className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="px-5 py-2.5 bg-gray-50 border-b border-gray-100">
              <span className="text-xs font-bold text-gray-500 uppercase tracking-wide">{cat.icon} {cat.label}</span>
            </div>
            <div className="divide-y divide-gray-50">
              {catItems.map(item => (
                <div key={item.id} className="flex items-center gap-3 px-5 py-3 group">
                  <button onClick={() => toggle(item)}
                    className="w-5 h-5 rounded-md border-2 flex items-center justify-center shrink-0 transition-colors"
                    style={{ borderColor: item.is_packed ? '#10B981' : '#D1D5DB', backgroundColor: item.is_packed ? '#10B981' : 'transparent' }}>
                    {item.is_packed && (
                      <svg viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" className="w-3 h-3">
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                    )}
                  </button>
                  <span className={`flex-1 text-sm ${item.is_packed ? 'text-gray-400 line-through' : 'text-gray-800 font-medium'}`}>{item.item_name}</span>
                  <button onClick={() => remove(item.id)} className="w-7 h-7 rounded-lg flex items-center justify-center opacity-0 group-hover:opacity-100 hover:bg-red-50 text-gray-400 hover:text-red-500 transition-colors"><TrashIcon /></button>
                </div>
              ))}
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ── Documents tab ────────────────────────────────────────────────────────
const BLANK_DOC = { doc_type: 'other', title: '', details: '' }

function DocumentsTab({ tripId, items, onReload, showToast }) {
  const [showForm, setShowForm] = useState(false)
  const [editItem, setEditItem] = useState(null)
  const [form, setForm] = useState(BLANK_DOC)
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  function openAdd() { setEditItem(null); setForm(BLANK_DOC); setShowForm(true) }
  function openEdit(item) { setEditItem(item); setForm({ ...BLANK_DOC, ...item }); setShowForm(true) }

  async function save() {
    if (!form.title.trim()) return
    if (editItem) await bridge.updateDocument({ ...form, id: editItem.id })
    else await bridge.createDocument(tripId, form)
    setShowForm(false)
    onReload()
    showToast(editItem ? 'Document updated' : 'Document added')
  }

  async function remove(id) {
    if (!confirm('Delete this document?')) return
    await bridge.deleteDocument(id)
    onReload()
    showToast('Document deleted')
  }

  return (
    <div className="space-y-4">
      <button onClick={openAdd} className="flex items-center gap-2 px-4 py-2 rounded-xl text-white text-sm font-semibold hover:opacity-90 transition-opacity" style={{ backgroundColor: '#6C63FF' }}>
        <span className="text-base leading-none">+</span> Add Document
      </button>

      {items.length === 0 ? (
        <p className="text-sm text-gray-400 text-center py-10">No documents yet</p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {items.map(item => {
            const type = DOC_TYPES[item.doc_type] || DOC_TYPES.other
            return (
              <div key={item.id} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 group">
                <div className="flex items-start justify-between mb-2">
                  <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-gray-100 text-gray-500">{type.icon} {type.label}</span>
                  <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button onClick={() => openEdit(item)} className="w-7 h-7 rounded-lg flex items-center justify-center hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors"><EditIcon /></button>
                    <button onClick={() => remove(item.id)} className="w-7 h-7 rounded-lg flex items-center justify-center hover:bg-red-50 text-gray-400 hover:text-red-500 transition-colors"><TrashIcon /></button>
                  </div>
                </div>
                <p className="text-sm font-semibold text-gray-900 mb-1">{item.title}</p>
                {item.details && <p className="text-xs text-gray-500 whitespace-pre-wrap">{item.details}</p>}
              </div>
            )
          })}
        </div>
      )}

      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4" onClick={e => e.target === e.currentTarget && setShowForm(false)}>
          <div className="bg-white rounded-2xl w-full max-w-[420px] shadow-2xl p-6 space-y-3">
            <h3 className="text-base font-bold text-gray-900 mb-1">{editItem ? 'Edit Document' : 'Add Document'}</h3>
            <div>
              <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1 block">Type</label>
              <select value={form.doc_type} onChange={e => set('doc_type', e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-gray-200 text-sm bg-white">
                {Object.entries(DOC_TYPES).map(([k, m]) => <option key={k} value={k}>{m.icon} {m.label}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1 block">Title *</label>
              <input autoFocus type="text" value={form.title} onChange={e => set('title', e.target.value)}
                placeholder="e.g. Return flight booking" className="w-full px-3 py-2 rounded-xl border border-gray-200 text-sm" />
            </div>
            <div>
              <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1 block">Details</label>
              <textarea rows={4} value={form.details || ''} onChange={e => set('details', e.target.value)}
                placeholder="Booking reference, flight number, dates…"
                className="w-full px-3 py-2 rounded-xl border border-gray-200 text-sm resize-none" />
            </div>
            <div className="flex gap-3 pt-2">
              <button onClick={() => setShowForm(false)} className="flex-1 py-2.5 rounded-xl border border-gray-200 text-sm font-semibold text-gray-600 hover:bg-gray-50 transition-colors">Cancel</button>
              <button onClick={save} disabled={!form.title.trim()} className="flex-1 py-2.5 rounded-xl text-white text-sm font-semibold hover:opacity-90 transition-opacity disabled:opacity-50" style={{ backgroundColor: '#6C63FF' }}>Save</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Companions tab ───────────────────────────────────────────────────────
function CompanionsTab({ tripId, items, onReload, showToast }) {
  const [showForm, setShowForm] = useState(false)
  const [name, setName] = useState('')
  const [relation, setRelation] = useState('')

  async function add() {
    if (!name.trim()) return
    await bridge.createCompanion(tripId, { name: name.trim(), relation: relation.trim() || null })
    setName(''); setRelation(''); setShowForm(false)
    onReload()
    showToast('Companion added')
  }

  async function remove(id) {
    await bridge.deleteCompanion(id)
    onReload()
    showToast('Companion removed')
  }

  return (
    <div className="space-y-4">
      {!showForm ? (
        <button onClick={() => setShowForm(true)} className="flex items-center gap-2 px-4 py-2 rounded-xl text-white text-sm font-semibold hover:opacity-90 transition-opacity" style={{ backgroundColor: '#6C63FF' }}>
          <span className="text-base leading-none">+</span> Add Companion
        </button>
      ) : (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 flex gap-2 flex-wrap items-center">
          <input autoFocus type="text" placeholder="Name" value={name} onChange={e => setName(e.target.value)}
            className="flex-1 min-w-[120px] px-3 py-2 rounded-xl border border-gray-200 text-sm" />
          <input type="text" placeholder="Relation (optional)" value={relation} onChange={e => setRelation(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && add()}
            className="flex-1 min-w-[120px] px-3 py-2 rounded-xl border border-gray-200 text-sm" />
          <button onClick={add} disabled={!name.trim()} className="px-4 py-2 rounded-xl text-white text-sm font-semibold hover:opacity-90 transition-opacity disabled:opacity-50" style={{ backgroundColor: '#6C63FF' }}>Add</button>
          <button onClick={() => setShowForm(false)} className="px-3 py-2 rounded-xl text-sm font-semibold text-gray-500 hover:bg-gray-50">Cancel</button>
        </div>
      )}

      {items.length === 0 ? (
        <p className="text-sm text-gray-400 text-center py-10">No companions added yet</p>
      ) : (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm divide-y divide-gray-50 overflow-hidden">
          {items.map(item => (
            <div key={item.id} className="flex items-center gap-3 px-5 py-3 group">
              <div className="w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold text-white shrink-0" style={{ backgroundColor: '#6C63FF' }}>
                {item.name.charAt(0).toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-gray-800 truncate">{item.name}</p>
                {item.relation && <p className="text-xs text-gray-400 truncate">{item.relation}</p>}
              </div>
              <button onClick={() => remove(item.id)} className="w-7 h-7 rounded-lg flex items-center justify-center opacity-0 group-hover:opacity-100 hover:bg-red-50 text-gray-400 hover:text-red-500 transition-colors"><TrashIcon /></button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Trip detail view ─────────────────────────────────────────────────────
const TABS = [
  { id: 'itinerary', label: 'Itinerary' },
  { id: 'budget', label: 'Budget' },
  { id: 'packing', label: 'Packing' },
  { id: 'documents', label: 'Documents' },
  { id: 'companions', label: 'Companions' },
]

function TripDetail({ trip, loading, onBack, onEdit, onDelete, onReload, showToast }) {
  const [tab, setTab] = useState('itinerary')

  if (loading || !trip) {
    return (
      <div className="p-4 sm:p-6 max-w-4xl mx-auto">
        <button onClick={onBack} className="flex items-center gap-1.5 text-sm font-semibold text-gray-500 hover:text-gray-800 mb-4"><BackIcon /> Back to Trips</button>
        <div className="h-40 bg-white rounded-2xl border border-gray-100 animate-pulse" />
      </div>
    )
  }

  const status = STATUS_META[trip.status] || STATUS_META.planned

  return (
    <div className="p-4 sm:p-6 max-w-4xl mx-auto space-y-5">
      <button onClick={onBack} className="flex items-center gap-1.5 text-sm font-semibold text-gray-500 hover:text-gray-800"><BackIcon /> Back to Trips</button>

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 sm:p-6">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-14 h-14 rounded-2xl flex items-center justify-center text-3xl shrink-0" style={{ backgroundColor: (trip.color || '#6C63FF') + '18' }}>
              {trip.emoji || '✈️'}
            </div>
            <div className="min-w-0">
              <h2 className="text-xl font-bold text-gray-900 truncate">{trip.title}</h2>
              {trip.destination && <p className="text-sm text-gray-400 truncate">📍 {trip.destination}</p>}
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <span className="px-3 py-1 rounded-full text-xs font-semibold" style={{ backgroundColor: status.bg, color: status.color }}>{status.label}</span>
            <button onClick={() => onEdit(trip)} className="p-2 rounded-xl hover:bg-gray-100 text-gray-400 hover:text-gray-700 transition-colors"><EditIcon /></button>
            <button onClick={() => onDelete(trip.id)} className="p-2 rounded-xl hover:bg-red-50 text-gray-400 hover:text-red-500 transition-colors"><TrashIcon /></button>
          </div>
        </div>

        <p className="text-sm text-gray-500 mt-3">{dateRangeLabel(trip.start_date, trip.end_date)}</p>
        {trip.notes && <p className="text-sm text-gray-500 mt-2 whitespace-pre-wrap">{trip.notes}</p>}

        {trip.budget_amount > 0 && (
          <div className="mt-4">
            <div className="flex items-center justify-between mb-1">
              <span className="text-sm font-bold text-gray-900">{fmt(trip.budget_spent)} spent</span>
              <span className="text-xs text-gray-400">of {fmt(trip.budget_amount)}</span>
            </div>
            <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
              <div className="h-full rounded-full transition-all" style={{ width: `${Math.min(100, (trip.budget_spent / trip.budget_amount) * 100)}%`, backgroundColor: budgetColor(trip.budget_spent, trip.budget_amount) }} />
            </div>
          </div>
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-gray-100 rounded-xl p-1 overflow-x-auto">
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className="flex-1 min-w-[90px] py-2 rounded-lg text-xs font-semibold transition-all whitespace-nowrap"
            style={{ backgroundColor: tab === t.id ? '#6C63FF' : 'transparent', color: tab === t.id ? 'white' : '#6B7280' }}>
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'itinerary' && <ItineraryTab tripId={trip.id} items={trip.itinerary || []} onReload={onReload} showToast={showToast} />}
      {tab === 'budget' && <BudgetTab tripId={trip.id} tripBudget={trip.budget_amount || 0} items={trip.budgetItems || []} onReload={onReload} showToast={showToast} />}
      {tab === 'packing' && <PackingTab tripId={trip.id} items={trip.packingItems || []} onReload={onReload} showToast={showToast} />}
      {tab === 'documents' && <DocumentsTab tripId={trip.id} items={trip.documents || []} onReload={onReload} showToast={showToast} />}
      {tab === 'companions' && <CompanionsTab tripId={trip.id} items={trip.companions || []} onReload={onReload} showToast={showToast} />}
    </div>
  )
}

// ── Main page ────────────────────────────────────────────────────────────
export default function TravelPage() {
  const [trips, setTrips] = useState([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editTrip, setEditTrip] = useState(null)
  const [selectedTripId, setSelectedTripId] = useState(null)
  const [tripDetail, setTripDetail] = useState(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [toast, setToast] = useState({ visible: false, message: '', type: 'success' })

  function showToast(message, type = 'success') {
    setToast({ visible: true, message, type })
  }

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const data = await bridge.getAllTrips()
      setTrips(data || [])
    } catch (e) {
      console.error(e)
      setTrips([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const loadDetail = useCallback(async (id) => {
    setDetailLoading(true)
    try {
      const data = await bridge.getTripById(id)
      setTripDetail(data)
    } catch (e) {
      console.error(e)
    } finally {
      setDetailLoading(false)
    }
  }, [])

  function openDetail(trip) {
    setSelectedTripId(trip.id)
    loadDetail(trip.id)
  }
  function closeDetail() {
    setSelectedTripId(null)
    setTripDetail(null)
    load()
  }
  function reloadDetail() {
    if (selectedTripId) loadDetail(selectedTripId)
    load()
  }

  function openAdd() { setEditTrip(null); setShowForm(true) }
  function openEdit(trip) { setEditTrip(trip); setShowForm(true) }

  async function handleSaveTrip(data) {
    if (editTrip) {
      await bridge.updateTrip({ ...data, id: editTrip.id })
      showToast('Trip updated')
    } else {
      await bridge.createTrip(data)
      showToast('Trip created')
    }
    setShowForm(false)
    setEditTrip(null)
    await load()
    if (selectedTripId) loadDetail(selectedTripId)
  }

  async function handleDeleteTrip(id) {
    if (!confirm('Delete this trip? This removes its itinerary, budget, packing list, documents, and companions too.')) return
    await bridge.deleteTrip(id)
    showToast('Trip deleted')
    if (selectedTripId === id) closeDetail()
    else load()
  }

  if (selectedTripId) {
    return (
      <>
        <TripDetail
          trip={tripDetail}
          loading={detailLoading}
          onBack={closeDetail}
          onEdit={openEdit}
          onDelete={handleDeleteTrip}
          onReload={reloadDetail}
          showToast={showToast}
        />
        {showForm && <TripFormModal trip={editTrip} onSave={handleSaveTrip} onClose={() => { setShowForm(false); setEditTrip(null) }} />}
        <Toast message={toast.message} type={toast.type} visible={toast.visible} onHide={() => setToast(t => ({ ...t, visible: false }))} />
      </>
    )
  }

  return (
    <div className="p-4 sm:p-8">
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Travel</h2>
          <p className="text-sm text-gray-500 mt-0.5">Plan trips, track itineraries and budgets</p>
        </div>
        <button onClick={openAdd} className="flex items-center gap-2 px-4 py-2 rounded-xl text-white text-sm font-semibold hover:opacity-90 transition-opacity" style={{ backgroundColor: '#6C63FF' }}>
          <span className="text-lg leading-none">+</span> New Trip
        </button>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3].map(i => <div key={i} className="h-48 bg-white rounded-2xl border border-gray-100 animate-pulse" />)}
        </div>
      ) : trips.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-64 rounded-2xl bg-white border border-dashed border-gray-200">
          <p className="text-4xl mb-3">🧳</p>
          <p className="text-base font-semibold text-gray-700">No trips yet</p>
          <p className="text-sm text-gray-400 mt-1">Plan your first trip to get started</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {trips.map(trip => (
            <TripCard key={trip.id} trip={trip} onView={openDetail} onEdit={openEdit} onDelete={handleDeleteTrip} />
          ))}
        </div>
      )}

      {showForm && <TripFormModal trip={editTrip} onSave={handleSaveTrip} onClose={() => { setShowForm(false); setEditTrip(null) }} />}

      <Toast message={toast.message} type={toast.type} visible={toast.visible} onHide={() => setToast(t => ({ ...t, visible: false }))} />
    </div>
  )
}
