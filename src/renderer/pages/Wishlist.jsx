import { useState, useEffect, useMemo, useCallback } from 'react'
import bridge from '../lib/bridge'

// Wishlist is private per-user — every bridge call below is scoped to the
// signed-in caller server-side (JWT / Electron session), so admin and
// tracker each only ever see their own items and collections.

export const WISHLIST_CATEGORIES = [
  'Motorcycle', 'Automobile', 'Riding Gear', 'Electronics', 'PC', 'Watches',
  'Clothing', 'Shoes', 'Bags & Backpacks', 'Home', 'Travel',
  'Fitness', 'Accessories', 'Other',
]

const CATEGORY_META = {
  'Motorcycle':        { emoji: '🏍️', color: '#F97316' },
  'Automobile':         { emoji: '🚗', color: '#EF4444' },
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

// Preset palette + emoji set for collections.
const COLLECTION_COLORS = [
  { name: 'Orange', value: '#f97316' },
  { name: 'Indigo', value: '#6366f1' },
  { name: 'Green',  value: '#22c55e' },
  { name: 'Pink',   value: '#ec4899' },
  { name: 'Blue',   value: '#3b82f6' },
  { name: 'Red',    value: '#ef4444' },
  { name: 'Amber',  value: '#f59e0b' },
  { name: 'Purple', value: '#6C63FF' },
]
const COLLECTION_EMOJIS = [
  '📦', '🏍️', '🖥️', '🏠', '✨', '📱', '👕', '📚', '🧳', '💪', '⌚', '👟',
  '🎒', '🎮', '🛠️', '🪑', '🚗', '🎸', '📷', '🎧', '⌨️', '🖼️', '🌱', '🍳',
  '🧴', '💡', '🔧', '🎯', '⛺', '🏕️', '🔩', '🪛',
]
const UNCATEGORIZED = { id: null, name: 'Uncategorized', emoji: '📥', color: '#9CA3AF', uncategorized: true }

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
const THIS_YEAR_SECTION = { key: 'This Year', emoji: '🗓️', label: `This Year (${new Date().getFullYear()})`, color: '#0EA5E9', tint: '#E0F2FE' }

const CURRENT_YEAR = new Date().getFullYear()
const YEAR_OPTIONS = [CURRENT_YEAR - 1, CURRENT_YEAR, CURRENT_YEAR + 1]

const TARGET_MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
const TARGET_MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const TARGET_YEARS = Array.from({ length: 10 }, (_, i) => CURRENT_YEAR + i)

function targetDateLabel(item, style = 'short') {
  const m = Number(item?.target_month), y = Number(item?.target_year)
  if (!m || !y || m < 1 || m > 12) return null
  return `${(style === 'long' ? TARGET_MONTHS : TARGET_MONTHS_SHORT)[m - 1]} ${y}`
}
function targetSortKey(item) {
  const m = Number(item?.target_month), y = Number(item?.target_year)
  if (y && m) return y * 12 + m
  if (y) return y * 12 + 13
  return Number.POSITIVE_INFINITY
}
function sortByTargetThenRecent(arr) {
  return [...arr].sort((a, b) => {
    const ka = targetSortKey(a), kb = targetSortKey(b)
    if (ka !== kb) return ka - kb
    return new Date(b.created_at) - new Date(a.created_at)
  })
}

const VIEW_STORAGE_KEY = 'wealthlens_wishlist_view'
function getStoredView() {
  try {
    return localStorage.getItem(VIEW_STORAGE_KEY) === 'timeline' ? 'timeline' : 'collections'
  } catch {
    return 'collections'
  }
}

const INR = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 })

const priorityMeta = (p) => PRIORITIES.find(x => x.value === p) || PRIORITIES[1]
const statusMeta = (s) => STATUSES.find(x => x.value === s) || STATUSES[0]
const timingSection = (timing) => TIME_SECTIONS.find(d => d.key === timing) || TIME_SECTIONS[TIME_SECTIONS.length - 1]
const priceOf = (i) => (i.price != null && i.price !== '' ? Number(i.price) : 0)
const hasPriceSet = (i) => i.price != null && i.price !== ''
const topPriority = (its) =>
  its.some(i => i.priority === 'high') ? 'high' : its.some(i => i.priority === 'medium') ? 'medium' : 'low'

// Colour a budget/total by size: gray < ₹50k, amber ₹50k–₹1L, purple > ₹1L.
const budgetColor = (amt) => (amt > 100000 ? '#6C63FF' : amt >= 50000 ? '#D97706' : '#6B7280')

// Sum of priced items, excluding dropped ones, + how many have no price.
function wishlistTotals(list) {
  const active = list.filter(i => i.status !== 'dropped')
  const priced = active.filter(hasPriceSet)
  return {
    total: priced.reduce((s, i) => s + priceOf(i), 0),
    itemCount: active.length,
    pricedCount: priced.length,
    unpricedCount: active.length - priced.length,
  }
}

// Resolve an item's collection object (or the synthetic Uncategorized one).
function collectionOf(item, collections) {
  if (item.collection_id == null) return UNCATEGORIZED
  return collections.find(c => c.id === item.collection_id) || UNCATEGORIZED
}

