import { useState, useEffect, useCallback } from 'react'

// ── Utilities ─────────────────────────────────────────────────────────────
const INR = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 })
const fmt = (v) => INR.format(v || 0)

function inflationTarget(cost, years, rate) {
  return cost * Math.pow(1 + rate / 100, years)
}

function yearsFromNow(targetYear) {
  return Math.max(0, targetYear - new Date().getFullYear())
}

function monthsFromNow(targetYear) {
  const now = new Date()
  return Math.max(0, (targetYear - now.getFullYear()) * 12 - now.getMonth())
}

function sipNeeded(target, saved, months, annualReturn = 12) {
  if (months <= 0) return 0
  const r = annualReturn / 100 / 12
  const factor = Math.pow(1 + r, months)
  return Math.max(0, (target - saved * factor) * r / (factor - 1))
}

// ── Constants ─────────────────────────────────────────────────────────────
const EMOJIS = [
  '🏠','🚗','✈️','🎓','💍','👶','💊','🏋️','📱','💻',
  '🌴','🎯','💰','🏦','📈','🛒','🎁','🏖️','🎸','⚽',
  '🏕️','🛡️','🔑','🏡','🚀','🌿','💎','🌏','🎻','🏄',
]

const COLORS = [
  '#6C63FF','#3B82F6','#10B981','#F59E0B',
  '#EF4444','#8B5CF6','#EC4899','#14B8A6',
  '#F97316','#6366F1','#84CC16','#06B6D4',
]

const BLANK_FORM = {
  title: '',
  emoji: '🎯',
  type: 'need',
  target_amount: '',
  target_year: new Date().getFullYear() + 10,
  target_age: '',
  use_age: false,
  current_age: '',
  inflation_rate: 6,
  color: '#6C63FF',
}

// ── Small SVG icons ───────────────────────────────────────────────────────
const EditIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
    <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/>
    <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/>
  </svg>
)

const TrashIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
    <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6m4-6v6"/><path d="M9 6V4h6v2"/>
  </svg>
)

const BackIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
    <polyline points="15 18 9 12 15 6"/>
  </svg>
)

const CloseIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
    <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
  </svg>
)

// ── Goal Card ─────────────────────────────────────────────────────────────
function GoalCard({ goal, investments, onEdit, onView, onDelete }) {
  const linked = investments.filter(i => i.goal_id === goal.id)
  const saved = linked.reduce((s, i) => s + (i.current_value || 0), 0)
  const years = yearsFromNow(goal.target_year || new Date().getFullYear())
  const target = inflationTarget(goal.target_amount || 0, years, goal.inflation_rate || 6)
  const months = monthsFromNow(goal.target_year || new Date().getFullYear())
  const pct = target > 0 ? Math.min(100, (saved / target) * 100) : 0
  const accent = goal.color || '#6C63FF'

  return (
    <div
      className="bg-white rounded-2xl p-5 border border-gray-100 shadow-sm hover:shadow-md transition-all duration-200 cursor-pointer group"
      onClick={() => onView(goal)}
    >
      <div className="flex items-start gap-3 mb-4">
        <div
          className="w-12 h-12 rounded-xl flex items-center justify-center text-2xl shrink-0 select-none"
          style={{ backgroundColor: accent + '18' }}
        >
          {goal.emoji || '🎯'}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="font-semibold text-gray-900 truncate">{goal.title}</h3>
            <span className={`shrink-0 px-2 py-0.5 rounded-full text-xs font-semibold ${goal.type === 'need' ? 'bg-blue-50 text-blue-700' : 'bg-purple-50 text-purple-700'}`}>
              {goal.type === 'need' ? 'Need' : 'Want'}
            </span>
            {Boolean(goal.is_achieved) && (
              <span className="shrink-0 px-2 py-0.5 rounded-full text-xs font-semibold bg-green-50 text-green-700">✓ Achieved</span>
            )}
          </div>
          <p className="text-xs text-gray-400 mt-0.5">{goal.inflation_rate || 6}% inflation · {linked.length} investment{linked.length !== 1 ? 's' : ''}</p>
        </div>

        <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity" onClick={e => e.stopPropagation()}>
          <button onClick={() => onEdit(goal)} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-700 transition-colors">
            <EditIcon />
          </button>
          <button onClick={() => onDelete(goal.id)} className="p-1.5 rounded-lg hover:bg-red-50 text-gray-400 hover:text-red-500 transition-colors">
            <TrashIcon />
          </button>
        </div>
      </div>

      <div className="flex items-end justify-between mb-3">
        <div>
          <p className="text-2xl font-bold text-gray-900">{fmt(target)}</p>
          <p className="text-xs text-gray-400">target in {goal.target_year || '—'}</p>
        </div>
        <div className="text-right">
          <p className="text-sm font-semibold text-gray-700">{fmt(saved)}</p>
          <p className="text-xs text-gray-400">saved</p>
        </div>
      </div>

      <div className="mb-3">
        <div className="flex justify-between text-xs text-gray-500 mb-1.5">
          <span>{pct.toFixed(1)}% funded</span>
          <span>{fmt(Math.max(0, target - saved))} to go</span>
        </div>
        <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
          <div className="h-full rounded-full transition-all duration-700" style={{ width: `${pct}%`, backgroundColor: accent }} />
        </div>
      </div>

      <div className="flex items-center justify-between">
        <span className="text-xs text-gray-500">🗓 {goal.target_year || 'No year'}</span>
        <span className={`text-xs font-medium ${months > 0 ? 'text-gray-500' : 'text-red-500'}`}>
          {months > 0 ? `${months} months left` : 'Past due'}
        </span>
      </div>
    </div>
  )
}

