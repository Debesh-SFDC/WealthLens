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

const PURCHASE_TIMINGS = [
  'Now', 'This Month', 'Next 3 Months', 'Later',
  'After I Buy a House', 'After I Move',
  'When Current One Breaks', 'After Next Salary Revision', 'No Plan',
]

const PRIORITIES = [
  { value: 'high',   label: 'High',   emoji: '🔴' },
  { value: 'medium', label: 'Medium', emoji: '🟡' },
  { value: 'low',    label: 'Low',    emoji: '🟢' },
]

const STATUSES = [
  { value: 'wishlist',    label: 'Wishlist',    bg: '#EEF2FF', fg: '#4F46E5' },
  { value: 'shortlisted', label: 'Shortlisted', bg: '#E0F2FE', fg: '#0284C7' },
  { value: 'planned',     label: 'Planned',     bg: '#FEF3C7', fg: '#B45309' },
  { value: 'purchased',   label: 'Purchased ✓', bg: '#DCFCE7', fg: '#16A34A' },
  { value: 'dropped',     label: 'Dropped',     bg: '#F3F4F6', fg: '#6B7280' },
]

const INR = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 })

const priorityMeta = (p) => PRIORITIES.find(x => x.value === p) || PRIORITIES[1]
const statusMeta = (s) => STATUSES.find(x => x.value === s) || STATUSES[0]

