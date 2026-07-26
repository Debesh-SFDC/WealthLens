import { useState, useEffect, useMemo } from 'react'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine, ResponsiveContainer, Legend,
} from 'recharts'
import { calculateFIRE, computeBlended } from '../utils/fireCalc'

// ── Formatters ────────────────────────────────────────────────────────────
const INR = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 })
const fmt = v => INR.format(v || 0)
function fmtCr(v) {
  const n = Number(v) || 0
  const abs = Math.abs(n)
  if (abs >= 1e7) return `₹${(n / 1e7).toFixed(2)}Cr`
  if (abs >= 1e5) return `₹${(n / 1e5).toFixed(2)}L`
  if (abs >= 1e3) return `₹${(n / 1e3).toFixed(0)}K`
  return `₹${Math.round(n)}`
}

function computeAge(dob) {
  if (!dob) return null
  const d = new Date(dob)
  const t = new Date()
  let a = t.getFullYear() - d.getFullYear()
  if (t.getMonth() < d.getMonth() || (t.getMonth() === d.getMonth() && t.getDate() < d.getDate())) a--
  return a
}

let rowIdSeq = 0
const makeId = () => `r${++rowIdSeq}`

// ── Investment → FIRE instrument mapping ─────────────────────────────────
const TYPE_RETURN_DEFAULTS = {
  mf_sip: 12, mf_lumpsum: 12, stocks: 12,
  epf: 8.25, ppf: 7.1, nps: 10,
  fd: 6.5, rd: 6.5, gold: 8, insurance: 6,
}
// Types where the user is expected to have set their own rate (interest_rate column) —
// missing one of these means the FIRE calc is silently falling back to a generic default.
const RATE_EDITABLE_TYPES = ['mf_sip', 'mf_lumpsum', 'stocks', 'fd', 'rd']
const RECURRING_TYPES = ['mf_sip', 'epf', 'ppf', 'nps', 'rd']

// Mirrors NetWorth.jsx's effectiveCurrentValue so RD/insurance balances agree app-wide.
function effectiveBalance(inv) {
  const msPerMonth = 30.4375 * 24 * 60 * 60 * 1000
  if (inv.type === 'insurance') {
    const monthly = Number(inv.monthly_sip_amount) || 0
    const premiumYears = Number(inv.interest_rate) || 0
    const maturityAmt = Number(inv.purchase_price) || 0
    const start = inv.start_date ? new Date(inv.start_date).getTime() : null
    const maturityTs = inv.maturity_date ? new Date(inv.maturity_date).getTime() : null
    if (!start || !monthly) return 0
    if (maturityTs && Date.now() >= maturityTs) return maturityAmt
    const n = Math.min(Math.floor((Date.now() - start) / msPerMonth), Math.round(premiumYears * 12))
    return n * monthly
  }
  if (inv.type === 'rd') {
    const monthly = Number(inv.monthly_sip_amount) || 0
    const tenureMonths = Number(inv.units) || 0
    const maturityAmt = Number(inv.purchase_price) || 0
    const start = inv.start_date ? new Date(inv.start_date).getTime() : null
    const maturityTs = inv.maturity_date ? new Date(inv.maturity_date).getTime() : null
    if (!start || !monthly) return 0
    if (maturityTs && Date.now() >= maturityTs) return maturityAmt
    const n = Math.min(Math.floor((Date.now() - start) / msPerMonth), tenureMonths)
    return n * monthly
  }
  return Number(inv.current_value) || 0
}

function buildInstruments(investments) {
  return investments.map(inv => {
    const stored = Number(inv.interest_rate) || 0
    const hasCustomRate = stored > 0
    const annualReturnPct = hasCustomRate ? stored : (TYPE_RETURN_DEFAULTS[inv.type] ?? 8)
    const monthlyContribution = RECURRING_TYPES.includes(inv.type) ? (Number(inv.monthly_sip_amount) || 0) : 0
    return {
      name: inv.name, type: inv.type,
      currentBalance: effectiveBalance(inv),
      monthlyContribution,
      annualReturnPct,
      hasCustomRate,
    }
  })
}

// ── Chart colors (validated categorical set — see dataviz skill) ─────────
const COLORS = {
  corpus: '#2563EB',
  targetNoKids: '#E11D48',
  targetOneKid: '#CA8A04',
  targetTwoKids: '#9333EA',
  fire: '#EA580C',
}

const FIRE_TYPES = [
  { key: 'lean', label: 'Lean', emoji: '🔥', multiple: 25 },
  { key: 'regular', label: 'Regular', emoji: '🔥🔥', multiple: 30 },
  { key: 'fat', label: 'Fat', emoji: '🔥🔥🔥', multiple: 40 },
  { key: 'barista', label: 'Barista', emoji: '☕', multiple: 20 },
]

const inputCls = 'w-full px-2.5 py-1.5 rounded-lg border border-gray-200 text-xs focus:outline-none focus:ring-2 focus:ring-orange-100'

// ── Small building blocks ─────────────────────────────────────────────────
function CollapsibleSection({ title, open, onToggle, children }) {
  return (
    <div className="rounded-xl border border-gray-100 overflow-hidden">
      <button onClick={onToggle} className="w-full flex items-center justify-between px-4 py-3 bg-gray-50 hover:bg-gray-100 transition-colors">
        <span className="text-xs font-bold text-gray-700 uppercase tracking-wide">{title}</span>
        <span className={`text-gray-400 transition-transform duration-200 ${open ? 'rotate-180' : ''}`}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="w-3.5 h-3.5">
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </span>
      </button>
      {open && <div className="p-4 space-y-3">{children}</div>}
    </div>
  )
}