// One-time keyframes for the card micro-interactions.
function WishlistAnimationStyles() {
  return (
    <style>{`
      @keyframes wl-card-entrance { from { opacity: 0; transform: translateY(20px); } to { opacity: 1; transform: translateY(0); } }
      @keyframes wl-card-exit     { from { opacity: 1; transform: scale(1); } to { opacity: 0; transform: scale(0.9); } }
      @keyframes wl-results-in    { from { opacity: 0; } to { opacity: 1; } }
      @keyframes wl-flash         { 0% { background: rgba(34,197,94,0); } 25% { background: rgba(34,197,94,0.22); } 100% { background: rgba(34,197,94,0); } }
      @keyframes wl-pulse {
        0%, 100% { transform: scale(1);    box-shadow: 0 10px 25px -5px rgba(108,99,255,0.40); }
        50%      { transform: scale(1.04); box-shadow: 0 16px 32px -5px rgba(108,99,255,0.55); }
      }
      .wl-card-enter  { animation: wl-card-entrance 0.3s ease-out both; }
      .wl-card-exit   { animation: wl-card-exit 0.24s ease-in forwards; pointer-events: none; }
      .wl-results-in  { animation: wl-results-in 0.25s ease; }
      .wl-pulse       { animation: wl-pulse 1.8s ease-in-out infinite; }
      @media (prefers-reduced-motion: reduce) {
        .wl-card-enter, .wl-card-exit, .wl-results-in, .wl-pulse { animation: none !important; }
      }
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

function KebabButton({ onClick, className = '' }) {
  return (
    <button
      onClick={onClick}
      className={`w-8 h-8 rounded-lg flex items-center justify-center text-gray-400 hover:bg-gray-100 transition-colors ${className}`}
    >
      <svg viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4">
        <circle cx="12" cy="5" r="1.5" /><circle cx="12" cy="12" r="1.5" /><circle cx="12" cy="19" r="1.5" />
      </svg>
    </button>
  )
}

// ── Add/Edit item modal ─────────────────────────────────────────────────────
function WishlistModal({ item, collections, lockedCollectionId, collectionLocked, onSave, onClose }) {
  const isEdit = Boolean(item?.id)
  const [form, setForm] = useState(item
    ? { ...item, price: item.price != null ? String(item.price) : '', collection_id: item.collection_id ?? '' }
    : {
      name: '', category: WISHLIST_CATEGORIES[0], url: '', brand: '', price: '',
      priority: 'medium', status: 'wishlist', purchase_timing: 'No Plan', notes: '',
      target_month: null, target_year: null,
      collection_id: lockedCollectionId ?? '',
    }
  )
  const [saving, setSaving] = useState(false)
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))
  const lockCollection = collectionLocked && !isEdit

  async function handleSubmit(e) {
    e.preventDefault()
    if (!form.name.trim() || !form.category) return
    setSaving(true)
    try {
      const data = {
        ...form,
        price: form.price === '' ? null : parseFloat(form.price),
        group_name: (form.group_name || '').trim() || null,
        target_month: form.target_month ? Number(form.target_month) : null,
        target_year: form.target_year ? Number(form.target_year) : null,
        collection_id: form.collection_id === '' || form.collection_id == null ? null : Number(form.collection_id),
      }
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
                <label className="text-sm font-semibold text-gray-700 mb-1.5 block">Collection</label>
                <select
                  value={form.collection_id ?? ''}
                  onChange={e => set('collection_id', e.target.value)}
                  disabled={lockCollection}
                  className="w-full px-4 py-2.5 rounded-xl border border-gray-200 bg-white text-sm text-gray-800 focus:outline-none focus:border-[#6C63FF] focus:ring-2 focus:ring-[#6C63FF]/20 disabled:bg-gray-50 disabled:text-gray-500"
                >
                  <option value="">📥 Uncategorized</option>
                  {collections.map(c => (
                    <option key={c.id} value={c.id}>{c.emoji} {c.name}</option>
                  ))}
                </select>
              </div>

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
                        style={{ backgroundColor: active ? s.fg : s.bg, color: active ? '#fff' : s.fg }}
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

            <label className="text-sm font-semibold text-gray-700 mb-1.5 mt-4 block">Set a target date (optional)</label>
            <div className="flex gap-2">
              <select
                value={form.target_month || ''}
                onChange={e => set('target_month', e.target.value ? Number(e.target.value) : null)}
                className="flex-1 min-w-0 px-3 py-2.5 rounded-xl border border-gray-200 bg-white text-sm text-gray-800 focus:outline-none focus:border-[#6C63FF] focus:ring-2 focus:ring-[#6C63FF]/20"
              >
                <option value="">Month</option>
                {TARGET_MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
              </select>
              <select
                value={form.target_year || ''}
                onChange={e => set('target_year', e.target.value ? Number(e.target.value) : null)}
                className="flex-1 min-w-0 px-3 py-2.5 rounded-xl border border-gray-200 bg-white text-sm text-gray-800 focus:outline-none focus:border-[#6C63FF] focus:ring-2 focus:ring-[#6C63FF]/20"
              >
                <option value="">Year</option>
                {TARGET_YEARS.map(y => <option key={y} value={y}>{y}</option>)}
              </select>
            </div>
            <p className="text-xs text-gray-400 mt-2">💡 A specific month/year shows on the card and sorts the item chronologically in Timeline view.</p>
          </section>

          {/* Section 5 — Notes */}
          <section>
            <h3 className="text-sm font-bold uppercase tracking-wide mb-3" style={{ color: '#8B5CF6' }}>📝 Notes</h3>
            <textarea
              rows={5} placeholder="e.g. Only buy if price drops below ₹5,000 or after moving house"
              value={form.notes || ''} onChange={e => set('notes', e.target.value)}
              className="w-full min-h-[120px] px-4 py-3 rounded-xl border border-gray-200 text-sm text-gray-800 leading-relaxed focus:outline-none focus:border-[#6C63FF] focus:ring-2 focus:ring-[#6C63FF]/20 resize-y"
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

// ── New / Edit collection modal ─────────────────────────────────────────────
function CollectionModal({ collection, onSave, onClose }) {
  const isEdit = Boolean(collection?.id)
  const [name, setName] = useState(collection?.name || '')
  const [emoji, setEmoji] = useState(collection?.emoji || '📦')
  const [color, setColor] = useState(collection?.color || '#6C63FF')
  const [saving, setSaving] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    if (!name.trim()) return
    setSaving(true)
    try {
      const data = { name: name.trim(), emoji, color }
      if (isEdit) await bridge.updateWishlistCollection({ ...collection, ...data })
      else await bridge.createWishlistCollection(data)
      onSave()
    } finally {
      setSaving(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-[60] bg-black/40 backdrop-blur-sm sm:flex sm:items-center sm:justify-center sm:p-4"
      onClick={e => e.target === e.currentTarget && onClose()}
    >
      <div className="bg-white w-full h-full sm:h-auto sm:max-h-[90vh] sm:max-w-[440px] sm:rounded-3xl overflow-y-auto shadow-2xl">
        <div className="px-5 sm:px-7 py-5 border-b border-gray-100 flex items-center justify-between sticky top-0 bg-white z-10">
          <h2 className="text-xl font-extrabold text-gray-900">{isEdit ? 'Edit Collection' : 'New Collection'}</h2>
          <button onClick={onClose} className="w-10 h-10 rounded-full flex items-center justify-center hover:bg-gray-100 transition-colors">
            <CloseIcon className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 sm:p-7 space-y-6">
          <div className="flex items-center gap-3">
            <div
              className="w-14 h-14 rounded-2xl flex items-center justify-center text-3xl shrink-0"
              style={{ background: `${color}1A` }}
            >
              {emoji}
            </div>
            <input
              autoFocus required type="text" placeholder="Collection name"
              value={name} onChange={e => setName(e.target.value)}
              className="flex-1 min-w-0 px-4 py-3 rounded-xl border-2 border-gray-100 bg-gray-50 text-lg font-bold text-gray-900 focus:outline-none focus:border-[#6C63FF] focus:bg-white transition-colors"
            />
          </div>

          <div>
            <label className="text-sm font-semibold text-gray-700 mb-2 block">Emoji</label>
            <div className="grid grid-cols-8 gap-1.5">
              {COLLECTION_EMOJIS.map(e => (
                <button
                  key={e} type="button" onClick={() => setEmoji(e)}
                  className="aspect-square rounded-lg text-xl flex items-center justify-center border-2 transition-colors"
                  style={{ borderColor: emoji === e ? color : 'transparent', background: emoji === e ? `${color}14` : '#F9FAFB' }}
                >
                  {e}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="text-sm font-semibold text-gray-700 mb-2 block">Color</label>
            <div className="flex flex-wrap gap-2.5">
              {COLLECTION_COLORS.map(c => (
                <button
                  key={c.value} type="button" onClick={() => setColor(c.value)} title={c.name}
                  className="w-9 h-9 rounded-full transition-transform hover:scale-110"
                  style={{ background: c.value, outline: color === c.value ? `3px solid ${c.value}55` : 'none', outlineOffset: 2 }}
                />
              ))}
            </div>
          </div>

          <div className="flex gap-3 pt-1">
            <button type="button" onClick={onClose} className="flex-1 py-3.5 rounded-2xl border border-gray-200 text-sm font-bold text-gray-600 hover:bg-gray-50 transition-colors min-h-[48px]">
              Cancel
            </button>
            <button
              type="submit" disabled={saving}
              className="flex-1 py-3.5 rounded-2xl text-white text-sm font-bold hover:opacity-90 transition-opacity disabled:opacity-60 min-h-[48px]"
              style={{ backgroundColor: color }}
            >
              {saving ? 'Saving…' : isEdit ? 'Save' : 'Create Collection'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ── Move-item-to-collection picker ─────────────────────────────────────────
function MovePicker({ item, collections, onMove, onClose }) {
  const currentId = item.collection_id ?? null
  return (
    <div
      className="fixed inset-0 z-[60] bg-black/40 backdrop-blur-sm flex items-end sm:items-center sm:justify-center sm:p-4"
      onClick={e => e.target === e.currentTarget && onClose()}
    >
      <div className="bg-white w-full sm:max-w-[420px] rounded-t-3xl sm:rounded-3xl overflow-hidden shadow-2xl max-h-[80vh] flex flex-col">
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
          <h3 className="text-base font-extrabold text-gray-900 truncate pr-2">Move "{item.name}"</h3>
          <button onClick={onClose} className="w-9 h-9 rounded-full flex items-center justify-center hover:bg-gray-100 shrink-0">
            <CloseIcon className="w-5 h-5 text-gray-500" />
          </button>
        </div>
        <div className="overflow-y-auto py-1">
          {[...collections, UNCATEGORIZED].map(c => {
            const active = (c.id ?? null) === currentId
            return (
              <button
                key={c.id ?? 'uncat'}
                disabled={active}
                onClick={() => onMove(item, c.id ?? null)}
                className="w-full flex items-center gap-3 px-5 py-3 text-left hover:bg-gray-50 transition-colors disabled:opacity-50 disabled:cursor-default"
              >
                <span className="text-xl">{c.emoji}</span>
                <span className="flex-1 text-sm font-semibold text-gray-800">{c.name}</span>
                {active && <span className="text-xs font-bold text-gray-400">Current</span>}
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}

// ── Read-only item detail view ──────────────────────────────────────────
function WishlistDetailModal({ item, collection, onClose, onEdit, onMove, onMarkPurchased, onDelete }) {
  const pr = priorityMeta(item.priority)
  const st = statusMeta(item.status)
  const cat = categoryMeta(item.category)
  const isPurchased = item.status === 'purchased'
  const hasPrice = hasPriceSet(item)
  const added = item.created_at
    ? new Date(item.created_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
    : null

  return (
    <div
      className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm sm:flex sm:items-center sm:justify-center sm:p-4"
      onClick={e => e.target === e.currentTarget && onClose()}
    >
      <div className="bg-white w-full h-full sm:h-auto sm:max-h-[90vh] sm:max-w-[520px] sm:rounded-3xl overflow-y-auto shadow-2xl">
        <div className="px-5 sm:px-7 py-4 border-b border-gray-100 flex items-center justify-between sticky top-0 bg-white z-10">
          <button onClick={onClose} className="w-9 h-9 rounded-full flex items-center justify-center hover:bg-gray-100 transition-colors">
            <CloseIcon className="w-5 h-5 text-gray-500" />
          </button>
          <div className="flex items-center gap-2">
            <button onClick={() => onEdit(item)} className="px-3 h-8 rounded-lg text-xs font-bold border border-gray-200 text-gray-600 hover:bg-gray-50 transition-colors">✏️ Edit</button>
            <button onClick={() => onMove(item)} className="px-3 h-8 rounded-lg text-xs font-bold border border-gray-200 text-gray-600 hover:bg-gray-50 transition-colors">↔ Move</button>
            <button onClick={() => onDelete(item)} className="px-3 h-8 rounded-lg text-xs font-bold border border-red-200 text-red-600 hover:bg-red-50 transition-colors">🗑️ Delete</button>
          </div>
        </div>

        <div className="p-5 sm:p-7">
          <div className="flex items-center justify-between gap-3">
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold" style={{ backgroundColor: `${cat.color}1A`, color: cat.color }}>
              <span>{cat.emoji}</span>{item.category}
            </span>
            <span className="inline-flex items-center gap-1.5 text-sm font-bold" style={{ color: pr.color }}>
              {pr.emoji} {pr.label}
            </span>
          </div>

          <h2 className="mt-4 text-2xl font-extrabold text-gray-900 leading-tight" style={{ textDecoration: st.strike ? 'line-through' : 'none' }}>
            {item.name}
          </h2>
          {item.brand && <p className="text-sm text-gray-500 mt-1">by {item.brand}</p>}

          <p className="mt-4 text-3xl font-extrabold text-gray-900">
            {hasPrice ? INR.format(item.price) : <span className="text-base font-semibold text-gray-400 italic">Price not set</span>}
          </p>

          <dl className="mt-5 space-y-2 text-sm">
            {collection && (
              <div className="flex gap-3">
                <dt className="w-20 shrink-0 font-semibold text-gray-400">Collection</dt>
                <dd className="font-semibold" style={{ color: collection.color }}>{collection.emoji} {collection.name}</dd>
              </div>
            )}
            <div className="flex gap-3">
              <dt className="w-20 shrink-0 font-semibold text-gray-400">Status</dt>
              <dd><span className="font-bold px-2 py-0.5 rounded-full text-xs" style={{ backgroundColor: st.bg, color: st.fg }}>{st.label}</span></dd>
            </div>
            <div className="flex gap-3">
              <dt className="w-20 shrink-0 font-semibold text-gray-400">Timing</dt>
              <dd className="text-gray-800">🕐 {item.purchase_timing || '—'}</dd>
            </div>
            {targetDateLabel(item, 'long') && (
              <div className="flex gap-3">
                <dt className="w-20 shrink-0 font-semibold text-gray-400">Target</dt>
                <dd className="font-semibold" style={{ color: '#2563EB' }}>📅 {targetDateLabel(item, 'long')}</dd>
              </div>
            )}
            {added && (
              <div className="flex gap-3">
                <dt className="w-20 shrink-0 font-semibold text-gray-400">Added</dt>
                <dd className="text-gray-800">{added}</dd>
              </div>
            )}
          </dl>

          {item.notes && (
            <div className="mt-5">
              <p className="text-xs font-bold uppercase tracking-wide text-gray-400 mb-1.5">Notes</p>
              <p className="text-sm text-gray-700 whitespace-pre-wrap leading-relaxed bg-gray-50 rounded-xl p-4">{item.notes}</p>
            </div>
          )}

          {item.url && (
            <a
              href={item.url} target="_blank" rel="noopener noreferrer"
              className="mt-5 inline-flex items-center gap-1.5 text-sm font-bold" style={{ color: '#6C63FF' }}
            >
              Open Product
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="w-3.5 h-3.5">
                <line x1="7" y1="17" x2="17" y2="7" /><polyline points="7 7 17 7 17 17" />
              </svg>
            </a>
          )}

          {!isPurchased && (
            <button
              onClick={() => onMarkPurchased(item)}
              className="mt-6 w-full py-3.5 rounded-2xl text-white text-sm font-bold hover:opacity-90 transition-opacity min-h-[48px]"
              style={{ backgroundColor: '#22C55E' }}
            >
              ✓ Mark as Purchased
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Compact item card ────────────────────────────────────────────────────
function ItemCard({ item, index = 0, removing = false, collectionChip, onView, onEdit, onMove, onMarkPurchased, onDelete }) {
  const [flash, setFlash] = useState(false)
  const [expanded, setExpanded] = useState(false)
  const pr = priorityMeta(item.priority)
  const st = statusMeta(item.status)
  const cat = categoryMeta(item.category)
  const isPurchased = item.status === 'purchased'
  const accent = isPurchased ? '#22C55E' : cat.color
  const hasPrice = hasPriceSet(item)
  const tgtLabel = targetDateLabel(item)
  const stop = (fn) => (e) => { e.stopPropagation(); fn() }

  async function handleMarkPurchased() {
    setFlash(true)
    await onMarkPurchased(item)
    setTimeout(() => setFlash(false), 900)
  }

  return (
    <div
      onClick={() => onView?.(item)}
      className={`group relative flex flex-col rounded-xl bg-white border border-gray-100 shadow-sm transition-all duration-200 cursor-pointer hover:-translate-y-1 hover:shadow-lg ${removing ? 'wl-card-exit' : 'wl-card-enter'} ${expanded ? '' : 'md:h-[176px]'} ${isPurchased ? 'opacity-80' : ''}`}
      style={removing ? undefined : { animationDelay: `${Math.min(index, 10) * 50}ms` }}
    >
      <span
        className="absolute left-0 top-0 bottom-0 w-[3px] rounded-l-xl opacity-70 group-hover:opacity-100 transition-opacity"
        style={{ background: accent }}
      />
      <div className="absolute inset-0 rounded-xl pointer-events-none" style={{ animation: flash ? 'wl-flash 0.9s ease-out' : 'none' }} />

      <div className="flex flex-col flex-1 min-h-0 p-4 pl-5">
        <div className="flex items-start justify-between gap-2">
          <span
            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold"
            style={{ backgroundColor: `${cat.color}1A`, color: cat.color }}
          >
            <span>{cat.emoji}</span>{item.category}
          </span>
          <span className="mt-1 w-2 h-2 rounded-full shrink-0" style={{ background: pr.color }} title={`${pr.label} priority`} />
        </div>

        <h3
          className="mt-2 text-base font-semibold text-gray-900 leading-snug line-clamp-1"
          style={{ textDecoration: st.strike ? 'line-through' : 'none' }}
        >
          {item.name}
        </h3>
        {collectionChip ? (
          <p className="text-xs mt-0.5 truncate font-semibold" style={{ color: collectionChip.color }}>
            {collectionChip.emoji} {collectionChip.name}{item.brand ? <span className="text-gray-400 font-normal"> · {item.brand}</span> : null}
          </p>
        ) : item.brand ? (
          <p className="text-xs text-gray-400 mt-0.5 truncate">by {item.brand}</p>
        ) : null}

        <div className="mt-auto flex items-center gap-1.5 text-sm text-gray-600 min-w-0">
          <span className="font-bold text-gray-900 shrink-0">{hasPrice ? INR.format(item.price) : '—'}</span>
          {tgtLabel && (
            <>
              <span className="text-gray-300">•</span>
              <span className="font-semibold shrink-0" style={{ color: '#2563EB' }}>📅 {tgtLabel}</span>
            </>
          )}
          {item.purchase_timing && (
            <>
              <span className="text-gray-300">•</span>
              <span className="truncate">{tgtLabel ? '' : '🕐 '}{item.purchase_timing}</span>
            </>
          )}
        </div>

        <div className="mt-2 pt-2 border-t border-gray-100 flex items-center justify-between gap-2">
          {item.url ? (
            <a
              href={item.url} target="_blank" rel="noopener noreferrer"
              onClick={e => e.stopPropagation()}
              className="inline-flex items-center gap-1 text-xs font-bold" style={{ color: '#6C63FF' }}
            >
              Open <span className="text-[10px]">↗</span>
            </a>
          ) : <span className="text-xs text-gray-300">No link</span>}

          <div className="flex items-center gap-1">
            {item.notes && (
              <button
                onClick={stop(() => setExpanded(e => !e))}
                className="px-1.5 h-7 rounded-md text-xs font-bold text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-colors"
                title={expanded ? 'Hide notes' : 'Show notes'}
              >
                {expanded ? '×' : '•••'}
              </button>
            )}
            <span className="text-[11px] font-bold px-2 py-0.5 rounded-full" style={{ backgroundColor: st.bg, color: st.fg }}>
              {st.label}
            </span>
          </div>
        </div>

        {expanded && item.notes && (
          <div className="mt-3 pt-3 border-t border-gray-100">
            <p className="text-xs text-gray-500 whitespace-pre-wrap">{item.notes}</p>
          </div>
        )}
      </div>

      {/* Quick-action row — hover-reveal on desktop, static on touch/mobile. */}
      <div className="absolute inset-x-0 bottom-0 h-9 overflow-hidden pointer-events-none max-md:hidden">
        <div className="absolute inset-x-0 bottom-0 h-9 flex translate-y-full group-hover:translate-y-0 transition-transform duration-200 border-t border-gray-100 bg-white/95 backdrop-blur-sm pointer-events-auto">
          {!isPurchased && (
            <button onClick={stop(handleMarkPurchased)} className="flex-1 text-[11px] font-bold text-green-600 hover:bg-green-50 transition-colors">✓ Buy</button>
          )}
          <button onClick={stop(() => onEdit(item))} className="flex-1 text-[11px] font-bold text-gray-600 hover:bg-gray-50 transition-colors border-l border-gray-100">Edit</button>
          <button onClick={stop(() => onMove(item))} className="flex-1 text-[11px] font-bold text-gray-600 hover:bg-gray-50 transition-colors border-l border-gray-100">Move</button>
          <button onClick={stop(() => onDelete(item))} className="flex-1 text-[11px] font-bold text-red-600 hover:bg-red-50 transition-colors border-l border-gray-100">Delete</button>
        </div>
      </div>

      <div className="md:hidden flex border-t border-gray-100">
        {!isPurchased && (
          <button onClick={stop(handleMarkPurchased)} className="flex-1 py-2.5 text-[11px] font-bold text-green-600 active:bg-green-50">✓ Buy</button>
        )}
        <button onClick={stop(() => onEdit(item))} className="flex-1 py-2.5 text-[11px] font-bold text-gray-600 active:bg-gray-50 border-l border-gray-100">Edit</button>
        <button onClick={stop(() => onMove(item))} className="flex-1 py-2.5 text-[11px] font-bold text-gray-600 active:bg-gray-50 border-l border-gray-100">Move</button>
        <button onClick={stop(() => onDelete(item))} className="flex-1 py-2.5 text-[11px] font-bold text-red-600 active:bg-red-50 border-l border-gray-100">Delete</button>
      </div>
    </div>
  )
}

// ── Collection card on the overview grid ───────────────────────────────────
function CollectionCard({ collection, items, index = 0, onOpen, onEdit, onDelete }) {
  const [menuOpen, setMenuOpen] = useState(false)
  const editable = !collection.uncategorized
  const count = items.length
  const pricedItems = items.filter(hasPriceSet)
  const value = pricedItems.reduce((s, i) => s + priceOf(i), 0)
  const pricedCount = pricedItems.length
  const highCount = items.filter(i => i.priority === 'high').length
  const highPct = count ? Math.round((highCount / count) * 100) : 0
  const prio = priorityMeta(topPriority(items))
  const preview = items.slice(0, 3)
  const more = count - preview.length

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onOpen(collection)}
      onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpen(collection) } }}
      className="wl-card-enter group relative text-left rounded-2xl border p-5 transition-all duration-200 cursor-pointer hover:-translate-y-1 hover:shadow-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-[#6C63FF]/40"
      style={{ animationDelay: `${Math.min(index, 10) * 50}ms`, background: `${collection.color}0D`, borderColor: `${collection.color}33` }}
    >
      <span className="absolute left-0 top-4 bottom-4 w-1 rounded-r" style={{ background: collection.color }} />

      <div className="flex items-start justify-between gap-3">
        <div className="text-4xl leading-none">{collection.emoji}</div>
        {editable && (
          <div className="relative shrink-0" onClick={e => e.stopPropagation()}>
            <KebabButton onClick={() => setMenuOpen(o => !o)} />
            {menuOpen && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(false)} />
                <div className="absolute right-0 top-9 z-20 w-44 bg-white rounded-xl shadow-xl border border-gray-100 overflow-hidden py-1">
                  <button onClick={() => { setMenuOpen(false); onEdit(collection) }} className="w-full text-left px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50">✏️ Edit</button>
                  <button onClick={() => { setMenuOpen(false); onDelete(collection) }} className="w-full text-left px-4 py-2.5 text-sm font-medium text-red-600 hover:bg-red-50">🗑️ Delete</button>
                </div>
              </>
            )}
          </div>
        )}
      </div>

      <h3 className="mt-3 text-xl font-bold text-gray-900 truncate">{collection.name}</h3>
      <p className="text-xs text-gray-500 mt-0.5">{count} item{count === 1 ? '' : 's'}</p>
      {pricedCount === 0 ? (
        <p className="mt-1 text-sm font-semibold text-gray-400">No budget set yet</p>
      ) : (
        <p className="mt-1 text-lg font-extrabold" style={{ color: budgetColor(value) }}>
          {INR.format(value)}
          {pricedCount < count && (
            <span className="ml-1.5 text-xs font-semibold text-gray-400">• {pricedCount} item{pricedCount === 1 ? '' : 's'} priced</span>
          )}
        </p>
      )}

      {preview.length > 0 ? (
        <ul className="mt-3 space-y-0.5">
          {preview.map(i => (
            <li key={i.id} className="text-sm text-gray-600 truncate">• {i.name}</li>
          ))}
          {more > 0 && <li className="text-sm text-gray-400">• +{more} more</li>}
        </ul>
      ) : (
        <p className="mt-3 text-sm text-gray-400 italic">Empty — tap to add items</p>
      )}

      {count > 0 && (
        <div className="mt-4 flex items-center gap-2.5">
          <div className="h-1.5 flex-1 rounded-full bg-gray-200/70 overflow-hidden">
            <div className="h-full rounded-full" style={{ width: `${Math.max(highPct, 6)}%`, background: collection.color }} />
          </div>
          <span className="text-xs font-semibold shrink-0" style={{ color: prio.color }}>{prio.label} priority</span>
        </div>
      )}
    </div>
  )
}

// ── Grid of item cards (active + purchased sections) ───────────────────────
function ItemGrid({ items, collections, showChips, removingId, onView, onEdit, onMove, onMarkPurchased, onDelete }) {
  const active = items.filter(i => i.status !== 'purchased')
  const purchased = items.filter(i => i.status === 'purchased')

  const renderCard = (item, i) => (
    <ItemCard
      key={item.id}
      index={i}
      item={item}
      removing={removingId === item.id}
      collectionChip={showChips ? collectionOf(item, collections) : undefined}
      onView={onView}
      onEdit={onEdit}
      onMove={onMove}
      onMarkPurchased={onMarkPurchased}
      onDelete={onDelete}
    />
  )

  return (
    <>
      {active.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {active.map(renderCard)}
        </div>
      )}
      {purchased.length > 0 && (
        <div className={active.length > 0 ? 'mt-10' : ''}>
          <div className="flex items-center gap-3 mb-5">
            <div className="h-px flex-1 bg-gray-200" />
            <span className="text-sm font-bold text-gray-500">✅ Purchased ({purchased.length})</span>
            <div className="h-px flex-1 bg-gray-200" />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {purchased.map(renderCard)}
          </div>
        </div>
      )}
    </>
  )
}

// ── Collection detail "page" ──────────────────────────────────────────────
function CollectionDetail({ collection, items, collections, removingId, onBack, onAddItem, onEditCollection, onDeleteCollection, ...handlers }) {
  const [menuOpen, setMenuOpen] = useState(false)
  const editable = !collection.uncategorized
  const count = items.length
  const value = items.filter(hasPriceSet).reduce((s, i) => s + priceOf(i), 0)
  const prio = priorityMeta(topPriority(items))

  const ordered = useMemo(() => {
    const rank = { high: 0, medium: 1, low: 2 }
    return [...items].sort((a, b) => {
      if ((a.status === 'purchased') !== (b.status === 'purchased')) return a.status === 'purchased' ? 1 : -1
      if (rank[a.priority] !== rank[b.priority]) return rank[a.priority] - rank[b.priority]
      return new Date(b.created_at) - new Date(a.created_at)
    })
  }, [items])

  return (
    <div className="wl-results-in">
      <div
        className="rounded-3xl p-5 md:p-7 mb-6 border"
        style={{ background: `${collection.color}0D`, borderColor: `${collection.color}33` }}
      >
        <button onClick={onBack} className="inline-flex items-center gap-1.5 text-sm font-bold text-gray-500 hover:text-gray-800 transition-colors mb-3">
          <ChevronDown className="w-4 h-4 rotate-90" /> Back to collections
        </button>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-2xl md:text-3xl font-extrabold text-gray-900 flex items-center gap-2.5">
              <span className="text-3xl md:text-4xl">{collection.emoji}</span>
              <span className="truncate">{collection.name}</span>
            </h1>
            <p className="text-sm text-gray-600 mt-1 font-medium">
              {count} item{count === 1 ? '' : 's'}
              {count > 0 && <> • <span style={{ color: prio.color }}>{prio.label} priority</span></>}
              {value > 0 && <> • {INR.format(value)} budgeted</>}
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={() => onAddItem(collection)}
              className="flex items-center gap-1.5 px-4 py-2.5 rounded-full bg-white text-sm font-bold shadow-sm hover:shadow-md transition-all"
              style={{ color: collection.color }}
            >
              + Add Item
            </button>
            {editable && (
              <div className="relative">
                <KebabButton onClick={() => setMenuOpen(o => !o)} className="bg-white/70" />
                {menuOpen && (
                  <>
                    <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(false)} />
                    <div className="absolute right-0 top-10 z-20 w-48 bg-white rounded-xl shadow-xl border border-gray-100 overflow-hidden py-1">
                      <button onClick={() => { setMenuOpen(false); onEditCollection(collection) }} className="w-full text-left px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50">✏️ Edit collection</button>
                      <button onClick={() => { setMenuOpen(false); onDeleteCollection(collection) }} className="w-full text-left px-4 py-2.5 text-sm font-medium text-red-600 hover:bg-red-50">🗑️ Delete collection</button>
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {count === 0 ? (
        <div className="flex flex-col items-center justify-center text-center py-16 px-4">
          <div style={{ fontSize: 56, lineHeight: 1 }} className="mb-3">{collection.emoji}</div>
          <p className="text-lg font-extrabold text-gray-900">Nothing here yet</p>
          <p className="text-sm text-gray-500 mt-1.5 mb-5">Add the first thing you want for this collection.</p>
          <button
            onClick={() => onAddItem(collection)}
            className="wl-pulse px-6 py-3.5 rounded-full text-white text-sm font-bold min-h-[48px]"
            style={{ backgroundColor: collection.color }}
          >
            + Add Item
          </button>
        </div>
      ) : (
        <ItemGrid items={ordered} collections={collections} showChips={false} removingId={removingId} {...handlers} />
      )}
    </div>
  )
}

// ── Timeline pieces ───────────────────────────────────────────────────────
function TimelineCard({ item, collectionChip, onView, onEdit, onMarkPurchased, onDelete }) {
  const [menuOpen, setMenuOpen] = useState(false)
  const cat = categoryMeta(item.category)
  const st = statusMeta(item.status)
  const isPurchased = item.status === 'purchased'

  return (
    <div
      onClick={() => onView?.(item)}
      className="wl-card-enter relative bg-white rounded-xl shadow-sm hover:shadow-md transition-shadow p-3.5 w-[210px] shrink-0 md:w-auto cursor-pointer"
      style={{ borderLeft: `3px solid ${isPurchased ? '#22C55E' : cat.color}` }}
    >
      <div className="flex items-start justify-between gap-1">
        <h4 className="text-sm font-bold text-gray-900 leading-snug line-clamp-2 pr-1">{item.name}</h4>
        <div className="relative shrink-0">
          <button
            onClick={(e) => { e.stopPropagation(); setMenuOpen(o => !o) }}
            className="w-7 h-7 -mr-1 -mt-1 rounded-full flex items-center justify-center hover:bg-gray-100 transition-colors text-gray-400"
          >
            <svg viewBox="0 0 24 24" fill="currentColor" className="w-3.5 h-3.5">
              <circle cx="12" cy="5" r="1.5" /><circle cx="12" cy="12" r="1.5" /><circle cx="12" cy="19" r="1.5" />
            </svg>
          </button>
          {menuOpen && (
            <>
              <div className="fixed inset-0 z-10" onClick={(e) => { e.stopPropagation(); setMenuOpen(false) }} />
              <div className="absolute right-0 top-8 z-20 w-40 bg-white rounded-xl shadow-xl border border-gray-100 overflow-hidden py-1" onClick={(e) => e.stopPropagation()}>
                <button onClick={() => { setMenuOpen(false); onEdit(item) }} className="w-full text-left px-3.5 py-2 text-xs font-medium text-gray-700 hover:bg-gray-50">✏️ Edit</button>
                {!isPurchased && (
                  <button onClick={() => { setMenuOpen(false); onMarkPurchased(item) }} className="w-full text-left px-3.5 py-2 text-xs font-medium text-gray-700 hover:bg-gray-50">✅ Mark Purchased</button>
                )}
                <button onClick={() => { setMenuOpen(false); onDelete(item) }} className="w-full text-left px-3.5 py-2 text-xs font-medium text-red-600 hover:bg-red-50">🗑️ Delete</button>
              </div>
            </>
          )}
        </div>
      </div>

      {collectionChip && (
        <p className="text-[11px] font-semibold mt-1 truncate" style={{ color: collectionChip.color }}>
          {collectionChip.emoji} {collectionChip.name}
        </p>
      )}

      <p className="text-xs text-gray-500 mt-0.5 truncate">
        {item.brand && <>{item.brand} • </>}
        {hasPriceSet(item) ? INR.format(item.price) : 'Price not set'}
      </p>
      {targetDateLabel(item) && (
        <p className="text-xs font-semibold mt-1 truncate" style={{ color: '#2563EB' }}>📅 {targetDateLabel(item)}</p>
      )}

      <div className="flex items-center justify-between gap-2 mt-2.5">
        <span
          className="text-[11px] font-bold px-2 py-0.5 rounded-full"
          style={{ backgroundColor: st.bg, color: st.fg, textDecoration: st.strike ? 'line-through' : 'none' }}
        >
          {st.label}
        </span>
        {item.url && (
          <a href={item.url} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()} className="text-[11px] font-bold" style={{ color: '#6C63FF' }}>
            Open ↗
          </a>
        )}
      </div>
    </div>
  )
}

function TimelineSection({ def, monthLabel, items, collections, collapsed, onToggle, onView, onEdit, onMarkPurchased, onDelete }) {
  if (items.length === 0) return null
  const label = def.key === 'This Month' && monthLabel ? `${def.label} — ${monthLabel}` : def.label
  const cardsFor = (extraClass) => (
    <div className={extraClass}>
      {items.map(item => (
        <TimelineCard
          key={item.id} item={item}
          collectionChip={collectionOf(item, collections)}
          onView={onView} onEdit={onEdit} onMarkPurchased={onMarkPurchased} onDelete={onDelete}
        />
      ))}
    </div>
  )

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
          {cardsFor('flex md:hidden gap-3 overflow-x-auto pb-1 -mx-1 px-1')}
          {cardsFor('hidden md:grid grid-cols-2 lg:grid-cols-3 gap-3')}
        </>
      )}
    </div>
  )
}

function TimelineView({ items, collections, onView, onEdit, onMarkPurchased, onDelete }) {
  const [selectedYear, setSelectedYear] = useState(CURRENT_YEAR)
  const [collapsed, setCollapsed] = useState({})

  const nonPurchased = useMemo(() => items.filter(i => i.status !== 'purchased'), [items])
  const purchased = useMemo(() => items.filter(i => i.status === 'purchased'), [items])
  const monthLabel = useMemo(() => new Date().toLocaleDateString('en-IN', { month: 'long', year: 'numeric' }), [])

  const visibleSections = useMemo(
    () => TIME_SECTIONS.filter(def => selectedYear === 'all' || def.kind === 'current-year'),
    [selectedYear]
  )

  const showThisYear = selectedYear === CURRENT_YEAR
  const isThisYearTarget = (i) => Number(i.target_year) === CURRENT_YEAR

  const thisYearItems = useMemo(
    () => (showThisYear ? sortByTargetThenRecent(nonPurchased.filter(isThisYearTarget)) : []),
    [nonPurchased, showThisYear]
  )

  const groupedByKey = useMemo(() => {
    const groups = {}
    for (const def of TIME_SECTIONS) groups[def.key] = []
    for (const item of nonPurchased) {
      if (showThisYear && isThisYearTarget(item)) continue
      groups[timingSection(item.purchase_timing).key].push(item)
    }
    for (const k of Object.keys(groups)) groups[k] = sortByTargetThenRecent(groups[k])
    return groups
  }, [nonPurchased, showThisYear])

  const priced = useMemo(() => nonPurchased.filter(hasPriceSet), [nonPurchased])
  const sumByKind = (kind) => priced.filter(i => timingSection(i.purchase_timing).kind === kind).reduce((s, i) => s + Number(i.price), 0)
  const thisYearTotal = sumByKind('current-year')
  const conditionalTotal = sumByKind('conditional')
  const noPlanTotal = sumByKind('noplan')
  const totalSpend = thisYearTotal + conditionalTotal + noPlanTotal

  const toggleSection = (key) => setCollapsed(c => ({ ...c, [key]: !c[key] }))
  const nothingToShow = thisYearItems.length === 0
    && visibleSections.every(def => groupedByKey[def.key].length === 0)
    && purchased.length === 0

  return (
    <div>
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

      <div className="flex gap-2 mb-6 overflow-x-auto pb-1 -mx-1 px-1">
        {[...YEAR_OPTIONS, 'all'].map(y => (
          <button
            key={y} onClick={() => setSelectedYear(y)}
            className="shrink-0 px-4 py-2 rounded-full text-sm font-bold border transition-colors"
            style={{
              backgroundColor: selectedYear === y ? '#6C63FF' : '#fff',
              borderColor: selectedYear === y ? '#6C63FF' : '#E5E7EB',
              color: selectedYear === y ? '#fff' : '#4B5563',
            }}
          >
            {y === 'all' ? 'All Time' : y}
          </button>
        ))}
      </div>

      {nothingToShow ? (
        <p className="text-sm text-gray-400 py-14 text-center">
          📭 Nothing planned for {selectedYear === 'all' ? 'this view' : selectedYear} — try "All Time".
        </p>
      ) : (
        <>
          {thisYearItems.length > 0 && (
            <TimelineSection
              def={THIS_YEAR_SECTION} items={thisYearItems} collections={collections}
              collapsed={Boolean(collapsed[THIS_YEAR_SECTION.key])}
              onToggle={() => toggleSection(THIS_YEAR_SECTION.key)}
              onView={onView} onEdit={onEdit} onMarkPurchased={onMarkPurchased} onDelete={onDelete}
            />
          )}
          {visibleSections.map(def => (
            <TimelineSection
              key={def.key} def={def} monthLabel={monthLabel}
              items={groupedByKey[def.key]} collections={collections}
              collapsed={Boolean(collapsed[def.key])}
              onToggle={() => toggleSection(def.key)}
              onView={onView} onEdit={onEdit} onMarkPurchased={onMarkPurchased} onDelete={onDelete}
            />
          ))}
          {purchased.length > 0 && (
            <TimelineSection
              def={PURCHASED_SECTION} items={purchased} collections={collections}
              collapsed={Boolean(collapsed[PURCHASED_SECTION.key])}
              onToggle={() => toggleSection(PURCHASED_SECTION.key)}
              onView={onView} onEdit={onEdit} onMarkPurchased={onMarkPurchased} onDelete={onDelete}
            />
          )}
        </>
      )}
    </div>
  )
}

// ── Main page ────────────────────────────────────────────────────────────
// Inner content is exported as <WishlistContent /> so the unified Goals &
// Wishlist page can render it verbatim inside its "Wishlist" section. Passing
// { requestedCollectionId, requestNonce } opens that collection (used when a
// Venn chip is clicked). The default export is a thin wrapper kept for the
// standalone route / fallback alias and the Tracker app.
export function WishlistContent({ requestedCollectionId, requestNonce } = {}) {
  const [items, setItems] = useState([])
  const [collections, setCollections] = useState([])
  const [loading, setLoading] = useState(true)
  const [view, setView] = useState(getStoredView)
  const [openCollectionId, setOpenCollectionId] = useState(undefined) // undefined = overview
  const [search, setSearch] = useState('')

  const [modalItem, setModalItem] = useState(null)
  const [showModal, setShowModal] = useState(false)
  const [modalLockCollection, setModalLockCollection] = useState(null) // { id } | null
  const [detailItem, setDetailItem] = useState(null)
  const [moveItem, setMoveItem] = useState(null)
  const [collectionModal, setCollectionModal] = useState(null) // { editing?: collection } | null
  const [removingId, setRemovingId] = useState(null)

  function changeView(v) {
    setView(v)
    try { localStorage.setItem(VIEW_STORAGE_KEY, v) } catch {}
  }

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [rows, cols] = await Promise.all([
        bridge.getWishlistItems(),
        bridge.getWishlistCollections().catch(() => []),
      ])
      setItems(rows || [])
      setCollections(cols || [])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  // Open a specific collection on request from the parent (Venn chip click).
  useEffect(() => {
    if (!requestNonce || requestedCollectionId == null) return
    setSearch('')
    setView('collections')
    setOpenCollectionId(requestedCollectionId)
  }, [requestNonce]) // eslint-disable-line react-hooks/exhaustive-deps

  const hasUncategorized = useMemo(() => items.some(i => i.collection_id == null), [items])

  const allCollections = useMemo(
    () => (hasUncategorized ? [...collections, UNCATEGORIZED] : collections),
    [collections, hasUncategorized]
  )

  const itemsInCollection = useCallback(
    (colId) => items.filter(i => (i.collection_id ?? null) === (colId ?? null)),
    [items]
  )

  const openCollection = useMemo(() => {
    if (openCollectionId === undefined) return null
    if (openCollectionId === null) return UNCATEGORIZED
    return collections.find(c => c.id === openCollectionId) || null
  }, [openCollectionId, collections])

  // If the open collection was deleted, fall back to the overview.
  useEffect(() => {
    if (openCollectionId !== undefined && openCollectionId !== null && !openCollection && !loading) {
      setOpenCollectionId(undefined)
    }
  }, [openCollectionId, openCollection, loading])

  const searchResults = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return null
    return items.filter(i =>
      i.name.toLowerCase().includes(q) || (i.brand || '').toLowerCase().includes(q)
    )
  }, [items, search])

  // ── item mutations ──
  function openView(item) { setDetailItem(item) }
  function closeView() { setDetailItem(null) }
  function openAddItem(collection) {
    setModalItem(null)
    setModalLockCollection(collection ? { id: collection.id ?? null } : null)
    setShowModal(true)
  }
  function openEdit(item) {
    setDetailItem(null)
    setModalItem(item)
    setModalLockCollection(null)
    setShowModal(true)
  }
  function closeModal() { setShowModal(false); setModalItem(null); setModalLockCollection(null) }
  async function handleSaved() { closeModal(); await load() }

  async function markPurchased(item) {
    await bridge.updateWishlistItem({ ...item, status: 'purchased' })
    setDetailItem(d => (d && d.id === item.id ? null : d))
    await load()
  }

  async function handleMove(item, collectionId) {
    await bridge.moveWishlistItem(item.id, collectionId ?? null)
    setMoveItem(null)
    setDetailItem(d => (d && d.id === item.id ? null : d))
    await load()
  }

  async function handleDelete(item) {
    if (!confirm(`Remove "${item.name}" from wishlist?`)) return
    setDetailItem(d => (d && d.id === item.id ? null : d))
    setRemovingId(item.id)
    setTimeout(async () => {
      try {
        await bridge.deleteWishlistItem(item.id)
        await load()
      } finally {
        setRemovingId(null)
      }
    }, 240)
  }

  // ── collection mutations ──
  async function handleCollectionSaved() { setCollectionModal(null); await load() }

  async function handleDeleteCollection(collection) {
    const n = itemsInCollection(collection.id).length
    if (!confirm(`Delete "${collection.name}"?${n ? ` Its ${n} item${n === 1 ? '' : 's'} will move to Uncategorized.` : ''}`)) return
    await bridge.deleteWishlistCollection(collection.id)
    if (openCollectionId === collection.id) setOpenCollectionId(undefined)
    await load()
  }

  const itemHandlers = {
    onView: openView, onEdit: openEdit, onMove: setMoveItem,
    onMarkPurchased: markPurchased, onDelete: handleDelete,
  }

  const totalItems = items.length
  const highCount = useMemo(() => items.filter(i => i.priority === 'high' && i.status !== 'dropped').length, [items])
  const totals = useMemo(() => wishlistTotals(items), [items])
  const detailCollection = detailItem ? collectionOf(detailItem, collections) : null

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
              {totalItems} item{totalItems === 1 ? '' : 's'}
              {highCount > 0 && <> • {highCount} high priority</>}
              {collections.length > 0 && <> • {collections.length} collection{collections.length === 1 ? '' : 's'}</>}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1 bg-white/70 backdrop-blur rounded-full p-1 shadow-sm border border-white">
              <button
                onClick={() => changeView('collections')}
                className="flex items-center gap-1.5 px-3.5 py-2 rounded-full text-sm font-bold transition-colors min-h-[40px]"
                style={{ backgroundColor: view === 'collections' ? '#6C63FF' : 'transparent', color: view === 'collections' ? '#fff' : '#6B7280' }}
              >
                🗂️ Collections
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
              onClick={() => setCollectionModal({})}
              className="flex items-center gap-2 px-5 py-3 rounded-full bg-white text-sm font-bold shadow-lg hover:shadow-xl hover:-translate-y-0.5 transition-all min-h-[48px]"
              style={{ color: '#6C63FF' }}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
                <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
              </svg>
              New Collection
            </button>
          </div>
        </div>

        {totals.total > 0 && (
          <div className="mt-5 pt-4 border-t border-white/50">
            <p className="text-xs font-bold uppercase tracking-wide text-gray-500">💰 Total Wishlist Value</p>
            <p className="text-2xl md:text-3xl font-extrabold leading-tight mt-0.5" style={{ color: budgetColor(totals.total) }}>
              {INR.format(totals.total)}
            </p>
            <p className="text-xs text-gray-500 mt-0.5">
              across {totals.itemCount} item{totals.itemCount === 1 ? '' : 's'}
              {totals.unpricedCount > 0 && <> ({totals.unpricedCount} without price)</>}
            </p>
          </div>
        )}
      </div>

      {/* Search */}
      <div className="relative mb-6">
        <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400">🔍</span>
        <input
          type="text" placeholder="Search all collections…"
          value={search} onChange={e => setSearch(e.target.value)}
          className="w-full pl-10 pr-4 py-3 rounded-full border border-gray-200 bg-white text-sm text-gray-800 focus:outline-none focus:border-[#6C63FF] focus:ring-2 focus:ring-[#6C63FF]/20"
        />
      </div>

      {loading ? (
        <p className="text-sm text-gray-400 py-14 text-center">Loading your wishlist…</p>
      ) : searchResults ? (
        <div className="wl-results-in">
          <p className="text-sm font-bold text-gray-500 mb-4">
            {searchResults.length} result{searchResults.length === 1 ? '' : 's'} for “{search.trim()}”
          </p>
          {searchResults.length === 0 ? (
            <p className="text-sm text-gray-400 py-10 text-center">Nothing matches — try a different word.</p>
          ) : (
            <ItemGrid items={searchResults} collections={collections} showChips removingId={removingId} {...itemHandlers} />
          )}
        </div>
      ) : view === 'timeline' ? (
        <TimelineView items={items} collections={collections} onView={openView} onEdit={openEdit} onMarkPurchased={markPurchased} onDelete={handleDelete} />
      ) : openCollection ? (
        <CollectionDetail
          collection={openCollection}
          items={itemsInCollection(openCollection.id)}
          collections={collections}
          removingId={removingId}
          onBack={() => setOpenCollectionId(undefined)}
          onAddItem={openAddItem}
          onEditCollection={(c) => setCollectionModal({ editing: c })}
          onDeleteCollection={handleDeleteCollection}
          {...itemHandlers}
        />
      ) : collections.length === 0 && !hasUncategorized ? (
        <div className="flex flex-col items-center justify-center text-center py-16 px-4">
          <div style={{ fontSize: 64, lineHeight: 1 }} className="mb-4">🗂️</div>
          <p className="text-xl font-extrabold text-gray-900">Start with a collection</p>
          <p className="text-sm text-gray-500 mt-1.5 mb-6 max-w-xs">
            Collections keep your wishlist organised — like lists in Reminders or boards in Pinterest.
          </p>
          <button
            onClick={() => setCollectionModal({})}
            className="wl-pulse px-6 py-3.5 rounded-full text-white text-sm font-bold min-h-[48px]"
            style={{ backgroundColor: '#6C63FF' }}
          >
            + New Collection
          </button>
        </div>
      ) : (
        <div className="wl-results-in grid grid-cols-1 md:grid-cols-2 gap-4">
          {allCollections.map((c, i) => (
            <CollectionCard
              key={c.id ?? 'uncat'}
              index={i}
              collection={c}
              items={itemsInCollection(c.id)}
              onOpen={(col) => setOpenCollectionId(col.uncategorized ? null : col.id)}
              onEdit={(col) => setCollectionModal({ editing: col })}
              onDelete={handleDeleteCollection}
            />
          ))}
        </div>
      )}

      {showModal && (
        <WishlistModal
          item={modalItem}
          collections={collections}
          lockedCollectionId={modalLockCollection ? modalLockCollection.id : undefined}
          collectionLocked={Boolean(modalLockCollection)}
          onSave={handleSaved}
          onClose={closeModal}
        />
      )}
      {collectionModal && (
        <CollectionModal
          collection={collectionModal.editing}
          onSave={handleCollectionSaved}
          onClose={() => setCollectionModal(null)}
        />
      )}
      {moveItem && (
        <MovePicker
          item={moveItem}
          collections={collections}
          onMove={handleMove}
          onClose={() => setMoveItem(null)}
        />
      )}
      {detailItem && !showModal && (
        <WishlistDetailModal
          item={detailItem}
          collection={detailCollection}
          onClose={closeView}
          onEdit={openEdit}
          onMove={setMoveItem}
          onMarkPurchased={markPurchased}
          onDelete={handleDelete}
        />
      )}
    </div>
  )
}

export default function Wishlist() {
  return <WishlistContent />
}
