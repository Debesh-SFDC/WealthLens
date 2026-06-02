import { useState, useEffect, useCallback } from 'react'

// ── Constants ─────────────────────────────────────────────────────────────
const INR = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 })
const fmt = (v) => INR.format(v || 0)

// Each bucket: key, label, color, description, 50/30/20 default
const BUCKET_DEFS = {
  needs: {
    label: 'Needs',
    color: '#3B82F6',
    bg: '#eff6ff',
    defaultPct: 50,
    description: 'Rent, EMI, insurance, groceries, utilities',
    icon: '🏠',
    categories: [
      { value: 'expenses',  label: 'Expenses / Groceries' },
      { value: 'insurance', label: 'Insurance' },
      { value: 'emergency', label: 'Emergency Fund' },
    ],
  },
  wants: {
    label: 'Wants',
    color: '#8B5CF6',
    bg: '#f5f3ff',
    defaultPct: 30,
    description: 'Dining, subscriptions, lifestyle, travel',
    icon: '🎭',
    categories: [
      { value: 'other', label: 'Lifestyle / Other' },
    ],
  },
  savings: {
    label: 'Savings & Investments',
    color: '#10B981',
    bg: '#ecfdf5',
    defaultPct: 20,
    description: 'MF SIPs, PPF, NPS, FD, gold',
    icon: '📈',
    categories: [
      { value: 'mutual_fund', label: 'Mutual Fund' },
      { value: 'savings',     label: 'PPF / NPS / RD' },
    ],
  },
}

const STEP_LABELS = ['Salary', 'Suggestions', 'Allocate', 'Details']

const BLANK_ITEM = { label: '', category: 'expenses', amount: '', provider: '', bank: '' }

// ── Utility components ────────────────────────────────────────────────────
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