// ── Goal Form Modal ───────────────────────────────────────────────────────
function GoalFormModal({ initial, allInvestments, onSave, onClose }) {
  const [form, setForm] = useState(() => initial
    ? { ...BLANK_FORM, ...initial, use_age: false, current_age: '', target_amount: initial.target_amount ?? '' }
    : BLANK_FORM
  )
  const [showEmoji, setShowEmoji] = useState(false)
  const [linkedIds, setLinkedIds] = useState(() =>
    initial ? allInvestments.filter(i => i.goal_id === initial.id).map(i => i.id) : []
  )
  const [saving, setSaving] = useState(false)

  const curYear = new Date().getFullYear()
  const targetYear = form.use_age
    ? curYear + Math.max(0, Number(form.target_age || 0) - Number(form.current_age || 30))
    : Number(form.target_year) || curYear + 10
  const years = Math.max(0, targetYear - curYear)
  const adjTarget = inflationTarget(Number(form.target_amount) || 0, years, form.inflation_rate || 6)
  const months = monthsFromNow(targetYear)
  const currentSaved = allInvestments.filter(i => linkedIds.includes(i.id)).reduce((s, i) => s + (i.current_value || 0), 0)
  const sip = sipNeeded(adjTarget, currentSaved, months)

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const toggleLink = (id) => setLinkedIds(p => p.includes(id) ? p.filter(x => x !== id) : [...p, id])

  const handleSave = async () => {
    if (!form.title.trim() || !form.target_amount) return
    setSaving(true)
    try {
      await onSave({
        ...form,
        target_year: targetYear,
        target_amount: Number(form.target_amount),
        inflation_rate: Number(form.inflation_rate) || 6,
        linkedInvestmentIds: linkedIds,
        prevLinkedIds: initial ? allInvestments.filter(i => i.goal_id === initial.id).map(i => i.id) : [],
      })
    } finally {
      setSaving(false)
    }
  }

  const accent = form.color || '#6C63FF'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col" onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 shrink-0">
          <h2 className="text-lg font-bold text-gray-900">{initial ? 'Edit Goal' : 'New Goal'}</h2>
          <button onClick={onClose} className="p-1.5 rounded-xl hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors">
            <CloseIcon />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-6">
          <div className="grid grid-cols-5 gap-6">

            {/* ── Left: fields ── */}
            <div className="col-span-3 space-y-5">

              {/* Emoji + Title */}
              <div className="flex gap-3 items-start">
                <div className="relative shrink-0">
                  <button
                    onClick={() => setShowEmoji(v => !v)}
                    className="w-14 h-14 rounded-xl border-2 text-2xl flex items-center justify-center transition-colors hover:border-gray-300"
                    style={{ borderColor: showEmoji ? accent : '#e5e7eb' }}
                  >
                    {form.emoji}
                  </button>
                  {showEmoji && (
                    <div className="absolute top-16 left-0 z-20 bg-white rounded-xl shadow-2xl border border-gray-100 p-3 grid grid-cols-6 gap-1 w-52">
                      {EMOJIS.map(e => (
                        <button key={e} onClick={() => { set('emoji', e); setShowEmoji(false) }}
                          className="w-7 h-7 text-lg hover:bg-gray-100 rounded-lg flex items-center justify-center">
                          {e}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                <div className="flex-1">
                  <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Goal Title</label>
                  <input
                    autoFocus
                    className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm font-medium focus:outline-none focus:ring-2 transition-shadow"
                    style={{ '--tw-ring-color': accent + '40' }}
                    placeholder="e.g. Dream Home"
                    value={form.title}
                    onChange={e => set('title', e.target.value)}
                  />
                </div>
              </div>

              {/* Need / Want */}
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Type</label>
                <div className="flex rounded-xl border border-gray-200 overflow-hidden">
                  {['need', 'want'].map(t => (
                    <button key={t} onClick={() => set('type', t)}
                      className="flex-1 py-2.5 text-sm font-semibold transition-colors"
                      style={{ backgroundColor: form.type === t ? accent : 'transparent', color: form.type === t ? '#fff' : '#6b7280' }}>
                      {t === 'need' ? 'Need' : 'Want'}
                    </button>
                  ))}
                </div>
              </div>

              {/* Today's cost */}
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Today's Cost (₹)</label>
                <input
                  type="number"
                  className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 transition-shadow"
                  placeholder="e.g. 5000000"
                  value={form.target_amount}
                  onChange={e => set('target_amount', e.target.value)}
                />
              </div>

              {/* Target Year or Age */}
              <div>
                <div className="flex items-center gap-3 mb-2">
                  <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Target</label>
                  <div className="flex rounded-lg border border-gray-200 overflow-hidden text-xs">
                    {[['year', 'Year'], ['age', 'Age']].map(([v, l]) => (
                      <button key={v} onClick={() => set('use_age', v === 'age')}
                        className={`px-3 py-1.5 font-medium transition-colors ${form.use_age === (v === 'age') ? 'bg-gray-800 text-white' : 'text-gray-500 hover:bg-gray-50'}`}>
                        {l}
                      </button>
                    ))}
                  </div>
                </div>
                {form.use_age ? (
                  <div className="flex gap-2">
                    <div className="flex-1">
                      <p className="text-xs text-gray-400 mb-1">Your current age</p>
                      <input type="number" className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2"
                        placeholder="e.g. 28" value={form.current_age} onChange={e => set('current_age', e.target.value)} />
                    </div>
                    <div className="flex-1">
                      <p className="text-xs text-gray-400 mb-1">Target age</p>
                      <input type="number" className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2"
                        placeholder="e.g. 35" value={form.target_age} onChange={e => set('target_age', e.target.value)} />
                    </div>
                  </div>
                ) : (
                  <input type="number" className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2"
                    placeholder="e.g. 2035" value={form.target_year} onChange={e => set('target_year', e.target.value)} />
                )}
                {form.use_age && form.current_age && form.target_age && (
                  <p className="text-xs text-gray-400 mt-1">→ Year {targetYear} ({years} years away)</p>
                )}
              </div>

              {/* Inflation rate slider */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Inflation Rate</label>
                  <span className="text-sm font-bold tabular-nums" style={{ color: accent }}>{form.inflation_rate}%</span>
                </div>
                <input type="range" min={1} max={15} step={0.5} value={form.inflation_rate}
                  onChange={e => set('inflation_rate', parseFloat(e.target.value))}
                  className="w-full h-2 rounded-full appearance-none cursor-pointer bg-gray-200"
                  style={{ accentColor: accent }}
                />
                <div className="flex justify-between text-xs text-gray-400 mt-1">
                  <span>1%</span><span>Conservative ≈ 6%</span><span>15%</span>
                </div>
              </div>

              {/* Color */}
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Color</label>
                <div className="flex gap-2 flex-wrap">
                  {COLORS.map(c => (
                    <button key={c} onClick={() => set('color', c)}
                      className="w-7 h-7 rounded-full transition-transform hover:scale-110 shrink-0 border-2"
                      style={{ backgroundColor: c, borderColor: form.color === c ? c : 'transparent', outline: form.color === c ? `2px solid ${c}` : 'none', outlineOffset: 2 }} />
                  ))}
                </div>
              </div>

              {/* Link investments */}
              {allInvestments.length > 0 && (
                <div>
                  <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                    Link Investments <span className="font-normal normal-case text-gray-400 ml-1">({linkedIds.length} selected)</span>
                  </label>
                  <div className="max-h-40 overflow-y-auto rounded-xl border border-gray-200 divide-y divide-gray-50">
                    {allInvestments.map(inv => (
                      <label key={inv.id} className="flex items-center gap-3 px-3 py-2.5 cursor-pointer hover:bg-gray-50 transition-colors">
                        <input type="checkbox" checked={linkedIds.includes(inv.id)} onChange={() => toggleLink(inv.id)}
                          className="rounded" style={{ accentColor: accent }} />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-gray-800 truncate">{inv.name}</p>
                          <p className="text-xs text-gray-400">{inv.type?.replace(/_/g, ' ')} · {fmt(inv.current_value)}</p>
                        </div>
                      </label>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* ── Right: live preview ── */}
            <div className="col-span-2">
              <div className="sticky top-0 rounded-2xl p-4 space-y-3" style={{ backgroundColor: accent + '12' }}>
                <div className="flex items-center gap-2">
                  <span className="text-2xl">{form.emoji}</span>
                  <div>
                    <p className="font-semibold text-gray-900 text-sm leading-tight">{form.title || 'Your Goal'}</p>
                    <p className="text-xs text-gray-400">Live preview</p>
                  </div>
                </div>

                <div className="bg-white rounded-xl p-3.5 shadow-sm">
                  <p className="text-xs text-gray-400 mb-0.5">Inflation-adjusted target</p>
                  <p className="text-xl font-bold leading-tight" style={{ color: accent }}>{fmt(adjTarget)}</p>
                  <p className="text-xs text-gray-400">by {targetYear} ({years} yr)</p>
                </div>

                <div className="bg-white rounded-xl p-3.5 shadow-sm">
                  <p className="text-xs text-gray-400 mb-0.5">Monthly SIP needed</p>
                  <p className="text-xl font-bold text-gray-800 leading-tight">{fmt(sip)}</p>
                  <p className="text-xs text-gray-400">at 12% expected return</p>
                </div>

                {currentSaved > 0 && (
                  <div className="bg-white rounded-xl p-3.5 shadow-sm">
                    <p className="text-xs text-gray-400 mb-0.5">Already saved</p>
                    <p className="text-xl font-bold text-green-600 leading-tight">{fmt(currentSaved)}</p>
                    <p className="text-xs text-gray-400">from {linkedIds.length} investment{linkedIds.length !== 1 ? 's' : ''}</p>
                  </div>
                )}

                {/* Mini progress bar */}
                {adjTarget > 0 && (
                  <div className="bg-white rounded-xl p-3.5 shadow-sm">
                    <div className="flex justify-between text-xs text-gray-500 mb-2">
                      <span>Progress</span>
                      <span>{((currentSaved / adjTarget) * 100).toFixed(1)}%</span>
                    </div>
                    <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                      <div className="h-full rounded-full" style={{ width: `${Math.min(100, (currentSaved / adjTarget) * 100)}%`, backgroundColor: accent }} />
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-gray-100 shrink-0">
          <button onClick={onClose} className="px-5 py-2.5 rounded-xl text-sm font-semibold text-gray-600 hover:bg-gray-100 transition-colors">
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving || !form.title.trim() || !form.target_amount}
            className="px-5 py-2.5 rounded-xl text-sm font-semibold text-white transition-opacity disabled:opacity-50 disabled:cursor-not-allowed"
            style={{ backgroundColor: accent }}
          >
            {saving ? 'Saving…' : initial ? 'Save Changes' : 'Create Goal'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Goal Detail View ──────────────────────────────────────────────────────
function GoalDetail({ goal, investments, onBack, onAchieve, onEdit }) {
  const linked = investments.filter(i => i.goal_id === goal.id)
  const saved = linked.reduce((s, i) => s + (i.current_value || 0), 0)
  const curYear = new Date().getFullYear()
  const years = yearsFromNow(goal.target_year || curYear)
  const target = inflationTarget(goal.target_amount || 0, years, goal.inflation_rate || 6)
  const months = monthsFromNow(goal.target_year || curYear)
  const pct = target > 0 ? Math.min(100, (saved / target) * 100) : 0
  const sip = sipNeeded(target, saved, months)
  const accent = goal.color || '#6C63FF'

  return (
    <div className="p-8 max-w-3xl">
      {/* Back + actions */}
      <div className="flex items-center justify-between mb-6">
        <button onClick={onBack}
          className="flex items-center gap-1.5 text-sm font-medium text-gray-500 hover:text-gray-900 transition-colors">
          <BackIcon /> Back to Goals
        </button>
        <div className="flex gap-2">
          <button onClick={() => onEdit(goal)}
            className="px-4 py-2 rounded-xl text-sm font-semibold text-gray-700 border border-gray-200 hover:bg-gray-50 transition-colors">
            Edit
          </button>
          {!goal.is_achieved && (
            <button onClick={() => onAchieve(goal.id)}
              className="px-4 py-2 rounded-xl text-sm font-semibold text-white hover:opacity-90 transition-opacity"
              style={{ backgroundColor: '#10B981' }}>
              ✓ Mark as Achieved
            </button>
          )}
        </div>
      </div>

      {/* Hero card */}
      <div className="bg-white rounded-2xl p-6 border border-gray-100 shadow-sm mb-5">
        <div className="flex items-start gap-4 mb-5">
          <div className="w-16 h-16 rounded-2xl flex items-center justify-center text-3xl shrink-0" style={{ backgroundColor: accent + '18' }}>
            {goal.emoji || '🎯'}
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-2 flex-wrap mb-1">
              <h1 className="text-2xl font-bold text-gray-900">{goal.title}</h1>
              <span className={`px-2.5 py-1 rounded-full text-xs font-semibold ${goal.type === 'need' ? 'bg-blue-50 text-blue-700' : 'bg-purple-50 text-purple-700'}`}>
                {goal.type === 'need' ? 'Need' : 'Want'}
              </span>
              {Boolean(goal.is_achieved) && (
                <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-green-50 text-green-700">✓ Achieved</span>
              )}
            </div>
            <p className="text-sm text-gray-500">Target year: {goal.target_year} · Inflation: {goal.inflation_rate || 6}% p.a.</p>
          </div>
        </div>

        <div className="mb-1.5">
          <div className="flex justify-between text-sm mb-2">
            <span className="font-medium text-gray-700">{fmt(saved)} saved</span>
            <span className="text-gray-500">{fmt(target)} target</span>
          </div>
          <div className="h-3 bg-gray-100 rounded-full overflow-hidden">
            <div className="h-full rounded-full transition-all duration-700" style={{ width: `${pct}%`, backgroundColor: accent }} />
          </div>
          <p className="text-xs text-right text-gray-400 mt-1">{pct.toFixed(1)}% funded</p>
        </div>
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-3 gap-4 mb-5">
        {[
          { label: "Today's Cost", value: fmt(goal.target_amount || 0), sub: 'at today\'s prices', ac: null },
          { label: 'Adjusted Target', value: fmt(target), sub: `${years} yr × ${goal.inflation_rate || 6}% inflation`, ac: accent },
          { label: 'Monthly SIP Needed', value: fmt(sip), sub: 'at 12% expected return', ac: '#10B981' },
        ].map((s, i) => (
          <div key={i} className="bg-white rounded-2xl p-4 border border-gray-100 shadow-sm">
            <p className="text-xs text-gray-400 mb-1">{s.label}</p>
            <p className="text-xl font-bold leading-tight" style={{ color: s.ac || '#1a1a2e' }}>{s.value}</p>
            <p className="text-xs text-gray-400 mt-0.5">{s.sub}</p>
          </div>
        ))}
      </div>

      {/* Linked investments */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100">
          <h2 className="font-semibold text-gray-800">Linked Investments</h2>
          <p className="text-xs text-gray-400 mt-0.5">{linked.length} investment{linked.length !== 1 ? 's' : ''} contributing to this goal</p>
        </div>
        {linked.length === 0 ? (
          <div className="flex items-center justify-center py-10 text-sm text-gray-400">No investments linked yet</div>
        ) : (
          <div className="divide-y divide-gray-50">
            {linked.map(inv => (
              <div key={inv.id} className="flex items-center justify-between px-5 py-4">
                <div>
                  <p className="font-medium text-gray-800">{inv.name}</p>
                  <p className="text-xs text-gray-400 mt-0.5">{inv.type?.replace(/_/g, ' ').toUpperCase()} · {inv.bank_or_amc || inv.provider || '—'}</p>
                </div>
                <div className="text-right">
                  <p className="font-semibold text-gray-800">{fmt(inv.current_value)}</p>
                  <p className="text-xs text-gray-400">Invested: {fmt(inv.invested_amount)}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// ── Main Goals page ───────────────────────────────────────────────────────
export default function Goals() {
  const [goals, setGoals] = useState([])
  const [investments, setInvestments] = useState([])
  const [loading, setLoading] = useState(true)
  const [view, setView] = useState('list')   // 'list' | 'detail'
  const [selectedGoal, setSelectedGoal] = useState(null)
  const [showForm, setShowForm] = useState(false)
  const [editGoal, setEditGoal] = useState(null)
  const [filter, setFilter] = useState('all')  // 'all'|'need'|'want'|'achieved'

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [g, i] = await Promise.all([
        window.electronAPI.getAllGoals(),
        window.electronAPI.getAllInvestments(),
      ])
      setGoals(g || [])
      setInvestments(i || [])
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const handleSave = async (formData) => {
    const { linkedInvestmentIds, prevLinkedIds, use_age, target_age, current_age, ...data } = formData

    let goalId
    if (editGoal) {
      await window.electronAPI.updateGoal({ ...data, id: editGoal.id, is_achieved: editGoal.is_achieved ? 1 : 0 })
      goalId = editGoal.id
      // Unlink removed investments
      const toUnlink = prevLinkedIds.filter(id => !linkedInvestmentIds.includes(id))
      const toLink = linkedInvestmentIds.filter(id => !prevLinkedIds.includes(id))
      await Promise.all([
        ...toUnlink.map(id => {
          const inv = investments.find(i => i.id === id)
          return inv ? window.electronAPI.updateInvestment({ ...inv, goal_id: null }) : null
        }).filter(Boolean),
        ...toLink.map(id => {
          const inv = investments.find(i => i.id === id)
          return inv ? window.electronAPI.updateInvestment({ ...inv, goal_id: goalId }) : null
        }).filter(Boolean),
      ])
    } else {
      const { id } = await window.electronAPI.createGoal(data)
      goalId = id
      await Promise.all(
        linkedInvestmentIds.map(id => {
          const inv = investments.find(i => i.id === id)
          return inv ? window.electronAPI.updateInvestment({ ...inv, goal_id: goalId }) : null
        }).filter(Boolean)
      )
    }

    setShowForm(false)
    setEditGoal(null)
    await load()
  }

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this goal?')) return
    await window.electronAPI.deleteGoal(id)
    if (selectedGoal?.id === id) { setView('list'); setSelectedGoal(null) }
    await load()
  }

  const handleAchieve = async (id) => {
    const g = goals.find(x => x.id === id)
    if (!g) return
    await window.electronAPI.updateGoal({ ...g, is_achieved: 1 })
    await load()
    if (selectedGoal?.id === id) setSelectedGoal(p => ({ ...p, is_achieved: 1 }))
  }

  const openEdit = (g) => { setEditGoal(g); setShowForm(true) }

  const filtered = goals.filter(g => {
    if (filter === 'need') return g.type === 'need' && !g.is_achieved
    if (filter === 'want') return g.type === 'want' && !g.is_achieved
    if (filter === 'achieved') return Boolean(g.is_achieved)
    return !g.is_achieved
  })

  if (view === 'detail' && selectedGoal) {
    return (
      <GoalDetail
        goal={selectedGoal}
        investments={investments}
        onBack={() => { setView('list'); setSelectedGoal(null) }}
        onAchieve={handleAchieve}
        onEdit={openEdit}
      />
    )
  }

  return (
    <div className="p-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Goals</h2>
          <p className="mt-1 text-sm text-gray-500">
            {goals.filter(g => !g.is_achieved).length} active · {goals.filter(g => g.is_achieved).length} achieved
          </p>
        </div>
        <button
          onClick={() => { setEditGoal(null); setShowForm(true) }}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-white text-sm font-semibold hover:opacity-90 transition-opacity"
          style={{ backgroundColor: '#6C63FF' }}
        >
          <span className="text-base font-bold leading-none">+</span>
          Add Goal
        </button>
      </div>

      {/* Filter tabs */}
      <div className="flex gap-1 mb-6 bg-gray-100 rounded-xl p-1 w-fit">
        {[
          { key: 'all', label: 'Active' },
          { key: 'need', label: 'Needs' },
          { key: 'want', label: 'Wants' },
          { key: 'achieved', label: 'Achieved' },
        ].map(t => (
          <button key={t.key} onClick={() => setFilter(t.key)}
            className="px-4 py-1.5 rounded-lg text-sm font-semibold transition-all"
            style={{
              backgroundColor: filter === t.key ? '#fff' : 'transparent',
              color: filter === t.key ? '#1a1a2e' : '#9ca3af',
              boxShadow: filter === t.key ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
            }}>
            {t.label}
          </button>
        ))}
      </div>

      {/* Goal cards */}
      {loading ? (
        <div className="grid grid-cols-2 xl:grid-cols-3 gap-5">
          {[1, 2, 3].map(i => <div key={i} className="h-52 bg-gray-100 rounded-2xl animate-pulse" />)}
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex items-center justify-center h-56 rounded-2xl bg-white border border-dashed border-gray-200">
          <div className="text-center">
            <p className="text-4xl mb-3">{filter === 'achieved' ? '🏆' : '🎯'}</p>
            <p className="text-base font-semibold text-gray-700">
              {filter === 'achieved' ? 'No achieved goals yet' : 'No goals yet'}
            </p>
            <p className="text-sm text-gray-400 mt-1">
              {filter === 'achieved' ? 'Keep working towards your goals!' : 'Tap + Add Goal to get started'}
            </p>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-2 xl:grid-cols-3 gap-5">
          {filtered.map(g => (
            <GoalCard key={g.id} goal={g} investments={investments}
              onEdit={openEdit}
              onView={(g) => { setSelectedGoal(g); setView('detail') }}
              onDelete={handleDelete} />
          ))}
        </div>
      )}

      {showForm && (
        <GoalFormModal
          initial={editGoal}
          allInvestments={investments}
          onSave={handleSave}
          onClose={() => { setShowForm(false); setEditGoal(null) }}
        />
      )}
    </div>
  )
}
