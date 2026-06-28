import { useState, useEffect, useCallback, useRef } from 'react'

// ── Utilities ─────────────────────────────────────────────────────────────
const INR = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 })
const fmt = (v) => INR.format(v || 0)
const pct = (v) => `${v >= 0 ? '+' : ''}${v.toFixed(2)}%`

function calcReturn(invested, current) {
  if (!invested || invested <= 0) return { amt: 0, pct: 0 }
  const amt = current - invested
  return { amt, pct: (amt / invested) * 100 }
}

// CAGR / XIRR for 2-point cashflows (lumpsum-style investments)
function calcCAGR(invested, current, startDateStr) {
  if (!invested || invested <= 0 || !startDateStr) return null
  const years = (Date.now() - new Date(startDateStr).getTime()) / (365.25 * 24 * 60 * 60 * 1000)
  if (years < 0.083) return null   // less than ~1 month
  return (Math.pow(current / invested, 1 / years) - 1) * 100
}

// FD compound interest
function calcFDMaturity(principal, ratePct, startDate, maturityDate) {
  if (!principal || !ratePct || !startDate || !maturityDate) return 0
  const years = (new Date(maturityDate) - new Date(startDate)) / (365.25 * 24 * 60 * 60 * 1000)
  return principal * Math.pow(1 + ratePct / 100, years)
}

function fdCurrentValue(principal, ratePct, startDate) {
  if (!principal || !ratePct || !startDate) return principal || 0
  const years = (Date.now() - new Date(startDate).getTime()) / (365.25 * 24 * 60 * 60 * 1000)
  return principal * Math.pow(1 + ratePct / 100, Math.max(0, years))
}

function formatDate(isoStr) {
  if (!isoStr) return '—'
  return new Date(isoStr).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
}

