import { useState, useEffect } from 'react'

const INR = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 })
const fmt = v => INR.format(v || 0)
const todayISO = () => new Date().toISOString().slice(0, 10)
const fmtDate = iso => iso
  ? new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
  : ''

const CATEGORY_DEFS = {
  needs:      { label: 'Needs',      color: '#3B82F6', bg: '#eff6ff', icon: '🏠' },
  wants:      { label: 'Wants',      color: '#8B5CF6', bg: '#f5f3ff', icon: '🎭' },
  investment: { label: 'Investment', color: '#10B981', bg: '#ecfdf5', icon: '📈' },
}

// ── Icons ─────────────────────────────────────────────────────────────────
const TrashIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
    <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6m4-6v6"/><path d="M9 6V4h6v2"/>
  </svg>
)
const PlusIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
    <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
  </svg>
)
const CloseIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4 text-gray-500">
    <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
  </svg>
)

// ── Plan Donut ────────────────────────────────────────────────────────────
function PlanDonut({ plan }) {
  const salary = plan.monthly_salary || 0
  const totals = { needs: 0, wants: 0, investment: 0 }
  for (const item of (plan.items || [])) {
    if (totals[item.category] !== undefined) totals[item.category] += item.amount
  }

  const totalAllocated = totals.needs + totals.wants + totals.investment
  const surplus = salary - totalAllocated

  let cum = 0
  const segs = Object.entries(totals).map(([cat, amount]) => {
    const def = CATEGORY_DEFS[cat]
    const pct = salary > 0 ? (amount / salary) * 100 : 0
    const start = cum; cum += pct
    return { cat, amount, pct, start, ...def }
  })

  if (surplus > 0 && salary > 0) {
    const pct = (surplus / salary) * 100
    segs.push({ cat: 'unallocated', amount: surplus, pct, start: cum, label: 'Unallocated', color: '#E5E7EB', icon: '⬜', bg: '#f9fafb' })
  }

  const gradient = segs.length
    ? segs.map(s => `${s.color} ${s.start.toFixed(2)}% ${(s.start + s.pct).toFixed(2)}%`).join(', ')
    : '#E5E7EB 0% 100%'

  return (
    <div className="flex items-center gap-8">
      <div className="relative shrink-0 w-36 h-36">
        <div className="w-36 h-36 rounded-full" style={{ background: `conic-gradient(${gradient})` }} />
        <div className="absolute inset-6 bg-white rounded-full flex flex-col items-center justify-center">
          <p className="text-[9px] text-gray-400 leading-none">Monthly</p>
          <p className="text-xs font-bold text-gray-800 mt-0.5">{fmt(salary)}</p>
        </div>
      </div>
      <div className="flex-1 space-y-3">
        {segs.map(s => (
          <div key={s.cat}>
            <div className="flex items-center justify-between mb-1">
              <div className="flex items-center gap-2">
                <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: s.color }} />
                <span className="text-sm font-medium text-gray-700">{s.icon} {s.label}</span>
              </div>
              <div className="text-right">
                <span className="text-sm font-semibold text-gray-800">{fmt(s.amount)}</span>
                <span className="text-xs text-gray-400 ml-1.5">({s.pct.toFixed(0)}%)</span>
              </div>
            </div>
            <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
              <div className="h-full rounded-full" style={{ width: `${s.pct}%`, backgroundColor: s.color }} />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Running Balance Table ─────────────────────────────────────────────────
function RunningBalanceTable({ plan }) {
  const salary = plan.monthly_salary || 0
  const items = plan.items || []

  let balance = salary
  const rows = []

  for (const cat of ['needs', 'wants', 'investment']) {
    const catItems = items
      .filter(i => i.category === cat)
      .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
    if (!catItems.length) continue

    const def = CATEGORY_DEFS[cat]
    rows.push({ type: 'header', cat, def, total: catItems.reduce((s, i) => s + i.amount, 0) })

    for (const item of catItems) {
      balance -= item.amount
      rows.push({ type: 'item', item, balance, def })
    }
  }

  const surplus = balance

  return (
    <div>
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        {/* Column header */}
        <div className="grid grid-cols-12 px-5 py-3 bg-gray-50 border-b border-gray-100 text-xs font-semibold text-gray-500 uppercase tracking-wide">
          <div className="col-span-5">Name</div>
          <div className="col-span-3">Bank / Provider</div>
          <div className="col-span-2 text-right">Amount</div>
          <div className="col-span-2 text-right">Balance After</div>
        </div>

        {/* Salary row */}
        <div className="grid grid-cols-12 px-5 py-3 border-b border-gray-200 bg-gray-50/80">
          <div className="col-span-5 text-sm font-bold text-gray-900">💰 Monthly Salary</div>
          <div className="col-span-3" />
          <div className="col-span-2 text-right text-sm font-bold text-gray-900">{fmt(salary)}</div>
          <div className="col-span-2 text-right text-sm font-bold text-gray-900">{fmt(salary)}</div>
        </div>

        {rows.map((row, i) => {
          if (row.type === 'header') {
            return (
              <div key={`h-${i}`} className="grid grid-cols-12 px-5 py-2.5 border-b border-gray-50"
                style={{ backgroundColor: row.def.bg }}>
                <div className="col-span-5 text-xs font-bold uppercase tracking-wide flex items-center gap-1.5" style={{ color: row.def.color }}>
                  <span>{row.def.icon}</span> {row.def.label}
                </div>
                <div className="col-span-3" />
                <div className="col-span-2 text-right text-xs font-bold" style={{ color: row.def.color }}>{fmt(row.total)}</div>
                <div className="col-span-2" />
              </div>
            )
          }
          return (
            <div key={`i-${i}`} className="grid grid-cols-12 px-5 py-3 border-b border-gray-50 hover:bg-gray-50/50 transition-colors">
              <div className="col-span-5 text-sm font-medium text-gray-800 pl-4">{row.item.name}</div>
              <div className="col-span-3 text-sm text-gray-500">{row.item.bank_or_provider || '—'}</div>
              <div className="col-span-2 text-right text-sm text-gray-600">−{fmt(row.item.amount)}</div>
              <div className="col-span-2 text-right text-sm font-semibold" style={{ color: row.balance >= 0 ? '#374151' : '#EF4444' }}>
                {fmt(row.balance)}
              </div>
            </div>
          )
        })}
      </div>

      {/* Surplus / deficit */}
      <div className={`mt-4 flex items-center justify-between px-5 py-4 rounded-xl border ${surplus >= 0 ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'}`}>
        <div>
          <p className={`text-sm font-semibold ${surplus >= 0 ? 'text-green-700' : 'text-red-700'}`}>
            {surplus >= 0 ? '✓ Surplus' : '⚠ Deficit'}
          </p>
          <p className={`text-xs mt-0.5 ${surplus >= 0 ? 'text-green-600' : 'text-red-600'}`}>
            {surplus >= 0 ? 'Unallocated from salary' : 'Allocation exceeds salary'}
          </p>
        </div>
        <p className={`text-2xl font-bold ${surplus >= 0 ? 'text-green-700' : 'text-red-700'}`}>{fmt(Math.abs(surplus))}</p>
      </div>
    </div>
  )
}

// ── Items Editor ──────────────────────────────────────────────────────────
function ItemsEditor({ items, onChange, salary }) {
  const totalAllocated = items.reduce((s, i) => s + (parseFloat(i.amount) || 0), 0)
  const remaining = (salary || 0) - totalAllocated

  const update = (idx, field, val) => {
    const next = [...items]
    next[idx] = { ...next[idx], [field]: val }
    onChange(next)
  }

  return (
    <div>
      {salary > 0 && (
        <div className={`flex items-center justify-between px-4 py-2.5 rounded-xl mb-4 text-sm font-medium ${
          Math.abs(remaining) < 1 ? 'bg-green-50 text-green-700' : remaining < 0 ? 'bg-red-50 text-red-700' : 'bg-blue-50 text-blue-700'
        }`}>
          <span>
            {Math.abs(remaining) < 1 ? '✓ Fully allocated' : remaining > 0 ? `${fmt(remaining)} unallocated` : `${fmt(-remaining)} over budget`}
          </span>
          <span className="font-semibold">{fmt(totalAllocated)} / {fmt(salary)}</span>
        </div>
      )}

      <div className="space-y-2 mb-3">
        {items.map((item, idx) => (
          <div key={idx} className="grid grid-cols-12 gap-2 items-center">
            <div className="col-span-4">
              <input
                className="w-full px-3 py-2 text-sm rounded-lg border border-gray-200 focus:outline-none focus:ring-2 focus:ring-[#6C63FF]/20 focus:border-[#6C63FF]"
                placeholder="Name (e.g. Rent)"
                value={item.name}
                onChange={e => update(idx, 'name', e.target.value)}
              />
            </div>
            <div className="col-span-3">
              <select
                className="w-full px-3 py-2 text-sm rounded-lg border border-gray-200 bg-white focus:outline-none focus:ring-2 focus:ring-[#6C63FF]/20 focus:border-[#6C63FF]"
                value={item.category}
                onChange={e => update(idx, 'category', e.target.value)}
              >
                {Object.entries(CATEGORY_DEFS).map(([k, d]) => (
                  <option key={k} value={k}>{d.icon} {d.label}</option>
                ))}
              </select>
            </div>
            <div className="col-span-2">
              <input
                type="number" min="0"
                className="w-full px-3 py-2 text-sm rounded-lg border border-gray-200 focus:outline-none focus:ring-2 focus:ring-[#6C63FF]/20 focus:border-[#6C63FF]"
                placeholder="Amount"
                value={item.amount}
                onChange={e => update(idx, 'amount', e.target.value)}
              />
            </div>
            <div className="col-span-2">
              <input
                className="w-full px-3 py-2 text-sm rounded-lg border border-gray-200 focus:outline-none focus:ring-2 focus:ring-[#6C63FF]/20 focus:border-[#6C63FF]"
                placeholder="Bank"
                value={item.bank_or_provider}
                onChange={e => update(idx, 'bank_or_provider', e.target.value)}
              />
            </div>
            <div className="col-span-1 flex justify-center">
              <button
                onClick={() => onChange(items.filter((_, i) => i !== idx))}
                className="p-1.5 rounded-lg hover:bg-red-50 text-gray-400 hover:text-red-500 transition-colors"
              >
                <TrashIcon />
              </button>
            </div>
          </div>
        ))}
      </div>

      <button
        onClick={() => onChange([...items, { name: '', amount: '', category: 'needs', bank_or_provider: '' }])}
        className="flex items-center gap-1.5 text-sm font-medium text-[#6C63FF] hover:text-[#5a52e0] transition-colors"
      >
        <PlusIcon /> Add item
      </button>
    </div>
  )
}

// ── New Plan Wizard ───────────────────────────────────────────────────────
const WIZARD_STEPS = ['Plan Details', 'Line Items', 'Preview & Create']

function NewPlanWizard({ activePlan, onCreated, onClose }) {
  const [step, setStep] = useState(0)
  const [meta, setMeta] = useState({
    label: '',
    monthly_salary: activePlan?.monthly_salary ? String(activePlan.monthly_salary) : '',
    effective_from: todayISO(),
    notes: '',
  })
  const [items, setItems] = useState(
    activePlan?.items?.map(i => ({
      name: i.name,
      amount: String(i.amount),
      category: i.category,
      bank_or_provider: i.bank_or_provider || '',
    })) || []
  )
  const [saving, setSaving] = useState(false)

  const metaValid = meta.label.trim() && parseFloat(meta.monthly_salary) > 0 && meta.effective_from

  const previewPlan = {
    monthly_salary: parseFloat(meta.monthly_salary) || 0,
    items: items.filter(i => i.name.trim()).map((i, idx) => ({
      ...i, amount: parseFloat(i.amount) || 0, sort_order: idx,
    })),
  }

  async function handleCreate() {
    setSaving(true)
    try {
      await window.electronAPI.createPlan({
        label: meta.label.trim(),
        monthly_salary: parseFloat(meta.monthly_salary),
        effective_from: meta.effective_from,
        notes: meta.notes || null,
        items: previewPlan.items.map(i => ({
          name: i.name,
          amount: i.amount,
          category: i.category,
          bank_or_provider: i.bank_or_provider || null,
          sort_order: i.sort_order,
        })),
      })
      onCreated()
    } catch (e) {
      console.error(e)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
      onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="bg-white rounded-2xl w-[660px] max-h-[90vh] flex flex-col shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-5 border-b border-gray-100">
          <div>
            <h2 className="text-lg font-bold text-gray-900">New Salary Plan</h2>
            <p className="text-xs text-gray-400 mt-0.5">Step {step + 1} of {WIZARD_STEPS.length} — {WIZARD_STEPS[step]}</p>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-gray-100 transition-colors">
            <CloseIcon />
          </button>
        </div>

        {/* Step pills */}
        <div className="flex items-center gap-1.5 px-6 pt-4 pb-1">
          {WIZARD_STEPS.map((s, i) => (
            <div key={i} className="flex items-center gap-1.5">
              <div
                className="px-3 py-1 rounded-full text-xs font-semibold transition-colors"
                style={{
                  backgroundColor: i < step ? '#10B981' : i === step ? '#6C63FF' : '#F3F4F6',
                  color: i <= step ? '#fff' : '#6B7280',
                }}
              >
                {i < step ? `✓ ${s}` : `${i + 1}. ${s}`}
              </div>
              {i < WIZARD_STEPS.length - 1 && <div className="w-4 h-px bg-gray-200" />}
            </div>
          ))}
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-5">
          {step === 0 && (
            <div className="space-y-4">
              <div>
                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5 block">Plan Label *</label>
                <input
                  autoFocus type="text" placeholder="e.g. Plan 2 - Jan 2027"
                  value={meta.label} onChange={e => setMeta(m => ({ ...m, label: e.target.value }))}
                  className="w-full px-4 py-2.5 rounded-xl border border-gray-200 text-sm font-medium text-gray-900 focus:outline-none focus:border-[#6C63FF] focus:ring-2 focus:ring-[#6C63FF]/20"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5 block">Monthly Salary (₹) *</label>
                <input
                  type="number" min="0" step="1000" placeholder="e.g. 200000"
                  value={meta.monthly_salary} onChange={e => setMeta(m => ({ ...m, monthly_salary: e.target.value }))}
                  className="w-full px-4 py-2.5 rounded-xl border border-gray-200 text-sm font-medium text-gray-900 focus:outline-none focus:border-[#6C63FF] focus:ring-2 focus:ring-[#6C63FF]/20"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5 block">Effective From *</label>
                <input
                  type="date" value={meta.effective_from}
                  onChange={e => setMeta(m => ({ ...m, effective_from: e.target.value }))}
                  className="w-full px-4 py-2.5 rounded-xl border border-gray-200 text-sm font-medium text-gray-900 focus:outline-none focus:border-[#6C63FF] focus:ring-2 focus:ring-[#6C63FF]/20"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5 block">Notes (optional)</label>
                <textarea
                  rows={2} placeholder="e.g. Post salary hike, changed allocations"
                  value={meta.notes} onChange={e => setMeta(m => ({ ...m, notes: e.target.value }))}
                  className="w-full px-4 py-2.5 rounded-xl border border-gray-200 text-sm text-gray-700 focus:outline-none focus:border-[#6C63FF] focus:ring-2 focus:ring-[#6C63FF]/20 resize-none"
                />
              </div>
            </div>
          )}

          {step === 1 && (
            <div>
              <div className="grid grid-cols-12 gap-2 mb-2 text-xs font-semibold text-gray-400 uppercase tracking-wide">
                <div className="col-span-4">Name</div>
                <div className="col-span-3">Category</div>
                <div className="col-span-2">Amount (₹)</div>
                <div className="col-span-2">Bank/Provider</div>
                <div className="col-span-1" />
              </div>
              <ItemsEditor items={items} onChange={setItems} salary={parseFloat(meta.monthly_salary) || 0} />
            </div>
          )}

          {step === 2 && (
            <div>
              <div className="p-4 rounded-xl bg-gray-50 border border-gray-200 mb-5">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-semibold text-gray-900">{meta.label}</p>
                    <p className="text-xs text-gray-500 mt-0.5">
                      {fmt(parseFloat(meta.monthly_salary))}/month · from {fmtDate(meta.effective_from)}
                    </p>
                    {meta.notes && <p className="text-xs text-gray-400 mt-1 italic">{meta.notes}</p>}
                  </div>
                  <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-[#6C63FF]/10 text-[#6C63FF]">
                    {previewPlan.items.length} items
                  </span>
                </div>
              </div>

              <div className="bg-white rounded-2xl p-5 border border-gray-100 shadow-sm mb-5">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-4">Overview</p>
                <PlanDonut plan={previewPlan} />
              </div>

              <RunningBalanceTable plan={previewPlan} />
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-gray-100">
          {step > 0 ? (
            <button onClick={() => setStep(s => s - 1)}
              className="px-4 py-2 rounded-xl text-sm font-semibold text-gray-600 border border-gray-200 hover:bg-gray-50 transition-colors">
              ← Back
            </button>
          ) : (
            <button onClick={onClose}
              className="px-4 py-2 rounded-xl text-sm font-semibold text-gray-600 border border-gray-200 hover:bg-gray-50 transition-colors">
              Cancel
            </button>
          )}

          {step < 2 ? (
            <button
              onClick={() => setStep(s => s + 1)}
              disabled={step === 0 && !metaValid}
              className="px-6 py-2 rounded-xl text-white text-sm font-semibold hover:opacity-90 disabled:opacity-40 transition-opacity"
              style={{ backgroundColor: '#6C63FF' }}
            >
              Continue →
            </button>
          ) : (
            <button
              onClick={handleCreate} disabled={saving}
              className="px-6 py-2 rounded-xl text-white text-sm font-semibold hover:opacity-90 disabled:opacity-50 transition-opacity"
              style={{ backgroundColor: '#10B981' }}
            >
              {saving ? 'Creating…' : '✓ Create Plan'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Edit Plan Modal ───────────────────────────────────────────────────────
function EditPlanModal({ plan, onUpdated, onClose }) {
  const [label, setLabel] = useState(plan.label)
  const [salary, setSalary] = useState(String(plan.monthly_salary))
  const [items, setItems] = useState(
    (plan.items || []).map(i => ({
      name: i.name, amount: String(i.amount),
      category: i.category, bank_or_provider: i.bank_or_provider || '',
    }))
  )
  const [saving, setSaving] = useState(false)

  async function handleSave() {
    setSaving(true)
    try {
      await window.electronAPI.updatePlanItems({
        planId: plan.id,
        label: label.trim() || undefined,
        monthly_salary: parseFloat(salary) || undefined,
        items: items.filter(i => i.name.trim()).map((i, idx) => ({
          name: i.name.trim(),
          amount: parseFloat(i.amount) || 0,
          category: i.category,
          bank_or_provider: i.bank_or_provider || null,
          sort_order: idx,
        })),
      })
      onUpdated()
    } catch (e) {
      console.error(e)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
      onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="bg-white rounded-2xl w-[660px] max-h-[90vh] flex flex-col shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between px-6 py-5 border-b border-gray-100">
          <div>
            <h2 className="text-lg font-bold text-gray-900">Edit Active Plan</h2>
            <p className="text-xs text-gray-400 mt-0.5">{plan.label}</p>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-gray-100 transition-colors">
            <CloseIcon />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5 block">Plan Label</label>
              <input type="text" value={label} onChange={e => setLabel(e.target.value)}
                className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm font-medium focus:outline-none focus:border-[#6C63FF] focus:ring-2 focus:ring-[#6C63FF]/20"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5 block">Monthly Salary (₹)</label>
              <input type="number" min="0" value={salary} onChange={e => setSalary(e.target.value)}
                className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm font-medium focus:outline-none focus:border-[#6C63FF] focus:ring-2 focus:ring-[#6C63FF]/20"
              />
            </div>
          </div>

          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Line Items</p>
            <div className="grid grid-cols-12 gap-2 mb-2 text-xs font-semibold text-gray-400 uppercase tracking-wide">
              <div className="col-span-4">Name</div>
              <div className="col-span-3">Category</div>
              <div className="col-span-2">Amount (₹)</div>
              <div className="col-span-2">Bank/Provider</div>
              <div className="col-span-1" />
            </div>
            <ItemsEditor items={items} onChange={setItems} salary={parseFloat(salary) || 0} />
          </div>
        </div>

        <div className="flex gap-3 px-6 py-4 border-t border-gray-100">
          <button onClick={onClose}
            className="flex-1 py-2.5 rounded-xl border border-gray-200 text-sm font-semibold text-gray-600 hover:bg-gray-50 transition-colors">
            Cancel
          </button>
          <button onClick={handleSave} disabled={saving}
            className="flex-1 py-2.5 rounded-xl text-white text-sm font-semibold hover:opacity-90 disabled:opacity-50 transition-opacity"
            style={{ backgroundColor: '#6C63FF' }}>
            {saving ? 'Saving…' : '✓ Save Changes'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Compare View ──────────────────────────────────────────────────────────
function computeDiff(plan1, plan2) {
  const items1 = plan1.items || []
  const items2 = plan2.items || []
  const map1 = new Map(items1.map(i => [i.name.toLowerCase(), i]))
  const map2 = new Map(items2.map(i => [i.name.toLowerCase(), i]))
  const allKeys = new Set([...map1.keys(), ...map2.keys()])

  const rows = [...allKeys].map(key => {
    const i1 = map1.get(key)
    const i2 = map2.get(key)
    const name = i1?.name || i2?.name || key
    const oldAmt = i1?.amount || 0
    const newAmt = i2?.amount || 0
    let status = 'same'
    if (!i1) status = 'added'
    else if (!i2) status = 'removed'
    else if (Math.abs(oldAmt - newAmt) > 0.5 || i1.category !== i2.category) status = 'changed'
    return { name, oldAmt, newAmt, oldCat: i1?.category, newCat: i2?.category, status }
  })

  const order = { removed: 0, changed: 1, added: 2, same: 3 }
  return rows.sort((a, b) => order[a.status] - order[b.status])
}

function CompareView({ plan1, plan2, onClose }) {
  const diff = computeDiff(plan1, plan2)

  const ROW_BG = { added: '#F0FDF4', removed: '#FFF5F5', changed: '#FFFBEB', same: 'transparent' }
  const STATUS_LABEL = {
    added:   <span className="text-green-600 font-semibold">✦ Added</span>,
    removed: <span className="text-red-600 font-semibold">✖ Removed</span>,
    changed: <span className="text-amber-600 font-semibold">~ Changed</span>,
    same:    <span className="text-gray-400">— Unchanged</span>,
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-5">
        <h2 className="text-xl font-bold text-gray-900">Compare Plans</h2>
        <button onClick={onClose}
          className="px-4 py-2 rounded-xl text-sm font-semibold text-gray-600 border border-gray-200 hover:bg-gray-50 transition-colors">
          ✕ Close
        </button>
      </div>

      <div className="grid grid-cols-2 gap-4 mb-5">
        {[plan1, plan2].map((plan, i) => (
          <div key={i} className="bg-white rounded-2xl p-4 border border-gray-100 shadow-sm">
            <p className="font-semibold text-gray-900">{plan.label}</p>
            <p className="text-xs text-gray-500 mt-0.5">
              {fmt(plan.monthly_salary)}/month · {fmtDate(plan.effective_from)}
            </p>
          </div>
        ))}
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="grid grid-cols-12 px-5 py-3 bg-gray-50 border-b border-gray-100 text-xs font-semibold text-gray-500 uppercase tracking-wide">
          <div className="col-span-3">Name</div>
          <div className="col-span-2 text-right">Old Amount</div>
          <div className="col-span-2 text-center">Δ Change</div>
          <div className="col-span-2 text-right">New Amount</div>
          <div className="col-span-3">Status</div>
        </div>
        {diff.map((row, i) => (
          <div key={i}
            className="grid grid-cols-12 px-5 py-3 border-b border-gray-50 items-center"
            style={{ backgroundColor: ROW_BG[row.status] }}
          >
            <div className="col-span-3 text-sm font-medium text-gray-800">{row.name}</div>
            <div className="col-span-2 text-right text-sm text-gray-600">{row.oldAmt > 0 ? fmt(row.oldAmt) : '—'}</div>
            <div className="col-span-2 text-center text-xs font-semibold">
              {row.status === 'changed' && (
                <span style={{ color: row.newAmt > row.oldAmt ? '#10B981' : '#EF4444' }}>
                  {row.newAmt > row.oldAmt ? '+' : ''}{fmt(row.newAmt - row.oldAmt)}
                </span>
              )}
            </div>
            <div className="col-span-2 text-right text-sm text-gray-600">{row.newAmt > 0 ? fmt(row.newAmt) : '—'}</div>
            <div className="col-span-3 text-xs">{STATUS_LABEL[row.status]}</div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Plan History List ─────────────────────────────────────────────────────
function PlanHistoryList({ plans, activePlanId, onBack, onViewPlan, onCompare }) {
  const [selectedIds, setSelectedIds] = useState([])

  const toggleSelect = (id) => {
    setSelectedIds(prev => {
      if (prev.includes(id)) return prev.filter(x => x !== id)
      if (prev.length >= 2) return [prev[1], id]
      return [...prev, id]
    })
  }

  const sorted = [...plans].sort((a, b) => new Date(b.effective_from) - new Date(a.effective_from))

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-xl font-bold text-gray-900">Plan History</h2>
          <p className="text-sm text-gray-500 mt-0.5">{plans.length} plan{plans.length !== 1 ? 's' : ''} total</p>
        </div>
        <div className="flex items-center gap-3">
          {selectedIds.length === 2 && (
            <button
              onClick={() => onCompare(selectedIds)}
              className="px-4 py-2 rounded-xl text-white text-sm font-semibold hover:opacity-90 transition-opacity"
              style={{ backgroundColor: '#F59E0B' }}
            >
              ↔ Compare Selected
            </button>
          )}
          <button onClick={onBack}
            className="px-4 py-2 rounded-xl text-sm font-semibold text-gray-600 border border-gray-200 hover:bg-gray-50 transition-colors">
            ← Back
          </button>
        </div>
      </div>

      <div className="space-y-3">
        {sorted.map(plan => {
          const isActive = plan.id === activePlanId
          const isSel = selectedIds.includes(plan.id)

          return (
            <div key={plan.id}
              className={`bg-white rounded-2xl p-5 border shadow-sm transition-all ${
                isSel ? 'border-amber-400 ring-2 ring-amber-200' : isActive ? 'border-[#6C63FF]/40' : 'border-gray-100'
              }`}
            >
              <div className="flex items-start justify-between">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                    <p className="font-semibold text-gray-900">{plan.label}</p>
                    {isActive && (
                      <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-[#6C63FF]/10 text-[#6C63FF]">Active</span>
                    )}
                  </div>
                  <p className="text-xs text-gray-500">
                    {fmtDate(plan.effective_from)}
                    {plan.effective_to ? ` → ${fmtDate(plan.effective_to)}` : ' → Present'}
                  </p>
                  <p className="text-sm font-semibold text-gray-700 mt-1.5">{fmt(plan.monthly_salary)}/month</p>
                </div>

                <div className="flex items-start gap-4 ml-4 shrink-0">
                  <div className="text-right text-xs text-gray-500 space-y-1 pt-0.5">
                    <p><span className="inline-block w-1.5 h-1.5 rounded-full bg-[#3B82F6] mr-1.5 align-middle" />Needs: {fmt(plan.totalNeeds)}</p>
                    <p><span className="inline-block w-1.5 h-1.5 rounded-full bg-[#8B5CF6] mr-1.5 align-middle" />Wants: {fmt(plan.totalWants)}</p>
                    <p><span className="inline-block w-1.5 h-1.5 rounded-full bg-[#10B981] mr-1.5 align-middle" />Invest: {fmt(plan.totalInvestment)}</p>
                  </div>
                  <div className="flex flex-col gap-2">
                    <button onClick={() => onViewPlan(plan.id)}
                      className="px-3 py-1.5 rounded-lg text-xs font-semibold text-[#6C63FF] border border-[#6C63FF]/20 hover:bg-[#6C63FF]/5 transition-colors">
                      View
                    </button>
                    <button
                      onClick={() => toggleSelect(plan.id)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                        isSel
                          ? 'bg-amber-100 text-amber-700 border border-amber-300'
                          : 'text-gray-500 border border-gray-200 hover:bg-gray-50'
                      }`}
                    >
                      {isSel ? '✓ Selected' : 'Compare'}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── Plan Detail View ──────────────────────────────────────────────────────
function PlanDetailView({ plan, onEdit, onNewPlan, onHistory }) {
  return (
    <div>
      {/* Header */}
      <div className="flex items-start justify-between mb-6 flex-wrap gap-3">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <h3 className="text-xl font-bold text-gray-900">{plan.label}</h3>
            <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-[#6C63FF]/10 text-[#6C63FF]">Active</span>
          </div>
          <p className="text-sm text-gray-500">
            {fmt(plan.monthly_salary)}/month · effective {fmtDate(plan.effective_from)}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <button onClick={onEdit}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold text-[#6C63FF] border border-[#6C63FF]/20 hover:bg-[#6C63FF]/5 transition-colors">
            ✎ Edit
          </button>
          <button onClick={onNewPlan}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-white text-sm font-semibold hover:opacity-90 transition-opacity"
            style={{ backgroundColor: '#6C63FF' }}>
            + New Plan
          </button>
          <button onClick={onHistory}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold text-gray-600 border border-gray-200 hover:bg-gray-50 transition-colors">
            🕐 History
          </button>
        </div>
      </div>

      {/* Donut */}
      <div className="bg-white rounded-2xl p-6 border border-gray-100 shadow-sm mb-5">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-4">Allocation Overview</p>
        <PlanDonut plan={plan} />
      </div>

      {/* Running balance */}
      <div>
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Running Balance</p>
        <RunningBalanceTable plan={plan} />
      </div>
    </div>
  )
}

// ── Main Component ────────────────────────────────────────────────────────
export default function SalaryAllocator() {
  const [loading, setLoading]           = useState(true)
  const [activePlan, setActivePlan]     = useState(null)
  const [allPlans, setAllPlans]         = useState([])
  const [view, setView]                 = useState('detail') // 'detail' | 'history' | 'viewPlan' | 'compare'
  const [showNewWizard, setShowNewWizard] = useState(false)
  const [showEdit, setShowEdit]         = useState(false)
  const [viewingPlan, setViewingPlan]   = useState(null)
  const [comparePlans, setComparePlans] = useState(null) // [plan1, plan2]

  async function loadData() {
    setLoading(true)
    try {
      const [plan, plans] = await Promise.all([
        window.electronAPI.getActivePlan(),
        window.electronAPI.getAllPlans(),
      ])
      setActivePlan(plan || null)
      setAllPlans(plans || [])
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { loadData() }, [])

  async function handleViewPlan(id) {
    const plan = await window.electronAPI.getPlanById(id)
    setViewingPlan(plan)
    setView('viewPlan')
  }

  async function handleCompare(ids) {
    const [p1, p2] = await Promise.all([
      window.electronAPI.getPlanById(ids[0]),
      window.electronAPI.getPlanById(ids[1]),
    ])
    setComparePlans([p1, p2])
    setView('compare')
  }

  if (loading) {
    return (
      <div className="p-8 flex items-center justify-center h-64">
        <div className="w-6 h-6 rounded-full border-2 animate-spin" style={{ borderColor: '#6C63FF', borderTopColor: 'transparent' }} />
      </div>
    )
  }

  if (!activePlan) {
    return (
      <div className="p-8 flex flex-col items-center justify-center h-64 text-center">
        <p className="text-3xl mb-3">📋</p>
        <p className="text-lg font-bold text-gray-800 mb-1">No active plan</p>
        <p className="text-sm text-gray-500 mb-5">Create your first salary plan to get started</p>
        <button
          onClick={() => setShowNewWizard(true)}
          className="px-6 py-3 rounded-xl text-white font-semibold text-sm hover:opacity-90 transition-opacity"
          style={{ backgroundColor: '#6C63FF' }}
        >
          + Create Plan
        </button>
        {showNewWizard && (
          <NewPlanWizard
            activePlan={null}
            onCreated={() => { setShowNewWizard(false); loadData() }}
            onClose={() => setShowNewWizard(false)}
          />
        )}
      </div>
    )
  }

  return (
    <div className="p-8 max-w-4xl">
      {view === 'detail' && (
        <PlanDetailView
          plan={activePlan}
          onEdit={() => setShowEdit(true)}
          onNewPlan={() => setShowNewWizard(true)}
          onHistory={() => setView('history')}
        />
      )}

      {view === 'history' && (
        <PlanHistoryList
          plans={allPlans}
          activePlanId={activePlan?.id}
          onBack={() => setView('detail')}
          onViewPlan={handleViewPlan}
          onCompare={handleCompare}
        />
      )}

      {view === 'viewPlan' && viewingPlan && (
        <div>
          <div className="flex items-center gap-3 mb-5 flex-wrap">
            <button onClick={() => setView('history')}
              className="px-3 py-2 rounded-xl text-sm font-semibold text-gray-600 border border-gray-200 hover:bg-gray-50 transition-colors">
              ← History
            </button>
            <div className="flex items-center gap-2">
              <h2 className="text-xl font-bold text-gray-900">{viewingPlan.label}</h2>
              {viewingPlan.is_active ? (
                <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-[#6C63FF]/10 text-[#6C63FF]">Active</span>
              ) : (
                <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-gray-100 text-gray-500">Inactive</span>
              )}
            </div>
          </div>
          <p className="text-sm text-gray-500 mb-5">
            {fmt(viewingPlan.monthly_salary)}/month · {fmtDate(viewingPlan.effective_from)}
            {viewingPlan.effective_to ? ` → ${fmtDate(viewingPlan.effective_to)}` : ' → Present'}
          </p>
          <div className="bg-white rounded-2xl p-6 border border-gray-100 shadow-sm mb-5">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-4">Overview</p>
            <PlanDonut plan={viewingPlan} />
          </div>
          <RunningBalanceTable plan={viewingPlan} />
        </div>
      )}

      {view === 'compare' && comparePlans && (
        <CompareView
          plan1={comparePlans[0]}
          plan2={comparePlans[1]}
          onClose={() => setView('history')}
        />
      )}

      {showNewWizard && (
        <NewPlanWizard
          activePlan={activePlan}
          onCreated={() => { setShowNewWizard(false); loadData() }}
          onClose={() => setShowNewWizard(false)}
        />
      )}

      {showEdit && activePlan && (
        <EditPlanModal
          plan={activePlan}
          onUpdated={() => { setShowEdit(false); loadData() }}
          onClose={() => setShowEdit(false)}
        />
      )}
    </div>
  )
}
