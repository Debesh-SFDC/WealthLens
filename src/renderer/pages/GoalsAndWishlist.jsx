import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import bridge from '../lib/bridge'
import { GoalsContent } from './Goals'
import { WishlistContent } from './Wishlist'

const PURPLE = '#6C63FF'
const PINK = '#EC4899'

// ── formatting helpers ──────────────────────────────────────────────────────
function fmtCr(v) {
  const n = Number(v) || 0
  const s = n < 0 ? '-' : ''
  const a = Math.abs(n)
  if (a >= 1e7) return `${s}₹${(a / 1e7).toFixed(2)}Cr`
  if (a >= 1e5) return `${s}₹${(a / 1e5).toFixed(2)}L`
  if (a >= 1e3) return `${s}₹${(a / 1e3).toFixed(0)}K`
  return `${s}₹${Math.round(a)}`
}

function monthsLeft(dateStr) {
  if (!dateStr) return null
  const t = new Date(dateStr)
  if (isNaN(t.getTime())) return null
  return Math.round((t - new Date()) / (1000 * 60 * 60 * 24 * 30.44))
}

function dateLabel(d) {
  if (!d) return null
  const dt = new Date(d)
  if (isNaN(dt.getTime())) return null
  return dt.toLocaleDateString('en-IN', { month: 'short', year: 'numeric' })
}

function goalPct(g) {
  const target = Number(g.target_amount) || 0
  if (target <= 0) return 0
  return Math.min(100, Math.max(0, ((Number(g.current_amount) || 0) / target) * 100))
}

function monthlyNeeded(target, saved, months) {
  const gap = Math.max(0, (Number(target) || 0) - (Number(saved) || 0))
  if (!months || months <= 0) return gap
  return gap / months
}

// ── icons ───────────────────────────────────────────────────────────────────
const CloseIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
    <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
  </svg>
)

const canHover = typeof window !== 'undefined' && window.matchMedia
  ? window.matchMedia('(hover: hover)').matches
  : true

// ── mini progress bar (used inside goal chips) ──────────────────────────────
function MiniBar({ pct, color }) {
  return (
    <div className="h-1.5 w-full rounded-full bg-black/10 overflow-hidden mt-1">
      <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: color }} />
    </div>
  )
}