function FieldRow({ label, hint, children }) {
  return (
    <div>
      <label className="block text-xs text-gray-500 mb-1">{label}</label>
      {children}
      {hint && <p className="text-[10px] text-gray-400 mt-1">{hint}</p>}
    </div>
  )
}

function InfoTile({ label, value, hint }) {
  return (
    <div className="p-3 rounded-xl bg-gray-50 border border-gray-100">
      <p className="text-[10px] text-gray-400 uppercase tracking-wide mb-0.5">{label}</p>
      <p className="text-sm font-bold text-gray-800">{value}</p>
      {hint && <p className="text-[10px] text-amber-600 mt-0.5">{hint}</p>}
    </div>
  )
}

function RepeatableTable({ columns, rows, onUpdate, onRemove, onAdd, addLabel, emptyHint }) {
  return (
    <div className="space-y-2">
      {rows.length === 0 && <p className="text-xs text-gray-400 italic">{emptyHint}</p>}
      {rows.map(row => (
        <div key={row._id} className="flex items-center gap-2 flex-wrap p-2.5 rounded-xl bg-gray-50 border border-gray-100">
          {columns.map(col => (
            <div key={col.key} style={{ minWidth: col.width || 90, flex: col.flex ? col.flex : 'none' }}>
              <input
                type={col.type || 'text'}
                value={row[col.key] ?? ''}
                placeholder={col.placeholder}
                onChange={e => onUpdate(row._id, { [col.key]: e.target.value })}
                className={inputCls}
              />
            </div>
          ))}
          <button onClick={() => onRemove(row._id)} className="ml-auto text-gray-400 hover:text-red-500 text-sm font-bold px-1.5 shrink-0">×</button>
        </div>
      ))}
      <button onClick={onAdd} className="text-xs font-semibold text-orange-600 hover:text-orange-700">{addLabel}</button>
    </div>
  )
}

