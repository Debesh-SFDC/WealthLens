import { useState, useEffect, useMemo } from 'react'
import bridge from '../lib/bridge'

// Wishlist is private per-user — every bridge call below is scoped to the
// signed-in caller server-side (JWT / Electron session), so admin and
// tracker each only ever see their own items.

export const WISHLIST_CATEGORIES = [
  'Motorcycle', 'Riding Gear', 'Electronics', 'PC', 'Watches',
  'Clothing', 'Shoes', 'Bags & Backpacks', 'Home', 'Travel',
  'Fitness', 'Accessories', 'Other',
]

// Emoji + accent color per category — drives the card's left border, the
// category chip tint, and the pill selector in the add/edit modal.
const CATEGORY_META = {
  'Motorcycle':        { emoji: '🏍️', color: '#F97316' },
  'Riding Gear':        { emoji: '🪖', color: '#EF4444' },
  'Electronics':        { emoji: '📱', color: '#3B82F6' },
  'PC':                 { emoji: '🖥️', color: '#6366F1' },
  'Watches':            { emoji: '⌚', color: '#F59E0B' },
  'Clothing':           { emoji: '👕', color: '#EC4899' },
  'Shoes':              { emoji: '👟', color: '#92400E' },
  'Bags & Backpacks':   { emoji: '🎒', color: '#14B8A6' },
  'Home':               { emoji: '🏠', color: '#22C55E' },
  'Travel':             { emoji: '✈️', color: '#06B6D4' },
  'Fitness':            { emoji: '🏋️', color: '#84CC16' },
  'Accessories':        { emoji: '💍', color: '#A855F7' },
  'Other':              { emoji: '📦', color: '#9CA3AF' },
}
const categoryMeta = (c) => CATEGORY_META[c] || CATEGORY_META['Other']

const PURCHASE_TIMINGS = [
  'Now', 'This Month', 'Next 3 Months', 'Later',
  'After I Buy a House', 'After I Move',
  'When Current One Breaks', 'After Next Salary Revision', 'No Plan',
]

const PRIORITIES = [
  { value: 'high',   label: 'High',   emoji: '🔴', color: '#EF4444', tint: '#FEF2F2', border: '#FECACA' },
  { value: 'medium', label: 'Medium', emoji: '🟡', color: '#F59E0B', tint: '#FFFBEB', border: '#FDE68A' },
  { value: 'low',    label: 'Low',    emoji: '🟢', color: '#22C55E', tint: '#F0FDF4', border: '#BBF7D0' },
]

const STATUSES = [
  { value: 'wishlist',    label: 'Wishlist',    bg: '#F3F0FF', fg: '#6C63FF' },
  { value: 'shortlisted', label: 'Shortlisted', bg: '#FFFBEB', fg: '#B45309' },
  { value: 'planned',     label: 'Planned',     bg: '#EFF6FF', fg: '#1D4ED8' },
  { value: 'purchased',   label: 'Purchased ✓', bg: '#F0FDF4', fg: '#15803D' },
  { value: 'dropped',     label: 'Dropped',     bg: '#F3F4F6', fg: '#6B7280', strike: true },
]

const SORT_OPTIONS = [
  { value: 'recent',   label: 'Recently Added', emoji: '🕒' },
  { value: 'priority', label: 'Priority',        emoji: '🔥' },
  { value: 'price',    label: 'Price',           emoji: '💰' },
  { value: 'name',     label: 'Name',            emoji: '🔤' },
]

// Timeline view — one section per purchase_timing value, in display order.
// `kind: 'current-year'` sections are inferred to belong to the current
// calendar year (there's no real target date on the item, just this label),
// so they're hidden when a different specific year is selected. `conditional`
// and `noplan` sections have no year at all — only "All Time" shows them.
const TIME_SECTIONS = [
  { key: 'Now',                       emoji: '🔥', label: 'Now',                       color: '#EF4444', tint: '#FEF2F2', kind: 'current-year' },
  { key: 'This Month',                emoji: '📅', label: 'This Month',                color: '#F97316', tint: '#FFF7ED', kind: 'current-year' },
  { key: 'Next 3 Months',             emoji: '🗓️', label: 'Next 3 Months',             color: '#F59E0B', tint: '#FFFBEB', kind: 'current-year' },
  { key: 'Later',                     emoji: '⏳', label: 'Later',                     color: '#3B82F6', tint: '#EFF6FF', kind: 'current-year' },
  { key: 'After I Buy a House',       emoji: '🏠', label: 'After I Buy a House',       color: '#A855F7', tint: '#FAF5FF', kind: 'conditional' },
  { key: 'After I Move',              emoji: '🚚', label: 'After I Move',              color: '#A855F7', tint: '#FAF5FF', kind: 'conditional' },
  { key: 'When Current One Breaks',   emoji: '🔧', label: 'When Current One Breaks',   color: '#A855F7', tint: '#FAF5FF', kind: 'conditional' },
  { key: 'After Next Salary Revision', emoji: '💵', label: 'After Next Salary Revision', color: '#A855F7', tint: '#FAF5FF', kind: 'conditional' },
  { key: 'No Plan',                   emoji: '📋', label: 'No Plan',                   color: '#6B7280', tint: '#F9FAFB', kind: 'noplan' },
]
const PURCHASED_SECTION = { key: 'Purchased', emoji: '✅', label: 'Purchased', color: '#22C55E', tint: '#F0FDF4' }

const CURRENT_YEAR = new Date().getFullYear()
const YEAR_OPTIONS = [CURRENT_YEAR - 1, CURRENT_YEAR, CURRENT_YEAR + 1]

const VIEW_STORAGE_KEY = 'wealthlens_wishlist_view'
function getStoredView() {
  try {
    return localStorage.getItem(VIEW_STORAGE_KEY) === 'timeline' ? 'timeline' : 'grid'
  } catch {
    return 'grid'
  }
}

const INR = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 })