// ── floating hover / tap popup wrapper ─────────────────────────────────────
function VennChip({ tint, borderColor, onNavigate, popup, children }) {
  const [open, setOpen] = useState(false)
  const [side, setSide] = useState('right')
  const wrapRef = useRef(null)
  const closeTimer = useRef(null)

  const clearClose = () => { if (closeTimer.current) { clearTimeout(closeTimer.current); closeTimer.current = null } }
  const scheduleClose = (ms) => { clearClose(); closeTimer.current = setTimeout(() => setOpen(false), ms) }

  function show() {
    if (wrapRef.current) {
      const r = wrapRef.current.getBoundingClientRect()
      setSide(r.right + 300 > window.innerWidth ? 'left' : 'right')
    }
    clearClose()
    setOpen(true)
  }

  useEffect(() => () => clearClose(), [])

  // Tap-outside dismiss on touch devices.
  useEffect(() => {
    if (!open || canHover) return
    const onDoc = (e) => { if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', onDoc)
    document.addEventListener('touchstart', onDoc)
    return () => {
      document.removeEventListener('mousedown', onDoc)
      document.removeEventListener('touchstart', onDoc)
    }
  }, [open])

  const posClass = !canHover
    ? 'left-1/2 -translate-x-1/2 top-full mt-2'
    : side === 'right'
      ? 'left-full ml-3 top-0'
      : 'right-full mr-3 top-0'

  return (
    <div
      ref={wrapRef}
      className="relative w-full"
      onMouseEnter={canHover ? show : undefined}
      onMouseLeave={canHover ? () => scheduleClose(100) : undefined}
    >
      <button
        type="button"
        onClick={() => { if (canHover) onNavigate?.(); else setOpen(o => !o) }}
        className="w-full text-left rounded-xl border px-3 py-2 shadow-sm transition-transform hover:-translate-y-0.5"
        style={{ backgroundColor: tint, borderColor }}
      >
        {children}
      </button>
      {open && (
        <div
          className={`gw-pop absolute z-50 w-[min(280px,80vw)] rounded-2xl bg-white shadow-2xl border border-gray-100 p-4 ${posClass}`}
          onMouseEnter={canHover ? clearClose : undefined}
          onMouseLeave={canHover ? () => scheduleClose(100) : undefined}
        >
          {popup(onNavigate)}
        </div>
      )}
    </div>
  )
}

// ── chip content + popups ──────────────────────────────────────────────────
function GoalChip({ goal, onOpenGoals }) {
  const pct = goalPct(goal)
  const ml = monthsLeft(goal.target_date)
  const need = monthlyNeeded(goal.target_amount, goal.current_amount, ml)
  return (
    <VennChip
      tint="rgba(108,99,255,0.10)"
      borderColor="rgba(108,99,255,0.35)"
      onNavigate={onOpenGoals}
      popup={(nav) => (
        <>
          <p className="font-bold text-gray-900 text-sm flex items-center gap-1.5">
            <span>{goal.emoji || '🎯'}</span>{goal.title}
          </p>
          <div className="my-2 h-px bg-gray-100" />
          <dl className="text-xs space-y-1 text-gray-600">
            <div className="flex justify-between"><dt>Target</dt><dd className="font-semibold text-gray-900">{fmtCr(goal.target_amount)}</dd></div>
            <div className="flex justify-between"><dt>Saved</dt><dd className="font-semibold text-gray-900">{fmtCr(goal.current_amount)}</dd></div>
          </dl>
          <MiniBar pct={pct} color={PURPLE} />
          <p className="text-xs text-gray-500 mt-1">{Math.round(pct)}% funded</p>
          {dateLabel(goal.target_date) && (
            <p className="text-xs text-gray-500 mt-1">
              By {dateLabel(goal.target_date)}{ml != null && ml >= 0 ? ` • ${ml} months left` : ''}
            </p>
          )}
          {need > 0 && ml != null && ml > 0 && (
            <p className="text-xs text-gray-500 mt-0.5">Monthly needed: {fmtCr(need)}</p>
          )}
          <button onClick={() => nav?.()} className="mt-3 text-xs font-bold" style={{ color: PURPLE }}>View Goal →</button>
        </>
      )}
    >
      <p className="text-xs font-bold text-gray-800 truncate flex items-center gap-1">
        <span>{goal.emoji || '🎯'}</span>{goal.title}
      </p>
      <p className="text-[11px] text-gray-500 mt-0.5">
        {fmtCr(goal.current_amount)}/{fmtCr(goal.target_amount)} · {Math.round(pct)}%
      </p>
      <MiniBar pct={pct} color={PURPLE} />
    </VennChip>
  )
}

function CollectionChip({ collection, items, onOpenCollection }) {
  const list = items.filter(i => i.collection_id === collection.id && i.status !== 'dropped')
  const value = Number(collection.total_value) || list.reduce((s, i) => s + (Number(i.price) || 0), 0)
  const count = collection.item_count != null ? Number(collection.item_count) : list.length
  return (
    <VennChip
      tint="rgba(236,72,153,0.10)"
      borderColor="rgba(236,72,153,0.35)"
      onNavigate={onOpenCollection}
      popup={(nav) => (
        <>
          <p className="font-bold text-gray-900 text-sm flex items-center gap-1.5">
            <span>{collection.emoji || '🛍️'}</span>{collection.name}
          </p>
          <div className="my-2 h-px bg-gray-100" />
          <p className="text-xs text-gray-600">{count} item{count === 1 ? '' : 's'} in collection</p>
          <ul className="mt-1 text-xs text-gray-500 space-y-0.5">
            {list.slice(0, 3).map(i => <li key={i.id} className="truncate">• {i.name}</li>)}
            {list.length > 3 && <li>• +{list.length - 3} more</li>}
            {list.length === 0 && <li className="italic text-gray-400">No items yet</li>}
          </ul>
          <p className="text-xs text-gray-600 mt-2">Budget: {value > 0 ? fmtCr(value) : 'Not set'}</p>
          <button onClick={() => nav?.()} className="mt-3 text-xs font-bold" style={{ color: PINK }}>View Collection →</button>
        </>
      )}
    >
      <p className="text-xs font-bold text-gray-800 truncate flex items-center gap-1">
        <span>{collection.emoji || '🛍️'}</span>{collection.name}
      </p>
      <p className="text-[11px] text-gray-500 mt-0.5">
        {count} item{count === 1 ? '' : 's'} · {value > 0 ? fmtCr(value) : '₹0'}
      </p>
    </VennChip>
  )
}

function LinkedChip({ link, onOpenLinked }) {
  const pct = goalPct({ target_amount: link.goal_target_amount, current_amount: link.goal_current_amount })
  const gap = (Number(link.goal_target_amount) || 0) - (Number(link.goal_current_amount) || 0)
  return (
    <VennChip
      tint="linear-gradient(120deg, rgba(108,99,255,0.16), rgba(236,72,153,0.16))"
      borderColor="rgba(139,92,246,0.4)"
      onNavigate={onOpenLinked}
      popup={(nav) => (
        <>
          <p className="font-bold text-gray-900 text-sm flex items-center gap-1.5">
            <span>{link.goal_emoji || '🎯'}</span>{link.goal_title} + {link.collection_name}
          </p>
          <div className="my-2 h-px bg-gray-100" />
          <p className="text-xs text-gray-600">
            🎯 Goal: {fmtCr(link.goal_current_amount)}/{fmtCr(link.goal_target_amount)} · {Math.round(pct)}%
          </p>
          {dateLabel(link.goal_target_date) && (
            <p className="text-xs text-gray-500 ml-4">By {dateLabel(link.goal_target_date)}</p>
          )}
          <p className="text-xs text-gray-600 mt-1">🛍️ Wishlist: {link.collection_name}</p>
          <p className="text-xs text-gray-600 mt-1.5">
            {gap > 0
              ? `Gap: Need ${fmtCr(gap)} more in goal`
              : 'Goal fully funds this collection'}
          </p>
          <button onClick={() => nav?.()} className="mt-3 text-xs font-bold" style={{ color: '#8B5CF6' }}>View Linked →</button>
        </>
      )}
    >
      <p className="text-xs font-bold text-gray-800 truncate flex items-center gap-1">
        <span>{link.goal_emoji || '🎯'}</span>{link.goal_title}
      </p>
      <p className="text-[11px] text-gray-500 mt-0.5">Goal ↔ {link.collection_name}</p>
    </VennChip>
  )
}

// ── Link modal ──────────────────────────────────────────────────────────────
function LinkModal({ goals, collections, links, onClose, onSaved }) {
  const linkedPairs = new Set(links.map(l => `${l.goal_id}:${l.collection_id}`))
  const [goalId, setGoalId] = useState('')
  const [collectionId, setCollectionId] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function save() {
    if (!goalId || !collectionId) return
    if (linkedPairs.has(`${goalId}:${collectionId}`)) {
      setError('That goal and collection are already linked')
      return
    }
    setSaving(true)
    setError('')
    try {
      await bridge.createGoalWishlistLink({ goal_id: Number(goalId), collection_id: Number(collectionId) })
      onSaved()
    } catch (e) {
      setError(e?.message || 'Could not save link')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <h3 className="font-bold text-gray-900">Link a Goal to a Collection</h3>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-gray-100 text-gray-400"><CloseIcon /></button>
        </div>
        <div className="p-5 space-y-4">
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Goal</label>
            <select value={goalId} onChange={e => setGoalId(e.target.value)}
              className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm bg-white focus:outline-none focus:ring-2">
              <option value="">Select a goal…</option>
              {goals.map(g => <option key={g.id} value={g.id}>{g.emoji || '🎯'} {g.title}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Wishlist Collection</label>
            <select value={collectionId} onChange={e => setCollectionId(e.target.value)}
              className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm bg-white focus:outline-none focus:ring-2">
              <option value="">Select a collection…</option>
              {collections.map(c => <option key={c.id} value={c.id}>{c.emoji || '🛍️'} {c.name}</option>)}
            </select>
          </div>
          {error && <p className="text-xs font-medium text-red-500">{error}</p>}
          {goals.length === 0 && <p className="text-xs text-gray-400">Add a goal first — none exist yet.</p>}
          {collections.length === 0 && <p className="text-xs text-gray-400">Add a wishlist collection first — none exist yet.</p>}
        </div>
        <div className="flex items-center justify-end gap-3 px-5 py-4 border-t border-gray-100">
          <button onClick={onClose} className="px-4 py-2 rounded-xl text-sm font-semibold text-gray-600 hover:bg-gray-100">Cancel</button>
          <button onClick={save} disabled={saving || !goalId || !collectionId}
            className="px-4 py-2 rounded-xl text-sm font-semibold text-white disabled:opacity-50" style={{ backgroundColor: PURPLE }}>
            {saving ? 'Saving…' : 'Save Link'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Linked tab (Sections view) ──────────────────────────────────────────────
function LinkedPairCard({ link, items, onUnlink }) {
  const pct = goalPct({ target_amount: link.goal_target_amount, current_amount: link.goal_current_amount })
  const list = items.filter(i => i.collection_id === link.collection_id && i.status !== 'dropped')
  const cost = list.reduce((s, i) => s + (Number(i.price) || 0), 0)
  const gap = (Number(link.goal_target_amount) || 0) - cost
  return (
    <div className="rounded-2xl border border-gray-200 bg-white shadow-sm overflow-hidden">
      <div className="px-4 py-3 flex items-center justify-between"
        style={{ background: 'linear-gradient(120deg, rgba(108,99,255,0.10), rgba(236,72,153,0.10))' }}>
        <p className="font-bold text-gray-900 text-sm flex items-center gap-1.5">
          <span>{link.goal_emoji || '🎯'}</span>{link.goal_title} + {link.collection_name}
        </p>
        <button onClick={() => onUnlink(link)} className="text-xs font-semibold text-gray-400 hover:text-red-500">Unlink</button>
      </div>
      <div className="grid grid-cols-2 divide-x divide-gray-100 border-t border-gray-100">
        <div className="p-4">
          <p className="text-[11px] font-bold uppercase tracking-wide text-gray-400">🎯 Goal</p>
          <p className="text-sm font-bold text-gray-900 mt-1">
            {fmtCr(link.goal_current_amount)}/{fmtCr(link.goal_target_amount)}
          </p>
          {dateLabel(link.goal_target_date) && (
            <p className="text-xs text-gray-500 mt-0.5">by {dateLabel(link.goal_target_date)}</p>
          )}
          <MiniBar pct={pct} color={PURPLE} />
          <p className="text-xs text-gray-500 mt-1">{Math.round(pct)}%</p>
        </div>
        <div className="p-4">
          <p className="text-[11px] font-bold uppercase tracking-wide text-gray-400">🛍️ Wishlist</p>
          <p className="text-sm font-bold text-gray-900 mt-1">{link.collection_name}</p>
          <p className="text-xs text-gray-500 mt-0.5">
            {cost > 0 ? fmtCr(cost) : '₹0'} • {list.length} item{list.length === 1 ? '' : 's'} budgeted
          </p>
        </div>
      </div>
      <div className="px-4 py-2.5 border-t border-gray-100 bg-gray-50">
        <p className="text-xs font-medium text-gray-600">
          Gap: Goal {fmtCr(link.goal_target_amount)} vs Cost {fmtCr(cost)}
          {gap >= 0 ? ` — goal covers it (+${fmtCr(gap)})` : ` — short ${fmtCr(Math.abs(gap))}`}
        </p>
      </div>
    </div>
  )
}

function LinkedTab({ links, items, onLink, onUnlink }) {
  if (links.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center text-center py-16 px-4">
        <div className="text-5xl mb-3">🔗</div>
        <p className="text-base font-semibold text-gray-700">Link goals to wishlist collections to see connections</p>
        <button onClick={onLink} className="mt-4 px-5 py-2.5 rounded-xl text-white text-sm font-semibold" style={{ backgroundColor: PURPLE }}>
          + Link Now
        </button>
      </div>
    )
  }
  return (
    <div>
      <div className="flex justify-end mb-4">
        <button onClick={onLink} className="px-4 py-2 rounded-xl text-white text-sm font-semibold" style={{ backgroundColor: PURPLE }}>
          + Link a Goal to a Collection
        </button>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {links.map(l => <LinkedPairCard key={l.id} link={l} items={items} onUnlink={onUnlink} />)}
      </div>
    </div>
  )
}

// ── Venn view ───────────────────────────────────────────────────────────────
function VennColumn({ title, badge, children, empty, emptyAction }) {
  return (
    <div className="flex-1 min-w-0 flex flex-col items-center">
      <div className="flex items-center gap-1.5 mb-2 shrink-0">
        <span className="text-sm font-extrabold text-gray-700">{title}</span>
        {badge != null && <span className="text-[11px] font-bold text-gray-400">{badge}</span>}
      </div>
      <div className="w-full max-w-[240px] flex flex-col gap-2 overflow-y-auto px-1 pb-2" style={{ maxHeight: '100%' }}>
        {children}
        {(!children || (Array.isArray(children) && children.length === 0)) && (
          <div className="text-center py-6">
            <p className="text-xs text-gray-400 mb-2">{empty}</p>
            {emptyAction}
          </div>
        )}
      </div>
    </div>
  )
}

function VennView({ goals, collections, items, links, onOpenGoals, onOpenWishlist, onOpenCollection, onOpenLinked, onLink }) {
  const linkedGoalIds = useMemo(() => new Set(links.map(l => l.goal_id)), [links])
  const linkedCollectionIds = useMemo(() => new Set(links.map(l => l.collection_id)), [links])
  const goalsOnly = goals.filter(g => !linkedGoalIds.has(g.id))
  const collectionsOnly = collections.filter(c => !linkedCollectionIds.has(c.id))

  const addGoalBtn = (
    <button onClick={onOpenGoals} className="px-3 py-1.5 rounded-lg text-xs font-semibold text-white" style={{ backgroundColor: PURPLE }}>+ Add Goal</button>
  )
  const addCollectionBtn = (
    <button onClick={onOpenWishlist} className="px-3 py-1.5 rounded-lg text-xs font-semibold text-white" style={{ backgroundColor: PINK }}>+ Add Collection</button>
  )
  const addLinkBtn = (
    <button onClick={onLink} className="px-3 py-1.5 rounded-lg text-xs font-semibold text-white" style={{ backgroundColor: '#8B5CF6' }}>+ Link</button>
  )

  return (
    <div className="mt-4">
      <style>{`
        @keyframes gwPopIn { from { opacity: 0; transform: translateY(4px); } to { opacity: 1; transform: translateY(0); } }
        .gw-pop { animation: gwPopIn .2s ease both; }
        @media (prefers-reduced-motion: reduce) { .gw-pop { animation: none; } }
      `}</style>
      <div className="relative mx-auto w-full max-w-[960px] rounded-3xl border border-gray-100 bg-white overflow-hidden">
        {/* decorative overlapping circles — desktop only */}
        <div className="hidden md:block absolute inset-0 pointer-events-none">
          <div className="absolute top-1/2 -translate-y-1/2 left-[2%] h-[86%] aspect-square rounded-full"
            style={{ background: 'rgba(108,99,255,0.15)', border: '2px solid rgba(108,99,255,0.35)', mixBlendMode: 'multiply' }} />
          <div className="absolute top-1/2 -translate-y-1/2 right-[2%] h-[86%] aspect-square rounded-full"
            style={{ background: 'rgba(236,72,153,0.15)', border: '2px solid rgba(236,72,153,0.35)', mixBlendMode: 'multiply' }} />
        </div>

        <div className="relative flex flex-col md:flex-row gap-4 md:gap-2 p-4 md:p-6 h-auto md:h-[600px] min-h-[500px]">
          <VennColumn
            title="🎯 Goals"
            badge={goalsOnly.length || null}
            empty="No goals yet"
            emptyAction={addGoalBtn}
          >
            {goalsOnly.map(g => <GoalChip key={g.id} goal={g} onOpenGoals={onOpenGoals} />)}
          </VennColumn>

          <VennColumn
            title="🔗 Both"
            badge={links.length || null}
            empty="Link a goal to a collection to see connections here"
            emptyAction={addLinkBtn}
          >
            {links.map(l => <LinkedChip key={l.id} link={l} onOpenLinked={onOpenLinked} />)}
          </VennColumn>

          <VennColumn
            title="🛍️ Wishlist"
            badge={collectionsOnly.length || null}
            empty="No collections yet"
            emptyAction={addCollectionBtn}
          >
            {collectionsOnly.map(c => (
              <CollectionChip key={c.id} collection={c} items={items} onOpenCollection={() => onOpenCollection(c.id)} />
            ))}
          </VennColumn>
        </div>
      </div>
      <p className="text-center text-xs text-gray-400 mt-3">
        Hover a chip for details · click to jump to it
      </p>
    </div>
  )
}

// ── page ────────────────────────────────────────────────────────────────────
export default function GoalsAndWishlist() {
  const [mainView, setMainView] = useState('sections') // 'sections' | 'venn'
  const [sectionTab, setSectionTab] = useState('goals') // 'goals' | 'wishlist' | 'linked'
  const [wishReq, setWishReq] = useState({ id: null, nonce: 0 })
  const [showLinkModal, setShowLinkModal] = useState(false)

  const [goals, setGoals] = useState([])
  const [collections, setCollections] = useState([])
  const [items, setItems] = useState([])
  const [links, setLinks] = useState([])

  const load = useCallback(async () => {
    try {
      const [g, c, it, l] = await Promise.all([
        bridge.getAllGoals().catch(() => []),
        bridge.getWishlistCollections().catch(() => []),
        bridge.getWishlistItems().catch(() => []),
        bridge.getGoalWishlistLinks().catch(() => []),
      ])
      setGoals(g || [])
      setCollections(c || [])
      setItems(it || [])
      setLinks(l || [])
    } catch (e) {
      console.error(e)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const openGoals = () => { setMainView('sections'); setSectionTab('goals') }
  const openWishlist = () => { setMainView('sections'); setSectionTab('wishlist') }
  const openLinked = () => { setMainView('sections'); setSectionTab('linked') }
  const openCollection = (id) => {
    setMainView('sections')
    setSectionTab('wishlist')
    setWishReq(r => ({ id, nonce: r.nonce + 1 }))
  }

  async function handleUnlink(link) {
    if (!window.confirm(`Unlink "${link.goal_title}" from "${link.collection_name}"?`)) return
    try {
      await bridge.deleteGoalWishlistLink(link.id)
      await load()
    } catch (e) {
      console.error(e)
    }
  }

  const subtitle = `${goals.length} goal${goals.length === 1 ? '' : 's'} • ${collections.length} collection${collections.length === 1 ? '' : 's'}`

  const SECTION_TABS = [
    { id: 'goals', label: '🎯 Goals' },
    { id: 'wishlist', label: '🛍️ Wishlist' },
    { id: 'linked', label: '🔗 Linked' },
  ]

  return (
    <div className="p-4 lg:p-6">
      {/* header */}
      <div className="flex flex-wrap items-start justify-between gap-3 mb-5">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Goals &amp; Wishlist</h1>
          <p className="text-sm text-gray-500 mt-0.5">{subtitle}</p>
        </div>
        <div className="flex items-center gap-1 bg-gray-100 rounded-xl p-1">
          <button
            onClick={() => setMainView('sections')}
            className="px-3 py-1.5 rounded-lg text-sm font-semibold transition-colors"
            style={{ backgroundColor: mainView === 'sections' ? '#fff' : 'transparent', color: mainView === 'sections' ? '#1a1a2e' : '#6b7280' }}
          >
            📋 Sections
          </button>
          <button
            onClick={() => setMainView('venn')}
            className="px-3 py-1.5 rounded-lg text-sm font-semibold transition-colors"
            style={{ backgroundColor: mainView === 'venn' ? '#fff' : 'transparent', color: mainView === 'venn' ? '#1a1a2e' : '#6b7280' }}
          >
            ⭕ Venn
          </button>
        </div>
      </div>

      {mainView === 'sections' ? (
        <>
          <div className="flex items-center gap-1 border-b border-gray-200 mb-1">
            {SECTION_TABS.map(t => (
              <button
                key={t.id}
                onClick={() => setSectionTab(t.id)}
                className="px-4 py-2.5 text-sm font-semibold border-b-2 -mb-px transition-colors"
                style={{
                  borderColor: sectionTab === t.id ? PURPLE : 'transparent',
                  color: sectionTab === t.id ? PURPLE : '#6b7280',
                }}
              >
                {t.label}
              </button>
            ))}
          </div>

          {/* Keep the heavy content components mounted so their state (open
              collection, wizards) survives tab switches; just toggle visibility. */}
          <div hidden={sectionTab !== 'goals'}>
            <GoalsContent />
          </div>
          <div hidden={sectionTab !== 'wishlist'}>
            <WishlistContent requestedCollectionId={wishReq.id} requestNonce={wishReq.nonce} />
          </div>
          <div hidden={sectionTab !== 'linked'} className="p-4 lg:p-6">
            {sectionTab === 'linked' && (
              <LinkedTab
                links={links}
                items={items}
                onLink={() => setShowLinkModal(true)}
                onUnlink={handleUnlink}
              />
            )}
          </div>
        </>
      ) : (
        <VennView
          goals={goals}
          collections={collections}
          items={items}
          links={links}
          onOpenGoals={openGoals}
          onOpenWishlist={openWishlist}
          onOpenCollection={openCollection}
          onOpenLinked={openLinked}
          onLink={() => setShowLinkModal(true)}
        />
      )}

      {showLinkModal && (
        <LinkModal
          goals={goals}
          collections={collections}
          links={links}
          onClose={() => setShowLinkModal(false)}
          onSaved={async () => { setShowLinkModal(false); await load() }}
        />
      )}
    </div>
  )
}