function BagIcon(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M6 7h12l1.2 13.2a1 1 0 0 1-1 1.1H5.8a1 1 0 0 1-1-1.1L6 7z" />
      <path d="M9 7V5.5a3 3 0 0 1 6 0V7" />
    </svg>
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
  const [showMore, setShowMore] = useState(isEdit)
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

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
      onClick={e => e.target === e.currentTarget && onClose()}
    >
      <div className="bg-white rounded-2xl w-full max-w-[480px] max-h-[90vh] overflow-y-auto shadow-2xl">
        <div className="px-6 py-5 border-b border-gray-100 flex items-center justify-between sticky top-0 bg-white z-10">
          <h2 className="text-lg font-bold text-gray-900">{isEdit ? 'Edit Item' : 'Add to Wishlist'}</h2>
          <button onClick={onClose} className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-gray-100 transition-colors">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4 text-gray-500">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5 block">Item name *</label>
            <input
              autoFocus required
              type="text" placeholder="e.g. Shoei GT-Air 3 Helmet"
              value={form.name} onChange={e => set('name', e.target.value)}
              className="w-full px-4 py-3 rounded-xl border border-gray-200 text-lg font-semibold text-gray-900 focus:outline-none focus:border-[#6C63FF] focus:ring-2 focus:ring-[#6C63FF]/20"
            />
          </div>

          <div>
            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5 block">Category *</label>
            <select
              required value={form.category} onChange={e => set('category', e.target.value)}
              className="w-full px-4 py-2.5 rounded-xl border border-gray-200 bg-white text-sm font-medium text-gray-800 focus:outline-none focus:border-[#6C63FF] focus:ring-2 focus:ring-[#6C63FF]/20"
            >
              {WISHLIST_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>

          <div>
            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5 block">Product URL</label>
            <input
              type="url" placeholder="Paste product link here"
              value={form.url || ''} onChange={e => set('url', e.target.value)}
              className="w-full px-4 py-2.5 rounded-xl border border-gray-200 text-sm text-gray-800 focus:outline-none focus:border-[#6C63FF] focus:ring-2 focus:ring-[#6C63FF]/20"
            />
          </div>

          <button
            type="button"
            onClick={() => setShowMore(s => !s)}
            className="flex items-center gap-1.5 text-sm font-semibold"
            style={{ color: '#6C63FF' }}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"
              className="w-4 h-4 transition-transform" style={{ transform: showMore ? 'rotate(90deg)' : 'none' }}>
              <polyline points="9 18 15 12 9 6" />
            </svg>
            {showMore ? 'Hide details' : 'Add more details'}
          </button>

          {showMore && (
            <div className="space-y-4 pt-4 border-t border-gray-100">
              <div>
                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5 block">Brand</label>
                <input
                  type="text" placeholder="e.g. Shoei"
                  value={form.brand || ''} onChange={e => set('brand', e.target.value)}
                  className="w-full px-4 py-2.5 rounded-xl border border-gray-200 text-sm text-gray-800 focus:outline-none focus:border-[#6C63FF] focus:ring-2 focus:ring-[#6C63FF]/20"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5 block">Current price</label>
                <div className="relative">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500 font-semibold text-sm">₹</span>
                  <input
                    type="number" min="0" step="0.01" placeholder="0"
                    value={form.price} onChange={e => set('price', e.target.value)}
                    className="w-full pl-8 pr-4 py-2.5 rounded-xl border border-gray-200 text-sm font-medium text-gray-800 focus:outline-none focus:border-[#6C63FF] focus:ring-2 focus:ring-[#6C63FF]/20"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5 block">Priority</label>
                <div className="flex gap-2">
                  {PRIORITIES.map(p => (
                    <button
                      key={p.value} type="button" onClick={() => set('priority', p.value)}
                      className="flex-1 py-2 rounded-xl text-sm font-semibold border transition-colors"
                      style={{
                        borderColor: form.priority === p.value ? '#6C63FF' : '#E5E7EB',
                        backgroundColor: form.priority === p.value ? '#F0EFFF' : '#fff',
                        color: form.priority === p.value ? '#6C63FF' : '#6B7280',
                      }}
                    >
                      {p.emoji} {p.label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5 block">Status</label>
                <select
                  value={form.status} onChange={e => set('status', e.target.value)}
                  className="w-full px-4 py-2.5 rounded-xl border border-gray-200 bg-white text-sm font-medium text-gray-800 focus:outline-none focus:border-[#6C63FF] focus:ring-2 focus:ring-[#6C63FF]/20"
                >
                  {STATUSES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                </select>
              </div>

              <div>
                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5 block">Purchase timing</label>
                <select
                  value={form.purchase_timing} onChange={e => set('purchase_timing', e.target.value)}
                  className="w-full px-4 py-2.5 rounded-xl border border-gray-200 bg-white text-sm font-medium text-gray-800 focus:outline-none focus:border-[#6C63FF] focus:ring-2 focus:ring-[#6C63FF]/20"
                >
                  {PURCHASE_TIMINGS.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>

              <div>
                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5 block">Notes</label>
                <textarea
                  rows={3} placeholder="Why do you want this? Any conditions?"
                  value={form.notes || ''} onChange={e => set('notes', e.target.value)}
                  className="w-full px-4 py-2.5 rounded-xl border border-gray-200 text-sm text-gray-800 focus:outline-none focus:border-[#6C63FF] focus:ring-2 focus:ring-[#6C63FF]/20 resize-none"
                />
              </div>
            </div>
          )}

          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose} className="flex-1 py-2.5 rounded-xl border border-gray-200 text-sm font-semibold text-gray-600 hover:bg-gray-50 transition-colors">
              Cancel
            </button>
            <button
              type="submit" disabled={saving}
              className="flex-1 py-2.5 rounded-xl text-white text-sm font-semibold hover:opacity-90 transition-opacity disabled:opacity-60"
              style={{ backgroundColor: '#6C63FF' }}
            >
              {saving ? 'Saving…' : 'Save to Wishlist'}
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
  const pr = priorityMeta(item.priority)
  const st = statusMeta(item.status)

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="font-bold text-gray-900 text-[15px] truncate">{item.name}</h3>
          <p className="text-xs text-gray-500 mt-1 flex items-center gap-1.5 flex-wrap">
            {item.brand && <span>{item.brand}</span>}
            {item.brand && <span>•</span>}
            <span className="px-2 py-0.5 rounded-full bg-gray-100 text-gray-600 font-medium">{item.category}</span>
          </p>
        </div>

        <div className="relative shrink-0">
          <button
            onClick={() => setMenuOpen(o => !o)}
            className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-gray-100 transition-colors text-gray-400"
          >
            <svg viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4">
              <circle cx="12" cy="5" r="1.5" /><circle cx="12" cy="12" r="1.5" /><circle cx="12" cy="19" r="1.5" />
            </svg>
          </button>
          {menuOpen && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(false)} />
              <div className="absolute right-0 top-9 z-20 w-44 bg-white rounded-xl shadow-xl border border-gray-100 overflow-hidden py-1">
                <button onClick={() => { setMenuOpen(false); onEdit(item) }} className="w-full text-left px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50">
                  Edit
                </button>
                {item.status !== 'purchased' && (
                  <button onClick={() => { setMenuOpen(false); onMarkPurchased(item) }} className="w-full text-left px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50">
                    Mark Purchased
                  </button>
                )}
                <button onClick={() => { setMenuOpen(false); onDelete(item) }} className="w-full text-left px-4 py-2.5 text-sm text-red-600 hover:bg-red-50">
                  Delete
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      <div className="flex items-center gap-2 mt-3 flex-wrap">
        <span className="inline-flex items-center gap-1 text-xs font-semibold px-2 py-1 rounded-full bg-gray-50 text-gray-700">
          {pr.emoji} {pr.label}
        </span>
        <span className="text-xs font-semibold px-2 py-1 rounded-full" style={{ backgroundColor: st.bg, color: st.fg }}>
          {st.label}
        </span>
      </div>

      <div className="mt-3 flex items-center justify-between gap-2">
        <p className="text-sm font-bold text-gray-900">
          {item.price != null && item.price !== ''
            ? INR.format(item.price)
            : <span className="text-gray-400 font-medium">Price not set</span>}
        </p>
        {item.purchase_timing && (
          <p className="text-xs text-gray-500 text-right">🕐 {item.purchase_timing}</p>
        )}
      </div>

      {item.notes && <p className="text-xs text-gray-500 mt-2 truncate">{item.notes}</p>}

      {item.url && (
        <a
          href={item.url} target="_blank" rel="noopener noreferrer"
          className="mt-3 inline-flex items-center gap-1.5 text-sm font-semibold"
          style={{ color: '#6C63FF' }}
        >
          Open Product
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="w-3.5 h-3.5">
            <line x1="7" y1="17" x2="17" y2="7" /><polyline points="7 7 17 7 17 17" />
          </svg>
        </a>
      )}
    </div>
  )
}

// ── Main page ────────────────────────────────────────────────────────────
export default function Wishlist() {
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [modalItem, setModalItem] = useState(null)
  const [showModal, setShowModal] = useState(false)

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

  const chipDefs = [
    { id: 'all', label: 'All', count: counts.all },
    { id: 'high', label: 'High Priority', count: counts.high },
    { id: 'shortlisted', label: 'Shortlisted', count: counts.shortlisted },
    { id: 'planned', label: 'Planned', count: counts.planned },
    { id: 'purchased', label: 'Purchased', count: counts.purchased },
  ]

  return (
    <div className="p-4 lg:p-8 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-5 gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">My Wishlist</h1>
          <p className="text-sm text-gray-500 mt-0.5">{counts.all} item{counts.all === 1 ? '' : 's'}</p>
        </div>
        <button
          onClick={openAdd}
          className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-white text-sm font-semibold hover:opacity-90 transition-opacity shrink-0"
          style={{ backgroundColor: '#6C63FF' }}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
            <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
          </svg>
          Add Item
        </button>
      </div>

      {/* Summary chips */}
      <div className="flex gap-2 overflow-x-auto pb-2 mb-4 -mx-1 px-1">
        {chipDefs.map(c => (
          <button
            key={c.id}
            onClick={() => applyChip(c.id)}
            className="shrink-0 px-3.5 py-2 rounded-full text-xs font-semibold border transition-colors whitespace-nowrap"
            style={{
              borderColor: activeChip === c.id ? '#6C63FF' : '#E5E7EB',
              backgroundColor: activeChip === c.id ? '#6C63FF' : '#fff',
              color: activeChip === c.id ? '#fff' : '#4B5563',
            }}
          >
            {c.label}: {c.count}
          </button>
        ))}
      </div>

      {/* Search + filters */}
      <div className="flex flex-wrap gap-2 mb-5">
        <input
          type="text" placeholder="Search by name or brand"
          value={search} onChange={e => setSearch(e.target.value)}
          className="flex-1 min-w-[180px] px-4 py-2.5 rounded-xl border border-gray-200 text-sm text-gray-800 focus:outline-none focus:border-[#6C63FF] focus:ring-2 focus:ring-[#6C63FF]/20"
        />
        <select
          value={categoryFilter} onChange={e => setCategoryFilter(e.target.value)}
          className="px-3 py-2.5 rounded-xl border border-gray-200 bg-white text-sm font-medium text-gray-700 focus:outline-none focus:border-[#6C63FF]"
        >
          <option value="">All Categories</option>
          {WISHLIST_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        <select
          value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
          className="px-3 py-2.5 rounded-xl border border-gray-200 bg-white text-sm font-medium text-gray-700 focus:outline-none focus:border-[#6C63FF]"
        >
          <option value="">All Statuses</option>
          {STATUSES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
        </select>
        <select
          value={priorityFilter} onChange={e => setPriorityFilter(e.target.value)}
          className="px-3 py-2.5 rounded-xl border border-gray-200 bg-white text-sm font-medium text-gray-700 focus:outline-none focus:border-[#6C63FF]"
        >
          <option value="">All Priorities</option>
          {PRIORITIES.map(p => <option key={p.value} value={p.value}>{p.emoji} {p.label}</option>)}
        </select>
        <select
          value={sortBy} onChange={e => setSortBy(e.target.value)}
          className="px-3 py-2.5 rounded-xl border border-gray-200 bg-white text-sm font-medium text-gray-700 focus:outline-none focus:border-[#6C63FF]"
        >
          <option value="recent">Recently Added</option>
          <option value="priority">Priority</option>
          <option value="price">Price</option>
          <option value="name">Name</option>
        </select>
      </div>

      {loading ? (
        <p className="text-sm text-gray-400 py-14 text-center">Loading…</p>
      ) : items.length === 0 ? (
        <div className="flex flex-col items-center justify-center text-center py-16">
          <BagIcon className="w-20 h-20 mb-4" style={{ color: '#D1D5DB' }} />
          <p className="text-gray-700 font-semibold">Your wishlist is empty</p>
          <p className="text-sm text-gray-400 mt-1 mb-5">Save items you want to buy in the future</p>
          <button
            onClick={openAdd}
            className="px-5 py-2.5 rounded-xl text-white text-sm font-semibold hover:opacity-90 transition-opacity"
            style={{ backgroundColor: '#6C63FF' }}
          >
            + Add First Item
          </button>
        </div>
      ) : visibleItems.length === 0 ? (
        <p className="text-sm text-gray-400 py-14 text-center">No items match these filters.</p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {visibleItems.map(item => (
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

      {showModal && <WishlistModal item={modalItem} onSave={handleSaved} onClose={closeModal} />}
    </div>
  )
}