const priorityMeta = (p) => PRIORITIES.find(x => x.value === p) || PRIORITIES[1]
const statusMeta = (s) => STATUSES.find(x => x.value === s) || STATUSES[0]
// Any purchase_timing that doesn't match a known section (shouldn't happen —
// the modal only offers these 9 values — but items are never dropped from
// view, so unknown/blank values fall back to "No Plan").
const timingSection = (timing) => TIME_SECTIONS.find(d => d.key === timing) || TIME_SECTIONS[TIME_SECTIONS.length - 1]

// One-time keyframes for the "new card slides in" / "flash on purchase"
// micro-interactions — a plain <style> tag needs no Tailwind config change.
function WishlistAnimationStyles() {
  return (
    <style>{`
      @keyframes wl-slide-in { from { opacity: 0; transform: translateY(18px); } to { opacity: 1; transform: translateY(0); } }
      .wl-card-enter { animation: wl-slide-in 0.35s ease-out; }
    `}</style>
  )
}

function ChevronDown(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" {...props}>
      <polyline points="6 9 12 15 18 9" />
    </svg>
  )
}

function CloseIcon(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" {...props}>
      <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  )
}

// ── Generic pop-over dropdown (button + panel) — used instead of native
// <select> elements so the filter bar doesn't look like an HTML form. ──────
function PopDropdown({ trigger, children, align = 'left' }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="relative">
      <button type="button" onClick={() => setOpen(o => !o)}>{trigger(open)}</button>
      {open && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} />
          <div
            className={`absolute z-40 mt-2 min-w-[200px] bg-white rounded-2xl shadow-xl border border-gray-100 py-2 overflow-hidden ${align === 'right' ? 'right-0' : 'left-0'}`}
            onClick={() => setOpen(false)}
          >
            {children}
          </div>
        </>
      )}
    </div>
  )
}

function DropdownRow({ active, onClick, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-left hover:bg-gray-50 transition-colors"
      style={{ color: active ? '#6C63FF' : '#374151', backgroundColor: active ? '#F5F4FF' : 'transparent' }}
    >
      {children}
    </button>
  )
}