function FireTooltip({ active, payload, label, targetKey }) {
  if (!active || !payload?.length) return null
  const row = payload[0]?.payload
  if (!row) return null
  const target = row[targetKey]
  const gap = row.corpus - target
  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-lg px-3.5 py-3 text-xs space-y-1 min-w-[170px]">
      <p className="font-bold text-gray-800 mb-1">Year: {label}</p>
      <p className="text-gray-500">Your Age: <span className="font-semibold text-gray-800">{row.age}</span></p>
      <p className="text-gray-500">Corpus: <span className="font-semibold" style={{ color: COLORS.corpus }}>{fmtCr(row.corpus)}</span></p>
      <p className="text-gray-500">FI Target: <span className="font-semibold text-gray-800">{fmtCr(target)}</span></p>
      <p className="text-gray-500">Gap: <span className={`font-semibold ${gap >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
        {gap >= 0 ? '+' : ''}{fmtCr(gap)} {gap >= 0 ? '(ahead!)' : '(short)'}
      </span></p>
      <p className="text-gray-500">Kids at this point: <span className="font-semibold text-gray-800">{row.kids}</span></p>
    </div>
  )
}

function heroPalette(yearsToFIRE) {
  if (yearsToFIRE == null) return { bg: '#fef2f2', border: '#fecaca', text: '#b91c1c' }
  if (yearsToFIRE < 15) return { bg: '#ecfdf5', border: '#a7f3d0', text: '#047857' }
  if (yearsToFIRE <= 25) return { bg: '#fffbeb', border: '#fde68a', text: '#b45309' }
  return { bg: '#fef2f2', border: '#fecaca', text: '#b91c1c' }
}

const SCENARIO_PILLS = [
  ['noKids', 'No Kids'],
  ['oneKid', '1 Kid'],
  ['twoKids', '2 Kids'],
]

// ── Results tab ────────────────────────────────────────────────────────────
function FireResults({ results, form, currentYear, selectedScenarioKey, setSelectedScenarioKey, showAllYears, setShowAllYears }) {
  const sel = results.scenarios[selectedScenarioKey]
  const hc = heroPalette(sel.yearsToFIRE)
  const targetKey = selectedScenarioKey === 'noKids' ? 'fiTargetNoKids' : selectedScenarioKey === 'oneKid' ? 'fiTargetOneKid' : 'fiTargetTwoKids'

  const chartEndYear = Math.min(
    currentYear + 40,
    (sel.fireYear ?? currentYear + 35) + 5
  )

  const chartData = useMemo(() => {
    const noKidsRows = results.scenarios.noKids.yearlyData
    const oneKidRows = results.scenarios.oneKid.yearlyData
    const twoKidsRows = results.scenarios.twoKids.yearlyData
    const rows = []
    for (let i = 0; i < noKidsRows.length; i++) {
      if (noKidsRows[i].year > chartEndYear) break
      rows.push({
        year: noKidsRows[i].year,
        age: noKidsRows[i].age,
        corpus: noKidsRows[i].corpus,
        fiTargetNoKids: noKidsRows[i].fiTarget,
        fiTargetOneKid: oneKidRows[i].fiTarget,
        fiTargetTwoKids: twoKidsRows[i].fiTarget,
        kids: sel.yearlyData[i]?.kidsAtThisYear ?? 0,
      })
    }
    return rows
  }, [results, chartEndYear, sel])

  const tableRows = sel.yearlyData.filter(r => r.year <= chartEndYear)
  const visibleRows = showAllYears ? tableRows : tableRows.slice(0, 5)

  const fireTargetAtFire = sel.fireYear != null
    ? sel.yearlyData.find(r => r.year === sel.fireYear)?.fiTarget
    : sel.yearlyData[sel.yearlyData.length - 1]?.fiTarget

  // ── Insight chips ──────────────────────────────────────────────────────
  const insights = useMemo(() => {
    const chips = []
    const inputs = results.lastInputs

    if (sel.fireYear != null) {
      const bumpedStepUp = Number(inputs.sipStepUpPct) + 5
      const altSel = calculateFIRE({ ...inputs, sipStepUpPct: bumpedStepUp }).scenarios[selectedScenarioKey]
      if (altSel.fireYear != null && altSel.fireYear < sel.fireYear) {
        const diff = sel.fireYear - altSel.fireYear
        chips.push(`💡 Increasing your SIP step-up to ${bumpedStepUp}% brings FIRE ${diff} year${diff !== 1 ? 's' : ''} closer (${altSel.fireYear} vs ${sel.fireYear})`)
      }
    }

    const oneKidYear = results.scenarios.oneKid.fireYear
    const twoKidsYear = results.scenarios.twoKids.fireYear
    if (oneKidYear != null && twoKidsYear != null && twoKidsYear !== oneKidYear) {
      const diff = twoKidsYear - oneKidYear
      chips.push(`💡 Having 2 kids instead of 1 ${diff > 0 ? 'delays' : 'brings forward'} FIRE by ${Math.abs(diff)} year${Math.abs(diff) !== 1 ? 's' : ''}`)
    }

    if (sel.fireYear != null) {
      const epfPpf = inputs.instruments.filter(i => ['epf', 'ppf'].includes(i.type))
      if (epfPpf.length > 0) {
        const soloRes = calculateFIRE({ ...inputs, instruments: epfPpf })
        const row = soloRes.scenarios.noKids.yearlyData.find(r => r.year === sel.fireYear)
        if (row) chips.push(`💡 Your EPF + PPF alone will be worth ~${fmtCr(row.corpus)} by your FIRE year (${sel.fireYear})`)
      }
    }

    if (sel.yearsToFIRE != null) {
      const grownSip = results.totalMonthlyContribution * Math.pow(1 + Number(inputs.sipStepUpPct) / 100, sel.yearsToFIRE)
      chips.push(`💡 At FIRE, your SIP will have grown to ${fmt(grownSip)}/month (from step-up)`)
    }

    return chips.slice(0, 4)
  }, [results, sel, selectedScenarioKey])

  return (
    <div className="space-y-4">
      {/* Hero */}
      <div className="rounded-2xl p-6 border" style={{ backgroundColor: hc.bg, borderColor: hc.border }}>
        {sel.fireYear != null ? (
          <>
            <p className="text-2xl font-bold mb-1" style={{ color: hc.text }}>🔥 You can FIRE in {sel.fireYear}</p>
            <p className="text-sm" style={{ color: hc.text }}>
              That's {sel.yearsToFIRE} year{sel.yearsToFIRE !== 1 ? 's' : ''} away · You'll be {sel.ageAtFIRE} years old
            </p>
          </>
        ) : (
          <>
            <p className="text-2xl font-bold mb-1" style={{ color: hc.text }}>🔥 FIRE not reached in the next 40 years</p>
            <p className="text-sm" style={{ color: hc.text }}>Try increasing your SIP, step-up %, or reconsidering your FIRE type.</p>
          </>
        )}
        <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1.5 text-xs" style={{ color: hc.text }}>
          <span>FIRE type: <b className="capitalize">{form.fireType}</b> ({results.fiMultiple}x)</span>
          <span>Target corpus: <b>{fmtCr(fireTargetAtFire)}</b></span>
          <span>Blended return: <b>{results.blendedReturnPct.toFixed(1)}%/year</b></span>
        </div>
      </div>

      {/* Scenario pills */}
      {form.kidsPlanned > 0 && (
        <div className="flex gap-2 flex-wrap">
          {SCENARIO_PILLS.map(([key, label]) => {
            const sc = results.scenarios[key]
            const active = key === selectedScenarioKey
            return (
              <button key={key} onClick={() => setSelectedScenarioKey(key)}
                className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors ${active ? 'bg-orange-500 border-orange-500 text-white' : 'bg-white border-gray-200 text-gray-600 hover:border-orange-300'}`}>
                {label}: {sc.fireYear ?? '—'}
              </button>
            )
          })}
        </div>
      )}

      {/* Chart */}
      <div className="bg-white rounded-2xl border border-gray-100 p-4">
        <ResponsiveContainer width="100%" height={340}>
          <LineChart data={chartData} margin={{ top: 10, right: 20, left: 0, bottom: 5 }}>
            <CartesianGrid stroke="#f3f4f6" vertical={false} />
            <XAxis dataKey="year" tick={{ fontSize: 11, fill: '#9ca3af' }} axisLine={{ stroke: '#e5e7eb' }} tickLine={false} />
            <YAxis tickFormatter={fmtCr} tick={{ fontSize: 11, fill: '#9ca3af' }} axisLine={false} tickLine={false} width={72} />
            <Tooltip content={<FireTooltip targetKey={targetKey} />} />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            <Line type="monotone" dataKey="corpus" name="Projected Corpus" stroke={COLORS.corpus} strokeWidth={2.5} dot={false} />
            <Line type="monotone" dataKey="fiTargetNoKids" name="FI Target — No Kids" stroke={COLORS.targetNoKids} strokeWidth={2} strokeDasharray="6 4" dot={false} />
            {form.kidsPlanned >= 1 && (
              <Line type="monotone" dataKey="fiTargetOneKid" name="FI Target — 1 Kid" stroke={COLORS.targetOneKid} strokeWidth={2} strokeDasharray="3 3" dot={false} />
            )}
            {form.kidsPlanned === 2 && (
              <Line type="monotone" dataKey="fiTargetTwoKids" name="FI Target — 2 Kids" stroke={COLORS.targetTwoKids} strokeWidth={2} strokeDasharray="1 3" dot={false} />
            )}
            {sel.fireYear != null && (
              <ReferenceLine x={sel.fireYear} stroke={COLORS.fire} strokeDasharray="4 4" strokeWidth={1.5}
                label={{ value: 'FIRE! 🔥', position: 'top', fill: COLORS.fire, fontSize: 12, fontWeight: 700 }} />
            )}
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* Year by year table */}
      <div className="bg-white rounded-2xl border border-gray-100 p-4">
        <p className="text-sm font-bold text-gray-800 mb-3">Year by Year</p>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-gray-400 border-b border-gray-100">
                <th className="text-left py-2 pr-2">Year</th>
                <th className="text-right py-2 px-2">Age</th>
                <th className="text-right py-2 px-2">Kids</th>
                <th className="text-right py-2 px-2">Monthly SIP</th>
                <th className="text-right py-2 px-2">Corpus</th>
                <th className="text-right py-2 px-2">FI Target</th>
                <th className="text-right py-2 px-2">Gap</th>
                <th className="text-right py-2 pl-2">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {visibleRows.map(row => {
                const yearsFromNow = row.year - currentYear
                const monthlySip = results.totalMonthlyContribution * Math.pow(1 + Number(results.lastInputs.sipStepUpPct) / 100, yearsFromNow)
                const isFireYear = row.year === sel.fireYear
                const gapPctAbs = row.fiTarget > 0 ? Math.abs(row.gap) / row.fiTarget : 1
                const status = row.hit ? '✅ FIRE Ready' : (gapPctAbs < 0.1 ? '🎯 Almost' : '⏳ Building')
                return (
                  <tr key={row.year} className={isFireYear ? 'bg-emerald-50 font-semibold' : ''}>
                    <td className="py-2 pr-2 text-gray-700">{row.year}</td>
                    <td className="py-2 px-2 text-right text-gray-700">{row.age}</td>
                    <td className="py-2 px-2 text-right text-gray-700">{row.kidsAtThisYear}</td>
                    <td className="py-2 px-2 text-right text-gray-700">{fmt(monthlySip)}</td>
                    <td className="py-2 px-2 text-right text-gray-800">{fmtCr(row.corpus)}</td>
                    <td className="py-2 px-2 text-right text-gray-800">{fmtCr(row.fiTarget)}</td>
                    <td className={`py-2 px-2 text-right ${row.gap >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                      {row.gap >= 0 ? '+' : ''}{fmtCr(row.gap)}
                    </td>
                    <td className="py-2 pl-2 text-right whitespace-nowrap">{status}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        {tableRows.length > 5 && (
          <button onClick={() => setShowAllYears(v => !v)} className="mt-3 text-xs font-semibold text-orange-600 hover:text-orange-700">
            {showAllYears ? 'Show fewer years' : `Show all years (${tableRows.length})`}
          </button>
        )}
      </div>

      {/* Insights */}
      {insights.length > 0 && (
        <div className="bg-white rounded-2xl border border-gray-100 p-4">
          <p className="text-sm font-bold text-gray-800 mb-3">Key Insights</p>
          <div className="space-y-2">
            {insights.map((chip, i) => (
              <div key={i} className="px-3 py-2.5 rounded-xl bg-orange-50 border border-orange-100 text-xs text-orange-800">
                {chip}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ── Main component ─────────────────────────────────────────────────────────
export default function FirePlanner({ investments = [], onNavigate, standalone = false }) {
  const [collapsed, setCollapsed] = useState(true)
  const [tab, setTab] = useState('inputs')
  const [loading, setLoading] = useState(true)
  const [profile, setProfile] = useState(null)
  const [activePlan, setActivePlan] = useState(null)
  const [saving, setSaving] = useState(false)
  const [results, setResults] = useState(null)
  const [selectedScenarioKey, setSelectedScenarioKey] = useState('noKids')
  const [showAllYears, setShowAllYears] = useState(false)

  const [sectionsOpen, setSectionsOpen] = useState({
    profile: true, portfolio: true, expenses: true, kids: true,
    loans: false, futureExpenses: false, bonuses: false,
  })
  const toggleSection = key => setSectionsOpen(s => ({ ...s, [key]: !s[key] }))

  const [form, setForm] = useState({
    fireType: 'regular',
    useCustomMultiple: false,
    customMultiple: '',
    baristaAnnualIncome: '',
    sipStepUpPct: '10',
    expenseNoKids: '', expenseOneKid: '', expenseTwoKids: '',
    kidsPlanned: 0,
    kid1Year: '', kid2Year: '',
    inflationPct: '6',
    loans: [],
    futureExpenses: [],
    lumpSums: [],
  })

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      setLoading(true)
      try {
        const [profileRes, planRes, savedRes] = await Promise.all([
          window.electronAPI.getProfile(),
          window.electronAPI.getActivePlan(),
          window.electronAPI.getFireSettings(),
        ])
        if (cancelled) return
        setProfile(profileRes)
        setActivePlan(planRes)
        if (savedRes) {
          setForm(f => ({
            ...f,
            fireType: savedRes.fire_type || 'regular',
            useCustomMultiple: savedRes.fi_multiple != null,
            customMultiple: savedRes.fi_multiple != null ? String(savedRes.fi_multiple) : '',
            sipStepUpPct: String(savedRes.sip_step_up_pct ?? 10),
            expenseNoKids: savedRes.expense_no_kids ? String(savedRes.expense_no_kids) : '',
            expenseOneKid: savedRes.expense_one_kid ? String(savedRes.expense_one_kid) : '',
            expenseTwoKids: savedRes.expense_two_kids ? String(savedRes.expense_two_kids) : '',
            kidsPlanned: savedRes.kids_planned ?? 0,
            kid1Year: savedRes.kid1_year ? String(savedRes.kid1_year) : '',
            kid2Year: savedRes.kid2_year ? String(savedRes.kid2_year) : '',
            inflationPct: String(savedRes.inflation_pct ?? 6),
            baristaAnnualIncome: savedRes.barista_income ? String(savedRes.barista_income) : '',
            loans: (savedRes.loans_json || []).map(r => ({ ...r, _id: makeId() })),
            futureExpenses: (savedRes.future_expenses_json || []).map(r => ({ ...r, _id: makeId() })),
            lumpSums: (savedRes.lump_sums_json || []).map(r => ({ ...r, _id: makeId() })),
          }))
        }
      } catch (e) {
        console.error(e)
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [])

  const age = profile?.date_of_birth ? computeAge(profile.date_of_birth) : null
  const retirementAge = profile?.retirement_age || 60
  const currentYear = new Date().getFullYear()

  const instrumentsForCalc = useMemo(() => buildInstruments(investments), [investments])
  const missingRateInvestments = useMemo(
    () => investments.filter(inv => RATE_EDITABLE_TYPES.includes(inv.type) && !(Number(inv.interest_rate) > 0)),
    [investments]
  )
  const previewBlended = useMemo(() => computeBlended(instrumentsForCalc).blendedAnnual, [instrumentsForCalc])

  const suggestedAnnualExpense = useMemo(() => {
    if (!activePlan?.items) return 0
    return activePlan.items
      .filter(i => i.category === 'needs' || i.category === 'wants')
      .reduce((s, i) => s + (Number(i.amount) || 0), 0) * 12
  }, [activePlan])

  function updateForm(patch) { setForm(f => ({ ...f, ...patch })) }
  function addRow(listKey, row) { setForm(f => ({ ...f, [listKey]: [...f[listKey], { ...row, _id: makeId() }] })) }
  function updateRow(listKey, id, patch) { setForm(f => ({ ...f, [listKey]: f[listKey].map(r => r._id === id ? { ...r, ...patch } : r) })) }
  function removeRow(listKey, id) { setForm(f => ({ ...f, [listKey]: f[listKey].filter(r => r._id !== id) })) }

  function buildCalcInputs() {
    return {
      currentYear,
      currentAge: age ?? 30,
      retirementAge,
      instruments: instrumentsForCalc,
      sipStepUpPct: Number(form.sipStepUpPct) || 0,
      expenseNoKids: Number(form.expenseNoKids) || 0,
      expenseOneKid: Number(form.expenseOneKid) || 0,
      expenseTwoKids: Number(form.expenseTwoKids) || 0,
      kidsPlanned: Number(form.kidsPlanned) || 0,
      kid1Year: form.kid1Year ? Number(form.kid1Year) : null,
      kid2Year: form.kid2Year ? Number(form.kid2Year) : null,
      inflationPct: Number(form.inflationPct) || 6,
      fiMultiple: 30,
      fireType: form.fireType,
      fireTypeMultiplierOverride: form.useCustomMultiple ? (Number(form.customMultiple) || null) : null,
      baristaAnnualIncome: form.fireType === 'barista' ? (Number(form.baristaAnnualIncome) || 0) : null,
      loans: form.loans.filter(l => l.name).map(l => ({
        name: l.name, annualEmi: Number(l.annualEmi) || 0,
        startYear: Number(l.startYear), endYear: Number(l.endYear),
      })),
      futureExpenses: form.futureExpenses.filter(f2 => f2.name).map(f2 => ({
        name: f2.name, costToday: Number(f2.costToday) || 0, year: Number(f2.year),
        financedPct: Number(f2.financedPct) || 0,
        loanInterestPct: Number(f2.loanInterestPct) || 0,
        loanTenureYears: Number(f2.loanTenureYears) || 0,
      })),
      lumpSums: form.lumpSums.filter(l => l.name).map(l => ({
        name: l.name, amount: Number(l.amount) || 0, year: Number(l.year),
      })),
    }
  }

  async function handleCalculate() {
    const inputs = buildCalcInputs()
    const res = calculateFIRE(inputs)
    setResults({ ...res, lastInputs: inputs })
    setSelectedScenarioKey(res.selectedScenarioKey)
    setTab('results')
    setShowAllYears(false)

    setSaving(true)
    try {
      await window.electronAPI.saveFireSettings({
        fire_type: form.fireType,
        fi_multiple: form.useCustomMultiple ? (Number(form.customMultiple) || null) : null,
        sip_step_up_pct: Number(form.sipStepUpPct) || 10,
        expense_no_kids: Number(form.expenseNoKids) || 0,
        expense_one_kid: Number(form.expenseOneKid) || 0,
        expense_two_kids: Number(form.expenseTwoKids) || 0,
        kids_planned: Number(form.kidsPlanned) || 0,
        kid1_year: form.kid1Year ? Number(form.kid1Year) : null,
        kid2_year: form.kid2Year ? Number(form.kid2Year) : null,
        inflation_pct: Number(form.inflationPct) || 6,
        barista_income: form.fireType === 'barista' ? (Number(form.baristaAnnualIncome) || 0) : null,
        loans_json: inputs.loans,
        future_expenses_json: inputs.futureExpenses,
        lump_sums_json: inputs.lumpSums,
      })
    } catch (e) {
      console.error(e)
    } finally {
      setSaving(false)
    }
  }

  const goToInvestments = () => onNavigate?.('investments')

  const isOpen = standalone || !collapsed

  return (
    <div className={standalone ? '' : 'bg-white rounded-2xl border border-gray-100 shadow-sm mb-4 overflow-hidden'}>
      {standalone ? (
        results?.selectedScenario?.fireYear && (
          <div className="flex items-center gap-3 mb-4">
            <span className="text-xs px-2 py-0.5 rounded-full bg-orange-50 text-orange-600 font-semibold">
              FIRE in {results.selectedScenario.fireYear}
            </span>
          </div>
        )
      ) : (
        <button onClick={() => setCollapsed(v => !v)} className="w-full flex items-center justify-between px-5 py-4 hover:bg-gray-50 transition-colors">
          <div className="flex items-center gap-3">
            <span className="text-base font-bold text-gray-800">🔥 FIRE Planner</span>
            {results?.selectedScenario?.fireYear && (
              <span className="text-xs px-2 py-0.5 rounded-full bg-orange-50 text-orange-600 font-semibold">
                FIRE in {results.selectedScenario.fireYear}
              </span>
            )}
          </div>
          <span className={`text-gray-400 transition-transform duration-200 ${!collapsed ? 'rotate-180' : ''}`}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
              <polyline points="6 9 12 15 18 9" />
            </svg>
          </span>
        </button>
      )}

      {isOpen && (
        <div className={standalone ? '' : 'px-5 pb-5 border-t border-gray-100 pt-4'}>
          {loading ? (
            <div className="space-y-3">
              {[1, 2, 3].map(i => <div key={i} className="h-16 bg-gray-100 rounded-xl animate-pulse" />)}
            </div>
          ) : (
            <>
              <div className="flex gap-1 mb-4 p-1 bg-gray-100 rounded-xl w-fit">
                <button onClick={() => setTab('inputs')}
                  className={`px-4 py-1.5 rounded-lg text-xs font-semibold transition-colors ${tab === 'inputs' ? 'bg-white text-gray-800 shadow-sm' : 'text-gray-500'}`}>
                  Inputs
                </button>
                <button onClick={() => setTab('results')} disabled={!results}
                  className={`px-4 py-1.5 rounded-lg text-xs font-semibold transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${tab === 'results' ? 'bg-white text-gray-800 shadow-sm' : 'text-gray-500'}`}>
                  Results
                </button>
              </div>

              {tab === 'inputs' ? (
                <div className="space-y-3">
                  {/* Section A — Your Profile */}
                  <CollapsibleSection title="Your Profile" open={sectionsOpen.profile} onToggle={() => toggleSection('profile')}>
                    <div className="grid grid-cols-3 gap-3">
                      <InfoTile label="Current Age" value={age != null ? `${age} yrs` : '—'} hint={age == null ? 'Set DOB in Settings' : null} />
                      <InfoTile label="Target Retirement Age" value={`${retirementAge} yrs`} />
                      <InfoTile label="Current Year" value={String(currentYear)} />
                    </div>

                    <div>
                      <p className="text-xs font-semibold text-gray-500 mb-2">FIRE Type</p>
                      <div className="grid grid-cols-4 gap-2">
                        {FIRE_TYPES.map(t => {
                          const active = form.fireType === t.key
                          return (
                            <button key={t.key} onClick={() => updateForm({ fireType: t.key })}
                              className={`p-3 rounded-xl border text-center transition-colors ${active ? 'border-orange-400 bg-orange-50' : 'border-gray-200 hover:border-orange-200'}`}>
                              <p className="text-lg leading-none">{t.emoji}</p>
                              <p className="text-xs font-bold text-gray-800 mt-1.5">{t.label}</p>
                              <p className="text-[10px] text-gray-400">{t.multiple}x</p>
                            </button>
                          )
                        })}
                      </div>
                    </div>

                    {form.fireType === 'barista' && (
                      <FieldRow label="Expected side income (₹/year)">
                        <input type="number" className={inputCls} value={form.baristaAnnualIncome}
                          onChange={e => updateForm({ baristaAnnualIncome: e.target.value })} placeholder="e.g. 300000" />
                      </FieldRow>
                    )}

                    <label className="flex items-center gap-2 text-xs text-gray-600 cursor-pointer">
                      <input type="checkbox" checked={form.useCustomMultiple}
                        onChange={e => updateForm({ useCustomMultiple: e.target.checked })} />
                      Use custom multiple instead
                    </label>
                    {form.useCustomMultiple && (
                      <FieldRow label="Custom FI multiple (× annual expenses)">
                        <input type="number" className={inputCls} value={form.customMultiple}
                          onChange={e => updateForm({ customMultiple: e.target.value })} placeholder="e.g. 33" />
                      </FieldRow>
                    )}
                  </CollapsibleSection>

                  {/* Section B — Portfolio */}
                  <CollapsibleSection title="Portfolio" open={sectionsOpen.portfolio} onToggle={() => toggleSection('portfolio')}>
                    {missingRateInvestments.length > 0 && (
                      <div className="flex items-center justify-between gap-3 px-3 py-2.5 rounded-xl bg-amber-50 border border-amber-200">
                        <p className="text-xs text-amber-800">
                          ⚠️ {missingRateInvestments.length} investment{missingRateInvestments.length !== 1 ? 's have' : ' has'} no return rate set — add {missingRateInvestments.length !== 1 ? 'them' : 'it'} in Investments for accurate FIRE calculation
                        </p>
                        <button onClick={goToInvestments} className="shrink-0 px-3 py-1 rounded-lg bg-amber-600 text-white text-xs font-semibold hover:bg-amber-700">
                          Go to Investments
                        </button>
                      </div>
                    )}

                    <div className="overflow-x-auto">
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="text-gray-400 border-b border-gray-100">
                            <th className="text-left py-1.5">Name</th>
                            <th className="text-right py-1.5">Balance</th>
                            <th className="text-right py-1.5">Monthly SIP</th>
                            <th className="text-right py-1.5">Return %</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-50">
                          {instrumentsForCalc.map((i, idx) => (
                            <tr key={idx}>
                              <td className="py-1.5 text-gray-700">{i.name}</td>
                              <td className="py-1.5 text-right font-medium text-gray-800">{fmtCr(i.currentBalance)}</td>
                              <td className="py-1.5 text-right text-gray-700">{i.monthlyContribution ? fmt(i.monthlyContribution) : '—'}</td>
                              <td className={`py-1.5 text-right font-medium ${i.hasCustomRate ? 'text-gray-700' : 'text-amber-600'}`}>{i.annualReturnPct.toFixed(2)}%</td>
                            </tr>
                          ))}
                          {instrumentsForCalc.length === 0 && (
                            <tr><td colSpan={4} className="py-4 text-center text-gray-400">No investments found</td></tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                    <button onClick={goToInvestments} className="text-xs text-indigo-600 hover:text-indigo-700 underline">Edit in Investments tab</button>

                    <div className="px-4 py-3 rounded-xl bg-indigo-50 border border-indigo-100">
                      <p className="text-sm font-bold text-indigo-700">📊 Your blended return: {previewBlended.toFixed(1)}%/year</p>
                    </div>

                    <FieldRow label="Annual SIP step-up %">
                      <input type="number" className={inputCls} value={form.sipStepUpPct}
                        onChange={e => updateForm({ sipStepUpPct: e.target.value })} placeholder="10" />
                    </FieldRow>
                  </CollapsibleSection>

                  {/* Section C — Living Expenses */}
                  <CollapsibleSection title="Living Expenses (Today's ₹)" open={sectionsOpen.expenses} onToggle={() => toggleSection('expenses')}>
                    <div className="grid grid-cols-3 gap-3">
                      <FieldRow label="No kids (₹/year)">
                        <input type="number" className={inputCls} value={form.expenseNoKids} onChange={e => updateForm({ expenseNoKids: e.target.value })} />
                      </FieldRow>
                      <FieldRow label="With 1 kid (₹/year)">
                        <input type="number" className={inputCls} value={form.expenseOneKid} onChange={e => updateForm({ expenseOneKid: e.target.value })} />
                      </FieldRow>
                      <FieldRow label="With 2 kids (₹/year)">
                        <input type="number" className={inputCls} value={form.expenseTwoKids} onChange={e => updateForm({ expenseTwoKids: e.target.value })} />
                      </FieldRow>
                    </div>
                    {suggestedAnnualExpense > 0 && (
                      <div className="flex items-center justify-between gap-3 px-3 py-2.5 rounded-xl bg-blue-50 border border-blue-100">
                        <p className="text-xs text-blue-800">
                          Based on your salary plan, your current expenses are ~{fmtCr(suggestedAnnualExpense)}/year. Use this?
                        </p>
                        <button onClick={() => updateForm({ expenseNoKids: String(Math.round(suggestedAnnualExpense)) })}
                          className="shrink-0 px-3 py-1 rounded-lg bg-blue-600 text-white text-xs font-semibold hover:bg-blue-700">
                          Yes
                        </button>
                      </div>
                    )}
                  </CollapsibleSection>

                  {/* Section D — Kids Planning */}
                  <CollapsibleSection title="Kids Planning" open={sectionsOpen.kids} onToggle={() => toggleSection('kids')}>
                    <div>
                      <p className="text-xs font-semibold text-gray-500 mb-2">How many kids planned?</p>
                      <div className="flex gap-2">
                        {[0, 1, 2].map(n => (
                          <button key={n} onClick={() => updateForm({ kidsPlanned: n })}
                            className={`px-4 py-2 rounded-xl border text-sm font-bold transition-colors ${form.kidsPlanned === n ? 'border-orange-400 bg-orange-50 text-orange-700' : 'border-gray-200 text-gray-600 hover:border-orange-200'}`}>
                            {n}
                          </button>
                        ))}
                      </div>
                    </div>
                    {form.kidsPlanned >= 1 && (
                      <FieldRow label="Year kid 1 arrives">
                        <input type="number" className={inputCls} value={form.kid1Year} onChange={e => updateForm({ kid1Year: e.target.value })} placeholder={String(currentYear + 1)} />
                      </FieldRow>
                    )}
                    {form.kidsPlanned === 2 && (
                      <FieldRow label="Year kid 2 arrives">
                        <input type="number" className={inputCls} value={form.kid2Year} onChange={e => updateForm({ kid2Year: e.target.value })} placeholder={String(currentYear + 3)} />
                      </FieldRow>
                    )}
                    <FieldRow label="Inflation rate (%)">
                      <input type="number" className={inputCls} value={form.inflationPct} onChange={e => updateForm({ inflationPct: e.target.value })} />
                    </FieldRow>
                  </CollapsibleSection>

                  {/* Section E — Loans & EMIs */}
                  <CollapsibleSection title="Loans & EMIs (optional)" open={sectionsOpen.loans} onToggle={() => toggleSection('loans')}>
                    <RepeatableTable
                      rows={form.loans}
                      emptyHint="No loans added — e.g. home loan, car loan"
                      addLabel="+ Add Loan"
                      onAdd={() => addRow('loans', { name: '', annualEmi: '', startYear: String(currentYear), endYear: String(currentYear + 5) })}
                      onUpdate={(id, patch) => updateRow('loans', id, patch)}
                      onRemove={id => removeRow('loans', id)}
                      columns={[
                        { key: 'name', placeholder: 'Loan name', flex: 2 },
                        { key: 'annualEmi', type: 'number', placeholder: 'Annual EMI ₹', width: 110 },
                        { key: 'startYear', type: 'number', placeholder: 'Start year', width: 90 },
                        { key: 'endYear', type: 'number', placeholder: 'End year', width: 90 },
                      ]}
                    />
                  </CollapsibleSection>

                  {/* Section F — Future Big Expenses */}
                  <CollapsibleSection title="Future Big Expenses (optional)" open={sectionsOpen.futureExpenses} onToggle={() => toggleSection('futureExpenses')}>
                    <div className="space-y-2">
                      {form.futureExpenses.length === 0 && (
                        <p className="text-xs text-gray-400 italic">e.g. Car purchase, ₹8L, 2027, 50% financed</p>
                      )}
                      {form.futureExpenses.map(row => (
                        <div key={row._id} className="p-3 rounded-xl bg-gray-50 border border-gray-100 space-y-2">
                          <div className="flex items-center gap-2 flex-wrap">
                            <input placeholder="Item (e.g. Car purchase)" value={row.name}
                              onChange={e => updateRow('futureExpenses', row._id, { name: e.target.value })}
                              className={`${inputCls} flex-1 min-w-[140px]`} />
                            <input type="number" placeholder="Today's cost ₹" value={row.costToday}
                              onChange={e => updateRow('futureExpenses', row._id, { costToday: e.target.value })}
                              className={`${inputCls} w-32`} />
                            <input type="number" placeholder="Year" value={row.year}
                              onChange={e => updateRow('futureExpenses', row._id, { year: e.target.value })}
                              className={`${inputCls} w-24`} />
                            <input type="number" placeholder="Financed %" value={row.financedPct}
                              onChange={e => updateRow('futureExpenses', row._id, { financedPct: e.target.value })}
                              className={`${inputCls} w-24`} />
                            <button onClick={() => removeRow('futureExpenses', row._id)} className="ml-auto text-gray-400 hover:text-red-500 text-sm font-bold px-1.5 shrink-0">×</button>
                          </div>
                          {Number(row.financedPct) > 0 && (
                            <div className="flex items-center gap-2 pl-1">
                              <span className="text-[11px] text-gray-400 shrink-0">Loan:</span>
                              <input type="number" placeholder="Rate %" value={row.loanInterestPct}
                                onChange={e => updateRow('futureExpenses', row._id, { loanInterestPct: e.target.value })}
                                className={`${inputCls} w-20`} />
                              <input type="number" placeholder="Tenure yrs" value={row.loanTenureYears}
                                onChange={e => updateRow('futureExpenses', row._id, { loanTenureYears: e.target.value })}
                                className={`${inputCls} w-24`} />
                            </div>
                          )}
                        </div>
                      ))}
                      <button
                        onClick={() => addRow('futureExpenses', { name: '', costToday: '', year: String(currentYear + 1), financedPct: '', loanInterestPct: '', loanTenureYears: '' })}
                        className="text-xs font-semibold text-orange-600 hover:text-orange-700">
                        + Add Expense
                      </button>
                    </div>
                  </CollapsibleSection>

                  {/* Section G — Bonus / Lump Sum */}
                  <CollapsibleSection title="Bonus / Lump Sum Injections (optional)" open={sectionsOpen.bonuses} onToggle={() => toggleSection('bonuses')}>
                    <RepeatableTable
                      rows={form.lumpSums}
                      emptyHint="No bonuses added"
                      addLabel="+ Add Bonus"
                      onAdd={() => addRow('lumpSums', { name: '', amount: '', year: String(currentYear + 1) })}
                      onUpdate={(id, patch) => updateRow('lumpSums', id, patch)}
                      onRemove={id => removeRow('lumpSums', id)}
                      columns={[
                        { key: 'name', placeholder: 'Description', flex: 2 },
                        { key: 'amount', type: 'number', placeholder: 'Amount ₹', width: 110 },
                        { key: 'year', type: 'number', placeholder: 'Year', width: 90 },
                      ]}
                    />
                  </CollapsibleSection>

                  <button onClick={handleCalculate} disabled={saving}
                    className="w-full py-3.5 rounded-xl bg-orange-500 hover:bg-orange-600 text-white text-sm font-bold shadow-sm transition-colors disabled:opacity-60">
                    {saving ? 'Saving…' : '🔥 Calculate FIRE'}
                  </button>
                </div>
              ) : (
                results && (
                  <FireResults
                    results={results} form={form} currentYear={currentYear}
                    selectedScenarioKey={selectedScenarioKey} setSelectedScenarioKey={setSelectedScenarioKey}
                    showAllYears={showAllYears} setShowAllYears={setShowAllYears}
                  />
                )
              )}
            </>
          )}
        </div>
      )}
    </div>
  )
}
