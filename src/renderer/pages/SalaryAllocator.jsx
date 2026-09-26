import { useState, useEffect } from 'react'
import bridge from '../lib/bridge'

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

// ── Investment monthly helpers ────────────────────────────────────────────
function getTotalCurrentMonthly(investments = []) {
  return investments.reduce((sum, inv) => {
    if (inv.type === 'mf_sip') {
      return sum + (Number(inv.monthly_sip_amount) || 0)
    }
    if (['epf', 'ppf', 'nps'].includes(inv.type)) return sum + (Number(inv.monthly_sip_amount) || 0)
    if (inv.type === 'insurance') {
      const monthly = Number(inv.monthly_sip_amount) || 0
      const premYears = Number(inv.interest_rate) || 0
      const start = inv.start_date ? new Date(inv.start_date).getTime() : null
      if (!start || !monthly || !premYears) return sum
      const yrs = (Date.now() - start) / (365.25 * 24 * 60 * 60 * 1000)
      return sum + (yrs < premYears ? monthly : 0)
    }
    return sum
  }, 0)
}

function getItemCurrentMonthly(planItemName, investments = []) {
  if (!planItemName || !investments.length) return null
  const q = planItemName.toLowerCase().trim()
  let inv = investments.find(i => i.name?.toLowerCase().trim() === q)
  if (!inv) inv = investments.find(i => i.name?.toLowerCase().includes(q))
  if (!inv) inv = investments.find(i => q.includes(i.name?.toLowerCase()?.trim() || '___'))
  if (!inv) return null
  if (inv.type === 'mf_sip') {
    return Number(inv.monthly_sip_amount) || 0
  }
  if (['epf', 'ppf', 'nps'].includes(inv.type)) return Number(inv.monthly_sip_amount) || 0
  if (inv.type === 'insurance') {
    const monthly = Number(inv.monthly_sip_amount) || 0
    const premYears = Number(inv.interest_rate) || 0
    const start = inv.start_date ? new Date(inv.start_date).getTime() : null
    if (!start || !monthly || !premYears) return null
    const yrs = (Date.now() - start) / (365.25 * 24 * 60 * 60 * 1000)
    return yrs < premYears ? monthly : 0
  }
  return null
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
function RunningBalanceTable({ plan, investments = [] }) {
  const salary = plan.monthly_salary || 0
  const items = plan.items || []
  const totalCurrentInvestment = getTotalCurrentMonthly(investments)

  let balance = salary
  const rows = []

  for (const cat of ['needs', 'wants', 'investment']) {
    const catItems = items
      .filter(i => i.category === cat)
      .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
    if (!catItems.length) continue

    const def = CATEGORY_DEFS[cat]
    const targetTotal = catItems.reduce((s, i) => s + i.amount, 0)
    const currentTotal = cat === 'investment' ? totalCurrentInvestment : targetTotal
    rows.push({ type: 'header', cat, def, targetTotal, currentTotal })

    for (const item of catItems) {
      balance -= item.amount
      const currentAmt = cat === 'investment'
        ? getItemCurrentMonthly(item.name, investments)
        : item.amount
      rows.push({ type: 'item', item, balance, def, currentAmt, cat })
    }
  }

  const surplus = balance

  return (
    <div>
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        {/* Column headers */}
        <div className="grid grid-cols-12 px-5 py-3 bg-gray-50 border-b border-gray-100 text-xs font-semibold text-gray-500 uppercase tracking-wide">
          <div className="col-span-3">Name</div>
          <div className="col-span-2">Category</div>
          <div className="col-span-1">Bank</div>
          <div className="col-span-2 text-right">Target Amount</div>
          <div className="col-span-2 text-right">Current Amount</div>
          <div className="col-span-2 text-right">Balance After</div>
        </div>

        {/* Salary row */}
        <div className="grid grid-cols-12 px-5 py-3 border-b border-gray-200 bg-gray-50/80">
          <div className="col-span-3 text-sm font-bold text-gray-900">💰 Monthly Salary</div>
          <div className="col-span-2" />
          <div className="col-span-1" />
          <div className="col-span-2 text-right text-sm font-bold text-gray-900">{fmt(salary)}</div>
          <div className="col-span-2 text-right text-sm font-bold text-gray-900">{fmt(salary)}</div>
          <div className="col-span-2 text-right text-sm font-bold text-gray-900">{fmt(salary)}</div>
        </div>

        {rows.map((row, i) => {
          if (row.type === 'header') {
            const isInv = row.cat === 'investment'
            const diff = row.currentTotal - row.targetTotal
            const headerCurrentColor = !isInv ? row.def.color
              : diff > 0 ? '#10B981' : diff < 0 ? '#F59E0B' : row.def.color
            return (
              <div key={`h-${i}`} className="grid grid-cols-12 px-5 py-2.5 border-b border-gray-50"
                style={{ backgroundColor: row.def.bg }}>
                <div className="col-span-3 text-xs font-bold uppercase tracking-wide flex items-center gap-1.5" style={{ color: row.def.color }}>
                  <span>{row.def.icon}</span> {row.def.label}
                </div>
                <div className="col-span-2" />
                <div className="col-span-1" />
                <div className="col-span-2 text-right text-xs font-bold" style={{ color: row.def.color }}>
                  {fmt(row.targetTotal)}
                </div>
                <div className="col-span-2 text-right text-xs font-bold" style={{ color: headerCurrentColor }}>
                  {fmt(row.currentTotal)}
                  {isInv && investments.length > 0 && Math.abs(diff) > 0 && (
                    <span className="ml-1 font-normal opacity-70">
                      ({diff > 0 ? '+' : ''}{fmt(diff)})
                    </span>
                  )}
                </div>
                <div className="col-span-2" />
              </div>
            )
          }

          // Item row
          const isInv = row.cat === 'investment'
          const itemCurrentColor = !isInv ? '#6b7280'
            : row.currentAmt === null ? '#d1d5db'
            : row.currentAmt > row.item.amount ? '#10B981'
            : row.currentAmt < row.item.amount ? '#F59E0B'
            : '#6b7280'

          return (
            <div key={`i-${i}`} className="grid grid-cols-12 px-5 py-3 border-b border-gray-50 hover:bg-gray-50/50 transition-colors">
              <div className="col-span-3 text-sm font-medium text-gray-800 pl-4">{row.item.name}</div>
              <div className="col-span-2">
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold"
                  style={{ backgroundColor: row.def.bg, color: row.def.color }}>
                  {row.def.icon} {row.def.label}
                </span>
              </div>
              <div className="col-span-1 text-xs text-gray-500 truncate">{row.item.bank_or_provider || '—'}</div>
              <div className="col-span-2 text-right text-sm text-gray-600">−{fmt(row.item.amount)}</div>
              <div className="col-span-2 text-right text-sm font-medium" style={{ color: itemCurrentColor }}>
                {isInv
                  ? (row.currentAmt !== null ? fmt(row.currentAmt) : '—')
                  : fmt(row.item.amount)
                }
              </div>
              <div className="col-span-2 text-right text-sm font-semibold"
                style={{ color: row.balance >= 0 ? '#374151' : '#EF4444' }}>
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
      await bridge.createPlan({
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
      await bridge.updatePlanItems({
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

// ── Bank Allocation Dashboard ─────────────────────────────────────────────
const BANK_COLORS = ['#6C63FF','#10B981','#F59E0B','#3B82F6','#EF4444','#8B5CF6','#06B6D4','#F97316','#84CC16','#EC4899']

function BankAllocationDashboard({ plan }) {
  const salary = plan.monthly_salary || 0
  const items = plan.items || []

  const bankMap = new Map()
  for (const item of items) {
    const bank = item.bank_or_provider?.trim() || 'Unassigned'
    if (!bankMap.has(bank)) bankMap.set(bank, [])
    bankMap.get(bank).push(item)
  }

  const banks = [...bankMap.entries()]
    .map(([name, bankItems]) => {
      const total = bankItems.reduce((s, i) => s + (i.amount || 0), 0)
      const byCategory = { needs: 0, wants: 0, investment: 0 }
      for (const item of bankItems) {
        if (byCategory[item.category] !== undefined) byCategory[item.category] += item.amount || 0
      }
      return { name, items: bankItems, total, byCategory }
    })
    .sort((a, b) => b.total - a.total)

  const totalAllocated = banks.reduce((s, b) => s + b.total, 0)
  const unallocated = salary - totalAllocated

  // Stacked bar segments
  const barSegs = banks.map((b, i) => ({
    name: b.name,
    total: b.total,
    color: BANK_COLORS[i % BANK_COLORS.length],
    pct: salary > 0 ? (b.total / salary) * 100 : 0,
  }))

  return (
    <div>
      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        <div className="bg-white rounded-2xl p-4 border border-gray-100 shadow-sm">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Monthly Salary</p>
          <p className="text-xl font-bold text-gray-900">{fmt(salary)}</p>
        </div>
        <div className="bg-white rounded-2xl p-4 border border-gray-100 shadow-sm">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Total Allocated</p>
          <p className="text-xl font-bold text-gray-900">{fmt(totalAllocated)}</p>
          <p className="text-xs text-gray-400 mt-0.5">{salary > 0 ? ((totalAllocated / salary) * 100).toFixed(1) : 0}% of salary</p>
        </div>
        <div className="bg-white rounded-2xl p-4 border border-gray-100 shadow-sm">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Banks / Providers</p>
          <p className="text-xl font-bold text-gray-900">{banks.length}</p>
          <p className="text-xs text-gray-400 mt-0.5">{items.length} line item{items.length !== 1 ? 's' : ''}</p>
        </div>
      </div>

      {/* Stacked salary bar */}
      {salary > 0 && banks.length > 0 && (
        <div className="bg-white rounded-2xl p-5 border border-gray-100 shadow-sm mb-6">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-4">Salary Allocation by Bank</p>
          <div className="h-7 rounded-full overflow-hidden flex mb-4">
            {barSegs.map((seg, i) => (
              <div key={i} style={{ width: `${seg.pct}%`, backgroundColor: seg.color }} title={`${seg.name}: ${fmt(seg.total)}`} />
            ))}
            {unallocated > 0 && (
              <div style={{ flex: 1, backgroundColor: '#E5E7EB' }} title={`Unallocated: ${fmt(unallocated)}`} />
            )}
          </div>
          <div className="flex flex-wrap gap-x-5 gap-y-2">
            {barSegs.map((seg, i) => (
              <div key={i} className="flex items-center gap-1.5">
                <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: seg.color }} />
                <span className="text-xs text-gray-600 font-medium">{seg.name}</span>
                <span className="text-xs text-gray-400">{fmt(seg.total)}</span>
              </div>
            ))}
            {unallocated > 0 && (
              <div className="flex items-center gap-1.5">
                <div className="w-2.5 h-2.5 rounded-full shrink-0 bg-gray-200" />
                <span className="text-xs text-gray-500">Unallocated</span>
                <span className="text-xs text-gray-400">{fmt(unallocated)}</span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Per-bank cards */}
      <div className="space-y-4">
        {banks.map((bank, bi) => {
          const color = BANK_COLORS[bi % BANK_COLORS.length]
          const pct = salary > 0 ? (bank.total / salary) * 100 : 0
          return (
            <div key={bank.name} className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
              {/* Bank header */}
              <div className="flex items-center justify-between px-5 py-4 border-b border-gray-50">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl flex items-center justify-center text-white text-sm font-bold shrink-0"
                    style={{ backgroundColor: color }}>
                    {bank.name === 'Unassigned' ? '?' : bank.name.charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <p className="font-bold text-gray-900">{bank.name}</p>
                    <p className="text-xs text-gray-400">{bank.items.length} item{bank.items.length !== 1 ? 's' : ''}</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-xl font-bold text-gray-900">{fmt(bank.total)}</p>
                  <p className="text-xs text-gray-400">{pct.toFixed(1)}% of salary</p>
                </div>
              </div>

              {/* Progress bar */}
              <div className="px-5 pt-3 pb-1">
                <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                  <div className="h-full rounded-full transition-all" style={{ width: `${Math.min(pct, 100)}%`, backgroundColor: color }} />
                </div>
              </div>

              {/* Category chips */}
              <div className="flex gap-3 px-5 py-3">
                {Object.entries(bank.byCategory).filter(([, v]) => v > 0).map(([cat, amt]) => (
                  <div key={cat} className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold"
                    style={{ backgroundColor: CATEGORY_DEFS[cat].bg, color: CATEGORY_DEFS[cat].color }}>
                    {CATEGORY_DEFS[cat].icon} {CATEGORY_DEFS[cat].label}: {fmt(amt)}
                  </div>
                ))}
              </div>

              {/* Items table */}
              <div className="px-5 pb-4">
                <div className="divide-y divide-gray-50">
                  {bank.items
                    .slice()
                    .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
                    .map((item, ii) => (
                    <div key={ii} className="flex items-center justify-between py-2.5">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="text-sm font-medium text-gray-700 truncate">{item.name}</span>
                        <span className="shrink-0 px-2 py-0.5 rounded-full text-xs font-semibold"
                          style={{ backgroundColor: CATEGORY_DEFS[item.category]?.bg, color: CATEGORY_DEFS[item.category]?.color }}>
                          {CATEGORY_DEFS[item.category]?.icon} {CATEGORY_DEFS[item.category]?.label}
                        </span>
                      </div>
                      <span className="text-sm font-semibold text-gray-800 ml-4 shrink-0">{fmt(item.amount)}</span>
                    </div>
                  ))}
                </div>
                {/* Bank total row */}
                <div className="flex items-center justify-between pt-2.5 border-t border-gray-100 mt-1">
                  <span className="text-xs font-bold text-gray-500 uppercase tracking-wide">Total to {bank.name}</span>
                  <span className="text-sm font-bold" style={{ color }}>{fmt(bank.total)}</span>
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {unallocated > 0 && (
        <div className="mt-4 flex items-center justify-between px-5 py-4 rounded-xl border bg-green-50 border-green-200">
          <div>
            <p className="text-sm font-semibold text-green-700">Remaining / Unallocated</p>
            <p className="text-xs text-green-600 mt-0.5">Not assigned to any bank or provider</p>
          </div>
          <p className="text-2xl font-bold text-green-700">{fmt(unallocated)}</p>
        </div>
      )}
    </div>
  )
}

// ── Allocation Suggestions ────────────────────────────────────────────────
const SUGGESTION_KINDS = {
  critical: { icon: '🔴', border: '#FECACA', bg: '#FEF2F2', color: '#B91C1C' },
  warning:  { icon: '⚠️', border: '#FDE68A', bg: '#FFFBEB', color: '#B45309' },
  tip:      { icon: '💡', border: '#BFDBFE', bg: '#EFF6FF', color: '#1D4ED8' },
  good:     { icon: '✅', border: '#A7F3D0', bg: '#ECFDF5', color: '#047857' },
}
const SUGGESTION_ORDER = { critical: 0, warning: 1, tip: 2, good: 3 }
const LIMIT_80C_MONTHLY = 12500 // ₹1.5L / year

const pct1 = v => `${(Math.round(v * 10) / 10).toFixed(1)}%`
const nameOf = item => (item.name || '').toLowerCase()
const RE_EMERGENCY = /emergency/
const RE_HEALTH    = /health|medical|mediclaim/
const RE_TERM      = /\bterm\b/
const RE_80C       = /\b(ppf|elss|nps|epf|vpf)\b|tax\s*saver/

// Old-regime marginal slab (incl. 4% cess) for an annual gross income
function marginalTaxRate(annual) {
  const base = annual > 1000000 ? 0.30 : annual > 500000 ? 0.20 : annual > 250000 ? 0.05 : 0
  return base * 1.04
}

function analyzePlan(plan, fallbackSalary = 0) {
  const salary = plan.monthly_salary || fallbackSalary || 0
  const items = (plan.items || []).map(i => ({ ...i, amount: Number(i.amount) || 0 }))
  const sumOf = cat => items.filter(i => i.category === cat).reduce((s, i) => s + i.amount, 0)

  const needs = sumOf('needs')
  const wants = sumOf('wants')
  const invest = sumOf('investment')
  const unallocated = salary - needs - wants - invest
  const pctOf = v => salary > 0 ? (v / salary) * 100 : 0
  const needsPct = pctOf(needs)
  const wantsPct = pctOf(wants)
  const investPct = pctOf(invest)
  const unallocatedPct = pctOf(unallocated)

  const investItems = items.filter(i => i.category === 'investment')
  const emergencyItems = investItems.filter(i => RE_EMERGENCY.test(nameOf(i)))
  const emergencyAmt = emergencyItems.reduce((s, i) => s + i.amount, 0)
  const hasHealth = items.some(i => RE_HEALTH.test(nameOf(i)) && /insur|mediclaim|cover|policy/.test(nameOf(i)))
  const hasTerm = items.some(i => RE_TERM.test(nameOf(i)))
  const monthly80C = items.filter(i => RE_80C.test(nameOf(i))).reduce((s, i) => s + i.amount, 0)
  const is80CMaxed = monthly80C >= LIMIT_80C_MONTHLY
  const emergencyTarget = (needs + wants) * 6

  const suggestions = []
  const add = s => suggestions.push(s)

  if (salary > 0) {
    // Rule 1 — 50/30/20
    if (needsPct > 50) add({
      id: 'needs-high', kind: 'warning', title: 'Needs spending is high',
      body: `Your needs (rent, bills, groceries) are ${pct1(needsPct)} of income. Best practice is under 50%. Consider reducing fixed costs where possible.`,
      current: pct1(needsPct), recommended: '≤50%',
    })
    if (wantsPct > 30) add({
      id: 'wants-high', kind: 'warning', title: 'Wants spending above recommended',
      body: `Lifestyle expenses (dining, entertainment, subscriptions) are ${pct1(wantsPct)} of income. Try to keep wants under 30% to accelerate savings.`,
      current: pct1(wantsPct), recommended: '≤30%',
    })
    if (investPct < 20) add({
      id: 'under-invest', kind: 'critical', title: "You're under-investing",
      body: `Only ${pct1(investPct)} of your income goes to investments. Most financial experts recommend at least 20%. Even small increases now compound significantly over 15 years.`,
      current: pct1(investPct), recommended: '≥20%',
    })
    else if (investPct < 30) add({
      id: 'invest-good', kind: 'good', title: 'Good investment rate',
      body: `You're investing ${pct1(investPct)} of income — above the minimum 20% benchmark. Consider pushing toward 30% for early retirement.`,
      current: pct1(investPct), recommended: '≥20%',
    })
    else add({
      id: 'invest-excellent', kind: 'good', title: 'Excellent investment rate!',
      body: `Investing ${pct1(investPct)} of income puts you well ahead of most. At this rate your FIRE goal is very achievable.`,
      current: pct1(investPct), recommended: '≥20%',
    })

    // Rule 2 — Emergency fund (recommended monthly = build the 6-month corpus over a year)
    const emergencyMonthly = Math.ceil(emergencyTarget / 12 / 500) * 500
    if (!emergencyItems.length) add({
      id: 'no-emergency', kind: 'critical', title: 'No Emergency Fund allocated',
      body: `You should have 6 months of expenses (${fmt(emergencyTarget)}) as emergency fund before investing aggressively. Add an Emergency Fund line to your allocation.`,
      recommended: `${fmt(emergencyMonthly)}/month until you hit ${fmt(emergencyTarget)}`,
      apply: emergencyMonthly > 0 ? { label: `Add Emergency Fund (${fmt(emergencyMonthly)}/mo)`, type: 'add-emergency', amount: emergencyMonthly } : null,
    })
    else if (pctOf(emergencyAmt) < 5) add({
      id: 'emergency-low', kind: 'tip', title: 'Emergency Fund allocation seems low',
      body: `Consider allocating more until you reach 6 months of expenses (${fmt(emergencyTarget)}) as a safety net.`,
      current: pct1(pctOf(emergencyAmt)), recommended: '≥5%',
    })
    else add({
      id: 'emergency-ok', kind: 'good', title: 'Emergency Fund is funded',
      body: `${fmt(emergencyAmt)}/month (${pct1(pctOf(emergencyAmt))}) goes to your emergency fund. Target corpus: ${fmt(emergencyTarget)} (6 months of expenses).`,
    })

    // Rule 3 — Insurance
    if (!hasHealth) add({
      id: 'no-health', kind: 'critical', title: 'No Health Insurance in allocation',
      body: "Health insurance is critical — especially with a family. Ensure it's allocated and not missed.",
    })
    else add({ id: 'health-ok', kind: 'good', title: 'Health Insurance covered', body: 'Health insurance premium is part of your monthly allocation.' })
    if (!hasTerm) add({
      id: 'no-term', kind: 'warning', title: 'Term Insurance not visible in allocation',
      body: `A term life cover of 10-15× annual income (${fmt(salary * 12 * 10)}–${fmt(salary * 12 * 15)}) is recommended for family protection.`,
    })
    else add({ id: 'term-ok', kind: 'good', title: 'Term Insurance covered', body: 'Term life premium is part of your monthly allocation.' })

    // Rule 4 — Unallocated
    if (unallocated < 0) add({
      id: 'over-allocated', kind: 'critical', title: `Over-allocated by ${fmt(-unallocated)}`,
      body: `Your allocations exceed your salary by ${fmt(-unallocated)}. Review and reduce some line items.`,
      current: pct1(100 - unallocatedPct), recommended: '≤100%',
    })
    else if (unallocatedPct > 5) add({
      id: 'unallocated', kind: 'tip', title: `${fmt(unallocated)} unallocated each month`,
      body: `You have ${fmt(unallocated)} (${pct1(unallocatedPct)}) not assigned to any category. Consider moving this to investments or emergency fund.`,
      current: pct1(unallocatedPct), recommended: '≤5%',
      apply: { label: `Move ${fmt(unallocated)} to Emergency Fund`, type: 'move-to-emergency', amount: Math.round(unallocated) },
    })

    // Rule 5 — Diversification
    if (investItems.length >= 1 && investItems.length <= 2) add({
      id: 'diversify', kind: 'tip', title: 'Consider diversifying investments',
      body: `You have ${investItems.length} investment allocation${investItems.length > 1 ? 's' : ''}. Consider spreading across:`,
      bullets: ['Equity MF (for growth)', 'PPF/EPF (for safety)', 'Emergency Fund (for liquidity)'],
    })

    // Rule 6 — 80C
    if (!is80CMaxed) {
      const gapAnnual = (LIMIT_80C_MONTHLY - monthly80C) * 12
      const rate = marginalTaxRate(salary * 12)
      add({
        id: '80c', kind: 'tip', title: 'You may not be maximizing 80C benefits',
        body: `You can save tax on up to ₹1.5L/year via 80C (PPF, ELSS, NPS, EPF). Currently allocating ${fmt(monthly80C)}/month = ${fmt(monthly80C * 12)}/year toward 80C instruments.`,
        current: `${fmt(monthly80C)}/mo`, recommended: `${fmt(LIMIT_80C_MONTHLY)}/mo`,
        footnote: `Potential tax saving: ${fmt(gapAnnual * rate)}/year at your ${Math.round(rate / 1.04 * 100)}% slab (old regime, incl. cess)`,
      })
    } else add({
      id: '80c-ok', kind: 'good', title: '80C limit maximized',
      body: `${fmt(monthly80C)}/month (${fmt(monthly80C * 12)}/year) goes to 80C instruments — the full ₹1.5L deduction is used.`,
    })

    // Rule 7 — Lean on wants
    if (salary > 150000 && wantsPct < 10) add({
      id: 'lean-wants', kind: 'tip', title: 'Room for lifestyle spending',
      body: "With your income, allocating some to quality of life (travel, experiences, dining) is healthy. You're currently very lean on wants.",
      current: pct1(wantsPct), recommended: '10–30%',
    })
  }

  suggestions.sort((a, b) => SUGGESTION_ORDER[a.kind] - SUGGESTION_ORDER[b.kind])

  // Health score
  let score = 100
  if (investPct < 10) score -= 25
  if (investPct < 20) score -= 15
  if (needsPct > 60) score -= 15
  if (needsPct > 50) score -= 10
  if (wantsPct > 40) score -= 10
  if (!emergencyItems.length) score -= 10
  if (!hasHealth) score -= 10
  if (unallocated < 0) score -= 10
  if (investPct >= 30) score += 5
  if (is80CMaxed) score += 5
  score = Math.max(0, Math.min(100, score))

  return {
    salary, needsPct, wantsPct, investPct, score, suggestions,
    issues: suggestions.filter(s => s.kind !== 'good').length,
    goods: suggestions.filter(s => s.kind === 'good').length,
  }
}

function scoreLabel(score) {
  if (score >= 90) return { text: 'Excellent 🌟', color: '#059669' }
  if (score >= 75) return { text: 'Good ✅', color: '#10B981' }
  if (score >= 60) return { text: 'Fair 💡', color: '#F59E0B' }
  return { text: 'Needs attention ⚠️', color: '#EF4444' }
}

function SuggestionCard({ s, onApply, applying }) {
  const k = SUGGESTION_KINDS[s.kind]
  return (
    <div className="rounded-xl border p-4" style={{ borderColor: k.border, backgroundColor: k.bg }}>
      <p className="text-sm font-semibold flex items-center gap-2" style={{ color: k.color }}>
        <span>{k.icon}</span> {s.title}
      </p>
      <p className="text-sm text-gray-700 mt-2 leading-relaxed">{s.body}</p>
      {s.bullets && (
        <ul className="mt-1.5 space-y-0.5 text-sm text-gray-700 list-disc pl-5">
          {s.bullets.map(b => <li key={b}>{b}</li>)}
        </ul>
      )}
      {(s.current || s.recommended) && (
        <p className="text-xs mt-3 text-gray-600">
          {s.current && <>Current: <span className="font-bold text-gray-800">{s.current}</span></>}
          {s.current && s.recommended && <span className="mx-2 text-gray-400">→</span>}
          {s.recommended && <>Recommended: <span className="font-bold text-gray-800">{s.recommended}</span></>}
        </p>
      )}
      {s.footnote && <p className="text-xs mt-1.5 font-medium" style={{ color: k.color }}>{s.footnote}</p>}
      {s.apply && (
        <button
          onClick={() => onApply(s.apply)} disabled={applying}
          className="mt-3 px-3 py-1.5 rounded-lg text-xs font-semibold text-white hover:opacity-90 disabled:opacity-50 transition-opacity"
          style={{ backgroundColor: '#6C63FF' }}
        >
          {applying ? 'Applying…' : s.apply.label}
        </button>
      )}
    </div>
  )
}

function BenchmarkComparison({ needsPct, wantsPct, investPct }) {
  const rows = [
    { label: 'Needs',       you: needsPct,  bench: 50, higherIsBetter: false },
    { label: 'Wants',       you: wantsPct,  bench: 30, higherIsBetter: false },
    { label: 'Investments', you: investPct, bench: 20, higherIsBetter: true },
  ]
  const scale = Math.max(100, ...rows.map(r => r.you))
  return (
    <div className="mt-6 pt-5 border-t border-gray-100">
      <p className="text-sm font-semibold text-gray-800 mb-1">How you compare to similar income earners:</p>
      <p className="text-xs text-gray-400 mb-4">Benchmark: 50/30/20 rule — green is better than benchmark, red is worse</p>
      <div className="grid grid-cols-12 text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">
        <div className="col-span-3" />
        <div className="col-span-2 text-right">You</div>
        <div className="col-span-2 text-right">Benchmark</div>
        <div className="col-span-5" />
      </div>
      <div className="space-y-3">
        {rows.map(r => {
          const better = r.higherIsBetter ? r.you >= r.bench : r.you <= r.bench
          const color = better ? '#10B981' : '#EF4444'
          return (
            <div key={r.label} className="grid grid-cols-12 items-center">
              <div className="col-span-3 text-sm font-medium text-gray-700">{r.label}</div>
              <div className="col-span-2 text-right text-sm font-bold" style={{ color }}>{pct1(r.you)}</div>
              <div className="col-span-2 text-right text-sm text-gray-500">{r.bench}%</div>
              <div className="col-span-5 pl-4 space-y-1">
                <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                  <div className="h-full rounded-full" style={{ width: `${(r.you / scale) * 100}%`, backgroundColor: color }} />
                </div>
                <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                  <div className="h-full rounded-full bg-gray-300" style={{ width: `${(r.bench / scale) * 100}%` }} />
                </div>
              </div>
            </div>
          )
        })}
      </div>
      <div className="flex items-center gap-4 mt-3 text-xs text-gray-500 justify-end">
        <span className="flex items-center gap-1.5"><span className="w-3 h-2 rounded-full bg-gray-500" />You (top bar)</span>
        <span className="flex items-center gap-1.5"><span className="w-3 h-2 rounded-full bg-gray-300" />Benchmark</span>
      </div>
    </div>
  )
}

function AllocationSuggestions({ plan, fallbackSalary, onUpdated }) {
  const [open, setOpen] = useState(true)
  const [applying, setApplying] = useState(false)
  const a = analyzePlan(plan, fallbackSalary)
  const label = scoreLabel(a.score)

  async function handleApply(action) {
    const items = (plan.items || [])
      .slice()
      .sort((x, y) => (x.sort_order ?? 0) - (y.sort_order ?? 0))
      .map(i => ({
        name: i.name, amount: Number(i.amount) || 0, category: i.category,
        bank_or_provider: i.bank_or_provider || null,
      }))
    const idx = items.findIndex(i => i.category === 'investment' && RE_EMERGENCY.test(nameOf(i)))
    if (idx >= 0) items[idx].amount += action.amount
    else items.push({ name: 'Emergency Fund', amount: action.amount, category: 'investment', bank_or_provider: null })

    setApplying(true)
    try {
      await bridge.updatePlanItems({
        planId: plan.id,
        items: items.map((i, sort_order) => ({ ...i, sort_order })),
      })
      onUpdated?.()
    } catch (e) {
      console.error(e)
    } finally {
      setApplying(false)
    }
  }

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm mt-6 overflow-hidden">
      <button onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-6 py-4 text-left hover:bg-gray-50/60 transition-colors">
        <div>
          <p className="text-base font-bold text-gray-900">💡 Allocation Suggestions</p>
          <p className="text-xs text-gray-500 mt-0.5">Based on your current allocation and financial best practices</p>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          {!open && a.salary > 0 && (
            <span className="px-2.5 py-1 rounded-full text-xs font-bold" style={{ backgroundColor: `${label.color}1A`, color: label.color }}>
              {a.score}/100
            </span>
          )}
          <span className="text-gray-400 text-sm transition-transform" style={{ transform: open ? 'rotate(180deg)' : 'none' }}>▾</span>
        </div>
      </button>

      {open && (
        <div className="px-6 pb-6">
          {a.salary <= 0 ? (
            <p className="text-sm text-gray-500">Set a monthly salary on this plan to get suggestions.</p>
          ) : (
            <>
              {/* Health score */}
              <div className="rounded-xl border border-gray-100 bg-gray-50/70 p-4 mb-5">
                <p className="text-sm font-semibold text-gray-800">💰 Allocation Health Score</p>
                <div className="flex items-center gap-4 mt-3">
                  <div className="flex-1 h-3 bg-gray-200 rounded-full overflow-hidden">
                    <div className="h-full rounded-full transition-all" style={{ width: `${a.score}%`, backgroundColor: label.color }} />
                  </div>
                  <p className="text-lg font-bold text-gray-900 shrink-0">{a.score}<span className="text-sm text-gray-400 font-medium">/100</span></p>
                  <p className="text-sm font-semibold shrink-0" style={{ color: label.color }}>{label.text}</p>
                </div>
                <p className="text-xs text-gray-500 mt-2">
                  {a.issues} issue{a.issues !== 1 ? 's' : ''} found • {a.goods} thing{a.goods !== 1 ? 's' : ''} doing well
                </p>
              </div>

              {/* Suggestion cards */}
              <div className="space-y-3">
                {a.suggestions.map(s => (
                  <SuggestionCard key={s.id} s={s} onApply={handleApply} applying={applying} />
                ))}
              </div>

              <BenchmarkComparison needsPct={a.needsPct} wantsPct={a.wantsPct} investPct={a.investPct} />
            </>
          )}
        </div>
      )}
    </div>
  )
}

// ── Plan Detail View ──────────────────────────────────────────────────────
function PlanDetailView({ plan, investments, profileSalary, onEdit, onNewPlan, onHistory, onUpdated }) {
  const [tab, setTab] = useState('overview') // 'overview' | 'bank'

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

      {/* Tab switcher */}
      <div className="flex gap-1 p-1 bg-gray-100 rounded-xl mb-6 w-fit">
        {[
          { key: 'overview', label: 'Overview' },
          { key: 'bank', label: 'Bank Allocation' },
        ].map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className="px-4 py-1.5 rounded-lg text-sm font-semibold transition-all"
            style={tab === t.key
              ? { backgroundColor: '#fff', color: '#6C63FF', boxShadow: '0 1px 3px rgba(0,0,0,0.08)' }
              : { color: '#6B7280' }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'overview' && (
        <>
          {/* Donut */}
          <div className="bg-white rounded-2xl p-6 border border-gray-100 shadow-sm mb-5">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-4">Allocation Overview</p>
            <PlanDonut plan={plan} />
          </div>

          {/* Running balance */}
          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Running Balance</p>
            <RunningBalanceTable plan={plan} investments={investments} />
          </div>
        </>
      )}

      {tab === 'bank' && (
        <BankAllocationDashboard plan={plan} />
      )}

      <AllocationSuggestions plan={plan} fallbackSalary={profileSalary} onUpdated={onUpdated} />
    </div>
  )
}

// ── Main Component ────────────────────────────────────────────────────────
export default function SalaryAllocator() {
  const [loading, setLoading]           = useState(true)
  const [activePlan, setActivePlan]     = useState(null)
  const [allPlans, setAllPlans]         = useState([])
  const [investments, setInvestments]   = useState([])
  const [profileSalary, setProfileSalary] = useState(0)
  const [view, setView]                 = useState('detail') // 'detail' | 'history' | 'viewPlan' | 'compare'
  const [showNewWizard, setShowNewWizard] = useState(false)
  const [showEdit, setShowEdit]         = useState(false)
  const [viewingPlan, setViewingPlan]   = useState(null)
  const [comparePlans, setComparePlans] = useState(null) // [plan1, plan2]

  async function loadData() {
    setLoading(true)
    try {
      const [plan, plans, inv, profile] = await Promise.all([
        bridge.getActivePlan(),
        bridge.getAllPlans(),
        bridge.getAllInvestments(),
        bridge.getProfile().catch(() => null),
      ])
      setProfileSalary(Number(profile?.monthly_salary) || 0)
      setActivePlan(plan || null)
      setAllPlans(plans || [])
      setInvestments(inv || [])
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { loadData() }, [])

  async function handleViewPlan(id) {
    const plan = await bridge.getPlanById(id)
    setViewingPlan(plan)
    setView('viewPlan')
  }

  async function handleCompare(ids) {
    const [p1, p2] = await Promise.all([
      bridge.getPlanById(ids[0]),
      bridge.getPlanById(ids[1]),
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
          investments={investments}
          profileSalary={profileSalary}
          onEdit={() => setShowEdit(true)}
          onNewPlan={() => setShowNewWizard(true)}
          onHistory={() => setView('history')}
          onUpdated={loadData}
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
          <RunningBalanceTable plan={viewingPlan} investments={investments} />
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