// ── Donut (mini inline chart) ─────────────────────────────────────────────
function DonutMini({ buckets, salary }) {
  const segs = Object.entries(BUCKET_DEFS).map(([k, def]) => ({
    label: def.label, color: def.color,
    pct: buckets[k].percentage,
  }))
  let cum = 0
  const gradient = segs.map(s => {
    const start = cum
    cum += s.pct
    return `${s.color} ${start}% ${cum}%`
  }).join(', ')

  return (
    <div className="flex items-center gap-6">
      <div className="relative shrink-0 w-28 h-28">
        <div className="w-28 h-28 rounded-full" style={{ background: `conic-gradient(${gradient})` }} />
        <div className="absolute inset-5 bg-white rounded-full flex items-center justify-center">
          <span className="text-xs font-bold text-gray-600">{segs.reduce((s, x) => s + x.pct, 0).toFixed(0)}%</span>
        </div>
      </div>
      <div className="space-y-2">
        {segs.map((s, i) => (
          <div key={i} className="flex items-center gap-2 text-sm">
            <div className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: s.color }} />
            <span className="text-gray-600">{s.label}</span>
            <span className="font-semibold text-gray-800 ml-auto pl-4">{s.pct}%</span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Step 1: Salary entry ──────────────────────────────────────────────────
function StepSalary({ salary, setSalary, onNext }) {
  const [input, setInput] = useState(salary > 0 ? String(salary) : '')

  const proceed = () => {
    const val = parseFloat(input)
    if (val > 0) { setSalary(val); onNext() }
  }

  return (
    <div className="max-w-md mx-auto pt-8">
      <div className="text-center mb-8">
        <div className="text-4xl mb-3">💸</div>
        <h3 className="text-xl font-bold text-gray-900 mb-1">What's your monthly take-home?</h3>
        <p className="text-sm text-gray-500">We'll use this to suggest how to split your salary</p>
      </div>

      <div className="bg-white rounded-2xl p-6 border border-gray-100 shadow-sm">
        <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Monthly Salary (₹)</label>
        <div className="relative">
          <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 font-semibold text-lg">₹</span>
          <input
            autoFocus
            type="number"
            className="w-full pl-9 pr-4 py-4 text-2xl font-bold rounded-xl border-2 border-gray-200 focus:outline-none focus:border-accent transition-colors"
            placeholder="0"
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && proceed()}
          />
        </div>
        {parseFloat(input) > 0 && (
          <p className="text-sm text-gray-500 mt-2">{fmt(parseFloat(input))} per month</p>
        )}
      </div>

      <button
        onClick={proceed}
        disabled={!(parseFloat(input) > 0)}
        className="mt-6 w-full py-3 rounded-xl text-white font-semibold text-sm disabled:opacity-40 hover:opacity-90 transition-opacity"
        style={{ backgroundColor: '#6C63FF' }}
      >
        Continue →
      </button>
    </div>
  )
}

// ── Step 2: 50/30/20 suggestions ─────────────────────────────────────────
function StepSuggestions({ salary, buckets, setBuckets, onNext, onBack }) {
  const apply = () => {
    setBuckets(p => {
      const updated = { ...p }
      Object.entries(BUCKET_DEFS).forEach(([k, def]) => {
        updated[k] = { ...updated[k], percentage: def.defaultPct }
      })
      return updated
    })
    onNext()
  }

  return (
    <div className="max-w-xl mx-auto pt-6">
      <div className="text-center mb-6">
        <h3 className="text-xl font-bold text-gray-900 mb-1">Suggested 50/30/20 Split</h3>
        <p className="text-sm text-gray-500">A popular personal finance rule for <span className="font-semibold">{fmt(salary)}/month</span></p>
      </div>

      <div className="space-y-4 mb-8">
        {Object.entries(BUCKET_DEFS).map(([key, def]) => {
          const amount = salary * def.defaultPct / 100
          return (
            <div key={key} className="bg-white rounded-2xl p-5 border border-gray-100 shadow-sm flex items-start gap-4">
              <div className="w-12 h-12 rounded-xl flex items-center justify-center text-2xl shrink-0" style={{ backgroundColor: def.bg }}>
                {def.icon}
              </div>
              <div className="flex-1">
                <div className="flex items-center justify-between mb-1">
                  <span className="font-semibold text-gray-900">{def.label}</span>
                  <div className="text-right">
                    <span className="text-2xl font-bold" style={{ color: def.color }}>{def.defaultPct}%</span>
                    <p className="text-xs text-gray-400">{fmt(amount)}</p>
                  </div>
                </div>
                <p className="text-xs text-gray-500">{def.description}</p>
                <div className="mt-2 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                  <div className="h-full rounded-full" style={{ width: `${def.defaultPct}%`, backgroundColor: def.color }} />
                </div>
              </div>
            </div>
          )
        })}
      </div>

      <div className="flex gap-3">
        <button onClick={onBack} className="px-5 py-2.5 rounded-xl text-sm font-semibold text-gray-600 border border-gray-200 hover:bg-gray-50 transition-colors">
          ← Back
        </button>
        <button onClick={apply}
          className="flex-1 py-2.5 rounded-xl text-white text-sm font-semibold hover:opacity-90 transition-opacity"
          style={{ backgroundColor: '#6C63FF' }}>
          Use this split →
        </button>
      </div>
    </div>
  )
}

// ── Step 3: Tweak sliders ────────────────────────────────────────────────
function StepAllocate({ salary, buckets, setBuckets, onNext, onBack }) {
  const total = Object.values(buckets).reduce((s, b) => s + b.percentage, 0)
  const isValid = Math.abs(total - 100) < 0.5

  const setPercent = (key, raw) => {
    const val = Math.min(100, Math.max(0, Number(raw)))
    setBuckets(p => ({ ...p, [key]: { ...p[key], percentage: val } }))
  }

  return (
    <div className="max-w-xl mx-auto pt-6">
      <div className="text-center mb-6">
        <h3 className="text-xl font-bold text-gray-900 mb-1">Adjust Your Allocation</h3>
        <p className="text-sm text-gray-500">Drag sliders or type percentages — must total 100%</p>
      </div>

      <div className="space-y-5 mb-6">
        {Object.entries(BUCKET_DEFS).map(([key, def]) => {
          const b = buckets[key]
          const amount = salary * b.percentage / 100
          return (
            <div key={key} className="bg-white rounded-2xl p-5 border border-gray-100 shadow-sm">
              <div className="flex items-center gap-3 mb-3">
                <span className="text-xl">{def.icon}</span>
                <div className="flex-1">
                  <p className="font-semibold text-gray-900 text-sm">{def.label}</p>
                  <p className="text-xs text-gray-400">{fmt(amount)}</p>
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min={0} max={100}
                    value={b.percentage}
                    onChange={e => setPercent(key, e.target.value)}
                    className="w-16 text-center px-2 py-1 rounded-lg border border-gray-200 text-sm font-bold focus:outline-none focus:ring-2"
                    style={{ color: def.color }}
                  />
                  <span className="text-sm text-gray-400">%</span>
                </div>
              </div>
              <input
                type="range" min={0} max={100} step={1}
                value={b.percentage}
                onChange={e => setPercent(key, e.target.value)}
                className="w-full h-2 rounded-full appearance-none cursor-pointer"
                style={{ accentColor: def.color }}
              />
            </div>
          )
        })}
      </div>

      {/* Total indicator */}
      <div className={`flex items-center justify-between px-4 py-3 rounded-xl mb-5 ${isValid ? 'bg-green-50' : 'bg-red-50'}`}>
        <span className={`text-sm font-semibold ${isValid ? 'text-green-700' : 'text-red-600'}`}>
          {isValid ? '✓ Allocation adds up to 100%' : `⚠ Total is ${total.toFixed(0)}% — needs to be 100%`}
        </span>
        <span className={`text-lg font-bold ${isValid ? 'text-green-700' : 'text-red-600'}`}>{total.toFixed(0)}%</span>
      </div>

      <DonutMini buckets={buckets} salary={salary} />

      <div className="flex gap-3 mt-6">
        <button onClick={onBack} className="px-5 py-2.5 rounded-xl text-sm font-semibold text-gray-600 border border-gray-200 hover:bg-gray-50 transition-colors">
          ← Back
        </button>
        <button onClick={onNext} disabled={!isValid}
          className="flex-1 py-2.5 rounded-xl text-white text-sm font-semibold disabled:opacity-40 hover:opacity-90 transition-opacity"
          style={{ backgroundColor: '#6C63FF' }}>
          Add Line Items →
        </button>
      </div>
    </div>
  )
}

// ── Step 4: Line items per bucket ─────────────────────────────────────────
function StepDetails({ salary, buckets, setBuckets, onSave, onBack, saving }) {
  const addItem = (bucketKey) => {
    const def = BUCKET_DEFS[bucketKey]
    const defaultCat = def.categories[0].value
    setBuckets(p => ({
      ...p,
      [bucketKey]: {
        ...p[bucketKey],
        items: [...p[bucketKey].items, { ...BLANK_ITEM, category: defaultCat }],
      },
    }))
  }

  const updateItem = (bucketKey, idx, field, val) => {
    setBuckets(p => {
      const items = [...p[bucketKey].items]
      items[idx] = { ...items[idx], [field]: val }
      return { ...p, [bucketKey]: { ...p[bucketKey], items } }
    })
  }

  const removeItem = (bucketKey, idx) => {
    setBuckets(p => {
      const items = p[bucketKey].items.filter((_, i) => i !== idx)
      return { ...p, [bucketKey]: { ...p[bucketKey], items } }
    })
  }

  return (
    <div className="max-w-2xl mx-auto pt-6">
      <div className="text-center mb-6">
        <h3 className="text-xl font-bold text-gray-900 mb-1">Break Down Each Bucket</h3>
        <p className="text-sm text-gray-500">Add specific line items with provider / bank details</p>
      </div>

      <div className="space-y-5 mb-6">
        {Object.entries(BUCKET_DEFS).map(([key, def]) => {
          const b = buckets[key]
          const bucketAmount = salary * b.percentage / 100
          const allocatedAmount = b.items.reduce((s, item) => s + (parseFloat(item.amount) || 0), 0)
          const remaining = bucketAmount - allocatedAmount

          return (
            <div key={key} className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
              {/* Bucket header */}
              <div className="flex items-center justify-between px-5 py-4" style={{ backgroundColor: def.bg }}>
                <div className="flex items-center gap-3">
                  <span className="text-xl">{def.icon}</span>
                  <div>
                    <p className="font-semibold text-gray-900">{def.label}</p>
                    <p className="text-xs text-gray-500">{b.percentage}% · {fmt(bucketAmount)}</p>
                  </div>
                </div>
                <div className="text-right text-xs">
                  <p className={`font-semibold ${remaining >= 0 ? 'text-gray-600' : 'text-red-600'}`}>
                    {remaining >= 0 ? `${fmt(remaining)} unallocated` : `${fmt(-remaining)} over budget`}
                  </p>
                  <div className="mt-1 h-1 w-24 bg-gray-200 rounded-full overflow-hidden ml-auto">
                    <div className="h-full rounded-full" style={{ width: `${Math.min(100, (allocatedAmount / bucketAmount) * 100)}%`, backgroundColor: def.color }} />
                  </div>
                </div>
              </div>

              {/* Line items */}
              <div className="divide-y divide-gray-50">
                {b.items.map((item, idx) => (
                  <div key={idx} className="px-5 py-3.5 grid grid-cols-12 gap-2 items-center">
                    <div className="col-span-4">
                      <input
                        className="w-full px-2.5 py-2 text-sm rounded-lg border border-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-100"
                        placeholder="Label (e.g. HDFC MF SIP)"
                        value={item.label}
                        onChange={e => updateItem(key, idx, 'label', e.target.value)}
                      />
                    </div>
                    <div className="col-span-3">
                      <select
                        className="w-full px-2.5 py-2 text-sm rounded-lg border border-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-100 bg-white"
                        value={item.category}
                        onChange={e => updateItem(key, idx, 'category', e.target.value)}
                      >
                        {def.categories.map(c => (
                          <option key={c.value} value={c.value}>{c.label}</option>
                        ))}
                      </select>
                    </div>
                    <div className="col-span-2">
                      <input
                        type="number"
                        className="w-full px-2.5 py-2 text-sm rounded-lg border border-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-100"
                        placeholder="₹ Amount"
                        value={item.amount}
                        onChange={e => updateItem(key, idx, 'amount', e.target.value)}
                      />
                    </div>
                    <div className="col-span-2">
                      <input
                        className="w-full px-2.5 py-2 text-sm rounded-lg border border-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-100"
                        placeholder="Provider"
                        value={item.provider}
                        onChange={e => updateItem(key, idx, 'provider', e.target.value)}
                      />
                    </div>
                    <div className="col-span-1 flex justify-center">
                      <button onClick={() => removeItem(key, idx)}
                        className="p-1.5 rounded-lg hover:bg-red-50 text-gray-400 hover:text-red-500 transition-colors">
                        <TrashIcon />
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              {/* Add item */}
              <div className="px-5 py-3 border-t border-gray-50">
                <button
                  onClick={() => addItem(key)}
                  className="flex items-center gap-1.5 text-sm font-medium transition-colors"
                  style={{ color: def.color }}
                >
                  <PlusIcon /> Add line item
                </button>
              </div>
            </div>
          )
        })}
      </div>

      <div className="flex gap-3">
        <button onClick={onBack} className="px-5 py-2.5 rounded-xl text-sm font-semibold text-gray-600 border border-gray-200 hover:bg-gray-50 transition-colors">
          ← Back
        </button>
        <button onClick={onSave} disabled={saving}
          className="flex-1 py-2.5 rounded-xl text-white text-sm font-semibold disabled:opacity-50 hover:opacity-90 transition-opacity"
          style={{ backgroundColor: '#6C63FF' }}>
          {saving ? 'Saving…' : '✓ Save Allocation'}
        </button>
      </div>
    </div>
  )
}

// ── Saved view ────────────────────────────────────────────────────────────
function SavedView({ salary, buckets, onEdit }) {
  const totalItems = Object.values(buckets).reduce((s, b) => s + b.items.length, 0)

  let cum = 0
  const segs = Object.entries(BUCKET_DEFS).map(([k, def]) => {
    const pct = buckets[k].percentage
    const start = cum
    cum += pct
    return { ...def, key: k, pct, start, amount: salary * pct / 100, items: buckets[k].items }
  })

  const gradient = segs.map(s => `${s.color} ${s.start}% ${s.start + s.pct}%`).join(', ')

  return (
    <div className="p-8 max-w-2xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Salary Allocator</h2>
          <p className="mt-1 text-sm text-gray-500">{fmt(salary)}/month · {totalItems} line items</p>
        </div>
        <button onClick={onEdit}
          className="px-4 py-2 rounded-xl text-sm font-semibold text-white hover:opacity-90 transition-opacity"
          style={{ backgroundColor: '#6C63FF' }}>
          Edit Allocation
        </button>
      </div>

      {/* Donut + legend */}
      <div className="bg-white rounded-2xl p-6 border border-gray-100 shadow-sm mb-5 flex items-center gap-8">
        <div className="relative shrink-0 w-40 h-40">
          <div className="w-40 h-40 rounded-full" style={{ background: `conic-gradient(${gradient})` }} />
          <div className="absolute inset-7 bg-white rounded-full flex flex-col items-center justify-center">
            <p className="text-xs text-gray-400">Monthly</p>
            <p className="text-sm font-bold text-gray-800">{fmt(salary)}</p>
          </div>
        </div>
        <div className="flex-1 space-y-3">
          {segs.map(s => (
            <div key={s.key}>
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: s.color }} />
                  <span className="text-sm font-medium text-gray-700">{s.icon} {s.label}</span>
                </div>
                <div className="text-right">
                  <span className="text-sm font-bold text-gray-800">{fmt(s.amount)}</span>
                  <span className="text-xs text-gray-400 ml-1">({s.pct}%)</span>
                </div>
              </div>
              <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                <div className="h-full rounded-full" style={{ width: `${s.pct}%`, backgroundColor: s.color }} />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Line items per bucket */}
      <div className="space-y-4">
        {segs.map(s => s.items.length > 0 && (
          <div key={s.key} className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="px-5 py-3.5 border-b border-gray-100 flex items-center gap-2" style={{ backgroundColor: s.bg }}>
              <span>{s.icon}</span>
              <span className="font-semibold text-sm text-gray-800">{s.label}</span>
              <span className="text-xs text-gray-500 ml-1">— {fmt(s.amount)}</span>
            </div>
            <div className="divide-y divide-gray-50">
              {s.items.map((item, i) => (
                <div key={i} className="flex items-center justify-between px-5 py-3">
                  <div>
                    <p className="text-sm font-medium text-gray-800">{item.label || '—'}</p>
                    <p className="text-xs text-gray-400">{item.category?.replace(/_/g, ' ')} · {item.provider || '—'}</p>
                  </div>
                  <p className="text-sm font-semibold text-gray-800">{fmt(parseFloat(item.amount) || 0)}</p>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────
function buildInitialBuckets() {
  return Object.fromEntries(
    Object.entries(BUCKET_DEFS).map(([k, def]) => [k, { percentage: def.defaultPct, items: [] }])
  )
}

function allocationsToBuckets(rows) {
  const buckets = buildInitialBuckets()
  const bucketMap = { expenses: 'needs', insurance: 'needs', emergency: 'needs', other: 'wants', mutual_fund: 'savings', savings: 'savings' }

  // Header rows carry bucket % (stored with bank = '__bucket__')
  for (const r of rows.filter(r => r.bank === '__bucket__')) {
    if (r.label === 'Needs') buckets.needs.percentage = r.percentage
    else if (r.label === 'Wants') buckets.wants.percentage = r.percentage
    else if (r.label === 'Savings') buckets.savings.percentage = r.percentage
  }

  // Line items
  for (const r of rows.filter(r => r.bank !== '__bucket__')) {
    const key = bucketMap[r.category] || 'needs'
    buckets[key].items.push({ label: r.label, category: r.category, amount: String(r.amount || ''), provider: r.provider || '', bank: r.bank || '' })
  }

  return buckets
}

function bucketsToRows(salary, buckets) {
  const rows = []
  // 3 header rows
  for (const [key, def] of Object.entries(BUCKET_DEFS)) {
    rows.push({
      category: def.categories[0].value,
      label: def.label,  // 'Needs', 'Wants', 'Savings'
      percentage: buckets[key].percentage,
      amount: salary * buckets[key].percentage / 100,
      provider: null,
      bank: '__bucket__',
      color: def.color,
    })
  }
  // Line items
  for (const [key, b] of Object.entries(buckets)) {
    for (const item of b.items) {
      if (!item.label && !item.amount) continue
      rows.push({
        category: item.category,
        label: item.label || 'Item',
        percentage: 0,
        amount: parseFloat(item.amount) || 0,
        provider: item.provider || null,
        bank: item.bank || null,
        color: BUCKET_DEFS[key].color,
      })
    }
  }
  return rows
}

export default function SalaryAllocator() {
  const [loading, setLoading] = useState(true)
  const [step, setStep] = useState(1)
  const [salary, setSalary] = useState(0)
  const [buckets, setBuckets] = useState(buildInitialBuckets)
  const [saved, setSaved] = useState(false)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    Promise.all([
      window.electronAPI.getProfile(),
      window.electronAPI.getSalaryAllocations(),
    ]).then(([profile, allocs]) => {
      if (profile?.monthly_salary > 0) setSalary(profile.monthly_salary)
      if (allocs?.length > 0) {
        setBuckets(allocationsToBuckets(allocs))
        setSaved(true)
        setStep(4) // jump to details view
      }
    }).catch(console.error).finally(() => setLoading(false))
  }, [])

  const handleSave = async () => {
    setSaving(true)
    try {
      const rows = bucketsToRows(salary, buckets)
      await window.electronAPI.replaceAllSalaryAllocations({ salary, rows })
      setSaved(true)
      setStep(4) // show saved view
    } catch (e) {
      console.error(e)
    } finally {
      setSaving(false)
    }
  }

  const handleEdit = () => { setSaved(false); setStep(3) }

  if (loading) {
    return <div className="p-8 flex items-center justify-center h-64"><div className="w-6 h-6 border-2 border-accent border-t-transparent rounded-full animate-spin" style={{ borderColor: '#6C63FF', borderTopColor: 'transparent' }} /></div>
  }

  if (saved && step === 4) {
    return <SavedView salary={salary} buckets={buckets} onEdit={handleEdit} />
  }

  return (
    <div className="p-8">
      {/* Step progress bar */}
      <div className="flex items-center gap-2 mb-8 max-w-lg">
        {STEP_LABELS.map((label, i) => {
          const num = i + 1
          const done = step > num
          const active = step === num
          return (
            <div key={label} className="flex items-center gap-2 flex-1 min-w-0">
              <div className="flex items-center gap-2 shrink-0">
                <div
                  className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition-colors"
                  style={{
                    backgroundColor: done ? '#10B981' : active ? '#6C63FF' : '#e5e7eb',
                    color: done || active ? '#fff' : '#9ca3af',
                  }}
                >
                  {done ? '✓' : num}
                </div>
                <span className={`text-xs font-medium hidden sm:block ${active ? 'text-gray-900' : done ? 'text-green-600' : 'text-gray-400'}`}>{label}</span>
              </div>
              {i < STEP_LABELS.length - 1 && (
                <div className="flex-1 h-px mx-2" style={{ backgroundColor: done ? '#10B981' : '#e5e7eb' }} />
              )}
            </div>
          )
        })}
      </div>

      {step === 1 && <StepSalary salary={salary} setSalary={setSalary} onNext={() => setStep(2)} />}
      {step === 2 && <StepSuggestions salary={salary} buckets={buckets} setBuckets={setBuckets} onNext={() => setStep(3)} onBack={() => setStep(1)} />}
      {step === 3 && <StepAllocate salary={salary} buckets={buckets} setBuckets={setBuckets} onNext={() => setStep(4)} onBack={() => setStep(2)} />}
      {step === 4 && !saved && (
        <StepDetails salary={salary} buckets={buckets} setBuckets={setBuckets} onSave={handleSave} onBack={() => setStep(3)} saving={saving} />
      )}
    </div>
  )
}