// ── Add/Edit modal ──────────────────────────────────────────────────────────
function WishlistModal({ item, onSave, onClose }) {
  const isEdit = Boolean(item?.id)
  const [form, setForm] = useState(item
    ? { ...item, price: item.price != null ? String(item.price) : '' }
    : {
      name: '', category: WISHLIST_CATEGORIES[0], url: '', brand: '', price: '',
      priority: 'medium', status: 'wishlist', purchase_timing: 'No Plan', notes: '',
    }
  )
  const [saving, setSaving] = useState(false)

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  async function handleSubmit(e) {
    e.preventDefault()
    if (!form.name.trim() || !form.category) return
    setSaving(true)
    try {
      const data = { ...form, price: form.price === '' ? null : parseFloat(form.price) }
      if (isEdit) await bridge.updateWishlistItem(data)
      else await bridge.createWishlistItem(data)
      onSave()
    } finally {
      setSaving(false)
    }
  }

  function testLink() {
    if (form.url) window.open(form.url, '_blank', 'noopener,noreferrer')
  }

  return (
    <div
      className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm sm:flex sm:items-center sm:justify-center sm:p-4"
      onClick={e => e.target === e.currentTarget && onClose()}
    >
      <div className="bg-white w-full h-full sm:h-auto sm:max-h-[90vh] sm:max-w-[560px] sm:rounded-3xl overflow-y-auto shadow-2xl">
        <div className="px-5 sm:px-7 py-5 border-b border-gray-100 flex items-center justify-between sticky top-0 bg-white z-10">
          <h2 className="text-xl font-extrabold text-gray-900">{isEdit ? 'Edit Item' : 'Add to Wishlist'}</h2>
          <button onClick={onClose} className="w-10 h-10 rounded-full flex items-center justify-center hover:bg-gray-100 transition-colors">
            <CloseIcon className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 sm:p-7 space-y-8">
          {/* Section 1 — The Item */}
          <section>
            <h3 className="text-sm font-bold uppercase tracking-wide mb-3" style={{ color: '#8B5CF6' }}>🎯 The Item</h3>
            <div className="space-y-4">
              <div>
                <label className="text-sm font-semibold text-gray-700 mb-1.5 block">What do you want?</label>
                <input
                  autoFocus required
                  type="text" placeholder="e.g. Shoei GT-Air 3 Helmet"
                  value={form.name} onChange={e => set('name', e.target.value)}
                  className="w-full px-4 py-3.5 rounded-2xl border-2 border-gray-100 bg-gray-50 text-lg font-bold text-gray-900 focus:outline-none focus:border-[#6C63FF] focus:bg-white transition-colors"
                />
              </div>

              <div>
                <label className="text-sm font-semibold text-gray-700 mb-1.5 block">Brand (optional)</label>
                <input
                  type="text" placeholder="e.g. Shoei"
                  value={form.brand || ''} onChange={e => set('brand', e.target.value)}
                  className="w-full px-4 py-2.5 rounded-xl border border-gray-200 text-sm text-gray-800 focus:outline-none focus:border-[#6C63FF] focus:ring-2 focus:ring-[#6C63FF]/20"
                />
              </div>

              <div>
                <label className="text-sm font-semibold text-gray-700 mb-2 block">Category</label>
                <div className="flex flex-wrap gap-2">
                  {WISHLIST_CATEGORIES.map(c => {
                    const meta = categoryMeta(c)
                    const active = form.category === c
                    return (
                      <button
                        key={c} type="button" onClick={() => set('category', c)}
                        className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-full text-sm font-semibold border-2 transition-colors min-h-[40px]"
                        style={{
                          backgroundColor: active ? '#6C63FF' : '#fff',
                          borderColor: active ? '#6C63FF' : '#E5E7EB',
                          color: active ? '#fff' : '#374151',
                        }}
                      >
                        <span>{meta.emoji}</span>{c}
                      </button>
                    )
                  })}
                </div>
              </div>
            </div>
          </section>

          {/* Section 2 — The Link */}
          <section>
            <h3 className="text-sm font-bold uppercase tracking-wide mb-3" style={{ color: '#8B5CF6' }}>🔗 The Link</h3>
            <label className="text-sm font-semibold text-gray-700 mb-1.5 block">Paste the product link</label>
            <div className="flex gap-2">
              <div className="relative flex-1 min-w-0">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400">🔗</span>
                <input
                  type="url" placeholder="https://…"
                  value={form.url || ''} onChange={e => set('url', e.target.value)}
                  className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-gray-200 text-sm text-gray-800 focus:outline-none focus:border-[#6C63FF] focus:ring-2 focus:ring-[#6C63FF]/20"
                />
              </div>
              <button
                type="button" onClick={testLink} disabled={!form.url}
                className="shrink-0 px-4 py-2.5 rounded-xl text-sm font-semibold border border-gray-200 text-gray-600 hover:bg-gray-50 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Test Link
              </button>
            </div>
          </section>

          {/* Section 3 — Price, Priority & Status */}
          <section>
            <h3 className="text-sm font-bold uppercase tracking-wide mb-3" style={{ color: '#8B5CF6' }}>💰 Price & Priority</h3>
            <div className="space-y-4">
              <div>
                <label className="text-sm font-semibold text-gray-700 mb-1.5 block">Current price</label>
                <div className="relative">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500 font-bold">₹</span>
                  <input
                    type="number" min="0" step="0.01" placeholder="0"
                    value={form.price} onChange={e => set('price', e.target.value)}
                    className="w-full pl-8 pr-4 py-2.5 rounded-xl border border-gray-200 text-sm font-semibold text-gray-800 focus:outline-none focus:border-[#6C63FF] focus:ring-2 focus:ring-[#6C63FF]/20"
                  />
                </div>
              </div>

              <div>
                <label className="text-sm font-semibold text-gray-700 mb-2 block">Priority</label>
                <div className="grid grid-cols-3 gap-2">
                  {PRIORITIES.map(p => {
                    const active = form.priority === p.value
                    return (
                      <button
                        key={p.value} type="button" onClick={() => set('priority', p.value)}
                        className="py-3 rounded-2xl text-sm font-bold border-2 transition-colors min-h-[48px]"
                        style={{
                          borderColor: active ? p.color : '#E5E7EB',
                          backgroundColor: active ? p.tint : '#fff',
                          color: active ? p.color : '#6B7280',
                        }}
                      >
                        {p.emoji} {p.label}
                      </button>
                    )
                  })}
                </div>
              </div>

              <div>
                <label className="text-sm font-semibold text-gray-700 mb-2 block">Status</label>
                <div className="flex flex-wrap gap-2">
                  {STATUSES.map(s => {
                    const active = form.status === s.value
                    return (
                      <button
                        key={s.value} type="button" onClick={() => set('status', s.value)}
                        className="px-3.5 py-2 rounded-full text-sm font-semibold transition-colors"
                        style={{
                          backgroundColor: active ? s.fg : s.bg,
                          color: active ? '#fff' : s.fg,
                        }}
                      >
                        {s.label}
                      </button>
                    )
                  })}
                </div>
              </div>
            </div>
          </section>

          {/* Section 4 — When to Buy */}
          <section>
            <h3 className="text-sm font-bold uppercase tracking-wide mb-3" style={{ color: '#8B5CF6' }}>🕐 When to Buy</h3>
            <div className="flex flex-wrap gap-2">
              {PURCHASE_TIMINGS.map(t => {
                const active = form.purchase_timing === t
                return (
                  <button
                    key={t} type="button" onClick={() => set('purchase_timing', t)}
                    className="px-3.5 py-2 rounded-full text-sm font-semibold border-2 transition-colors"
                    style={{
                      backgroundColor: active ? '#6C63FF' : '#fff',
                      borderColor: active ? '#6C63FF' : '#E5E7EB',
                      color: active ? '#fff' : '#374151',
                    }}
                  >
                    {t}
                  </button>
                )
              })}
            </div>
          </section>

          {/* Section 5 — Notes */}
          <section>
            <h3 className="text-sm font-bold uppercase tracking-wide mb-3" style={{ color: '#8B5CF6' }}>📝 Notes</h3>
            <textarea
              rows={3} placeholder="e.g. Only buy if price drops below ₹5,000 or after moving house"
              value={form.notes || ''} onChange={e => set('notes', e.target.value)}
              className="w-full px-4 py-3 rounded-xl border border-gray-200 text-sm text-gray-800 focus:outline-none focus:border-[#6C63FF] focus:ring-2 focus:ring-[#6C63FF]/20 resize-none"
            />
            <p className="text-xs text-gray-400 mt-2">💡 Just a name and category is enough — everything else is optional.</p>
          </section>

          <div className="flex gap-3 pt-2 pb-1 sticky bottom-0 bg-white">
            <button type="button" onClick={onClose} className="flex-1 py-3.5 rounded-2xl border border-gray-200 text-sm font-bold text-gray-600 hover:bg-gray-50 transition-colors min-h-[48px]">
              Cancel
            </button>
            <button
              type="submit" disabled={saving}
              className="flex-1 py-3.5 rounded-2xl text-white text-sm font-bold hover:opacity-90 transition-opacity disabled:opacity-60 min-h-[48px] shadow-lg shadow-[#6C63FF]/30"
              style={{ backgroundColor: '#6C63FF' }}
            >
              {saving ? 'Saving…' : 'Save to Wishlist 🛍️'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ── Item card ────────────────────────────────────────────────────────────
function ItemCard({ item, onEdit, onMarkPurchased, onDelete }) {
  const [menuOpen, setMenuOpen] = useState(false)
  const [flash, setFlash] = useState(false)
  const pr = priorityMeta(item.priority)
  const st = statusMeta(item.status)
  const cat = categoryMeta(item.category)
  const isPurchased = item.status === 'purchased'

  async function handleMarkPurchased() {
    setFlash(true)
    await onMarkPurchased(item)
    setTimeout(() => setFlash(false), 900)
  }

  return (
    <div
      className={`wl-card-enter relative bg-white rounded-2xl shadow-md hover:shadow-xl hover:scale-[1.02] transition-all duration-200 p-5 ${isPurchased ? 'opacity-75' : ''}`}
      style={{ borderLeft: `4px solid ${isPurchased ? '#22C55E' : cat.color}` }}
    >
      {/* Purchase flash overlay */}
      <div
        className="absolute inset-0 rounded-2xl pointer-events-none transition-opacity duration-700"
        style={{ backgroundColor: '#22C55E', opacity: flash ? 0.18 : 0 }}
      />

      <div className="flex items-start justify-between gap-2">
        <span
          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold"
          style={{ backgroundColor: `${cat.color}1A`, color: cat.color }}
        >
          <span>{cat.emoji}</span>{item.category}
        </span>

        <div className="relative shrink-0">
          <button
            onClick={() => setMenuOpen(o => !o)}
            className="w-9 h-9 rounded-full flex items-center justify-center hover:bg-gray-100 transition-colors text-gray-400"
          >
            <svg viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4">
              <circle cx="12" cy="5" r="1.5" /><circle cx="12" cy="12" r="1.5" /><circle cx="12" cy="19" r="1.5" />
            </svg>
          </button>
          {menuOpen && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(false)} />
              <div className="absolute right-0 top-10 z-20 w-48 bg-white rounded-2xl shadow-xl border border-gray-100 overflow-hidden py-1">
                <button onClick={() => { setMenuOpen(false); onEdit(item) }} className="w-full text-left px-4 py-3 text-sm font-medium text-gray-700 hover:bg-gray-50">
                  ✏️ Edit
                </button>
                {!isPurchased && (
                  <button onClick={() => { setMenuOpen(false); handleMarkPurchased() }} className="w-full text-left px-4 py-3 text-sm font-medium text-gray-700 hover:bg-gray-50">
                    ✅ Mark Purchased
                  </button>
                )}
                <button onClick={() => { setMenuOpen(false); onDelete(item) }} className="w-full text-left px-4 py-3 text-sm font-medium text-red-600 hover:bg-red-50">
                  🗑️ Delete
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      <div className="flex items-center gap-2 mt-2.5">
        <span className="text-sm font-semibold text-gray-600">{pr.emoji} {pr.label}</span>
        <span
          className="text-xs font-bold px-2.5 py-1 rounded-full transition-colors duration-200"
          style={{ backgroundColor: st.bg, color: st.fg, textDecoration: st.strike ? 'line-through' : 'none' }}
        >
          {st.label}
        </span>
      </div>

      <h3 className="text-lg font-extrabold text-gray-900 mt-3 leading-snug line-clamp-2">{item.name}</h3>
      {item.brand && <p className="text-sm text-gray-500 mt-0.5">by {item.brand}</p>}

      <p className="mt-3">
        {item.price != null && item.price !== ''
          ? <span className="text-xl font-extrabold text-gray-900">{INR.format(item.price)}</span>
          : <span className="text-sm text-gray-400 italic">Price not set</span>}
      </p>

      {item.purchase_timing && (
        <p className="mt-2 flex items-center gap-1.5 text-sm text-gray-500">
          <span>🕐</span>{item.purchase_timing}
        </p>
      )}

      {item.notes && <p className="text-sm text-gray-500 italic mt-3 line-clamp-2">"{item.notes}"</p>}

      <div className="mt-4 pt-3 border-t border-gray-100 flex items-center justify-between">
        {item.url ? (
          <a
            href={item.url} target="_blank" rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-sm font-bold"
            style={{ color: '#6C63FF' }}
          >
            Open Product
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="w-3.5 h-3.5">
              <line x1="7" y1="17" x2="17" y2="7" /><polyline points="7 7 17 7 17 17" />
            </svg>
          </a>
        ) : <span />}
        {isPurchased && <span className="text-sm font-bold text-green-600">✅ Purchased</span>}
      </div>
    </div>
  )
}

// ── Compact card used inside timeline sections ──────────────────────────
function TimelineCard({ item, onEdit, onMarkPurchased, onDelete }) {
  const [menuOpen, setMenuOpen] = useState(false)
  const cat = categoryMeta(item.category)
  const st = statusMeta(item.status)
  const isPurchased = item.status === 'purchased'

  return (
    <div
      className="wl-card-enter relative bg-white rounded-xl shadow-sm hover:shadow-md transition-shadow p-3.5 w-[210px] shrink-0 md:w-auto"
      style={{ borderLeft: `3px solid ${isPurchased ? '#22C55E' : cat.color}` }}
    >
      <div className="flex items-start justify-between gap-1">
        <h4 className="text-sm font-bold text-gray-900 leading-snug line-clamp-2 pr-1">{item.name}</h4>
        <div className="relative shrink-0">
          <button
            onClick={() => setMenuOpen(o => !o)}
            className="w-7 h-7 -mr-1 -mt-1 rounded-full flex items-center justify-center hover:bg-gray-100 transition-colors text-gray-400"
          >
            <svg viewBox="0 0 24 24" fill="currentColor" className="w-3.5 h-3.5">
              <circle cx="12" cy="5" r="1.5" /><circle cx="12" cy="12" r="1.5" /><circle cx="12" cy="19" r="1.5" />
            </svg>
          </button>
          {menuOpen && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(false)} />
              <div className="absolute right-0 top-8 z-20 w-40 bg-white rounded-xl shadow-xl border border-gray-100 overflow-hidden py-1">
                <button onClick={() => { setMenuOpen(false); onEdit(item) }} className="w-full text-left px-3.5 py-2 text-xs font-medium text-gray-700 hover:bg-gray-50">
                  ✏️ Edit
                </button>
                {!isPurchased && (
                  <button onClick={() => { setMenuOpen(false); onMarkPurchased(item) }} className="w-full text-left px-3.5 py-2 text-xs font-medium text-gray-700 hover:bg-gray-50">
                    ✅ Mark Purchased
                  </button>
                )}
                <button onClick={() => { setMenuOpen(false); onDelete(item) }} className="w-full text-left px-3.5 py-2 text-xs font-medium text-red-600 hover:bg-red-50">
                  🗑️ Delete
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      <p className="text-xs text-gray-500 mt-0.5 truncate">
        {item.brand && <>{item.brand} • </>}
        {item.price != null && item.price !== '' ? INR.format(item.price) : 'Price not set'}
      </p>

      <div className="flex items-center justify-between gap-2 mt-2.5">
        <span
          className="text-[11px] font-bold px-2 py-0.5 rounded-full"
          style={{ backgroundColor: st.bg, color: st.fg, textDecoration: st.strike ? 'line-through' : 'none' }}
        >
          {st.label}
        </span>
        {item.url && (
          <a href={item.url} target="_blank" rel="noopener noreferrer" className="text-[11px] font-bold" style={{ color: '#6C63FF' }}>
            Open ↗
          </a>
        )}
      </div>
    </div>
  )
}

// ── One collapsible timeline section (header + its cards) ──────────────
function TimelineSection({ def, monthLabel, items, collapsed, onToggle, onEdit, onMarkPurchased, onDelete }) {
  if (items.length === 0) return null
  const label = def.key === 'This Month' && monthLabel ? `${def.label} — ${monthLabel}` : def.label

  return (
    <div className="mb-7">
      <button type="button" onClick={onToggle} className="w-full flex items-center gap-2.5 mb-3">
        <span className="text-lg">{def.emoji}</span>
        <span className="text-sm font-extrabold uppercase tracking-wide whitespace-nowrap" style={{ color: def.color }}>{label}</span>
        <span className="text-xs font-bold px-2 py-0.5 rounded-full whitespace-nowrap" style={{ backgroundColor: def.tint, color: def.color }}>
          {items.length} item{items.length === 1 ? '' : 's'}
        </span>
        <div className="h-px flex-1 bg-gray-100" />
        <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform shrink-0 ${collapsed ? '-rotate-90' : ''}`} />
      </button>

      {!collapsed && (
        <>
          <div className="flex md:hidden gap-3 overflow-x-auto pb-1 -mx-1 px-1">
            {items.map(item => (
              <TimelineCard key={item.id} item={item} onEdit={onEdit} onMarkPurchased={onMarkPurchased} onDelete={onDelete} />
            ))}
          </div>
          <div className="hidden md:grid grid-cols-2 lg:grid-cols-3 gap-3">
            {items.map(item => (
              <TimelineCard key={item.id} item={item} onEdit={onEdit} onMarkPurchased={onMarkPurchased} onDelete={onDelete} />
            ))}
          </div>
        </>
      )}
    </div>
  )
}

// ── Timeline view — items grouped by purchase timing ────────────────────
function TimelineView({ items, onEdit, onMarkPurchased, onDelete }) {
  const [selectedYear, setSelectedYear] = useState(CURRENT_YEAR)
  const [collapsed, setCollapsed] = useState({})

  const nonPurchased = useMemo(() => items.filter(i => i.status !== 'purchased'), [items])
  const purchased = useMemo(() => items.filter(i => i.status === 'purchased'), [items])

  const monthLabel = useMemo(() => new Date().toLocaleDateString('en-IN', { month: 'long', year: 'numeric' }), [])

  const visibleSections = useMemo(
    () => TIME_SECTIONS.filter(def => selectedYear === 'all' || def.kind === 'current-year'),
    [selectedYear]
  )

  const groupedByKey = useMemo(() => {
    const groups = {}
    for (const def of TIME_SECTIONS) groups[def.key] = []
    for (const item of nonPurchased) groups[timingSection(item.purchase_timing).key].push(item)
    return groups
  }, [nonPurchased])

  // Budget breakdown — planned (not-yet-purchased) items with a price set,
  // independent of the year pill so the totals always describe everything.
  const priced = useMemo(() => nonPurchased.filter(i => i.price != null && i.price !== ''), [nonPurchased])
  const sumByKind = (kind) => priced.filter(i => timingSection(i.purchase_timing).kind === kind).reduce((s, i) => s + Number(i.price), 0)
  const thisYearTotal = sumByKind('current-year')
  const conditionalTotal = sumByKind('conditional')
  const noPlanTotal = sumByKind('noplan')
  const totalSpend = thisYearTotal + conditionalTotal + noPlanTotal

  const toggleSection = (key) => setCollapsed(c => ({ ...c, [key]: !c[key] }))

  const nothingToShow = visibleSections.every(def => groupedByKey[def.key].length === 0) && purchased.length === 0

  return (
    <div>
      {/* Budget summary */}
      <div className="rounded-2xl p-4 mb-5" style={{ backgroundColor: '#F5F4FF' }}>
        <p className="text-sm font-bold text-gray-800">
          💰 Planned spend: <span style={{ color: '#6C63FF' }}>{INR.format(totalSpend)}</span> across {priced.length} item{priced.length === 1 ? '' : 's'}
        </p>
        <p className="text-xs text-gray-500 mt-1.5 flex flex-wrap gap-x-4 gap-y-1">
          <span>This year: <b className="text-gray-700">{INR.format(thisYearTotal)}</b></span>
          <span>Conditional: <b className="text-gray-700">{INR.format(conditionalTotal)}</b></span>
          <span>No plan: <b className="text-gray-700">{INR.format(noPlanTotal)}</b></span>
        </p>
      </div>

      {/* Year selector */}
      <div className="flex gap-2 mb-6 overflow-x-auto pb-1 -mx-1 px-1">
        {YEAR_OPTIONS.map(y => (
          <button
            key={y} onClick={() => setSelectedYear(y)}
            className="shrink-0 px-4 py-2 rounded-full text-sm font-bold border transition-colors"
            style={{
              backgroundColor: selectedYear === y ? '#6C63FF' : '#fff',
              borderColor: selectedYear === y ? '#6C63FF' : '#E5E7EB',
              color: selectedYear === y ? '#fff' : '#4B5563',
            }}
          >
            {y}
          </button>
        ))}
        <button
          onClick={() => setSelectedYear('all')}
          className="shrink-0 px-4 py-2 rounded-full text-sm font-bold border transition-colors"
          style={{
            backgroundColor: selectedYear === 'all' ? '#6C63FF' : '#fff',
            borderColor: selectedYear === 'all' ? '#6C63FF' : '#E5E7EB',
            color: selectedYear === 'all' ? '#fff' : '#4B5563',
          }}
        >
          All Time
        </button>
      </div>

      {nothingToShow ? (
        <p className="text-sm text-gray-400 py-14 text-center">
          📭 Nothing planned for {selectedYear === 'all' ? 'this view' : selectedYear} — try "All Time".
        </p>
      ) : (
        <>
          {visibleSections.map(def => (
            <TimelineSection
              key={def.key}
              def={def}
              monthLabel={monthLabel}
              items={groupedByKey[def.key]}
              collapsed={Boolean(collapsed[def.key])}
              onToggle={() => toggleSection(def.key)}
              onEdit={onEdit}
              onMarkPurchased={onMarkPurchased}
              onDelete={onDelete}
            />
          ))}

          {purchased.length > 0 && (
            <TimelineSection
              def={PURCHASED_SECTION}
              items={purchased}
              collapsed={Boolean(collapsed[PURCHASED_SECTION.key])}
              onToggle={() => toggleSection(PURCHASED_SECTION.key)}
              onEdit={onEdit}
              onMarkPurchased={onMarkPurchased}
              onDelete={onDelete}
            />
          )}
        </>
      )}
    </div>
  )
}

// ── Mobile filter bottom sheet ──────────────────────────────────────────
function MobileFilterSheet({ categoryFilter, setCategoryFilter, sortBy, setSortBy, onClose }) {
  return (
    <div className="fixed inset-0 z-50 sm:hidden" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="absolute inset-0 bg-black/40" />
      <div className="absolute bottom-0 left-0 right-0 bg-white rounded-t-3xl shadow-2xl max-h-[80vh] overflow-y-auto">
        <div className="sticky top-0 bg-white px-5 py-4 border-b border-gray-100 flex items-center justify-between">
          <h3 className="text-lg font-extrabold text-gray-900">Filter & Sort</h3>
          <button onClick={onClose} className="w-9 h-9 rounded-full flex items-center justify-center hover:bg-gray-100">
            <CloseIcon className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        <div className="p-5 space-y-6">
          <div>
            <h4 className="text-sm font-bold text-gray-700 mb-2.5">Category</h4>
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => setCategoryFilter('')}
                className="px-3.5 py-2.5 rounded-full text-sm font-semibold border-2 min-h-[44px]"
                style={{
                  backgroundColor: categoryFilter === '' ? '#6C63FF' : '#fff',
                  borderColor: categoryFilter === '' ? '#6C63FF' : '#E5E7EB',
                  color: categoryFilter === '' ? '#fff' : '#374151',
                }}
              >
                All Categories
              </button>
              {WISHLIST_CATEGORIES.map(c => {
                const meta = categoryMeta(c)
                const active = categoryFilter === c
                return (
                  <button
                    key={c} onClick={() => setCategoryFilter(c)}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2.5 rounded-full text-sm font-semibold border-2 min-h-[44px]"
                    style={{
                      backgroundColor: active ? '#6C63FF' : '#fff',
                      borderColor: active ? '#6C63FF' : '#E5E7EB',
                      color: active ? '#fff' : '#374151',
                    }}
                  >
                    <span>{meta.emoji}</span>{c}
                  </button>
                )
              })}
            </div>
          </div>

          <div>
            <h4 className="text-sm font-bold text-gray-700 mb-2.5">Sort by</h4>
            <div className="space-y-1.5">
              {SORT_OPTIONS.map(o => {
                const active = sortBy === o.value
                return (
                  <button
                    key={o.value} onClick={() => setSortBy(o.value)}
                    className="w-full flex items-center gap-2.5 px-4 py-3 rounded-xl text-sm font-semibold text-left min-h-[48px]"
                    style={{ backgroundColor: active ? '#F5F4FF' : 'transparent', color: active ? '#6C63FF' : '#374151' }}
                  >
                    <span>{o.emoji}</span>{o.label}
                  </button>
                )
              })}
            </div>
          </div>

          <button
            onClick={onClose}
            className="w-full py-3.5 rounded-2xl text-white text-sm font-bold min-h-[48px]"
            style={{ backgroundColor: '#6C63FF' }}
          >
            Done
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Main page ────────────────────────────────────────────────────────────
export default function Wishlist() {
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [modalItem, setModalItem] = useState(null)
  const [showModal, setShowModal] = useState(false)
  const [mobileFilterOpen, setMobileFilterOpen] = useState(false)
  const [view, setView] = useState(getStoredView)

  function changeView(v) {
    setView(v)
    try { localStorage.setItem(VIEW_STORAGE_KEY, v) } catch {}
  }

  const [search, setSearch] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [priorityFilter, setPriorityFilter] = useState('')
  const [sortBy, setSortBy] = useState('recent')

  async function load() {
    setLoading(true)
    try {
      const rows = await bridge.getWishlistItems()
      setItems(rows || [])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  const counts = useMemo(() => ({
    all: items.length,
    high: items.filter(i => i.priority === 'high').length,
    shortlisted: items.filter(i => i.status === 'shortlisted').length,
    planned: items.filter(i => i.status === 'planned').length,
    purchased: items.filter(i => i.status === 'purchased').length,
  }), [items])

  function applyChip(chip) {
    if (chip === 'all') { setStatusFilter(''); setPriorityFilter('') }
    else if (chip === 'high') { setPriorityFilter('high'); setStatusFilter('') }
    else { setStatusFilter(chip); setPriorityFilter('') }
  }

  const activeChip = priorityFilter === 'high'
    ? 'high'
    : ['shortlisted', 'planned', 'purchased'].includes(statusFilter) ? statusFilter : 'all'

  const visibleItems = useMemo(() => {
    let list = items
    if (categoryFilter) list = list.filter(i => i.category === categoryFilter)
    if (statusFilter)   list = list.filter(i => i.status === statusFilter)
    if (priorityFilter) list = list.filter(i => i.priority === priorityFilter)
    if (search.trim()) {
      const q = search.trim().toLowerCase()
      list = list.filter(i => i.name.toLowerCase().includes(q) || (i.brand || '').toLowerCase().includes(q))
    }
    const sorted = [...list]
    if (sortBy === 'priority') {
      const rank = { high: 0, medium: 1, low: 2 }
      sorted.sort((a, b) => rank[a.priority] - rank[b.priority])
    } else if (sortBy === 'price') {
      sorted.sort((a, b) => (b.price || 0) - (a.price || 0))
    } else if (sortBy === 'name') {
      sorted.sort((a, b) => a.name.localeCompare(b.name))
    } else {
      sorted.sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
    }
    return sorted
  }, [items, categoryFilter, statusFilter, priorityFilter, search, sortBy])

  const activeItems = useMemo(() => visibleItems.filter(i => i.status !== 'purchased'), [visibleItems])
  const purchasedItems = useMemo(() => visibleItems.filter(i => i.status === 'purchased'), [visibleItems])

  function openAdd() { setModalItem(null); setShowModal(true) }
  function openEdit(item) { setModalItem(item); setShowModal(true) }
  function closeModal() { setShowModal(false); setModalItem(null) }
  async function handleSaved() { closeModal(); await load() }

  async function markPurchased(item) {
    await bridge.updateWishlistItem({ ...item, status: 'purchased' })
    await load()
  }

  async function handleDelete(item) {
    if (!confirm(`Remove "${item.name}" from wishlist?`)) return
    await bridge.deleteWishlistItem(item.id)
    await load()
  }

  const CHIP_DEFS = [
    { id: 'all', emoji: '🛍️', label: 'All', count: counts.all, fill: '#6C63FF', tint: '#F5F4FF', text: '#4F46E5' },
    { id: 'high', emoji: '🔴', label: 'High Priority', count: counts.high, fill: '#EF4444', tint: '#FEF2F2', text: '#DC2626' },
    { id: 'shortlisted', emoji: '⭐', label: 'Shortlisted', count: counts.shortlisted, fill: '#F59E0B', tint: '#FFFBEB', text: '#B45309' },
    { id: 'planned', emoji: '📋', label: 'Planned', count: counts.planned, fill: '#3B82F6', tint: '#EFF6FF', text: '#1D4ED8' },
    { id: 'purchased', emoji: '✅', label: 'Purchased', count: counts.purchased, fill: '#22C55E', tint: '#F0FDF4', text: '#15803D' },
  ]

  const activeFilterCount = (categoryFilter ? 1 : 0) + (sortBy !== 'recent' ? 1 : 0)

  return (
    <div className="p-4 lg:p-8 max-w-5xl mx-auto pb-24 sm:pb-8">
      <WishlistAnimationStyles />

      {/* Hero header */}
      <div
        className="relative overflow-hidden rounded-3xl p-6 md:p-8 mb-5"
        style={{ background: 'linear-gradient(120deg, rgba(108,99,255,0.13) 0%, rgba(139,92,246,0.11) 50%, rgba(236,72,153,0.10) 100%)' }}
      >
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl md:text-3xl font-extrabold text-gray-900 flex items-center gap-2.5">
              <span className="text-3xl md:text-4xl">🛍️</span> My Wishlist
            </h1>
            <p className="text-sm text-gray-600 mt-1 font-medium">
              {counts.all} item{counts.all === 1 ? '' : 's'}
              {counts.high > 0 && <> • {counts.high} high priority</>}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1 bg-white/70 backdrop-blur rounded-full p-1 shadow-sm border border-white">
              <button
                onClick={() => changeView('grid')}
                className="flex items-center gap-1.5 px-3.5 py-2 rounded-full text-sm font-bold transition-colors min-h-[40px]"
                style={{ backgroundColor: view === 'grid' ? '#6C63FF' : 'transparent', color: view === 'grid' ? '#fff' : '#6B7280' }}
              >
                ⊞ Grid
              </button>
              <button
                onClick={() => changeView('timeline')}
                className="flex items-center gap-1.5 px-3.5 py-2 rounded-full text-sm font-bold transition-colors min-h-[40px]"
                style={{ backgroundColor: view === 'timeline' ? '#6C63FF' : 'transparent', color: view === 'timeline' ? '#fff' : '#6B7280' }}
              >
                📅 Timeline
              </button>
            </div>

            <button
              onClick={openAdd}
              className="flex items-center gap-2 px-5 py-3 rounded-full bg-white text-sm font-bold shadow-lg hover:shadow-xl hover:-translate-y-0.5 transition-all min-h-[48px]"
              style={{ color: '#6C63FF' }}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
                <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
              </svg>
              Add Item
            </button>
          </div>
        </div>
      </div>

      {/* Stats pill row */}
      <div className="flex gap-2 overflow-x-auto pb-2 mb-4 -mx-1 px-1">
        {CHIP_DEFS.map(c => {
          const active = activeChip === c.id
          return (
            <button
              key={c.id}
              onClick={() => applyChip(c.id)}
              className="shrink-0 inline-flex items-center gap-1.5 px-4 py-2.5 rounded-full text-sm font-bold border transition-colors whitespace-nowrap"
              style={{
                backgroundColor: active ? c.fill : '#fff',
                borderColor: active ? c.fill : '#E5E7EB',
                color: active ? '#fff' : '#4B5563',
              }}
            >
              <span>{c.emoji}</span>{c.label} <span style={{ opacity: 0.85 }}>({c.count})</span>
            </button>
          )
        })}
      </div>

      {/* Search + filter bar — desktop */}
      <div className="hidden sm:flex items-center gap-2 mb-6">
        <div className="relative flex-1 min-w-[200px]">
          <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400">🔍</span>
          <input
            type="text" placeholder="Search by name or brand…"
            value={search} onChange={e => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 rounded-full border border-gray-200 bg-white text-sm text-gray-800 focus:outline-none focus:border-[#6C63FF] focus:ring-2 focus:ring-[#6C63FF]/20"
          />
        </div>

        <PopDropdown
          trigger={(open) => (
            <span
              className="flex items-center gap-1.5 px-4 py-2.5 rounded-full border border-gray-200 bg-white text-sm font-semibold text-gray-700 hover:border-gray-300 transition-colors"
            >
              {categoryFilter ? <>{categoryMeta(categoryFilter).emoji} {categoryFilter}</> : 'Category'}
              <ChevronDown className={`w-4 h-4 transition-transform ${open ? 'rotate-180' : ''}`} />
            </span>
          )}
        >
          <DropdownRow active={!categoryFilter} onClick={() => setCategoryFilter('')}>All Categories</DropdownRow>
          {WISHLIST_CATEGORIES.map(c => (
            <DropdownRow key={c} active={categoryFilter === c} onClick={() => setCategoryFilter(c)}>
              {categoryMeta(c).emoji} {c}
            </DropdownRow>
          ))}
        </PopDropdown>

        <PopDropdown
          align="right"
          trigger={(open) => (
            <span className="flex items-center gap-1.5 px-4 py-2.5 rounded-full border border-gray-200 bg-white text-sm font-semibold text-gray-700 hover:border-gray-300 transition-colors">
              {SORT_OPTIONS.find(o => o.value === sortBy)?.emoji} Sort
              <ChevronDown className={`w-4 h-4 transition-transform ${open ? 'rotate-180' : ''}`} />
            </span>
          )}
        >
          {SORT_OPTIONS.map(o => (
            <DropdownRow key={o.value} active={sortBy === o.value} onClick={() => setSortBy(o.value)}>
              {o.emoji} {o.label}
            </DropdownRow>
          ))}
        </PopDropdown>
      </div>

      {/* Search + filter bar — mobile */}
      <div className="flex sm:hidden items-center gap-2 mb-6">
        <div className="relative flex-1 min-w-0">
          <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400">🔍</span>
          <input
            type="text" placeholder="Search…"
            value={search} onChange={e => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-3 rounded-full border border-gray-200 bg-white text-sm text-gray-800 focus:outline-none focus:border-[#6C63FF] focus:ring-2 focus:ring-[#6C63FF]/20 min-h-[48px]"
          />
        </div>
        <button
          onClick={() => setMobileFilterOpen(true)}
          className="relative shrink-0 flex items-center gap-1.5 px-4 py-3 rounded-full border border-gray-200 bg-white text-sm font-semibold text-gray-700 min-h-[48px]"
        >
          Filter <ChevronDown className="w-4 h-4" />
          {activeFilterCount > 0 && (
            <span
              className="absolute -top-1 -right-1 w-4 h-4 rounded-full text-[10px] font-bold text-white flex items-center justify-center"
              style={{ backgroundColor: '#6C63FF' }}
            >
              {activeFilterCount}
            </span>
          )}
        </button>
      </div>

      {mobileFilterOpen && (
        <MobileFilterSheet
          categoryFilter={categoryFilter} setCategoryFilter={setCategoryFilter}
          sortBy={sortBy} setSortBy={setSortBy}
          onClose={() => setMobileFilterOpen(false)}
        />
      )}

      {loading ? (
        <p className="text-sm text-gray-400 py-14 text-center">Loading your wishlist…</p>
      ) : items.length === 0 ? (
        <div className="flex flex-col items-center justify-center text-center py-16 px-4">
          <div style={{ fontSize: 64, lineHeight: 1 }} className="mb-4">🛍️</div>
          <p className="text-xl font-extrabold text-gray-900">Your wishlist is empty</p>
          <p className="text-sm text-gray-500 mt-1.5 mb-6 max-w-xs">
            Save things you want to buy — from gadgets to gear to everyday essentials.
          </p>
          <button
            onClick={openAdd}
            className="px-6 py-3.5 rounded-full text-white text-sm font-bold shadow-lg hover:opacity-90 transition-opacity min-h-[48px]"
            style={{ backgroundColor: '#6C63FF' }}
          >
            + Add Your First Item
          </button>
        </div>
      ) : visibleItems.length === 0 ? (
        <p className="text-sm text-gray-400 py-14 text-center">🔍 No items match these filters.</p>
      ) : view === 'timeline' ? (
        <TimelineView
          items={visibleItems}
          onEdit={openEdit}
          onMarkPurchased={markPurchased}
          onDelete={handleDelete}
        />
      ) : (
        <>
          {activeItems.length > 0 && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              {activeItems.map(item => (
                <ItemCard
                  key={item.id}
                  item={item}
                  onEdit={openEdit}
                  onMarkPurchased={markPurchased}
                  onDelete={handleDelete}
                />
              ))}
            </div>
          )}

          {purchasedItems.length > 0 && (
            <div className={activeItems.length > 0 ? 'mt-10' : ''}>
              <div className="flex items-center gap-3 mb-5">
                <div className="h-px flex-1 bg-gray-200" />
                <span className="text-sm font-bold text-gray-500 flex items-center gap-1.5">✅ Purchased ({purchasedItems.length})</span>
                <div className="h-px flex-1 bg-gray-200" />
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                {purchasedItems.map(item => (
                  <ItemCard
                    key={item.id}
                    item={item}
                    onEdit={openEdit}
                    onMarkPurchased={markPurchased}
                    onDelete={handleDelete}
                  />
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {showModal && <WishlistModal item={modalItem} onSave={handleSaved} onClose={closeModal} />}
    </div>
  )
}