function timeAgo(isoStr) {
  if (!isoStr) return '—'
  const diff = (Date.now() - new Date(isoStr).getTime()) / 1000
  if (diff < 60) return 'just now'
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
  if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`
  return formatDate(isoStr)
}

// Insurance: deposited-so-far until maturity, then switches to maturity amount.
// Fields reused: monthly_sip_amount=monthly premium, interest_rate=premium payment years,
//                purchase_price=maturity amount, start_date, maturity_date
function calcInsuranceDisplayValue(inv) {
  const monthly       = Number(inv.monthly_sip_amount) || 0
  const premiumYears  = Number(inv.interest_rate) || 0
  const maturityAmt   = Number(inv.purchase_price) || 0
  const start         = inv.start_date ? new Date(inv.start_date).getTime() : null
  const maturityTs    = inv.maturity_date ? new Date(inv.maturity_date).getTime() : null

  if (!start || !monthly) return 0
  if (maturityTs && Date.now() >= maturityTs) return maturityAmt

  const msPerMonth        = 30.4375 * 24 * 60 * 60 * 1000
  const monthsElapsed     = Math.floor((Date.now() - start) / msPerMonth)
  const totalPremiumMonths = Math.round(premiumYears * 12)
  const depositedMonths   = Math.min(monthsElapsed, totalPremiumMonths)
  return depositedMonths * monthly
}

// Returns the effective "current value" for any investment type (insurance computed live)
function effectiveCurrentValue(inv) {
  if (inv.type === 'insurance') return calcInsuranceDisplayValue(inv)
  return inv.current_value || 0
}

// ── Type metadata ─────────────────────────────────────────────────────────
const TYPE_META = {
  mf_sip:    { label: 'MF SIP',    color: '#6C63FF', bg: '#f0efff', group: 'mf' },
  mf_lumpsum:{ label: 'MF Lump',   color: '#3B82F6', bg: '#eff6ff', group: 'mf' },
  stocks:    { label: 'Stocks',    color: '#EF4444', bg: '#fef2f2', group: 'stocks' },
  fd:        { label: 'FD',        color: '#8B5CF6', bg: '#f5f3ff', group: 'fd' },
  epf:       { label: 'EPF',       color: '#10B981', bg: '#ecfdf5', group: 'others' },
  ppf:       { label: 'PPF',       color: '#059669', bg: '#ecfdf5', group: 'others' },
  nps:       { label: 'NPS',       color: '#F59E0B', bg: '#fffbeb', group: 'others' },
  gold:      { label: 'Gold',      color: '#D97706', bg: '#fffbeb', group: 'others' },
  insurance: { label: 'Insurance', color: '#0EA5E9', bg: '#f0f9ff', group: 'others' },
}

const TYPE_GROUPS = {
  all:    () => true,
  mf:     t => TYPE_META[t]?.group === 'mf',
  stocks: t => t === 'stocks',
  fd:     t => t === 'fd',
  others: t => TYPE_META[t]?.group === 'others',
}

const CHART_GROUPS = [
  { key: 'mf',        label: 'Mutual Funds',     color: '#6C63FF', types: ['mf_sip', 'mf_lumpsum'] },
  { key: 'stocks',    label: 'Stocks',            color: '#EF4444', types: ['stocks'] },
  { key: 'fd',        label: 'Fixed Deposits',    color: '#8B5CF6', types: ['fd'] },
  { key: 'epf',       label: 'EPF',               color: '#10B981', types: ['epf'] },
  { key: 'ppf',       label: 'PPF',               color: '#059669', types: ['ppf'] },
  { key: 'nps',       label: 'NPS',               color: '#F59E0B', types: ['nps'] },
  { key: 'gold',      label: 'Gold',              color: '#D97706', types: ['gold'] },
  { key: 'insurance', label: 'Insurance',         color: '#0EA5E9', types: ['insurance'] },
]

const FILTER_TABS = [
  { key: 'all',    label: 'All' },
  { key: 'mf',     label: 'Mutual Funds' },
  { key: 'stocks', label: 'Stocks' },
  { key: 'fd',     label: 'Fixed Deposits' },
  { key: 'others', label: 'Others' },
]

// ── Allocation health helpers ─────────────────────────────────────────────
function computeAge(dob) {
  if (!dob) return null
  const d = new Date(dob)
  const t = new Date()
  let a = t.getFullYear() - d.getFullYear()
  if (t.getMonth() < d.getMonth() || (t.getMonth() === d.getMonth() && t.getDate() < d.getDate())) a--
  return a
}

// Zerodha Kite, Groww, Upstox etc. are stock trading platforms — investments
// entered with these as provider should be treated as equity even if type was
// accidentally set to insurance or mf_sip.
const STOCK_BROKERS = ['zerodha', 'kite', 'upstox', 'groww', 'angel', '5paisa', 'dhan', 'iifl', 'mstock', 'paytm money']

function isStockBroker(inv) {
  const p = ((inv.provider || '') + ' ' + (inv.bank_or_amc || '')).toLowerCase()
  return STOCK_BROKERS.some(b => p.includes(b))
}

function isEquityType(inv) {
  if (inv.type === 'stocks') return true
  // Hard-safe: EPF/PPF/FD/NPS are never equity regardless of platform
  if (['epf', 'ppf', 'fd', 'nps'].includes(inv.type)) return false
  // Gold: conservative (safe) by default
  if (inv.type === 'gold') return false
  // Insurance: Kite/Zerodha don't offer insurance products — if provider is a
  // stock broker, the user likely entered their stock portfolio with the wrong type
  if (inv.type === 'insurance') return isStockBroker(inv)
  // mf_sip / mf_lumpsum: check fund name for debt-style keywords
  const n = (inv.name || '').toLowerCase()
  if (n.includes('debt') || n.includes('liquid') || n.includes('overnight') ||
      n.includes('gilt') || n.includes('bond') || n.includes('arbitrage')) return false
  return true // equity MF / default
}

const BLANK_FORM = {
  name: '', type: 'mf_sip',
  provider: '', bank_or_amc: '', account_number: '',
  invested_amount: '', current_value: '',
  monthly_sip_amount: '', sip_frequency: 'monthly',
  start_date: '', maturity_date: '',
  goal_id: '', notes: '',
  units: '', purchase_price: '', scheme_code: '',
  interest_rate: '', ticker_symbol: '', exchange: 'NSE', purity: '24K',
}


// ── Icons ─────────────────────────────────────────────────────────────────
const RefreshIcon = ({ spinning }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"
    className={`w-3.5 h-3.5 ${spinning ? 'animate-spin' : ''}`}>
    <polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/>
    <path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15"/>
  </svg>
)
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
const CloseIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
    <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
  </svg>
)
const SearchIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
    <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
  </svg>
)

// ── Donut chart helpers ───────────────────────────────────────────────────
function polarToCartesian(cx, cy, r, angleDeg) {
  const rad = ((angleDeg - 90) * Math.PI) / 180
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) }
}

function donutPath(cx, cy, outerR, innerR, startAngle, endAngle) {
  const sweep = endAngle - startAngle
  const gap = sweep > 5 ? 1.5 : 0
  const s = startAngle + gap / 2
  const e = endAngle - gap / 2
  if (e <= s) return ''
  const p1 = polarToCartesian(cx, cy, outerR, s)
  const p2 = polarToCartesian(cx, cy, outerR, e)
  const p3 = polarToCartesian(cx, cy, innerR, e)
  const p4 = polarToCartesian(cx, cy, innerR, s)
  const large = e - s > 180 ? 1 : 0
  return `M ${p1.x} ${p1.y} A ${outerR} ${outerR} 0 ${large} 1 ${p2.x} ${p2.y} L ${p3.x} ${p3.y} A ${innerR} ${innerR} 0 ${large} 0 ${p4.x} ${p4.y} Z`
}

function fmtCompact(v) {
  if (v >= 1e7) return `₹${(v / 1e7).toFixed(1)}Cr`
  if (v >= 1e5) return `₹${(v / 1e5).toFixed(1)}L`
  if (v >= 1e3) return `₹${(v / 1e3).toFixed(0)}K`
  return `₹${Math.round(v)}`
}

function AllocationChart({ investments }) {
  const [hovered, setHovered] = useState(null)

  const segments = CHART_GROUPS.map(g => ({
    ...g,
    value: investments
      .filter(inv => g.types.includes(inv.type))
      .reduce((s, inv) => s + effectiveCurrentValue(inv), 0),
  })).filter(g => g.value > 0)

  const total = segments.reduce((s, g) => s + g.value, 0)
  if (total === 0) return null

  let angle = 0
  const arcs = segments.map(seg => {
    const sweep = (seg.value / total) * 360
    const start = angle
    angle += sweep
    return { ...seg, start, end: angle, pct: (seg.value / total) * 100 }
  })

  const cx = 80, cy = 80, outerR = 68, innerR = 44
  const hoveredArc = hovered != null ? arcs.find(a => a.key === hovered) : null

  return (
    <div>
      <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Allocation by Type</p>
      <div className="flex items-center gap-5">

        {/* SVG donut */}
        <div className="shrink-0">
          <svg width="160" height="160" viewBox="0 0 160 160">
            {arcs.map(arc => (
              <path
                key={arc.key}
                d={donutPath(cx, cy, outerR, innerR, arc.start, arc.end)}
                fill={arc.color}
                style={{
                  opacity: hovered === null || hovered === arc.key ? 1 : 0.3,
                  transform: hovered === arc.key ? 'scale(1.05)' : 'scale(1)',
                  transformOrigin: `${cx}px ${cy}px`,
                  transition: 'all 0.15s ease',
                  cursor: 'pointer',
                }}
                onMouseEnter={() => setHovered(arc.key)}
                onMouseLeave={() => setHovered(null)}
              />
            ))}
            {/* Center label */}
            <text x={cx} y={cy - 9} textAnchor="middle"
              style={{ fontSize: '9px', fill: '#9ca3af', fontFamily: 'inherit', fontWeight: 500 }}>
              {hoveredArc ? hoveredArc.label : 'Portfolio'}
            </text>
            <text x={cx} y={cy + 9} textAnchor="middle"
              style={{ fontSize: '14px', fontWeight: 700, fill: '#111827', fontFamily: 'inherit' }}>
              {hoveredArc ? `${hoveredArc.pct.toFixed(1)}%` : fmtCompact(total)}
            </text>
          </svg>
        </div>

        {/* Legend */}
        <div className="flex-1 space-y-2 min-w-0">
          {arcs.map(arc => (
            <div key={arc.key}
              className="flex items-center gap-2 cursor-default"
              style={{ opacity: hovered === null || hovered === arc.key ? 1 : 0.35, transition: 'opacity 0.15s' }}
              onMouseEnter={() => setHovered(arc.key)}
              onMouseLeave={() => setHovered(null)}>
              <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: arc.color }} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-1 mb-0.5">
                  <span className="text-xs font-medium text-gray-700 truncate">{arc.label}</span>
                  <span className="text-xs font-bold text-gray-900 shrink-0">{fmt(arc.value)}</span>
                </div>
                <div className="h-1 rounded-full bg-gray-100 overflow-hidden">
                  <div className="h-full rounded-full"
                    style={{ width: `${arc.pct}%`, backgroundColor: arc.color, opacity: 0.75, transition: 'width 0.3s ease' }} />
                </div>
              </div>
              <span className="text-[10px] text-gray-400 shrink-0 w-9 text-right">{arc.pct.toFixed(1)}%</span>
            </div>
          ))}
        </div>

      </div>
    </div>
  )
}

// ── Summary bar ───────────────────────────────────────────────────────────
function SummaryBar({ investments }) {
  const totalCurrent = investments.reduce((s, i) => s + effectiveCurrentValue(i), 0)

  return (
    <div className="bg-white rounded-2xl p-4 border border-gray-100 shadow-sm mb-4 flex items-center gap-8 flex-wrap">
      <div>
        <p className="text-xs text-gray-400 mb-0.5">Current Value</p>
        <p className="text-xl font-bold text-gray-900">{fmt(totalCurrent)}</p>
      </div>
      <div className="ml-auto text-xs text-gray-400">{investments.length} investment{investments.length !== 1 ? 's' : ''}</div>
    </div>
  )
}

// ── Quick Value Update modal ──────────────────────────────────────────────
function QuickUpdateModal({ inv, onSave, onClose }) {
  const isInsurance  = inv.type === 'insurance'
  const isMF         = ['mf_sip', 'mf_lumpsum'].includes(inv.type)
  const isGold       = inv.type === 'gold'
  const isRetirement = ['epf', 'ppf', 'nps'].includes(inv.type)

  const [value, setValue]       = useState(String(isInsurance ? '' : (inv.current_value || '')))
  const [units, setUnits]       = useState(String(inv.units || ''))
  const [saving, setSaving]     = useState(false)
  const [fetchSt, setFetchSt]   = useState(null)
  const [fetchMsg, setFetchMsg] = useState('')

  const meta = TYPE_META[inv.type] || { label: inv.type, color: '#6b7280', bg: '#f9fafb' }
  const numVal = Number(value) || 0
  const ret = calcReturn(inv.invested_amount, numVal)

  // Insurance computed view
  const insDisplayVal    = isInsurance ? calcInsuranceDisplayValue(inv) : 0
  const insMaturityAmt   = isInsurance ? (Number(inv.purchase_price) || 0) : 0
  const insTotalPremium  = isInsurance ? Math.round((Number(inv.monthly_sip_amount) || 0) * 12 * (Number(inv.interest_rate) || 0)) : 0
  const insIsPastMat     = isInsurance && inv.maturity_date && Date.now() >= new Date(inv.maturity_date).getTime()

  const handleFetchNav = async () => {
    if (!inv.scheme_code) return
    setFetchSt('fetching')
    try {
      const { nav, date } = await window.electronAPI.fetchMFNav(inv.scheme_code)
      const cv = units ? (Number(units) * nav).toFixed(2) : nav.toFixed(2)
      setValue(cv)
      setFetchSt('ok')
      setFetchMsg(`NAV ₹${nav} · ${date}`)
    } catch (e) { setFetchSt('error'); setFetchMsg(e.message) }
  }

  const handleFetchGold = async () => {
    setFetchSt('fetching')
    try {
      const { inrPerGram } = await window.electronAPI.fetchGoldPrice()
      const purityFactor = inv.purity === '22K' ? 22/24 : inv.purity === '18K' ? 18/24 : 1
      const price = Math.round(inrPerGram * purityFactor)
      const cv = units ? (Number(units) * price).toFixed(2) : price.toFixed(2)
      setValue(cv)
      setFetchSt('ok')
      setFetchMsg(`Gold ₹${inrPerGram.toLocaleString('en-IN')}/g`)
    } catch (e) { setFetchSt('error'); setFetchMsg(e.message) }
  }

  const handleSave = async () => {
    if (!numVal) return
    setSaving(true)
    try {
      await onSave(inv.id, numVal, Number(units) || inv.units || 0)
    } finally { setSaving(false) }
  }

  const provider = inv.type === 'stocks'
    ? inv.provider
    : [inv.bank_or_amc || inv.provider, inv.account_number].filter(Boolean).join(' · ')

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-white rounded-t-3xl sm:rounded-3xl shadow-2xl w-full max-w-sm" onClick={e => e.stopPropagation()}>

        {/* Handle bar */}
        <div className="flex justify-center pt-3 pb-1 sm:hidden">
          <div className="w-10 h-1 rounded-full bg-gray-200" />
        </div>

        {/* Header */}
        <div className="flex items-start justify-between px-5 pt-4 pb-3 border-b border-gray-100">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-0.5 flex-wrap">
              <h3 className="font-semibold text-gray-900 text-sm truncate">{inv.name}</h3>
              <span className="shrink-0 px-1.5 py-0.5 rounded-full text-xs font-semibold"
                style={{ backgroundColor: meta.bg, color: meta.color }}>{meta.label}</span>
            </div>
            {provider && <p className="text-xs text-gray-400 truncate">{provider}</p>}
          </div>
          <button onClick={onClose} className="p-1 rounded-xl hover:bg-gray-100 text-gray-400 ml-2 shrink-0"><CloseIcon /></button>
        </div>

        {/* Body */}
        <div className="px-5 py-4 space-y-4">

          {isInsurance ? (
            /* Insurance: auto-tracked, show read-only progress */
            <div className="space-y-3">
              <div className="rounded-2xl p-4 space-y-2" style={{ backgroundColor: meta.bg }}>
                <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: meta.color }}>
                  {insIsPastMat ? 'Policy Matured' : 'Auto-tracked'}
                </p>
                <div className="flex items-end justify-between">
                  <div>
                    <p className="text-xs text-gray-500">{insIsPastMat ? 'Matured Value' : 'Deposited So Far'}</p>
                    <p className="text-2xl font-bold text-gray-900">{fmt(insDisplayVal)}</p>
                  </div>
                  {insMaturityAmt > 0 && (
                    <div className="text-right">
                      <p className="text-xs text-gray-400">At maturity</p>
                      <p className="text-sm font-bold" style={{ color: meta.color }}>{fmt(insMaturityAmt)}</p>
                      <p className="text-xs text-gray-400">{formatDate(inv.maturity_date)}</p>
                    </div>
                  )}
                </div>
              </div>
              {insTotalPremium > 0 && (
                <div className="flex justify-between text-xs text-gray-400 px-1">
                  <span>Total premium to pay</span>
                  <span className="font-medium text-gray-600">{fmt(insTotalPremium)}</span>
                </div>
              )}
              <p className="text-xs text-center text-gray-400">
                This investment auto-calculates — no manual update needed.
              </p>
            </div>
          ) : (
            <>
              {/* Big value input */}
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                  {isRetirement ? 'Current Balance (₹)' : 'Current Value (₹)'}
                </label>
                <div className="relative">
                  <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-lg text-gray-400 font-medium">₹</span>
                  <input
                    type="number"
                    autoFocus
                    className="w-full pl-8 pr-4 py-3 rounded-2xl border-2 border-gray-200 text-xl font-bold text-gray-900 focus:outline-none focus:border-blue-400 transition-colors"
                    placeholder="0"
                    value={value}
                    onChange={e => setValue(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && !saving && handleSave()}
                  />
                </div>
              </div>

              {/* MF: units + fetch NAV */}
              {isMF && (
                <div className="space-y-2">
                  <div>
                    <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Units Held</label>
                    <input type="number"
                      className="w-full px-3 py-2 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-100"
                      placeholder="e.g. 245.678" value={units}
                      onChange={e => setUnits(e.target.value)} />
                  </div>
                  {inv.scheme_code && (
                    <button onClick={handleFetchNav} disabled={fetchSt === 'fetching'}
                      className="flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold text-blue-700 bg-blue-50 hover:bg-blue-100 transition-colors disabled:opacity-50 w-full justify-center">
                      <RefreshIcon spinning={fetchSt === 'fetching'} />
                      Fetch Latest NAV → update value
                    </button>
                  )}
                </div>
              )}

              {/* Gold: fetch price */}
              {isGold && (
                <div className="space-y-2">
                  <div>
                    <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Weight (grams)</label>
                    <input type="number" step="0.001"
                      className="w-full px-3 py-2 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-yellow-100"
                      placeholder="e.g. 10" value={units}
                      onChange={e => setUnits(e.target.value)} />
                  </div>
                  <button onClick={handleFetchGold} disabled={fetchSt === 'fetching'}
                    className="flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold text-yellow-700 bg-yellow-50 hover:bg-yellow-100 transition-colors disabled:opacity-50 w-full justify-center">
                    <RefreshIcon spinning={fetchSt === 'fetching'} />
                    Fetch Today's Gold Price → update value
                  </button>
                </div>
              )}

              {/* Fetch status */}
              {fetchSt && (
                <div className={`flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-medium ${fetchSt === 'ok' ? 'bg-green-50 text-green-700' : fetchSt === 'error' ? 'bg-red-50 text-red-600' : 'bg-blue-50 text-blue-600'}`}>
                  {fetchSt === 'fetching' && <span className="w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin shrink-0" />}
                  {fetchSt === 'ok' && '✓'}{fetchSt === 'error' && '✗'} {fetchMsg}
                </div>
              )}

              {/* Live returns preview */}
              {!isRetirement && inv.invested_amount > 0 && numVal > 0 && (
                <div className="flex items-center justify-between px-3 py-2.5 rounded-xl bg-gray-50">
                  <div className="text-xs text-gray-400">
                    Invested <span className="font-medium text-gray-600">{fmt(inv.invested_amount)}</span>
                  </div>
                  <div className={`text-xs font-semibold ${ret.amt >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                    {ret.amt >= 0 ? '▲' : '▼'} {fmt(Math.abs(ret.amt))}
                    <span className="ml-1 opacity-75">({pct(ret.pct)})</span>
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="flex gap-2.5 px-5 pb-6 pt-1">
          <button onClick={onClose}
            className="flex-1 py-2.5 rounded-2xl text-sm font-semibold text-gray-600 bg-gray-100 hover:bg-gray-200 transition-colors">
            {isInsurance ? 'Close' : 'Cancel'}
          </button>
          {!isInsurance && (
            <button onClick={handleSave} disabled={saving || !numVal}
              className="flex-2 px-6 py-2.5 rounded-2xl text-sm font-semibold text-white transition-opacity disabled:opacity-50 hover:opacity-90"
              style={{ backgroundColor: meta.color || '#6C63FF' }}>
              {saving ? 'Saving…' : 'Update Value'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Investment card ───────────────────────────────────────────────────────
function InsuranceCard({ inv, onEdit, onDelete, onClick }) {
  const meta = TYPE_META.insurance
  const monthly        = Number(inv.monthly_sip_amount) || 0
  const premiumYears   = Number(inv.interest_rate) || 0
  const maturityAmt    = Number(inv.purchase_price) || 0
  const totalPremium   = Math.round(monthly * 12 * premiumYears)
  const depositedSoFar = calcInsuranceDisplayValue(inv)
  const isPastMaturity = inv.maturity_date && Date.now() >= new Date(inv.maturity_date).getTime()
  const isPremiumDone  = inv.start_date && premiumYears > 0 &&
    (Date.now() - new Date(inv.start_date).getTime()) / (365.25 * 24 * 60 * 60 * 1000) >= premiumYears

  const totalPremiumMonths = Math.round(premiumYears * 12)
  const msPerMonth = 30.4375 * 24 * 60 * 60 * 1000
  const monthsPaid = inv.start_date
    ? Math.min(Math.floor((Date.now() - new Date(inv.start_date).getTime()) / msPerMonth), totalPremiumMonths)
    : 0
  const premiumProgress = totalPremiumMonths > 0 ? monthsPaid / totalPremiumMonths : 0
  const status = isPastMaturity ? 'matured' : isPremiumDone ? 'waiting' : 'paying'

  return (
    <div onClick={onClick}
      className="bg-white rounded-xl border border-gray-100 shadow-sm hover:shadow-md hover:border-gray-200 transition-all duration-150 cursor-pointer group relative">
      {/* Actions */}
      <div className="absolute top-2 right-2 flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity z-10"
        onClick={e => e.stopPropagation()}>
        <button onClick={() => onEdit(inv)} className="p-1 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-700 transition-colors"><EditIcon /></button>
        <button onClick={() => onDelete(inv.id)} className="p-1 rounded-lg hover:bg-red-50 text-gray-400 hover:text-red-500 transition-colors"><TrashIcon /></button>
      </div>

      {/* Row 1: name + value */}
      <div className="flex items-start justify-between px-3 pt-2.5 pb-1 pr-16">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 mb-0.5 flex-wrap">
            <h3 className="text-xs font-semibold text-gray-900 truncate">{inv.name}</h3>
            <span className="shrink-0 px-1 py-px rounded-full text-[10px] font-semibold"
              style={{ backgroundColor: meta.bg, color: meta.color }}>{meta.label}</span>
          </div>
          <p className="text-xs text-gray-400 truncate">{inv.bank_or_amc || inv.provider || '—'}</p>
        </div>
        <div className="text-right shrink-0 ml-2">
          <p className="text-sm font-bold text-gray-900">{fmt(depositedSoFar)}</p>
          <p className="text-[10px] text-gray-400">{isPastMaturity ? 'matured' : 'deposited'}</p>
        </div>
      </div>

      {/* Progress bar */}
      {!isPastMaturity && totalPremiumMonths > 0 && (
        <div className="px-3 pb-1">
          <div className="h-1 rounded-full bg-gray-100 overflow-hidden">
            <div className="h-full rounded-full" style={{ width: `${Math.round(premiumProgress * 100)}%`, backgroundColor: meta.color }} />
          </div>
        </div>
      )}

      {/* Row 3: status + maturity */}
      <div className="flex items-center justify-between px-3 pb-2.5 pt-1">
        <div className="flex items-center gap-1">
          {status === 'matured' && <span className="text-[10px] font-semibold text-green-600">✓ Matured</span>}
          {status === 'waiting' && <span className="text-[10px] text-sky-600">Awaiting maturity</span>}
          {status === 'paying' && <span className="text-[10px] text-sky-600">{monthsPaid}/{totalPremiumMonths} mo paid</span>}
        </div>
        <p className="text-[10px] text-gray-400">{fmt(maturityAmt)} · {formatDate(inv.maturity_date)}</p>
      </div>
    </div>
  )
}

function InvestmentCard({ inv, onEdit, onDelete, onRefresh, refreshing, onClick }) {
  if (inv.type === 'insurance') return <InsuranceCard inv={inv} onEdit={onEdit} onDelete={onDelete} onClick={onClick} />

  const meta = TYPE_META[inv.type] || { label: inv.type, color: '#6b7280', bg: '#f9fafb' }
  const ret = calcReturn(inv.invested_amount, inv.current_value)
  const positive = ret.amt >= 0
  const showCAGR = ['mf_lumpsum', 'fd', 'stocks', 'gold', 'epf', 'ppf', 'nps'].includes(inv.type)
  const cagr = showCAGR ? calcCAGR(inv.invested_amount, inv.current_value, inv.start_date) : null
  const canAutoRefresh = ['mf_sip', 'mf_lumpsum', 'gold'].includes(inv.type)
  const isRetirement = ['epf', 'ppf', 'nps'].includes(inv.type)

  return (
    <div onClick={onClick}
      className="bg-white rounded-xl border border-gray-100 shadow-sm hover:shadow-md hover:border-gray-200 transition-all duration-150 cursor-pointer group relative">

      {/* Hover actions */}
      <div className="absolute top-2 right-2 flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity z-10"
        onClick={e => e.stopPropagation()}>
        {canAutoRefresh && (
          <button onClick={() => onRefresh(inv)} disabled={refreshing} title="Refresh price"
            className="p-1 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-blue-500 transition-colors disabled:opacity-50">
            <RefreshIcon spinning={refreshing} />
          </button>
        )}
        <button onClick={() => onEdit(inv)} className="p-1 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-700 transition-colors"><EditIcon /></button>
        <button onClick={() => onDelete(inv.id)} className="p-1 rounded-lg hover:bg-red-50 text-gray-400 hover:text-red-500 transition-colors"><TrashIcon /></button>
      </div>

      {/* Row 1: name + badge · current value */}
      <div className="flex items-start justify-between px-3 pt-2.5 pb-1 pr-16">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 mb-0.5 flex-wrap">
            <h3 className="text-xs font-semibold text-gray-900 truncate">{inv.name}</h3>
            <span className="shrink-0 px-1 py-px rounded-full text-[10px] font-semibold"
              style={{ backgroundColor: meta.bg, color: meta.color }}>{meta.label}</span>
          </div>
          <p className="text-xs text-gray-400 truncate">
            {inv.type === 'stocks'
              ? (inv.provider || '—')
              : ([inv.bank_or_amc || inv.provider, inv.account_number].filter(Boolean).join(' · ') || '—')}
          </p>
        </div>
        <div className="text-right shrink-0 ml-2">
          <p className="text-sm font-bold text-gray-900">{fmt(inv.current_value)}</p>
          <p className="text-[10px] text-gray-400">{isRetirement ? 'balance' : 'current'}</p>
        </div>
      </div>

      {/* Row 2: returns + CAGR (non-retirement only) */}
      {!isRetirement && (
        <div className="flex items-center justify-between px-3 pb-1">
          <span className={`text-[11px] font-semibold ${positive ? 'text-green-600' : 'text-red-500'}`}>
            {positive ? '▲' : '▼'} {fmt(Math.abs(ret.amt))}
            <span className="font-normal opacity-80 ml-1">({pct(ret.pct)})</span>
          </span>
          {cagr !== null && (
            <span className={`text-[11px] font-bold ${cagr >= 0 ? 'text-green-600' : 'text-red-500'}`}>
              {pct(cagr)} <span className="font-normal text-gray-400">CAGR</span>
            </span>
          )}
        </div>
      )}

      {/* Row 3: tags + last updated */}
      <div className="flex items-center justify-between px-3 pb-2.5 pt-0.5">
        <div className="flex items-center gap-1 flex-wrap">
          {inv.goal_title && (
            <span className="px-1 py-px rounded-full text-[10px] font-medium bg-purple-50 text-purple-600">🎯 {inv.goal_title}</span>
          )}
          {inv.type === 'mf_sip' && inv.monthly_sip_amount > 0 && (
            <span className="px-1 py-px rounded-full text-[10px] font-medium bg-blue-50 text-blue-600">
              SIP {fmt(inv.monthly_sip_amount)}/{inv.sip_frequency === 'weekly' ? 'wk' : 'mo'}
            </span>
          )}
          {isRetirement && inv.monthly_sip_amount > 0 && (
            <span className="px-1 py-px rounded-full text-[10px] font-medium bg-green-50 text-green-700">{fmt(inv.monthly_sip_amount)}/mo</span>
          )}
          {isRetirement && inv.interest_rate > 0 && (
            <span className="px-1 py-px rounded-full text-[10px] font-medium bg-emerald-50 text-emerald-700">{Number(inv.interest_rate).toFixed(2)}% p.a.</span>
          )}
        </div>
        <p className="text-[10px] text-gray-400 shrink-0">↻ {timeAgo(inv.last_updated_at)}</p>
      </div>
    </div>
  )
}

// ── Monthly SIP Summary ───────────────────────────────────────────────────
const SIP_ROWS = [
  {
    key: 'mf_sip', label: 'Mutual Fund SIP', color: '#6C63FF', bg: '#f0efff',
    returnType: 'market',
    range: '11–22% p.a.',
    risk: 'Moderate–High Risk',
    riskColor: '#EF4444',
  },
  {
    key: 'epf', label: 'EPF', color: '#10B981', bg: '#ecfdf5',
    returnType: 'fixed',
    range: '~8.25% p.a.',
    risk: 'No Risk',
    riskColor: '#10B981',
  },
  {
    key: 'ppf', label: 'PPF', color: '#059669', bg: '#d1fae5',
    returnType: 'fixed',
    range: '~7.1% p.a.',
    risk: 'No Risk',
    riskColor: '#059669',
  },
  {
    key: 'nps', label: 'NPS', color: '#F59E0B', bg: '#fffbeb',
    returnType: 'market',
    range: '9–12% p.a.',
    risk: 'Low Risk',
    riskColor: '#10B981',
  },
]

function MonthlySIPSummary({ investments }) {
  const [hovered, setHovered] = useState(null)

  const grouped = SIP_ROWS.map(row => {
    const items = investments.filter(i => i.type === row.key && Number(i.monthly_sip_amount) > 0)
    const amount = items.reduce((s, i) => s + (Number(i.monthly_sip_amount) || 0), 0)
    return { ...row, amount, count: items.length }
  }).filter(r => r.amount > 0)

  const total = grouped.reduce((s, r) => s + r.amount, 0)
  if (total === 0) return null

  let angle = 0
  const arcs = grouped.map(r => {
    const sweep = (r.amount / total) * 360
    const start = angle
    angle += sweep
    return { ...r, start, end: angle, pct: (r.amount / total) * 100 }
  })

  const cx = 80, cy = 80, outerR = 68, innerR = 46
  const hovArc = hovered ? arcs.find(a => a.key === hovered) : null

  return (
    <div>
      <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Monthly SIP & Contributions</p>

      <div className="flex items-start gap-5">
        {/* Donut */}
        <div className="shrink-0">
          <svg width="160" height="160" viewBox="0 0 160 160">
            {arcs.map(arc => (
              <path
                key={arc.key}
                d={donutPath(cx, cy, outerR, innerR, arc.start, arc.end)}
                fill={arc.color}
                style={{
                  opacity: hovered === null || hovered === arc.key ? 1 : 0.25,
                  transform: hovered === arc.key ? 'scale(1.06)' : 'scale(1)',
                  transformOrigin: `${cx}px ${cy}px`,
                  transition: 'all 0.15s ease',
                  cursor: 'pointer',
                }}
                onMouseEnter={() => setHovered(arc.key)}
                onMouseLeave={() => setHovered(null)}
              />
            ))}
            <text x={cx} y={cy - 9} textAnchor="middle"
              style={{ fontSize: '9px', fill: '#9ca3af', fontFamily: 'inherit', fontWeight: 500 }}>
              {hovArc ? hovArc.label : 'Total/mo'}
            </text>
            <text x={cx} y={cy + 9} textAnchor="middle"
              style={{ fontSize: '14px', fontWeight: 700, fill: hovArc ? hovArc.color : '#111827', fontFamily: 'inherit' }}>
              {hovArc ? fmtCompact(hovArc.amount) : fmtCompact(total)}
            </text>
            {hovArc && (
              <text x={cx} y={cy + 22} textAnchor="middle"
                style={{ fontSize: '9px', fill: '#6b7280', fontFamily: 'inherit' }}>
                {hovArc.pct.toFixed(1)}%
              </text>
            )}
          </svg>
        </div>

        {/* Legend */}
        <div className="flex-1 min-w-0 space-y-3">
          {arcs.map(arc => (
            <div key={arc.key}
              className="cursor-default"
              style={{ opacity: hovered === null || hovered === arc.key ? 1 : 0.3, transition: 'opacity 0.15s' }}
              onMouseEnter={() => setHovered(arc.key)}
              onMouseLeave={() => setHovered(null)}>
              <div className="flex items-start gap-2">
                <div className="w-2.5 h-2.5 rounded-full shrink-0 mt-0.5" style={{ backgroundColor: arc.color }} />
                <div className="flex-1 min-w-0">
                  {/* Row 1: label + count + amount */}
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <span className="text-xs font-semibold text-gray-800">{arc.label}</span>
                      {arc.count > 0 && (
                        <span className="px-1 py-px rounded-full text-[9px] font-semibold"
                          style={{ backgroundColor: arc.bg, color: arc.color }}>
                          {arc.count}
                        </span>
                      )}
                    </div>
                    <span className="text-xs font-bold text-gray-900 shrink-0">{fmt(arc.amount)}</span>
                  </div>
                  {/* Row 2: tags */}
                  <div className="flex items-center gap-1.5 flex-wrap">
                    {/* Fixed / Market linked tag */}
                    <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full"
                      style={arc.returnType === 'fixed'
                        ? { backgroundColor: '#ecfdf5', color: '#059669' }
                        : { backgroundColor: '#eff6ff', color: '#3B82F6' }}>
                      {arc.returnType === 'fixed' ? '🔒 Fixed Return' : '📈 Market Linked'}
                    </span>
                    {/* Return range */}
                    <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-[#6C63FF]/10 text-[#6C63FF]">
                      {arc.range}
                    </span>
                    {/* Risk tag */}
                    <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full"
                      style={{ backgroundColor: arc.riskColor + '15', color: arc.riskColor }}>
                      {arc.risk}
                    </span>
                  </div>
                  {/* Mini bar */}
                  <div className="h-1 rounded-full bg-gray-100 overflow-hidden mt-1.5">
                    <div className="h-full rounded-full transition-all duration-300"
                      style={{ width: `${arc.pct}%`, backgroundColor: arc.color, opacity: 0.7 }} />
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// ── MF SIP Donut Chart ────────────────────────────────────────────────────
const MF_SIP_COLORS = ['#6C63FF','#3B82F6','#10B981','#F59E0B','#EF4444','#8B5CF6','#06B6D4','#F97316','#84CC16','#EC4899','#059669','#0EA5E9']

function expectedRange(name) {
  const n = (name || '').toLowerCase()
  if (n.includes('small cap'))                                                        return { range: '14–22%', label: 'Small Cap' }
  if (n.includes('mid cap') || n.includes('midcap'))                                 return { range: '13–18%', label: 'Mid Cap' }
  if (n.includes('large & mid') || n.includes('large and mid'))                      return { range: '12–17%', label: 'Large & Mid Cap' }
  if (n.includes('flexi cap') || n.includes('flexicap') || n.includes('multi cap'))  return { range: '12–16%', label: 'Flexi/Multi Cap' }
  if (n.includes('elss') || n.includes('tax saver') || n.includes('tax saving'))     return { range: '12–16%', label: 'ELSS' }
  if (n.includes('balanced advantage') || n.includes('conservative hybrid') || n.includes('aggressive hybrid')) return { range: '9–13%', label: 'Hybrid' }
  if (n.includes('gold'))                                                             return { range: '8–12%', label: 'Gold' }
  if (n.includes('u.s') || n.includes('us ') || n.includes('international') || n.includes('overseas') || n.includes('global') || n.includes('fund of fund') || n.includes('fof')) return { range: '8–15%', label: 'International' }
  if (n.includes('nifty 50') || n.includes('sensex') || n.includes('bse 500') || n.includes('nifty 100')) return { range: '11–14%', label: 'Large Cap Index' }
  if (n.includes('nifty next 50') || n.includes('nifty midcap') || n.includes('midcap 150') || n.includes('midcap 100')) return { range: '13–18%', label: 'Mid Cap Index' }
  if (n.includes('index') || n.includes('nifty'))                                    return { range: '11–15%', label: 'Index' }
  if (n.includes('large cap') || n.includes('bluechip') || n.includes('blue chip'))  return { range: '11–14%', label: 'Large Cap' }
  if (n.includes('debt') || n.includes('liquid') || n.includes('overnight') || n.includes('gilt')) return { range: '6–8%', label: 'Debt' }
  return { range: '11–16%', label: 'Equity' }
}

function MFSIPChart({ investments }) {
  const [hovered, setHovered] = useState(null)

  const sips = investments
    .filter(i => i.type === 'mf_sip' && Number(i.monthly_sip_amount) > 0)
    .map((i, idx) => ({
      name:    i.name || '—',
      monthly: Number(i.monthly_sip_amount) || 0,
      color:   MF_SIP_COLORS[idx % MF_SIP_COLORS.length],
    }))
    .sort((a, b) => b.monthly - a.monthly)

  if (sips.length === 0) return null

  const total = sips.reduce((s, i) => s + i.monthly, 0)

  let angle = 0
  const arcs = sips.map(sip => {
    const sweep = (sip.monthly / total) * 360
    const start = angle
    angle += sweep
    return { ...sip, start, end: angle, pct: (sip.monthly / total) * 100 }
  })

  const cx = 80, cy = 80, outerR = 68, innerR = 46
  const hovArc = hovered != null ? arcs.find(a => a.name === hovered) : null

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">MF SIP — Monthly Breakdown</p>
        <span className="text-xs text-gray-400">{sips.length} fund{sips.length !== 1 ? 's' : ''}</span>
      </div>

      <div className="flex items-start gap-4">
        {/* Donut */}
        <div className="shrink-0">
          <svg width="160" height="160" viewBox="0 0 160 160">
            {arcs.map(arc => (
              <path
                key={arc.name}
                d={donutPath(cx, cy, outerR, innerR, arc.start, arc.end)}
                fill={arc.color}
                style={{
                  opacity: hovered === null || hovered === arc.name ? 1 : 0.25,
                  transform: hovered === arc.name ? 'scale(1.06)' : 'scale(1)',
                  transformOrigin: `${cx}px ${cy}px`,
                  transition: 'all 0.15s ease',
                  cursor: 'pointer',
                }}
                onMouseEnter={() => setHovered(arc.name)}
                onMouseLeave={() => setHovered(null)}
              />
            ))}
            <text x={cx} y={cy - 10} textAnchor="middle"
              style={{ fontSize: '8px', fill: '#9ca3af', fontFamily: 'inherit', fontWeight: 500 }}>
              {hovArc ? 'monthly' : 'Total/mo'}
            </text>
            <text x={cx} y={cy + 7} textAnchor="middle"
              style={{ fontSize: hovArc ? '13px' : '14px', fontWeight: 700, fill: hovArc ? hovArc.color : '#111827', fontFamily: 'inherit' }}>
              {hovArc ? fmt(hovArc.monthly) : fmt(total)}
            </text>
            {hovArc && (
              <text x={cx} y={cy + 20} textAnchor="middle"
                style={{ fontSize: '9px', fill: '#6b7280', fontFamily: 'inherit' }}>
                {hovArc.pct.toFixed(1)}%
              </text>
            )}
          </svg>
        </div>

        {/* Legend */}
        <div className="flex-1 min-w-0 space-y-3 max-h-52 overflow-y-auto pr-1">
          {arcs.map(arc => {
            const exp = expectedRange(arc.name)
            return (
              <div key={arc.name}
                className="cursor-default"
                style={{ opacity: hovered === null || hovered === arc.name ? 1 : 0.3, transition: 'opacity 0.15s' }}
                onMouseEnter={() => setHovered(arc.name)}
                onMouseLeave={() => setHovered(null)}>
                <div className="flex items-start gap-2">
                  <div className="w-2 h-2 rounded-full shrink-0 mt-1" style={{ backgroundColor: arc.color }} />
                  <div className="flex-1 min-w-0">
                    {/* Name + SIP */}
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-semibold text-gray-800 truncate">{arc.name}</span>
                      <span className="text-xs font-bold text-gray-900 shrink-0">{fmt(arc.monthly)}</span>
                    </div>
                    {/* Expected range */}
                    <div className="flex items-center gap-1.5 mt-1">
                      <span className="text-[10px] text-gray-400">Expected:</span>
                      <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-[#6C63FF]/10 text-[#6C63FF]">
                        {exp.range} p.a.
                      </span>
                      <span className="text-[10px] text-gray-500">({exp.label})</span>
                    </div>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

// ── Fund Categories / Risk Buckets ────────────────────────────────────────
const RISK_BUCKETS = [
  {
    key: 'market',
    label: 'Market Linked',
    sublabel: 'Equity / High Risk',
    color: '#6C63FF',
    bg: '#f0efff',
    types: ['mf_sip', 'mf_lumpsum', 'stocks', 'gold'],
    returnRange: '12–22% p.a.',
  },
  {
    key: 'safe',
    label: 'Safe & Fixed',
    sublabel: 'No Risk',
    color: '#10B981',
    bg: '#ecfdf5',
    types: ['epf', 'ppf', 'fd', 'insurance'],
    returnRange: '6–8.25% p.a.',
  },
  {
    key: 'balanced',
    label: 'Balanced Return',
    sublabel: 'Low–Moderate Risk',
    color: '#F59E0B',
    bg: '#fffbeb',
    types: ['nps'],
    returnRange: '9–12% p.a.',
  },
]

function getMonthlyContrib(inv) {
  if (inv.type === 'mf_sip') return Number(inv.monthly_sip_amount) || 0
  if (['epf', 'ppf', 'nps'].includes(inv.type)) return Number(inv.monthly_sip_amount) || 0
  if (inv.type === 'insurance') {
    const monthly = Number(inv.monthly_sip_amount) || 0
    const premYears = Number(inv.interest_rate) || 0
    const start = inv.start_date ? new Date(inv.start_date).getTime() : null
    if (!start || !monthly || !premYears) return 0
    const yrs = (Date.now() - start) / (365.25 * 24 * 60 * 60 * 1000)
    return yrs < premYears ? monthly : 0
  }
  return 0
}

function FundCategoriesView({ investments }) {
  const [nwHov, setNwHov] = useState(null)
  const [moHov, setMoHov] = useState(null)

  const buckets = RISK_BUCKETS.map(b => {
    const items = investments.filter(inv => {
      if (inv.type === 'insurance' && isStockBroker(inv)) {
        // Stock broker provider + insurance type = misclassified stocks → Market Linked
        return b.key === 'market'
      }
      return b.types.includes(inv.type)
    })
    const netWorth = items.reduce((s, inv) => s + effectiveCurrentValue(inv), 0)
    const monthly = items.reduce((s, inv) => s + getMonthlyContrib(inv), 0)
    return { ...b, items, netWorth, monthly }
  })

  const totalNW = buckets.reduce((s, b) => s + b.netWorth, 0)
  const totalMonthly = buckets.reduce((s, b) => s + b.monthly, 0)

  const cx = 80, cy = 80, outerR = 68, innerR = 44

  let ang = 0
  const nwArcs = buckets.filter(b => b.netWorth > 0).map(b => {
    const sweep = totalNW > 0 ? (b.netWorth / totalNW) * 360 : 0
    const s = ang; ang += sweep
    return { ...b, start: s, end: ang, pct: totalNW > 0 ? (b.netWorth / totalNW) * 100 : 0 }
  })

  ang = 0
  const moArcs = buckets.filter(b => b.monthly > 0).map(b => {
    const sweep = totalMonthly > 0 ? (b.monthly / totalMonthly) * 360 : 0
    const s = ang; ang += sweep
    return { ...b, start: s, end: ang, pct: totalMonthly > 0 ? (b.monthly / totalMonthly) * 100 : 0 }
  })

  const nwHovArc = nwHov ? nwArcs.find(a => a.key === nwHov) : null
  const moHovArc = moHov ? moArcs.find(a => a.key === moHov) : null

  return (
    <div>
      <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Portfolio by Risk Category</p>

      <div className="grid grid-cols-2 gap-6 mb-4">
        {/* Net Worth Split */}
        <div>
          <p className="text-[11px] font-semibold text-gray-500 mb-2">Current Net Worth</p>
          <div className="flex items-center gap-3">
            <div className="shrink-0">
              <svg width="160" height="160" viewBox="0 0 160 160">
                {nwArcs.map(arc => (
                  <path key={arc.key}
                    d={donutPath(cx, cy, outerR, innerR, arc.start, arc.end)}
                    fill={arc.color}
                    style={{
                      opacity: nwHov === null || nwHov === arc.key ? 1 : 0.25,
                      transform: nwHov === arc.key ? 'scale(1.06)' : 'scale(1)',
                      transformOrigin: `${cx}px ${cy}px`,
                      transition: 'all 0.15s ease',
                      cursor: 'pointer',
                    }}
                    onMouseEnter={() => setNwHov(arc.key)}
                    onMouseLeave={() => setNwHov(null)}
                  />
                ))}
                <text x={cx} y={cy - 9} textAnchor="middle"
                  style={{ fontSize: '9px', fill: '#9ca3af', fontFamily: 'inherit', fontWeight: 500 }}>
                  {nwHovArc ? nwHovArc.label : 'Net Worth'}
                </text>
                <text x={cx} y={cy + 9} textAnchor="middle"
                  style={{ fontSize: '14px', fontWeight: 700, fill: nwHovArc ? nwHovArc.color : '#111827', fontFamily: 'inherit' }}>
                  {nwHovArc ? fmtCompact(nwHovArc.netWorth) : fmtCompact(totalNW)}
                </text>
                {nwHovArc && (
                  <text x={cx} y={cy + 22} textAnchor="middle"
                    style={{ fontSize: '9px', fill: '#6b7280', fontFamily: 'inherit' }}>
                    {nwHovArc.pct.toFixed(1)}%
                  </text>
                )}
              </svg>
            </div>
            <div className="flex-1 min-w-0 space-y-2">
              {buckets.map(b => (
                <div key={b.key} className="cursor-default"
                  style={{ opacity: nwHov === null || nwHov === b.key ? 1 : 0.3, transition: 'opacity 0.15s' }}
                  onMouseEnter={() => setNwHov(b.key)}
                  onMouseLeave={() => setNwHov(null)}>
                  <div className="flex items-center justify-between gap-1 mb-0.5">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: b.color }} />
                      <span className="text-xs font-medium text-gray-700 truncate">{b.label}</span>
                    </div>
                    <span className="text-xs font-bold text-gray-900 shrink-0">{fmt(b.netWorth)}</span>
                  </div>
                  <div className="h-1 rounded-full bg-gray-100 overflow-hidden ml-3.5">
                    <div className="h-full rounded-full"
                      style={{ width: `${totalNW > 0 ? (b.netWorth / totalNW) * 100 : 0}%`, backgroundColor: b.color, opacity: 0.75, transition: 'width 0.3s ease' }} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Monthly Split */}
        <div>
          <p className="text-[11px] font-semibold text-gray-500 mb-2">Monthly Investment</p>
          <div className="flex items-center gap-3">
            <div className="shrink-0">
              <svg width="160" height="160" viewBox="0 0 160 160">
                {moArcs.map(arc => (
                  <path key={arc.key}
                    d={donutPath(cx, cy, outerR, innerR, arc.start, arc.end)}
                    fill={arc.color}
                    style={{
                      opacity: moHov === null || moHov === arc.key ? 1 : 0.25,
                      transform: moHov === arc.key ? 'scale(1.06)' : 'scale(1)',
                      transformOrigin: `${cx}px ${cy}px`,
                      transition: 'all 0.15s ease',
                      cursor: 'pointer',
                    }}
                    onMouseEnter={() => setMoHov(arc.key)}
                    onMouseLeave={() => setMoHov(null)}
                  />
                ))}
                <text x={cx} y={cy - 9} textAnchor="middle"
                  style={{ fontSize: '9px', fill: '#9ca3af', fontFamily: 'inherit', fontWeight: 500 }}>
                  {moHovArc ? moHovArc.label : 'Monthly'}
                </text>
                <text x={cx} y={cy + 9} textAnchor="middle"
                  style={{ fontSize: '14px', fontWeight: 700, fill: moHovArc ? moHovArc.color : '#111827', fontFamily: 'inherit' }}>
                  {moHovArc ? fmtCompact(moHovArc.monthly) : fmtCompact(totalMonthly)}
                </text>
                {moHovArc && (
                  <text x={cx} y={cy + 22} textAnchor="middle"
                    style={{ fontSize: '9px', fill: '#6b7280', fontFamily: 'inherit' }}>
                    {moHovArc.pct.toFixed(1)}%
                  </text>
                )}
              </svg>
            </div>
            <div className="flex-1 min-w-0 space-y-2">
              {buckets.map(b => (
                <div key={b.key} className="cursor-default"
                  style={{ opacity: moHov === null || moHov === b.key ? 1 : 0.3, transition: 'opacity 0.15s' }}
                  onMouseEnter={() => setMoHov(b.key)}
                  onMouseLeave={() => setMoHov(null)}>
                  <div className="flex items-center justify-between gap-1 mb-0.5">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: b.color }} />
                      <span className="text-xs font-medium text-gray-700 truncate">{b.label}</span>
                    </div>
                    <span className="text-xs font-bold text-gray-900 shrink-0">{fmt(b.monthly)}/mo</span>
                  </div>
                  <div className="h-1 rounded-full bg-gray-100 overflow-hidden ml-3.5">
                    <div className="h-full rounded-full"
                      style={{ width: `${totalMonthly > 0 ? (b.monthly / totalMonthly) * 100 : 0}%`, backgroundColor: b.color, opacity: 0.75, transition: 'width 0.3s ease' }} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Bucket detail rows */}
      <div className="space-y-2">
        {buckets.map(b => (
          <div key={b.key} className="rounded-xl overflow-hidden"
            style={{ border: `1px solid ${b.color}40` }}>
            {/* Bucket header */}
            <div className="flex items-center justify-between px-3 py-2.5" style={{ backgroundColor: b.bg }}>
              <div className="flex items-center gap-2 flex-wrap">
                <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: b.color }} />
                <span className="text-xs font-bold" style={{ color: b.color }}>{b.label}</span>
                <span className="text-[10px] text-gray-500">{b.sublabel}</span>
                <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full"
                  style={{ backgroundColor: b.color + '20', color: b.color }}>{b.returnRange}</span>
              </div>
              <div className="flex items-center gap-4 shrink-0">
                <div className="text-right">
                  <p className="text-[10px] text-gray-400 leading-none">Net Worth</p>
                  <p className="text-xs font-bold text-gray-900">{fmt(b.netWorth)}</p>
                </div>
                {b.monthly > 0 && (
                  <div className="text-right">
                    <p className="text-[10px] text-gray-400 leading-none">Monthly</p>
                    <p className="text-xs font-bold" style={{ color: b.color }}>{fmt(b.monthly)}/mo</p>
                  </div>
                )}
              </div>
            </div>
            {/* Items */}
            {b.items.length > 0 && (
              <div className="bg-white divide-y divide-gray-50">
                {b.items.map(inv => {
                  const meta = TYPE_META[inv.type] || {}
                  const monthly = getMonthlyContrib(inv)
                  return (
                    <div key={inv.id} className="flex items-center justify-between px-4 py-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="shrink-0 px-1.5 py-0.5 rounded-full text-[10px] font-semibold"
                          style={{ backgroundColor: meta.bg, color: meta.color }}>{meta.label}</span>
                        <span className="text-xs font-medium text-gray-700 truncate">{inv.name}</span>
                      </div>
                      <div className="flex items-center gap-4 shrink-0 ml-2">
                        <div className="text-right">
                          <p className="text-xs font-semibold text-gray-800">{fmt(effectiveCurrentValue(inv))}</p>
                          <p className="text-[10px] text-gray-400">value</p>
                        </div>
                        {monthly > 0 && (
                          <div className="text-right">
                            <p className="text-xs font-semibold" style={{ color: b.color }}>{fmt(monthly)}/mo</p>
                            <p className="text-[10px] text-gray-400">monthly</p>
                          </div>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Allocation Health Check ───────────────────────────────────────────────
function AllocationHealthCheck({ investments, profile, goals, onRefresh, onAddSIP }) {
  const [open, setOpen]                 = useState(false)
  const [activeTab, setActiveTab]       = useState('allocation')
  const [doneActions, setDoneActions]   = useState(new Set())
  const [expanded, setExpanded]         = useState({ increase: true, reduce: true, add: true })
  const [timeframe, setTimeframe]       = useState(12) // months: 6, 12, 24, 36

  const age          = computeAge(profile?.date_of_birth)
  const retirementAge = Number(profile?.retirement_age) || 60

  // Load done rebalancing actions whenever card opens
  useEffect(() => {
    if (!open) return
    window.electronAPI.rebalancingGetAll?.().then(rows => {
      setDoneActions(new Set((rows || []).filter(r => r.status === 'done').map(r => r.suggestion_text)))
    }).catch(() => {})
  }, [open])

  const toggleDone = async (text) => {
    const isDone    = doneActions.has(text)
    const newStatus = isDone ? 'pending' : 'done'
    window.electronAPI.rebalancingUpsert?.(text, newStatus).catch(() => {})
    setDoneActions(prev => {
      const next = new Set(prev)
      isDone ? next.delete(text) : next.add(text)
      return next
    })
  }

  if (!age) {
    return (
      <div className="bg-gradient-to-r from-[#f0efff] to-[#eff6ff] rounded-2xl border border-[#6C63FF]/20 p-4 mb-4 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl flex items-center justify-center text-lg shrink-0" style={{ backgroundColor: '#e8e6ff' }}>📊</div>
          <div>
            <p className="text-sm font-bold text-gray-900">Allocation Health Check</p>
            <p className="text-xs text-gray-500 mt-0.5">Add your Date of Birth in Settings to get personalised allocation guidance</p>
          </div>
        </div>
        <span className="text-[11px] font-semibold text-[#6C63FF] px-3 py-1.5 bg-white rounded-xl border border-[#6C63FF]/20 shrink-0">Settings → Profile</span>
      </div>
    )
  }

  // ── Core calculations ──────────────────────────────────────────────────
  const idealEquityPct = Math.max(20, Math.min(90, 110 - age))
  const idealSafePct   = 100 - idealEquityPct

  const equityInvs  = investments.filter(isEquityType)
  const safeInvs    = investments.filter(i => !isEquityType(i))
  const equityValue = equityInvs.reduce((s, i) => s + effectiveCurrentValue(i), 0)
  const safeValue   = safeInvs.reduce((s, i) => s + effectiveCurrentValue(i), 0)
  const totalValue  = equityValue + safeValue

  const actualEquityPct = totalValue > 0 ? (equityValue / totalValue) * 100 : 0
  const actualSafePct   = 100 - actualEquityPct
  const equityGap       = actualEquityPct - idealEquityPct
  const absGap          = Math.abs(equityGap)

  const statusColor = absGap <= 5 ? '#10B981' : absGap <= 15 ? '#F59E0B' : '#EF4444'
  const statusText  = absGap <= 5 ? '✓ On Track'
    : equityGap > 0 ? `▲ ${absGap.toFixed(0)}% over equity` : `▼ ${absGap.toFixed(0)}% under equity`

  // ── Category coverage ──────────────────────────────────────────────────
  const hasEquityMF  = investments.some(i => ['mf_sip','mf_lumpsum'].includes(i.type) && isEquityType(i))
  const hasDebtMF    = investments.some(i => ['mf_sip','mf_lumpsum'].includes(i.type) && !isEquityType(i))
  const hasStocks    = investments.some(i => i.type === 'stocks')
  const hasPPF       = investments.some(i => i.type === 'ppf')
  const hasEPF       = investments.some(i => i.type === 'epf')
  const hasNPS       = investments.some(i => i.type === 'nps')
  const hasFD        = investments.some(i => i.type === 'fd')
  const hasGold      = investments.some(i => i.type === 'gold')
  const hasInsurance = investments.some(i => i.type === 'insurance')
  const hasEmergency = investments.some(i => {
    const n = (i.name || '').toLowerCase()
    return n.includes('emergency') || n.includes('liquid')
  })
  const hasIntl = investments.some(i => {
    const n = (i.name || '').toLowerCase()
    return n.includes('international') || n.includes('global') || n.includes('nasdaq') ||
           n.includes('s&p') || n.includes('us ') || n.includes('u.s')
  })

  // ── Suggestions ────────────────────────────────────────────────────────
  const suggestions        = []
  const equityGapValue     = Math.abs((idealEquityPct / 100) * totalValue - equityValue)

  if (totalValue > 0 && equityGap < -10) {
    const estMonthly = Math.round((equityGapValue / 60) / 500) * 500
    suggestions.push({ type: 'action', text: `Under-invested in growth by ${absGap.toFixed(0)}% (gap ≈ ${fmt(equityGapValue)}). Consider increasing equity SIP${estMonthly > 0 ? ` by ~${fmt(estMonthly)}/mo` : ''} to close the gap over 5 years.` })
  } else if (totalValue > 0 && equityGap > 10) {
    suggestions.push({ type: 'caution', text: `Equity is ${equityGap.toFixed(0)}% above ideal for age ${age}. Consider adding ~${fmt(equityGapValue)} to PPF, Debt MF, or FD to rebalance toward safety.` })
  }
  if (!hasGold) suggestions.push({ type: 'tip', text: 'No Gold allocation — consider Sovereign Gold Bonds or Gold ETF for a 5–8% portfolio hedge against inflation.' })
  if (!hasDebtMF && !hasFD && suggestions.length < 4) suggestions.push({ type: 'tip', text: 'No Debt MF or FD exposure — adding even 10–15% in debt lowers overall portfolio volatility.' })
  if (!hasEmergency && suggestions.length < 4) suggestions.push({ type: 'warn', text: 'No Emergency Fund detected — keep 6 months of expenses in a liquid fund before investing further.' })
  if (hasStocks && suggestions.length < 4) {
    const stocksValue = investments.filter(i => i.type === 'stocks').reduce((s, i) => s + effectiveCurrentValue(i), 0)
    const stocksPct   = equityValue > 0 ? (stocksValue / equityValue) * 100 : 0
    if (stocksPct > 25) suggestions.push({ type: 'caution', text: `Direct stock exposure is ${stocksPct.toFixed(0)}% of equity bucket — typical recommendation is under 20% unless you actively manage individual stocks.` })
  }
  if (!hasNPS && suggestions.length < 4) suggestions.push({ type: 'tip', text: 'NPS not in portfolio — offers an extra ₹50,000 tax deduction under 80CCD(1B) with good long-term returns.' })

  // ── Glide path chart data ──────────────────────────────────────────────
  const chartStartAge = Math.max(18, age - 3)
  const chartEndAge   = retirementAge + 10
  const CW = 500, CH = 110
  const PL = 36, PR = 12, PT = 10, PB = 24
  const IW = CW - PL - PR, IH = CH - PT - PB
  const Y_MIN = 10, Y_MAX = 100
  const xP = (a)   => PL + ((a - chartStartAge) / Math.max(1, chartEndAge - chartStartAge)) * IW
  const yP = (pct) => PT + ((Y_MAX - pct) / (Y_MAX - Y_MIN)) * IH
  const ages      = []
  for (let a = chartStartAge; a <= chartEndAge; a++) ages.push(a)
  const idealLine = ages.map(a => `${xP(a).toFixed(1)},${yP(Math.max(20, Math.min(90, 110 - a))).toFixed(1)}`).join(' ')
  const areaFill  = [`${PL},${PT + IH}`, ...ages.map(a => `${xP(a).toFixed(1)},${yP(Math.max(20, Math.min(90, 110 - a))).toFixed(1)}`), `${xP(chartEndAge).toFixed(1)},${PT + IH}`].join(' ')
  const labelStep = Math.max(1, Math.ceil((chartEndAge - chartStartAge) / 7))
  const labelAges = ages.filter(a => a === age || a === retirementAge || (a - chartStartAge) % labelStep === 0)

  // ── Rebalancing data ───────────────────────────────────────────────────
  const taggedFunds = investments.map(inv => {
    const val        = effectiveCurrentValue(inv)
    const isEq       = isEquityType(inv)
    const bucketTotal = isEq ? equityValue : safeValue
    const pct        = bucketTotal > 0 ? (val / bucketTotal) * 100 : 0
    const tag        = pct > 25 ? '🟡' : '🟢'
    return { ...inv, val, pct, tag, isEq }
  }).sort((a, b) => b.val - a.val)

  const MF_STYLES = ['large cap', 'mid cap', 'small cap', 'flexi cap', 'multi cap', 'elss', 'balanced advantage', 'index fund', 'sectoral']
  const mfFunds   = investments.filter(i => ['mf_sip','mf_lumpsum'].includes(i.type))
  const overlaps  = MF_STYLES.map(style => {
    const matching = mfFunds.filter(i => (i.name || '').toLowerCase().includes(style))
    return matching.length >= 2 ? { style, funds: matching } : null
  }).filter(Boolean)

  // Action lists
  const increaseActions = []
  const reduceActions   = []
  const addActions      = []

  if (totalValue > 0 && equityGap < -10) {
    const estMonthly = Math.round((equityGapValue / 60) / 500) * 500
    increaseActions.push(`Increase equity SIP${estMonthly > 0 ? ` by ~${fmt(estMonthly)}/mo` : ''} to close the ${absGap.toFixed(0)}% under-equity gap — redirect to a diversified equity MF`)
  }
  taggedFunds.filter(f => f.tag === '🟡').forEach(f => {
    reduceActions.push(`Redirect future SIP away from "${f.name}" (${f.pct.toFixed(0)}% of ${f.isEq ? 'equity' : 'safe'} bucket — keep each fund under 25% of its bucket)`)
  })
  if (totalValue > 0 && equityGap > 10) {
    reduceActions.push(`Overall equity is ${equityGap.toFixed(0)}% above ideal — redirect ${equityGap.toFixed(0)}% of future contributions to PPF, Debt MF, or FD`)
  }
  if (!hasGold)                 addActions.push('Add Gold allocation — Sovereign Gold Bond or Gold ETF (target 5–8% of portfolio for inflation hedge)')
  if (!hasDebtMF && !hasFD)     addActions.push('Add Debt MF or FD — even 10–15% in debt reduces volatility without sacrificing much return')
  if (!hasNPS)                  addActions.push('Add NPS — extra ₹50,000 tax deduction under 80CCD(1B) with good long-term returns')
  if (!hasEmergency)            addActions.push('Build Emergency Fund — 6 months of expenses in a liquid fund before investing further')
  if (!hasIntl)                 addActions.push('Consider International exposure — 5–10% in US/Global index fund for geographic diversification (optional)')

  // ── Target Path calculations ───────────────────────────────────────────
  // Scenario A: shift allocation — move ₹X from safe bucket → equity bucket,
  // total portfolio value stays the same (redirect future safe SIP to equity)
  const gapA = totalValue > 0 && equityGap < 0
    ? Math.max(0, (idealEquityPct / 100) * totalValue - equityValue)
    : 0
  const projSafeAfterA    = Math.max(0, safeValue - gapA)
  const monthlyRedirectA  = timeframe > 0 ? gapA / timeframe : 0

  // Scenario B: new money only — safe stays locked at current value
  // Solve X/(X + safeValue) = idealEquityPct/100  →  X = idealEquityPct*safe / (100-idealEquityPct)
  const denomB          = 100 - idealEquityPct
  const neededEquityB   = denomB > 0 && safeValue > 0
    ? (idealEquityPct * safeValue) / denomB
    : equityValue
  const gapB            = Math.max(0, neededEquityB - equityValue)
  const monthlyExtraB   = timeframe > 0 ? gapB / timeframe : 0

  const alreadyAtTarget = equityGap >= 0

  // "Where to invest" hint — prefer existing equity MF SIPs
  const equityMFsByValue = investments
    .filter(i => ['mf_sip','mf_lumpsum'].includes(i.type) && isEquityType(i))
    .sort((a, b) => effectiveCurrentValue(b) - effectiveCurrentValue(a))
  const whereSuggestion = equityMFsByValue.length >= 2
    ? `Increase SIP in "${equityMFsByValue[0].name}" and/or "${equityMFsByValue[1].name}" — or split between them for averaging`
    : equityMFsByValue.length === 1
    ? `Increase monthly SIP in "${equityMFsByValue[0].name}", or open a second equity fund for diversification`
    : !hasIntl
    ? 'Start a Nifty 50 Index Fund or Flexi Cap Fund as a new SIP to build equity exposure'
    : 'Consider a Mid Cap or International Index fund to diversify equity'

  // ── 5-Year Portfolio Projection ──────────────────────────────────────────
  // Future value: FV = PV*(1+r)^n + PMT*((1+r)^n - 1)/r
  const fv5 = (pv, r, pmt, n) => pv * Math.pow(1 + r, n) + (pmt * (Math.pow(1 + r, n) - 1)) / r
  const R_EQ   = 0.12 / 12  // 1%/mo → 12% p.a. for equity
  const R_SAFE = 0.07 / 12  // ~0.583%/mo → 7% p.a. for safe instruments
  const N5     = 60          // 5 years = 60 months
  const existingEquitySIP = equityInvs.reduce((s, i) => s + (Number(i.monthly_sip_amount) || 0), 0)
  const existingSafeSIP   = safeInvs.reduce((s, i) => s + (Number(i.monthly_sip_amount) || 0), 0)
  // Scenario B plan: add monthlyExtraB to existing equity SIP
  const equityFV5  = fv5(equityValue, R_EQ,   existingEquitySIP + monthlyExtraB, N5)
  const safeFV5    = fv5(safeValue,   R_SAFE, existingSafeSIP,                   N5)
  const totalFV5   = equityFV5 + safeFV5
  const growthPct5 = totalValue > 0 ? ((totalFV5 - totalValue) / totalValue) * 100 : 0
  const equityPct5 = totalFV5 > 0 ? (equityFV5 / totalFV5) * 100 : 0

  const TABS = [
    { id: 'allocation',  label: 'Allocation',  icon: '📊' },
    { id: 'coverage',    label: 'Coverage',    icon: '🗂️' },
    { id: 'suggestions', label: 'Suggestions', icon: '💡' },
    { id: 'rebalancing', label: 'Rebalancing', icon: '🔁' },
    { id: 'target',      label: 'Target',      icon: '💰' },
  ]

  const doneCount = [
    ...increaseActions, ...reduceActions, ...addActions,
    ...suggestions.map(s => s.text),
  ].filter(t => doneActions.has(t)).length

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm mb-4 overflow-hidden">

      {/* ── Header ── */}
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-5 py-4 hover:bg-gray-50/50 transition-colors text-left"
      >
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl flex items-center justify-center text-lg shrink-0" style={{ backgroundColor: '#f0efff' }}>📊</div>
          <div>
            <p className="text-sm font-bold text-gray-900">Allocation Health Check</p>
            <p className="text-xs text-gray-400 mt-0.5">Age {age} · Ideal {idealEquityPct}% equity / {idealSafePct}% safe</p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {totalValue > 0 && (
            <span className="text-[10px] font-bold px-2 py-1 rounded-full"
              style={{ backgroundColor: statusColor + '18', color: statusColor }}>
              {statusText}
            </span>
          )}
          {doneCount > 0 && (
            <span className="text-[10px] font-bold px-2 py-1 rounded-full bg-green-50 text-green-600">
              {doneCount} done
            </span>
          )}
          <button
            onClick={e => { e.stopPropagation(); onRefresh?.() }}
            title="Refresh"
            className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 transition-colors">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="w-3.5 h-3.5">
              <polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/>
              <path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15"/>
            </svg>
          </button>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"
            className={`w-4 h-4 text-gray-400 transition-transform duration-200 ${open ? 'rotate-180' : ''}`}>
            <polyline points="6 9 12 15 18 9"/>
          </svg>
        </div>
      </button>

      {/* ── Body ── */}
      {open && (
        <>
          {/* Tab bar */}
          <div className="flex border-t border-gray-100">
            {TABS.map(tab => (
              <button key={tab.id} onClick={() => setActiveTab(tab.id)}
                className={`flex-1 py-2.5 text-[11px] font-semibold transition-all border-b-2 ${
                  activeTab === tab.id
                    ? 'border-[#6C63FF] text-[#6C63FF] bg-[#f5f4ff]'
                    : 'border-transparent text-gray-400 hover:bg-gray-50 hover:text-gray-600'
                }`}>
                <span className="mr-1">{tab.icon}</span>{tab.label}
              </button>
            ))}
          </div>

          <div className="px-5 pb-6 pt-4 space-y-4">

            {/* ── Tab: Allocation ── */}
            {activeTab === 'allocation' && (
              <>
                {/* Current vs Ideal bars */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-gray-50 rounded-xl p-3">
                    <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-2">Your Portfolio</p>
                    {totalValue > 0 ? (
                      <>
                        <div className="h-2.5 rounded-full overflow-hidden flex mb-2">
                          <div style={{ width: `${actualEquityPct}%`, backgroundColor: '#6C63FF' }} />
                          <div style={{ flex: 1, backgroundColor: '#10B981' }} />
                        </div>
                        <div className="flex items-center justify-between text-xs font-semibold">
                          <span style={{ color: '#6C63FF' }}>Equity {actualEquityPct.toFixed(0)}%</span>
                          <span style={{ color: '#10B981' }}>Safe {actualSafePct.toFixed(0)}%</span>
                        </div>
                        <p className="text-[10px] text-gray-400 mt-1">{fmtCompact(equityValue)} · {fmtCompact(safeValue)}</p>
                      </>
                    ) : <p className="text-xs text-gray-400">No investments yet</p>}
                  </div>
                  <div className="rounded-xl p-3" style={{ backgroundColor: '#f0efff' }}>
                    <p className="text-[10px] font-semibold uppercase tracking-wide mb-2" style={{ color: '#6C63FF' }}>Ideal for Age {age}</p>
                    <div className="h-2.5 rounded-full overflow-hidden flex mb-2">
                      <div style={{ width: `${idealEquityPct}%`, backgroundColor: '#6C63FF' }} />
                      <div style={{ flex: 1, backgroundColor: '#10B981' }} />
                    </div>
                    <div className="flex items-center justify-between text-xs font-semibold">
                      <span style={{ color: '#6C63FF' }}>Equity {idealEquityPct}%</span>
                      <span style={{ color: '#10B981' }}>Safe {idealSafePct}%</span>
                    </div>
                    <p className="text-[10px] text-gray-400 mt-1">110 − age rule</p>
                  </div>
                </div>

                {/* Status banner */}
                {totalValue > 0 && (
                  <div className={`px-4 py-3 rounded-xl text-xs leading-relaxed ${
                    absGap <= 5 ? 'bg-green-50 text-green-800' :
                    equityGap > 0 ? 'bg-amber-50 text-amber-800' : 'bg-blue-50 text-blue-800'
                  }`}>
                    {absGap <= 5
                      ? `✓ You're at ${actualEquityPct.toFixed(0)}% equity / ${actualSafePct.toFixed(0)}% safe — well-aligned with the ideal ${idealEquityPct}% / ${idealSafePct}% for your age.`
                      : equityGap > 0
                      ? `You're at ${actualEquityPct.toFixed(0)}% equity / ${actualSafePct.toFixed(0)}% safe. Ideal for age ${age} is ${idealEquityPct}% / ${idealSafePct}%. Consider shifting ${equityGap.toFixed(0)}% toward safer instruments.`
                      : `You're at ${actualEquityPct.toFixed(0)}% equity / ${actualSafePct.toFixed(0)}% safe. Ideal for age ${age} is ${idealEquityPct}% / ${idealSafePct}%. Under-invested in growth by ${absGap.toFixed(0)}%.`
                    }
                  </div>
                )}

                {/* Glide path chart */}
                <div>
                  <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wide mb-2">Equity Glide Path</p>
                  <div className="bg-gray-50 rounded-xl p-3 overflow-hidden">
                    <svg viewBox={`0 0 ${CW} ${CH}`} width="100%" height={CH} style={{ display: 'block', overflow: 'visible' }}>
                      {[20, 40, 60, 80].map(pct => (
                        <line key={pct} x1={PL} y1={yP(pct)} x2={PL + IW} y2={yP(pct)}
                          stroke="#E5E7EB" strokeWidth={0.5} strokeDasharray="3,3" />
                      ))}
                      <polygon points={areaFill} fill="#6C63FF" opacity={0.07} />
                      <polyline points={idealLine} fill="none" stroke="#6C63FF" strokeWidth={2} strokeLinejoin="round" />
                      {retirementAge >= chartStartAge && retirementAge <= chartEndAge && (
                        <line x1={xP(retirementAge)} y1={PT} x2={xP(retirementAge)} y2={PT + IH}
                          stroke="#EF4444" strokeWidth={1} strokeDasharray="4,2" opacity={0.7} />
                      )}
                      {totalValue > 0 && (
                        <circle cx={xP(age)} cy={yP(actualEquityPct)} r={5} fill="#F59E0B" stroke="white" strokeWidth={1.5} />
                      )}
                      <circle cx={xP(age)} cy={yP(Math.max(20, Math.min(90, 110 - age)))} r={4} fill="#6C63FF" stroke="white" strokeWidth={1.5} />
                      {[20, 40, 60, 80].map(pct => (
                        <text key={pct} x={PL - 4} y={yP(pct) + 3} textAnchor="end"
                          style={{ fontSize: '9px', fill: '#9ca3af', fontFamily: 'inherit' }}>{pct}%</text>
                      ))}
                      {labelAges.map(a => (
                        <text key={a} x={xP(a)} y={CH - 2} textAnchor="middle"
                          style={{ fontSize: '9px', fontFamily: 'inherit',
                            fontWeight: (a === age || a === retirementAge) ? 'bold' : 'normal',
                            fill: a === retirementAge ? '#EF4444' : a === age ? '#6C63FF' : '#9ca3af' }}>
                          {a}
                        </text>
                      ))}
                      <circle cx={PL + 6} cy={PT + 5} r={3} fill="#6C63FF" />
                      <text x={PL + 12} y={PT + 8} style={{ fontSize: '9px', fill: '#6C63FF', fontFamily: 'inherit' }}>Ideal equity %</text>
                      {totalValue > 0 && (
                        <>
                          <circle cx={PL + 90} cy={PT + 5} r={3} fill="#F59E0B" />
                          <text x={PL + 96} y={PT + 8} style={{ fontSize: '9px', fill: '#F59E0B', fontFamily: 'inherit' }}>Your actual</text>
                        </>
                      )}
                      <line x1={PL + (totalValue > 0 ? 165 : 90)} y1={PT + 5} x2={PL + (totalValue > 0 ? 175 : 100)} y2={PT + 5}
                        stroke="#EF4444" strokeWidth={1} strokeDasharray="3,1.5" />
                      <text x={PL + (totalValue > 0 ? 178 : 103)} y={PT + 8}
                        style={{ fontSize: '9px', fill: '#EF4444', fontFamily: 'inherit' }}>Retire ({retirementAge})</text>
                    </svg>
                    <p className="text-[10px] text-gray-400 mt-1">X = age · Y = ideal equity % · equity decreases as you near retirement</p>
                  </div>
                </div>

                <p className="text-[10px] text-gray-400 leading-relaxed pt-1 border-t border-gray-100">
                  <span className="font-semibold">Disclaimer:</span> General guidelines based on the 110-minus-age rule — not personalised financial advice. Consult a SEBI-registered advisor for personalised planning.
                </p>
              </>
            )}

            {/* ── Tab: Coverage ── */}
            {activeTab === 'coverage' && (
              <>
                <p className="text-xs text-gray-500 mb-3">Categories you have covered vs. missing in your portfolio.</p>
                <div className="flex flex-wrap gap-2">
                  {[
                    { has: hasEquityMF,  label: 'Equity MF',      icon: '📈' },
                    { has: hasDebtMF,    label: 'Debt MF',        icon: '📋' },
                    { has: hasStocks,    label: 'Stocks',         icon: '📊' },
                    { has: hasEPF,       label: 'EPF',            icon: '💼' },
                    { has: hasPPF,       label: 'PPF',            icon: '🏛️' },
                    { has: hasNPS,       label: 'NPS',            icon: '🏦' },
                    { has: hasFD,        label: 'Fixed Deposit',  icon: '🏧' },
                    { has: hasGold,      label: 'Gold',           icon: '🥇' },
                    { has: hasInsurance, label: 'Insurance',      icon: '🛡️' },
                    { has: hasEmergency, label: 'Emergency Fund', icon: '🚨' },
                    { has: hasIntl,      label: 'International',  icon: '🌍', optional: true },
                  ].map(({ has, label, icon, optional }) => (
                    <div key={label}
                      className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold border ${
                        has
                          ? 'bg-green-50 text-green-700 border-green-200'
                          : optional
                          ? 'bg-gray-50 text-gray-400 border-gray-100'
                          : 'bg-red-50 text-red-600 border-red-100'
                      }`}>
                      <span>{has ? '✓' : optional ? '○' : '⚠'}</span>
                      <span>{icon} {label}{optional ? ' (opt)' : ''}</span>
                    </div>
                  ))}
                </div>
                <div className="flex items-center gap-3 mt-2 flex-wrap text-[11px] text-gray-400">
                  <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-green-400 inline-block" /> Covered</span>
                  <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-red-400 inline-block" /> Missing</span>
                  <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-gray-300 inline-block" /> Optional</span>
                </div>
              </>
            )}

            {/* ── Tab: Suggestions ── */}
            {activeTab === 'suggestions' && (
              <>
                {suggestions.length === 0 ? (
                  <div className="text-center py-6 text-sm text-gray-400">
                    <p className="text-2xl mb-2">🎉</p>
                    <p>No critical suggestions — your portfolio looks well-balanced!</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {suggestions.map((s, i) => (
                      <div key={i} className={`flex items-start gap-2.5 px-4 py-3 rounded-xl text-xs leading-relaxed ${
                        s.type === 'action'  ? 'bg-[#f0efff] text-[#4c48b0]' :
                        s.type === 'caution' ? 'bg-amber-50 text-amber-800' :
                        s.type === 'warn'    ? 'bg-red-50 text-red-700'     :
                                              'bg-blue-50 text-blue-800'
                      }`}>
                        <span className="shrink-0 mt-0.5">
                          {s.type === 'action' ? '💡' : s.type === 'caution' ? '⚠️' : s.type === 'warn' ? '🚨' : 'ℹ️'}
                        </span>
                        <span className="flex-1">{s.text}</span>
                      </div>
                    ))}
                  </div>
                )}
                <p className="text-[10px] text-gray-400 leading-relaxed pt-1 border-t border-gray-100">
                  <span className="font-semibold">Disclaimer:</span> General guidelines — not personalised financial advice. Consult a SEBI-registered advisor.
                </p>
              </>
            )}

            {/* ── Tab: Rebalancing ── */}
            {activeTab === 'rebalancing' && (
              <div className="space-y-5">

                {/* Fund Health Status */}
                <div>
                  <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wide mb-3">Fund Health Status</p>
                  {investments.length === 0 ? (
                    <p className="text-xs text-gray-400">No investments to analyse.</p>
                  ) : (
                    <div className="space-y-2">
                      {taggedFunds.map(fund => {
                        const goal = (goals || []).find(g => g.id === fund.goal_id)
                        const meta = TYPE_META[fund.type] || { label: fund.type, color: '#6b7280', bg: '#f9fafb' }
                        const wrongType = fund.type !== 'stocks' && isStockBroker(fund)
                        return (
                          <div key={fund.id} className={`flex items-center gap-3 p-3 rounded-xl ${wrongType ? 'bg-amber-50 border border-amber-100' : 'bg-gray-50'}`}>
                            <span className="text-base shrink-0">{fund.tag}</span>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="text-xs font-semibold text-gray-800 truncate">{fund.name}</span>
                                <span className="text-[10px] px-1.5 py-0.5 rounded-md font-semibold shrink-0"
                                  style={{ backgroundColor: meta.bg, color: meta.color }}>{meta.label}</span>
                                {wrongType && (
                                  <span className="text-[10px] px-1.5 py-0.5 bg-amber-100 text-amber-700 rounded-md font-semibold shrink-0">
                                    ⚠ Change type to Stocks
                                  </span>
                                )}
                                {goal && (
                                  <span className="text-[10px] px-1.5 py-0.5 bg-blue-50 text-blue-600 rounded-md font-semibold shrink-0">
                                    🎯 {goal.emoji} {goal.title}
                                  </span>
                                )}
                              </div>
                              <div className="flex items-center gap-2 mt-1">
                                <div className="flex-1 h-1.5 bg-gray-200 rounded-full overflow-hidden">
                                  <div className="h-full rounded-full transition-all"
                                    style={{
                                      width: `${Math.min(100, fund.pct)}%`,
                                      backgroundColor: fund.pct > 25 ? '#F59E0B' : '#10B981'
                                    }} />
                                </div>
                                <span className="text-[10px] text-gray-400 shrink-0">
                                  {fund.pct.toFixed(0)}% of {fund.isEq ? 'equity' : 'safe'} bucket
                                </span>
                              </div>
                            </div>
                            <div className="text-right shrink-0">
                              <p className="text-xs font-bold text-gray-800">{fmtCompact(fund.val)}</p>
                              {fund.tag === '🟡' && <p className="text-[10px] text-amber-600 font-semibold">Overweight</p>}
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>

                {/* Overlap / Redundancy */}
                {overlaps.length > 0 && (
                  <div>
                    <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wide mb-3">⚠ Overlap / Redundancy Detected</p>
                    <div className="space-y-2">
                      {overlaps.map((ov, i) => (
                        <div key={i} className="px-4 py-3 bg-amber-50 border border-amber-100 rounded-xl text-xs text-amber-800">
                          <p className="font-semibold capitalize">{ov.style} — {ov.funds.length} overlapping funds</p>
                          <p className="mt-1 text-amber-700">{ov.funds.map(f => f.name).join(' · ')}</p>
                          <p className="mt-1.5 text-amber-600">Consider consolidating to one fund of this style to avoid tracking the same index/sector twice.</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Action: Increase */}
                {increaseActions.length > 0 && (
                  <div>
                    <button
                      onClick={() => setExpanded(e => ({ ...e, increase: !e.increase }))}
                      className="w-full flex items-center justify-between mb-2 text-left"
                    >
                      <p className="text-[11px] font-bold text-green-700 uppercase tracking-wide flex items-center gap-1.5">
                        <span className="w-5 h-5 rounded-full bg-green-100 flex items-center justify-center text-[10px]">↑</span>
                        Increase / Invest More In
                        <span className="px-1.5 py-0.5 bg-green-100 text-green-700 rounded-full text-[10px] font-bold">{increaseActions.length}</span>
                      </p>
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"
                        className={`w-3.5 h-3.5 text-gray-400 transition-transform ${expanded.increase ? 'rotate-180' : ''}`}>
                        <polyline points="6 9 12 15 18 9"/>
                      </svg>
                    </button>
                    {expanded.increase && (
                      <div className="space-y-2">
                        {increaseActions.map((text, i) => (
                          <label key={i} className={`flex items-start gap-3 px-4 py-3 rounded-xl cursor-pointer transition-colors ${
                            doneActions.has(text) ? 'bg-green-50 border border-green-100' : 'bg-gray-50 border border-transparent hover:bg-green-50/40'
                          }`}>
                            <input type="checkbox" checked={doneActions.has(text)} onChange={() => toggleDone(text)}
                              className="mt-0.5 w-3.5 h-3.5 accent-green-500 shrink-0 cursor-pointer" />
                            <span className={`text-xs leading-relaxed flex-1 ${doneActions.has(text) ? 'line-through text-gray-400' : 'text-gray-700'}`}>{text}</span>
                          </label>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* Action: Reduce */}
                {reduceActions.length > 0 && (
                  <div>
                    <button
                      onClick={() => setExpanded(e => ({ ...e, reduce: !e.reduce }))}
                      className="w-full flex items-center justify-between mb-2 text-left"
                    >
                      <p className="text-[11px] font-bold text-amber-700 uppercase tracking-wide flex items-center gap-1.5">
                        <span className="w-5 h-5 rounded-full bg-amber-100 flex items-center justify-center text-[10px]">↔</span>
                        Reduce / Redirect Future Contributions
                        <span className="px-1.5 py-0.5 bg-amber-100 text-amber-700 rounded-full text-[10px] font-bold">{reduceActions.length}</span>
                      </p>
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"
                        className={`w-3.5 h-3.5 text-gray-400 transition-transform ${expanded.reduce ? 'rotate-180' : ''}`}>
                        <polyline points="6 9 12 15 18 9"/>
                      </svg>
                    </button>
                    {expanded.reduce && (
                      <div className="space-y-2">
                        {reduceActions.map((text, i) => (
                          <label key={i} className={`flex items-start gap-3 px-4 py-3 rounded-xl cursor-pointer transition-colors ${
                            doneActions.has(text) ? 'bg-green-50 border border-green-100' : 'bg-amber-50/60 border border-transparent hover:bg-amber-50'
                          }`}>
                            <input type="checkbox" checked={doneActions.has(text)} onChange={() => toggleDone(text)}
                              className="mt-0.5 w-3.5 h-3.5 accent-amber-500 shrink-0 cursor-pointer" />
                            <span className={`text-xs leading-relaxed flex-1 ${doneActions.has(text) ? 'line-through text-gray-400' : 'text-amber-900'}`}>{text}</span>
                          </label>
                        ))}
                        <p className="text-[10px] text-amber-600 px-1">No sell recommendations — only redirect future monthly SIP/contributions. Do not liquidate existing holdings.</p>
                      </div>
                    )}
                  </div>
                )}

                {/* Action: Add New */}
                {addActions.length > 0 && (
                  <div>
                    <button
                      onClick={() => setExpanded(e => ({ ...e, add: !e.add }))}
                      className="w-full flex items-center justify-between mb-2 text-left"
                    >
                      <p className="text-[11px] font-bold text-blue-700 uppercase tracking-wide flex items-center gap-1.5">
                        <span className="w-5 h-5 rounded-full bg-blue-100 flex items-center justify-center text-[10px]">+</span>
                        Consider Adding New
                        <span className="px-1.5 py-0.5 bg-blue-100 text-blue-700 rounded-full text-[10px] font-bold">{addActions.length}</span>
                      </p>
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"
                        className={`w-3.5 h-3.5 text-gray-400 transition-transform ${expanded.add ? 'rotate-180' : ''}`}>
                        <polyline points="6 9 12 15 18 9"/>
                      </svg>
                    </button>
                    {expanded.add && (
                      <div className="space-y-2">
                        {addActions.map((text, i) => (
                          <label key={i} className={`flex items-start gap-3 px-4 py-3 rounded-xl cursor-pointer transition-colors ${
                            doneActions.has(text) ? 'bg-green-50 border border-green-100' : 'bg-blue-50/60 border border-transparent hover:bg-blue-50'
                          }`}>
                            <input type="checkbox" checked={doneActions.has(text)} onChange={() => toggleDone(text)}
                              className="mt-0.5 w-3.5 h-3.5 accent-blue-500 shrink-0 cursor-pointer" />
                            <span className={`text-xs leading-relaxed flex-1 ${doneActions.has(text) ? 'line-through text-gray-400' : 'text-blue-900'}`}>{text}</span>
                          </label>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {increaseActions.length === 0 && reduceActions.length === 0 && addActions.length === 0 && (
                  <div className="text-center py-4 text-sm text-gray-400">
                    <p className="text-2xl mb-2">🎉</p>
                    <p>Portfolio looks well-balanced — no rebalancing needed right now!</p>
                  </div>
                )}

                <p className="text-[10px] text-gray-400 leading-relaxed pt-2 border-t border-gray-100">
                  <span className="font-semibold">Rebalancing Disclaimer:</span> All suggestions are to redirect <em>future contributions only</em> — no sell recommendations are made. Mark items as done to track your progress. This is not personalised financial advice. Consult a SEBI-registered advisor.
                </p>
              </div>
            )}

            {/* ── Tab: Target Path ── */}
            {activeTab === 'target' && (
              <div className="space-y-4">

                {/* Already at target */}
                {alreadyAtTarget ? (
                  <div className="px-4 py-4 bg-green-50 border border-green-100 rounded-xl text-sm text-green-800 leading-relaxed space-y-2">
                    <p className="font-bold">✓ Already at or above your target equity ratio</p>
                    <p>You're at <strong>{actualEquityPct.toFixed(0)}%</strong> equity vs ideal <strong>{idealEquityPct}%</strong> — no additional equity investment needed to rebalance.</p>
                    <p className="text-xs text-green-700">New money can go to safe instruments (PPF/FD) to build the safe side, or stay in equity if you have high risk tolerance.</p>
                  </div>
                ) : totalValue === 0 ? (
                  <p className="text-xs text-gray-400 text-center py-6">Add investments first to use the calculator.</p>
                ) : (
                  <>
                    {/* Shared timeframe selector */}
                    <div className="flex items-center gap-3">
                      <p className="text-xs font-semibold text-gray-500 shrink-0">Spread over:</p>
                      <div className="flex gap-1.5 flex-wrap">
                        {[6, 12, 24, 36, 60].map(m => (
                          <button key={m} onClick={() => setTimeframe(m)}
                            className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all border ${
                              timeframe === m
                                ? 'bg-[#6C63FF] text-white border-[#6C63FF]'
                                : 'bg-white text-gray-500 border-gray-200 hover:border-[#6C63FF]/40'
                            }`}>
                            {m === 60 ? '5yr' : `${m}mo`}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* ── Scenario A: Redirect Safe → Equity ── */}
                    <div className="rounded-2xl border border-amber-200 overflow-hidden">
                      <div className="px-4 py-3 bg-amber-50 border-b border-amber-100 flex items-start gap-2">
                        <span className="text-base shrink-0">↔</span>
                        <div>
                          <p className="text-xs font-bold text-amber-800 uppercase tracking-wide">Scenario A — Redirect Safe → Equity</p>
                          <p className="text-[11px] text-amber-700 mt-0.5">Keep total portfolio flat — redirect future safe SIP contributions to equity SIP instead</p>
                        </div>
                      </div>
                      <div className="px-4 py-4 bg-amber-50/30 space-y-3">
                        {/* Calculation rows */}
                        <div className="bg-white rounded-xl divide-y divide-gray-50 text-xs">
                          {[
                            { label: 'Current equity',    val: `${fmtCompact(equityValue)} (${actualEquityPct.toFixed(0)}%)`, color: '#6C63FF' },
                            { label: 'Current safe',      val: `${fmtCompact(safeValue)} (${actualSafePct.toFixed(0)}%)`,    color: '#10B981' },
                            { label: 'Shift to equity',   val: fmtCompact(gapA),                                              color: '#F59E0B', bold: true },
                          ].map(r => (
                            <div key={r.label} className="flex items-center justify-between px-3 py-2">
                              <span className="text-gray-500">{r.label}</span>
                              <span className={`font-semibold ${r.bold ? 'text-sm' : ''}`} style={{ color: r.color }}>{r.val}</span>
                            </div>
                          ))}
                        </div>

                        {/* Monthly redirect highlight */}
                        <div className="bg-amber-100 rounded-xl px-4 py-3 flex items-center justify-between">
                          <div>
                            <p className="text-[10px] text-amber-700 uppercase tracking-wide font-semibold">Monthly Redirect</p>
                            <p className="text-2xl font-bold text-amber-800">{fmtCompact(monthlyRedirectA)}<span className="text-sm font-normal">/mo</span></p>
                          </div>
                          <p className="text-[10px] text-amber-700 text-right max-w-[130px] leading-relaxed">Stop adding to safe SIP, add this amount to equity SIP instead</p>
                        </div>

                        {/* After rebalancing projection */}
                        <div className="bg-white rounded-xl p-3">
                          <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-2">After {timeframe}mo of Redirecting</p>
                          <div className="h-2 rounded-full overflow-hidden flex mb-1.5">
                            <div style={{ width: `${idealEquityPct}%`, backgroundColor: '#6C63FF' }} />
                            <div style={{ flex: 1, backgroundColor: '#10B981' }} />
                          </div>
                          <div className="flex items-center justify-between text-[11px] font-semibold">
                            <span style={{ color: '#6C63FF' }}>Equity {idealEquityPct}% · {fmtCompact(equityValue + gapA)}</span>
                            <span style={{ color: '#10B981' }}>Safe {idealSafePct}% · {fmtCompact(projSafeAfterA)}</span>
                          </div>
                        </div>

                        <p className="text-[10px] text-amber-600 leading-relaxed">⚠ PPF and EPF cannot be liquidated before maturity — this means pausing <em>future contributions</em> to those and routing the same amount into equity SIPs instead.</p>
                      </div>
                    </div>

                    {/* ── Scenario B: New Money Only ── */}
                    <div className="rounded-2xl border border-[#6C63FF]/20 overflow-hidden">
                      <div className="px-4 py-3 bg-[#ede9ff] border-b border-[#6C63FF]/20 flex items-start gap-2">
                        <span className="text-base shrink-0">+</span>
                        <div>
                          <p className="text-xs font-bold uppercase tracking-wide" style={{ color: '#4c48b0' }}>Scenario B — New Money Only</p>
                          <p className="text-[11px] mt-0.5" style={{ color: '#6C63FF' }}>Safe holdings ({fmtCompact(safeValue)}) stay completely untouched — only add fresh equity capital</p>
                        </div>
                      </div>
                      <div className="px-4 py-4 bg-[#f5f4ff]/60 space-y-3">
                        {/* Calculation rows */}
                        <div className="bg-white rounded-xl divide-y divide-gray-50 text-xs">
                          {[
                            { label: 'Current equity',         val: `${fmtCompact(equityValue)} (${actualEquityPct.toFixed(0)}%)`, color: '#6C63FF' },
                            { label: 'Safe stays fixed at',    val: fmtCompact(safeValue),                                         color: '#10B981' },
                            { label: `Target equity (${idealEquityPct}%)`, val: fmtCompact(neededEquityB),                        color: '#6C63FF' },
                            { label: 'New equity to add',      val: fmtCompact(gapB),                                              color: '#4c48b0', bold: true },
                          ].map(r => (
                            <div key={r.label} className="flex items-center justify-between px-3 py-2">
                              <span className="text-gray-500">{r.label}</span>
                              <span className={`font-semibold ${r.bold ? 'text-sm' : ''}`} style={{ color: r.color }}>{r.val}</span>
                            </div>
                          ))}
                        </div>

                        {/* Monthly extra highlight */}
                        <div className="rounded-xl px-4 py-3 flex items-center justify-between" style={{ backgroundColor: '#6C63FF' }}>
                          <div>
                            <p className="text-[10px] text-white/70 uppercase tracking-wide font-semibold">Monthly Extra Needed</p>
                            <p className="text-2xl font-bold text-white">{fmtCompact(monthlyExtraB)}<span className="text-sm font-normal">/mo</span></p>
                          </div>
                          <p className="text-[10px] text-white/80 text-right max-w-[120px] leading-relaxed">extra into equity for {timeframe} months, safe untouched</p>
                        </div>

                        {/* After adding new equity */}
                        <div className="bg-white rounded-xl p-3">
                          <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-2">After Adding {fmtCompact(gapB)} New Equity</p>
                          <div className="h-2 rounded-full overflow-hidden flex mb-1.5">
                            <div style={{ width: `${idealEquityPct}%`, backgroundColor: '#6C63FF' }} />
                            <div style={{ flex: 1, backgroundColor: '#10B981' }} />
                          </div>
                          <div className="flex items-center justify-between text-[11px] font-semibold">
                            <span style={{ color: '#6C63FF' }}>Equity {idealEquityPct}% · {fmtCompact(equityValue + gapB)}</span>
                            <span style={{ color: '#10B981' }}>Safe {idealSafePct}% · {fmtCompact(safeValue)}</span>
                          </div>
                        </div>

                        {/* Where to invest */}
                        <div className="bg-white rounded-xl px-4 py-3">
                          <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-1.5">💡 Where to Invest This</p>
                          <p className="text-xs text-gray-700 leading-relaxed">{whereSuggestion}</p>
                        </div>

                        {/* CTA — pre-fills the Add Investment form */}
                        {onAddSIP && (
                          <button
                            onClick={() => onAddSIP(monthlyExtraB)}
                            className="w-full py-3 rounded-xl text-sm font-semibold text-white flex items-center justify-center gap-2 hover:opacity-90 active:scale-[0.98] transition-all"
                            style={{ backgroundColor: '#6C63FF' }}>
                            <span className="text-base font-bold leading-none">+</span>
                            Add {fmtCompact(monthlyExtraB)}/mo as New SIP
                          </button>
                        )}
                      </div>
                    </div>

                    {/* ── 5-Year Projection ── */}
                    {totalValue > 0 && (
                      <div className="rounded-2xl border border-emerald-200 overflow-hidden">
                        <div className="px-4 py-3 bg-emerald-50 border-b border-emerald-100 flex items-center gap-2">
                          <span className="text-base">📈</span>
                          <div>
                            <p className="text-xs font-bold text-emerald-800 uppercase tracking-wide">5-Year Portfolio Outlook</p>
                            <p className="text-[11px] text-emerald-700 mt-0.5">If you follow Scenario B and your SIPs continue for 5 years</p>
                          </div>
                        </div>
                        <div className="px-4 py-4 bg-emerald-50/30 space-y-3">
                          {/* Projection rows */}
                          <div className="bg-white rounded-xl divide-y divide-gray-50 text-xs">
                            {[
                              { label: 'Equity in 5 yrs (12% p.a.)', val: fmtCompact(equityFV5),  color: '#6C63FF' },
                              { label: 'Safe in 5 yrs (7% p.a.)',    val: fmtCompact(safeFV5),    color: '#10B981' },
                            ].map(r => (
                              <div key={r.label} className="flex items-center justify-between px-3 py-2.5">
                                <span className="text-gray-500">{r.label}</span>
                                <span className="font-semibold" style={{ color: r.color }}>{r.val}</span>
                              </div>
                            ))}
                            <div className="flex items-center justify-between px-3 py-3 bg-emerald-50/60">
                              <span className="font-bold text-gray-700">Total portfolio in 5 yrs</span>
                              <div className="text-right">
                                <p className="text-lg font-bold text-emerald-700">{fmtCompact(totalFV5)}</p>
                                <p className="text-[10px] text-emerald-600">+{growthPct5.toFixed(0)}% from today's {fmtCompact(totalValue)}</p>
                              </div>
                            </div>
                          </div>

                          {/* Allocation at 5 years */}
                          <div className="bg-white rounded-xl p-3">
                            <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-2">Projected Allocation in 5 Years</p>
                            <div className="h-2 rounded-full overflow-hidden flex mb-1.5">
                              <div style={{ width: `${equityPct5}%`, backgroundColor: '#6C63FF' }} />
                              <div style={{ flex: 1, backgroundColor: '#10B981' }} />
                            </div>
                            <div className="flex items-center justify-between text-[11px] font-semibold">
                              <span style={{ color: '#6C63FF' }}>Equity {equityPct5.toFixed(0)}%</span>
                              <span style={{ color: '#10B981' }}>Safe {(100 - equityPct5).toFixed(0)}%</span>
                            </div>
                          </div>

                          <p className="text-[10px] text-gray-400 leading-relaxed">
                            Assumptions: 12% p.a. for equity/MFs, 7% p.a. for EPF/PPF/FD/insurance. Includes your existing SIPs + the new monthly SIP from Scenario B. Actual returns will vary. Not a guarantee.
                          </p>
                        </div>
                      </div>
                    )}

                    {/* Snapshot note */}
                    <div className="flex items-start gap-2 px-3 py-3 bg-gray-50 rounded-xl">
                      <span className="text-base shrink-0">📸</span>
                      <p className="text-[11px] text-gray-500 leading-relaxed">
                        <span className="font-semibold">Snapshot calculation.</span> Since PPF/EPF/FD keep earning interest and your existing SIPs keep adding, the gap changes over time. Recalculate every 3–6 months to stay accurate.
                        <button onClick={() => onRefresh?.()} className="ml-1.5 text-[#6C63FF] font-semibold hover:underline">🔄 Recalculate now</button>
                      </p>
                    </div>
                  </>
                )}

              </div>
            )}

          </div>
        </>
      )}
    </div>
  )
}

// ── MF Fund search (autocomplete) ─────────────────────────────────────────
function MFSearchInput({ value, schemeCode, onSelect }) {
  const [query, setQuery] = useState(value || '')
  const [results, setResults] = useState([])
  const [loading, setLoading] = useState(false)
  const debounceRef = useRef(null)

  const search = (q) => {
    setQuery(q)
    clearTimeout(debounceRef.current)
    if (q.length < 3) { setResults([]); return }
    debounceRef.current = setTimeout(async () => {
      setLoading(true)
      try {
        const data = await window.electronAPI.searchMF(q)
        setResults((data || []).slice(0, 8))
      } catch {
        setResults([])
      } finally {
        setLoading(false)
      }
    }, 400)
  }

  return (
    <div className="relative">
      <div className="relative">
        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"><SearchIcon /></span>
        <input
          className="w-full pl-9 pr-4 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-100"
          placeholder="Search fund name (e.g. Mirae Large Cap)"
          value={query}
          onChange={e => search(e.target.value)}
        />
        {loading && <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-400 animate-pulse">searching…</span>}
      </div>
      {results.length > 0 && (
        <div className="absolute z-30 top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-xl shadow-xl max-h-52 overflow-y-auto">
          {results.map(r => (
            <button key={r.schemeCode}
              className="w-full text-left px-4 py-3 hover:bg-gray-50 border-b border-gray-50 last:border-0 transition-colors"
              onClick={() => { onSelect(r); setQuery(r.schemeName); setResults([]) }}>
              <p className="text-sm font-medium text-gray-800 leading-snug">{r.schemeName}</p>
              <p className="text-xs text-gray-400 mt-0.5">Code: {r.schemeCode}</p>
            </button>
          ))}
        </div>
      )}
      {schemeCode && <p className="text-xs text-gray-400 mt-1">Scheme code: {schemeCode}</p>}
    </div>
  )
}

// ── Investment form modal ─────────────────────────────────────────────────
function InvestmentForm({ initial, goals, onSave, onClose }) {
  const [form, setForm] = useState(() => initial
    ? { ...BLANK_FORM, ...initial, goal_id: initial.goal_id ?? '', sip_frequency: initial.sip_frequency ?? 'monthly' }
    : BLANK_FORM
  )
  const [saving, setSaving] = useState(false)
  const [fetchStatus, setFetchStatus] = useState(null)  // null | 'fetching' | 'ok' | 'error'
  const [fetchMsg, setFetchMsg] = useState('')
  // Insurance: policy term in years drives maturity_date
  const [policyTermYears, setPolicyTermYears] = useState(() => {
    if (initial?.type === 'insurance' && initial?.start_date && initial?.maturity_date) {
      const yrs = (new Date(initial.maturity_date) - new Date(initial.start_date)) / (365.25 * 24 * 60 * 60 * 1000)
      return String(Math.round(yrs))
    }
    return ''
  })

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))
  const meta = TYPE_META[form.type] || {}

  // Auto-compute current_value for FD
  useEffect(() => {
    if (form.type === 'fd' && form.invested_amount && form.interest_rate && form.start_date) {
      const cv = fdCurrentValue(Number(form.invested_amount), Number(form.interest_rate), form.start_date)
      set('current_value', cv.toFixed(2))
    }
  }, [form.type, form.invested_amount, form.interest_rate, form.start_date])

  // Auto-compute invested_amount for gold from units × purchase_price
  useEffect(() => {
    if (form.type === 'gold' && form.units && form.purchase_price) {
      set('invested_amount', (Number(form.units) * Number(form.purchase_price)).toFixed(2))
    }
  }, [form.type, form.units, form.purchase_price])

  // Insurance: auto-compute maturity_date from start_date + policy term years
  useEffect(() => {
    if (form.type === 'insurance' && form.start_date && policyTermYears) {
      const d = new Date(form.start_date)
      d.setFullYear(d.getFullYear() + Number(policyTermYears))
      set('maturity_date', d.toISOString().split('T')[0])
    }
  }, [form.type, form.start_date, policyTermYears])

  const handleFetchNav = async () => {
    if (!form.scheme_code) return
    setFetchStatus('fetching')
    try {
      const { nav, date, name } = await window.electronAPI.fetchMFNav(form.scheme_code)
      const cv = form.units ? (Number(form.units) * nav).toFixed(2) : nav.toFixed(2)
      set('current_value', cv)
      setFetchStatus('ok')
      setFetchMsg(`NAV: ₹${nav} as of ${date}`)
    } catch (e) {
      setFetchStatus('error')
      setFetchMsg(e.message)
    }
  }

  const handleFetchGold = async () => {
    setFetchStatus('fetching')
    try {
      const { inrPerGram } = await window.electronAPI.fetchGoldPrice()
      const purityFactor = form.purity === '22K' ? 22/24 : form.purity === '18K' ? 18/24 : 1
      const priceForPurity = Math.round(inrPerGram * purityFactor)
      set('purchase_price', priceForPurity)
      const cv = form.units ? (Number(form.units) * priceForPurity).toFixed(2) : priceForPurity.toFixed(2)
      set('current_value', cv)
      setFetchStatus('ok')
      setFetchMsg(`24K: ₹${inrPerGram.toLocaleString('en-IN')}/g`)
    } catch (e) {
      setFetchStatus('error')
      setFetchMsg(e.message)
    }
  }

  const fdMaturity = form.type === 'fd'
    ? calcFDMaturity(Number(form.invested_amount), Number(form.interest_rate), form.start_date, form.maturity_date)
    : 0

  const liveRet = calcReturn(Number(form.invested_amount) || 0, Number(form.current_value) || 0)

  const handleSave = async () => {
    if (!form.name.trim() || !form.type) return
    setSaving(true)
    const isRetirement = ['epf', 'ppf', 'nps'].includes(form.type)
    const isInsurance  = form.type === 'insurance'
    const currentVal   = Number(form.current_value) || 0
    try {
      if (isInsurance) {
        const totalPremium = Math.round(
          Number(form.monthly_sip_amount) * 12 * Number(form.interest_rate)
        )
        const displayVal = calcInsuranceDisplayValue({
          ...form,
          monthly_sip_amount: Number(form.monthly_sip_amount),
          interest_rate: Number(form.interest_rate),
          purchase_price: Number(form.purchase_price),
        })
        await onSave({
          ...form,
          invested_amount: totalPremium,
          current_value: displayVal,
          purchase_price: Number(form.purchase_price) || 0,
          monthly_sip_amount: Number(form.monthly_sip_amount) || 0,
          interest_rate: Number(form.interest_rate) || 0,
          units: 0,
          goal_id: form.goal_id || null,
        })
      } else {
        await onSave({
          ...form,
          sip_frequency: form.sip_frequency || 'monthly',
          invested_amount: isRetirement ? currentVal : (Number(form.invested_amount) || 0),
          current_value: currentVal,
          units: Number(form.units) || 0,
          purchase_price: Number(form.purchase_price) || 0,
          monthly_sip_amount: Number(form.monthly_sip_amount) || 0,
          interest_rate: Number(form.interest_rate) || 0,
          goal_id: form.goal_id || null,
        })
      }
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[92vh] flex flex-col" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 shrink-0">
          <h2 className="text-lg font-bold text-gray-900">{initial ? 'Edit Investment' : 'Add Investment'}</h2>
          <button onClick={onClose} className="p-1.5 rounded-xl hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors">
            <CloseIcon />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-6">
          <div className="grid grid-cols-5 gap-6">
            {/* ── Left: form ── */}
            <div className="col-span-3 space-y-4">

              {/* Type selector */}
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Investment Type</label>
                <div className="grid grid-cols-4 gap-1.5">
                  {Object.entries(TYPE_META).map(([key, m]) => (
                    <button key={key} onClick={() => set('type', key)}
                      className="px-2 py-2 rounded-xl text-xs font-semibold text-center transition-all border-2"
                      style={{
                        backgroundColor: form.type === key ? m.bg : 'transparent',
                        color: form.type === key ? m.color : '#9ca3af',
                        borderColor: form.type === key ? m.color : 'transparent',
                      }}>
                      {m.label}
                    </button>
                  ))}
                </div>
                <p className="text-[10px] text-gray-400 mt-1.5">
                  Investing via Zerodha Kite, Groww, Upstox, Angel One → choose <span className="font-semibold text-red-500">Stocks</span>
                </p>
              </div>

              {/* Name */}
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Name / Label</label>
                <input autoFocus className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-100"
                  placeholder={
                    form.type === 'mf_sip' ? 'e.g. Mirae Asset Large Cap'
                    : form.type === 'stocks' ? 'e.g. TCS'
                    : form.type === 'insurance' ? 'e.g. Bajaj Allianz Smart Wealth Goal'
                    : 'e.g. SBI FD 2024'
                  }
                  value={form.name} onChange={e => set('name', e.target.value)} />
              </div>

              {/* ── MF specific ── */}
              {(form.type === 'mf_sip' || form.type === 'mf_lumpsum') && (
                <div className="space-y-3 p-4 rounded-xl bg-blue-50/50 border border-blue-100">
                  <p className="text-xs font-semibold text-blue-700 uppercase tracking-wide">Mutual Fund Details</p>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Search Fund</label>
                    <MFSearchInput
                      value={form.bank_or_amc}
                      schemeCode={form.scheme_code}
                      onSelect={r => { set('scheme_code', r.schemeCode); set('bank_or_amc', r.schemeName); set('name', r.schemeName) }}
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">AMC / Fund House</label>
                      <input className="w-full px-3 py-2 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-100"
                        placeholder="e.g. Mirae Asset" value={form.provider} onChange={e => set('provider', e.target.value)} />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">Folio Number</label>
                      <input className="w-full px-3 py-2 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-100"
                        placeholder="123456789" value={form.account_number} onChange={e => set('account_number', e.target.value)} />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">Units Held</label>
                      <input type="number" className="w-full px-3 py-2 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-100"
                        placeholder="e.g. 245.678" value={form.units} onChange={e => set('units', e.target.value)} />
                    </div>
                    {form.type === 'mf_sip' && (
                      <div>
                        <label className="block text-xs text-gray-500 mb-1">
                          SIP Amount (₹/{form.sip_frequency === 'weekly' ? 'wk' : 'mo'})
                        </label>
                        <input type="number" className="w-full px-3 py-2 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-100"
                          placeholder={form.sip_frequency === 'weekly' ? 'e.g. 1250' : 'e.g. 5000'}
                          value={form.monthly_sip_amount} onChange={e => set('monthly_sip_amount', e.target.value)} />
                      </div>
                    )}
                  </div>
                  {form.type === 'mf_sip' && (
                    <div>
                      <label className="block text-xs text-gray-500 mb-1.5">SIP Frequency</label>
                      <div className="flex gap-2">
                        {[{ key: 'monthly', label: 'Monthly' }, { key: 'weekly', label: 'Weekly' }].map(({ key, label }) => (
                          <button key={key} type="button"
                            onClick={() => set('sip_frequency', key)}
                            className="flex-1 py-2 rounded-xl text-xs font-semibold transition-all border-2"
                            style={{
                              backgroundColor: form.sip_frequency === key ? '#eff6ff' : 'transparent',
                              color: form.sip_frequency === key ? '#3B82F6' : '#9ca3af',
                              borderColor: form.sip_frequency === key ? '#3B82F6' : 'transparent',
                            }}>
                            {label}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                  {form.scheme_code && (
                    <button onClick={handleFetchNav} disabled={fetchStatus === 'fetching'}
                      className="flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold text-blue-700 bg-white border border-blue-200 hover:bg-blue-50 transition-colors disabled:opacity-50">
                      <RefreshIcon spinning={fetchStatus === 'fetching'} />
                      Fetch Latest NAV {form.units ? `→ update current value` : ''}
                    </button>
                  )}
                </div>
              )}

              {/* ── Stocks specific ── */}
              {form.type === 'stocks' && (
                <div className="space-y-3 p-4 rounded-xl bg-red-50/40 border border-red-100">
                  <p className="text-xs font-semibold text-red-700 uppercase tracking-wide">Stock Portfolio</p>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Platform / App</label>
                    <input
                      className="w-full px-3 py-2 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-red-100"
                      placeholder="e.g. Zerodha Kite, INDmoney, Groww"
                      value={form.provider}
                      onChange={e => set('provider', e.target.value)}
                    />
                  </div>
                </div>
              )}

              {/* ── FD specific ── */}
              {form.type === 'fd' && (
                <div className="space-y-3 p-4 rounded-xl bg-purple-50/40 border border-purple-100">
                  <p className="text-xs font-semibold text-purple-700 uppercase tracking-wide">Fixed Deposit Details</p>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Bank Name</label>
                    <input className="w-full px-3 py-2 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-purple-100"
                      placeholder="e.g. SBI, HDFC Bank" value={form.bank_or_amc} onChange={e => set('bank_or_amc', e.target.value)} />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">Interest Rate (% p.a.)</label>
                      <input type="number" step="0.01" className="w-full px-3 py-2 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-purple-100"
                        placeholder="e.g. 6.5" value={form.interest_rate} onChange={e => set('interest_rate', e.target.value)} />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">Maturity Date</label>
                      <input type="date" className="w-full px-3 py-2 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-purple-100"
                        value={form.maturity_date} onChange={e => set('maturity_date', e.target.value)} />
                    </div>
                  </div>
                  {fdMaturity > 0 && (
                    <div className="bg-white rounded-xl px-3 py-2.5 flex items-center justify-between">
                      <p className="text-xs text-gray-500">Maturity Amount</p>
                      <p className="text-sm font-bold text-purple-700">{fmt(fdMaturity)}</p>
                    </div>
                  )}
                </div>
              )}

              {/* ── Gold specific ── */}
              {form.type === 'gold' && (
                <div className="space-y-3 p-4 rounded-xl bg-yellow-50/50 border border-yellow-100">
                  <p className="text-xs font-semibold text-yellow-700 uppercase tracking-wide">Gold Details</p>
                  <div className="grid grid-cols-3 gap-3">
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">Weight (grams)</label>
                      <input type="number" step="0.001" className="w-full px-3 py-2 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-yellow-100"
                        placeholder="e.g. 10" value={form.units} onChange={e => set('units', e.target.value)} />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">Buy Price/gram (₹)</label>
                      <input type="number" className="w-full px-3 py-2 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-yellow-100"
                        placeholder="e.g. 6000" value={form.purchase_price} onChange={e => set('purchase_price', e.target.value)} />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">Purity</label>
                      <select className="w-full px-3 py-2 rounded-xl border border-gray-200 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-yellow-100"
                        value={form.purity} onChange={e => set('purity', e.target.value)}>
                        {['24K', '22K', '18K'].map(p => <option key={p}>{p}</option>)}
                      </select>
                    </div>
                  </div>
                  <button onClick={handleFetchGold} disabled={fetchStatus === 'fetching'}
                    className="flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold text-yellow-700 bg-white border border-yellow-200 hover:bg-yellow-50 transition-colors disabled:opacity-50">
                    <RefreshIcon spinning={fetchStatus === 'fetching'} />
                    Fetch Today's Gold Price
                  </button>
                </div>
              )}

              {/* ── Manual types (EPF/PPF/NPS) ── */}
              {['epf', 'ppf', 'nps'].includes(form.type) && (
                <div className="space-y-3 p-4 rounded-xl bg-green-50/40 border border-green-100">
                  <p className="text-xs font-semibold text-green-700 uppercase tracking-wide">{TYPE_META[form.type]?.label} Details</p>

                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Account / UAN Number</label>
                    <input className="w-full px-3 py-2 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-green-100"
                      placeholder="Account number" value={form.account_number} onChange={e => set('account_number', e.target.value)} />
                  </div>

                  <div className="grid grid-cols-2 gap-3 items-end">
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">Current Balance (₹)</label>
                      <input type="number" className="w-full px-3 py-2 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-green-100"
                        placeholder="Latest passbook value"
                        value={form.current_value} onChange={e => set('current_value', e.target.value)} />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">
                        Interest Rate (% p.a.)
                        {form.type === 'epf' && <span className="ml-1 text-green-600 whitespace-nowrap">· EPF: 8.25%</span>}
                        {form.type === 'ppf' && <span className="ml-1 text-green-600 whitespace-nowrap">· PPF: 7.1%</span>}
                      </label>
                      <input type="number" step="0.01" className="w-full px-3 py-2 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-green-100"
                        placeholder={form.type === 'epf' ? '8.25' : form.type === 'ppf' ? '7.1' : 'e.g. 9.0'}
                        value={form.interest_rate} onChange={e => set('interest_rate', e.target.value)} />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs text-gray-500 mb-1">
                      {form.type === 'epf' ? 'Monthly Contribution (Employee + Employer ₹)' : 'Monthly Deposit (₹)'}
                    </label>
                    <input type="number" className="w-full px-3 py-2 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-green-100"
                      placeholder={form.type === 'epf' ? 'e.g. 4800' : 'e.g. 12500'}
                      value={form.monthly_sip_amount} onChange={e => set('monthly_sip_amount', e.target.value)} />
                  </div>
                </div>
              )}

              {/* ── Insurance / ULIP specific ── */}
              {form.type === 'insurance' && (() => {
                const monthly      = Number(form.monthly_sip_amount) || 0
                const premYears    = Number(form.interest_rate) || 0
                const matAmt       = Number(form.purchase_price) || 0
                const totalPremium = Math.round(monthly * 12 * premYears)
                return (
                  <div className="space-y-3 p-4 rounded-xl bg-sky-50/40 border border-sky-100">
                    <p className="text-xs font-semibold text-sky-700 uppercase tracking-wide">Insurance / ULIP Details</p>

                    <div>
                      <label className="block text-xs text-gray-500 mb-1">Insurance Company / Plan Name</label>
                      <input className="w-full px-3 py-2 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-sky-100"
                        placeholder="e.g. Bajaj Allianz Life" value={form.bank_or_amc} onChange={e => set('bank_or_amc', e.target.value)} />
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs text-gray-500 mb-1">Monthly Premium (₹)</label>
                        <input type="number" className="w-full px-3 py-2 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-sky-100"
                          placeholder="e.g. 4166.66" value={form.monthly_sip_amount} onChange={e => set('monthly_sip_amount', e.target.value)} />
                      </div>
                      <div>
                        <label className="block text-xs text-gray-500 mb-1">Premium Payment Term (years)</label>
                        <input type="number" className="w-full px-3 py-2 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-sky-100"
                          placeholder="e.g. 8" value={form.interest_rate} onChange={e => set('interest_rate', e.target.value)} />
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs text-gray-500 mb-1">Policy Term (years)</label>
                        <input type="number" className="w-full px-3 py-2 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-sky-100"
                          placeholder="e.g. 15" value={policyTermYears} onChange={e => setPolicyTermYears(e.target.value)} />
                      </div>
                      <div>
                        <label className="block text-xs text-gray-500 mb-1">Maturity Amount (₹)</label>
                        <input type="number" className="w-full px-3 py-2 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-sky-100"
                          placeholder="e.g. 1000000" value={form.purchase_price} onChange={e => set('purchase_price', e.target.value)} />
                      </div>
                    </div>

                    <div>
                      <label className="block text-xs text-gray-500 mb-1">Policy Start Date</label>
                      <input type="date" className="w-full px-3 py-2 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-sky-100"
                        value={form.start_date} onChange={e => set('start_date', e.target.value)} />
                    </div>

                    {totalPremium > 0 && (
                      <div className="grid grid-cols-2 gap-2">
                        <div className="bg-white rounded-xl px-3 py-2 flex flex-col">
                          <p className="text-xs text-gray-400">Total Premium</p>
                          <p className="text-sm font-bold text-sky-700">{fmt(totalPremium)}</p>
                        </div>
                        {matAmt > 0 && (
                          <div className="bg-white rounded-xl px-3 py-2 flex flex-col">
                            <p className="text-xs text-gray-400">Maturity on</p>
                            <p className="text-sm font-bold text-sky-700">{form.maturity_date ? formatDate(form.maturity_date) : '—'}</p>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )
              })()}

              {/* API fetch status */}
              {fetchStatus && (
                <div className={`flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-medium ${fetchStatus === 'ok' ? 'bg-green-50 text-green-700' : fetchStatus === 'error' ? 'bg-red-50 text-red-600' : 'bg-blue-50 text-blue-600'}`}>
                  {fetchStatus === 'fetching' && <span className="w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin shrink-0" />}
                  {fetchStatus === 'ok' && '✓'} {fetchStatus === 'error' && '✗'} {fetchMsg}
                </div>
              )}

              {/* Common fields */}
              <div className="border-t border-gray-100 pt-4 space-y-4">
                {!['epf', 'ppf', 'nps', 'insurance'].includes(form.type) && (
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Invested Amount (₹)</label>
                      <input type="number" className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-100"
                        placeholder="Total invested" value={form.invested_amount} onChange={e => set('invested_amount', e.target.value)} />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Current Value (₹)</label>
                      <input type="number" className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-100"
                        placeholder="Current market value" value={form.current_value} onChange={e => set('current_value', e.target.value)} />
                    </div>
                  </div>
                )}

                {form.type !== 'insurance' && (
                  <div>
                    <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Start Date</label>
                    <input type="date" className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-100"
                      value={form.start_date} onChange={e => set('start_date', e.target.value)} />
                  </div>
                )}

                <div>
                  <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Link to Goal</label>
                  <select className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-100"
                    value={form.goal_id} onChange={e => set('goal_id', e.target.value)}>
                    <option value="">— No Goal —</option>
                    {goals.map(g => <option key={g.id} value={g.id}>{g.emoji || '🎯'} {g.title}</option>)}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Notes</label>
                  <textarea rows={2} className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-100 resize-none"
                    placeholder="Optional notes…" value={form.notes} onChange={e => set('notes', e.target.value)} />
                </div>
              </div>
            </div>

            {/* ── Right: live preview ── */}
            <div className="col-span-2">
              <div className="sticky top-0 rounded-2xl p-4 space-y-3" style={{ backgroundColor: (meta.bg || '#f9fafb') }}>
                <div>
                  <span className="text-xs font-semibold uppercase tracking-wide" style={{ color: meta.color || '#6b7280' }}>
                    {meta.label || form.type}
                  </span>
                  <p className="font-semibold text-gray-900 mt-0.5 text-sm">{form.name || 'Investment Preview'}</p>
                </div>

                {form.type === 'insurance' ? (() => {
                  const monthly    = Number(form.monthly_sip_amount) || 0
                  const premYears  = Number(form.interest_rate) || 0
                  const matAmt     = Number(form.purchase_price) || 0
                  const totalPrem  = Math.round(monthly * 12 * premYears)
                  const liveDeposit = calcInsuranceDisplayValue({
                    ...form,
                    monthly_sip_amount: monthly,
                    interest_rate: premYears,
                    purchase_price: matAmt,
                  })
                  return (
                    <>
                      <div className="bg-white rounded-xl p-3 shadow-sm">
                        <p className="text-xs text-gray-400 mb-0.5">Monthly Premium</p>
                        <p className="text-xl font-bold text-sky-700">{fmt(monthly)}</p>
                      </div>
                      <div className="bg-white rounded-xl p-3 shadow-sm">
                        <p className="text-xs text-gray-400 mb-0.5">Total Premium (8 yrs)</p>
                        <p className="text-xl font-bold text-gray-900">{fmt(totalPrem)}</p>
                      </div>
                      <div className="bg-white rounded-xl p-3 shadow-sm">
                        <p className="text-xs text-gray-400 mb-0.5">Deposited So Far</p>
                        <p className="text-xl font-bold text-gray-900">{fmt(liveDeposit)}</p>
                      </div>
                      {matAmt > 0 && (
                        <div className="bg-white rounded-xl p-3 shadow-sm">
                          <p className="text-xs text-gray-400 mb-0.5">Maturity Amount</p>
                          <p className="text-xl font-bold text-sky-700">{fmt(matAmt)}</p>
                          <p className="text-xs text-gray-400">{formatDate(form.maturity_date)}</p>
                        </div>
                      )}
                    </>
                  )
                })() : ['epf', 'ppf', 'nps'].includes(form.type) ? (
                  <div className="bg-white rounded-xl p-3 shadow-sm">
                    <p className="text-xs text-gray-400 mb-0.5">Current Balance</p>
                    <p className="text-xl font-bold text-gray-900">{fmt(Number(form.current_value) || 0)}</p>
                  </div>
                ) : (
                  <>
                    <div className="bg-white rounded-xl p-3 shadow-sm">
                      <p className="text-xs text-gray-400 mb-0.5">Invested</p>
                      <p className="text-xl font-bold text-gray-900">{fmt(Number(form.invested_amount) || 0)}</p>
                    </div>

                    <div className="bg-white rounded-xl p-3 shadow-sm">
                      <p className="text-xs text-gray-400 mb-0.5">Current Value</p>
                      <p className="text-xl font-bold text-gray-900">{fmt(Number(form.current_value) || 0)}</p>
                    </div>

                    {Number(form.invested_amount) > 0 && (
                      <div className="bg-white rounded-xl p-3 shadow-sm">
                        <p className="text-xs text-gray-400 mb-0.5">Returns</p>
                        <p className={`text-xl font-bold ${liveRet.amt >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                          {liveRet.amt >= 0 ? '+' : ''}{fmt(liveRet.amt)}
                        </p>
                        <p className={`text-xs font-semibold ${liveRet.pct >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                          {pct(liveRet.pct)}
                        </p>
                      </div>
                    )}
                  </>
                )}

                {form.type === 'fd' && fdMaturity > 0 && (
                  <div className="bg-white rounded-xl p-3 shadow-sm">
                    <p className="text-xs text-gray-400 mb-0.5">Maturity Amount</p>
                    <p className="text-lg font-bold text-purple-700">{fmt(fdMaturity)}</p>
                    <p className="text-xs text-gray-400">{formatDate(form.maturity_date)}</p>
                  </div>
                )}

                {(form.type === 'mf_sip' || ['epf', 'ppf', 'nps'].includes(form.type)) && form.monthly_sip_amount > 0 && (
                  <div className="bg-white rounded-xl p-3 shadow-sm">
                    <p className="text-xs text-gray-400 mb-0.5">
                      {['epf', 'ppf', 'nps'].includes(form.type) ? 'Monthly Contribution' : 'Monthly SIP'}
                    </p>
                    <p className="text-lg font-bold text-green-700">{fmt(Number(form.monthly_sip_amount))}</p>
                  </div>
                )}

                {['epf', 'ppf', 'nps'].includes(form.type) && form.interest_rate > 0 && (
                  <div className="bg-white rounded-xl p-3 shadow-sm">
                    <p className="text-xs text-gray-400 mb-0.5">Interest Rate</p>
                    <p className="text-lg font-bold text-green-700">{Number(form.interest_rate).toFixed(2)}% p.a.</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-gray-100 shrink-0">
          <button onClick={onClose} className="px-5 py-2.5 rounded-xl text-sm font-semibold text-gray-600 hover:bg-gray-100 transition-colors">Cancel</button>
          <button onClick={handleSave} disabled={saving || !form.name.trim()}
            className="px-5 py-2.5 rounded-xl text-sm font-semibold text-white hover:opacity-90 transition-opacity disabled:opacity-50"
            style={{ backgroundColor: meta.color || '#6C63FF' }}>
            {saving ? 'Saving…' : initial ? 'Save Changes' : 'Add Investment'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Main Investments page ─────────────────────────────────────────────────
export default function Investments() {
  const [investments, setInvestments] = useState([])
  const [goals, setGoals] = useState([])
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('all')
  const [search, setSearch] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [editInv, setEditInv] = useState(null)
  const [quickInv, setQuickInv] = useState(null)
  const [refreshingId, setRefreshingId] = useState(null)
  const [toast, setToast] = useState(null)
  const [chartTab, setChartTab] = useState('allocation')

  const showToast = (msg, type = 'ok') => {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 3000)
  }

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [inv, g, prof] = await Promise.all([
        window.electronAPI.getAllInvestments(),
        window.electronAPI.getAllGoals(),
        window.electronAPI.getProfile(),
      ])
      setInvestments(inv || [])
      setGoals(g || [])
      setProfile(prof || null)
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const handleSave = async (data) => {
    if (editInv) {
      await window.electronAPI.updateInvestment({ ...data, id: editInv.id })
    } else {
      await window.electronAPI.createInvestment(data)
    }
    setShowForm(false)
    setEditInv(null)
    await load()
    showToast(editInv ? 'Investment updated' : 'Investment added')
  }

  const handleQuickUpdate = async (id, currentValue, units) => {
    const inv = investments.find(i => i.id === id)
    if (!inv) return
    await window.electronAPI.updateInvestment({ ...inv, current_value: currentValue, units })
    setQuickInv(null)
    await load()
    showToast('Value updated')
  }

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this investment?')) return
    await window.electronAPI.deleteInvestment(id)
    await load()
  }

  const handleRefresh = async (inv) => {
    setRefreshingId(inv.id)
    try {
      let newValue = inv.current_value

      if ((inv.type === 'mf_sip' || inv.type === 'mf_lumpsum') && inv.scheme_code) {
        const { nav } = await window.electronAPI.fetchMFNav(inv.scheme_code)
        newValue = inv.units ? inv.units * nav : nav
        showToast(`NAV updated: ₹${nav}`)
      } else if (inv.type === 'gold') {
        const { inrPerGram } = await window.electronAPI.fetchGoldPrice()
        const purityFactor = inv.purity === '22K' ? 22/24 : inv.purity === '18K' ? 18/24 : 1
        const priceForPurity = inrPerGram * purityFactor
        newValue = inv.units ? inv.units * priceForPurity : priceForPurity
        showToast(`Gold price updated: ₹${Math.round(inrPerGram).toLocaleString('en-IN')}/g`)
      } else {
        showToast('Auto-refresh not available for this type', 'warn')
        return
      }

      await window.electronAPI.updateInvestment({ ...inv, current_value: newValue })
      await load()
    } catch (e) {
      showToast(`Fetch failed: ${e.message}`, 'error')
    } finally {
      setRefreshingId(null)
    }
  }

  const searchLower = search.trim().toLowerCase()
  const filtered = investments.filter(i => {
    if (!(TYPE_GROUPS[filter]?.(i.type) ?? true)) return false
    if (!searchLower) return true
    return [i.name, i.bank_or_amc, i.provider, i.account_number, i.notes, TYPE_META[i.type]?.label]
      .some(field => field?.toLowerCase().includes(searchLower))
  })

  return (
    <div className="p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Investments</h2>
          <p className="mt-1 text-sm text-gray-500">MF · Stocks · FD · Gold · EPF · PPF · NPS</p>
        </div>
        <button onClick={() => { setEditInv(null); setShowForm(true) }}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-white text-sm font-semibold hover:opacity-90 transition-opacity"
          style={{ backgroundColor: '#6C63FF' }}>
          <span className="text-base font-bold leading-none">+</span>
          Add Investment
        </button>
      </div>

      {/* Allocation Health Check */}
      <AllocationHealthCheck
        investments={investments}
        profile={profile}
        goals={goals}
        onRefresh={load}
        onAddSIP={(amount) => {
          setEditInv({ type: 'mf_sip', monthly_sip_amount: String(Math.round(amount)), sip_frequency: 'monthly' })
          setShowForm(true)
        }}
      />

      {/* Summary bar */}
      {investments.length > 0 && <SummaryBar investments={investments} />}

      {/* Tabbed charts */}
      {investments.length > 0 && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm mb-4 overflow-hidden">
          <div className="flex gap-0 border-b border-gray-100">
            {[
              { key: 'allocation', label: 'Allocation' },
              { key: 'sip',        label: 'Monthly SIP' },
              { key: 'mfsip',      label: 'MF SIP Funds' },
              { key: 'categories', label: 'Fund Buckets' },
            ].map(t => (
              <button
                key={t.key}
                onClick={() => setChartTab(t.key)}
                className="px-5 py-3 text-xs font-semibold transition-all border-b-2"
                style={{
                  borderBottomColor: chartTab === t.key ? '#6C63FF' : 'transparent',
                  color: chartTab === t.key ? '#6C63FF' : '#9ca3af',
                }}
              >
                {t.label}
              </button>
            ))}
          </div>
          <div className="p-4">
            {chartTab === 'allocation' && <AllocationChart investments={investments} />}
            {chartTab === 'sip'        && <MonthlySIPSummary investments={investments} />}
            {chartTab === 'mfsip'      && <MFSIPChart investments={investments} />}
            {chartTab === 'categories' && <FundCategoriesView investments={investments} />}
          </div>
        </div>
      )}

      {/* Filter tabs + search */}
      <div className="flex items-center gap-3 mb-4">
        <div className="flex gap-1 bg-gray-100 rounded-xl p-1 shrink-0">
          {FILTER_TABS.map(t => (
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
        <div className="relative flex-1 max-w-xs">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none">
            <SearchIcon />
          </span>
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search investments…"
            className="w-full pl-9 pr-8 py-1.5 rounded-xl border border-gray-200 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-300 transition-colors"
          />
          {search && (
            <button onClick={() => setSearch('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors text-base leading-none">
              ×
            </button>
          )}
        </div>
      </div>

      {/* Cards grid */}
      {loading ? (
        <div className="grid grid-cols-3 gap-3">
          {[1, 2, 3, 4, 5, 6].map(i => <div key={i} className="h-24 bg-gray-100 rounded-xl animate-pulse" />)}
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex items-center justify-center h-56 rounded-2xl bg-white border border-dashed border-gray-200">
          <div className="text-center">
            <p className="text-4xl mb-3">{searchLower ? '🔍' : '📈'}</p>
            <p className="text-base font-semibold text-gray-700">
              {searchLower ? `No results for "${search}"` : 'No investments here'}
            </p>
            <p className="text-sm text-gray-400 mt-1">
              {searchLower
                ? 'Try a different name, provider, or type'
                : filter === 'all' ? 'Tap + Add Investment to get started' : `No ${FILTER_TABS.find(t => t.key === filter)?.label} found`}
            </p>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-3 gap-3">
          {filtered.map(inv => (
            <InvestmentCard key={inv.id} inv={inv}
              onEdit={(i) => { setEditInv(i); setShowForm(true) }}
              onDelete={handleDelete}
              onRefresh={handleRefresh}
              refreshing={refreshingId === inv.id}
              onClick={() => setQuickInv(inv)}
            />
          ))}
        </div>
      )}

      {/* Quick value update modal */}
      {quickInv && (
        <QuickUpdateModal
          inv={quickInv}
          onSave={handleQuickUpdate}
          onClose={() => setQuickInv(null)}
        />
      )}

      {/* Full edit form modal */}
      {showForm && (
        <InvestmentForm
          initial={editInv}
          goals={goals.filter(g => !g.is_achieved)}
          onSave={handleSave}
          onClose={() => { setShowForm(false); setEditInv(null) }}
        />
      )}

      {/* Toast */}
      {toast && (
        <div className="fixed bottom-6 right-6 z-50 flex items-center gap-2 px-4 py-3 rounded-xl shadow-lg text-sm font-semibold text-white animate-in"
          style={{ backgroundColor: toast.type === 'error' ? '#EF4444' : toast.type === 'warn' ? '#F59E0B' : '#10B981' }}>
          {toast.type === 'error' ? '✗' : '✓'} {toast.msg}
        </div>
      )}
    </div>
  )
}
