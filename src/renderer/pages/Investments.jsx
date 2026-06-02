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

// ── Type metadata ─────────────────────────────────────────────────────────
const TYPE_META = {
  mf_sip:    { label: 'MF SIP',   color: '#6C63FF', bg: '#f0efff', group: 'mf' },
  mf_lumpsum:{ label: 'MF Lump',  color: '#3B82F6', bg: '#eff6ff', group: 'mf' },
  stocks:    { label: 'Stocks',   color: '#EF4444', bg: '#fef2f2', group: 'stocks' },
  fd:        { label: 'FD',       color: '#8B5CF6', bg: '#f5f3ff', group: 'fd' },
  epf:       { label: 'EPF',      color: '#10B981', bg: '#ecfdf5', group: 'others' },
  ppf:       { label: 'PPF',      color: '#059669', bg: '#ecfdf5', group: 'others' },
  nps:       { label: 'NPS',      color: '#F59E0B', bg: '#fffbeb', group: 'others' },
  gold:      { label: 'Gold',     color: '#D97706', bg: '#fffbeb', group: 'others' },
}

const TYPE_GROUPS = {
  all:    () => true,
  mf:     t => TYPE_META[t]?.group === 'mf',
  stocks: t => t === 'stocks',
  fd:     t => t === 'fd',
  others: t => TYPE_META[t]?.group === 'others',
}

const FILTER_TABS = [
  { key: 'all',    label: 'All' },
  { key: 'mf',     label: 'Mutual Funds' },
  { key: 'stocks', label: 'Stocks' },
  { key: 'fd',     label: 'Fixed Deposits' },
  { key: 'others', label: 'Others' },
]

const BLANK_FORM = {
  name: '', type: 'mf_sip',
  provider: '', bank_or_amc: '', account_number: '',
  invested_amount: '', current_value: '',
  monthly_sip_amount: '', start_date: '', maturity_date: '',
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

// ── Summary bar ───────────────────────────────────────────────────────────
function SummaryBar({ investments }) {
  const totalInvested = investments.reduce((s, i) => s + (i.invested_amount || 0), 0)
  const totalCurrent  = investments.reduce((s, i) => s + (i.current_value || 0), 0)
  const { amt, pct: retPct } = calcReturn(totalInvested, totalCurrent)
  const positive = amt >= 0

  return (
    <div className="bg-white rounded-2xl p-5 border border-gray-100 shadow-sm mb-6 flex items-center gap-8 flex-wrap">
      <div>
        <p className="text-xs text-gray-400 mb-0.5">Total Invested</p>
        <p className="text-2xl font-bold text-gray-900">{fmt(totalInvested)}</p>
      </div>
      <div className="w-px h-10 bg-gray-200" />
      <div>
        <p className="text-xs text-gray-400 mb-0.5">Current Value</p>
        <p className="text-2xl font-bold text-gray-900">{fmt(totalCurrent)}</p>
      </div>
      <div className="w-px h-10 bg-gray-200" />
      <div>
        <p className="text-xs text-gray-400 mb-0.5">Overall Returns</p>
        <p className={`text-2xl font-bold ${positive ? 'text-green-600' : 'text-red-600'}`}>
          {positive ? '+' : ''}{fmt(amt)}
        </p>
      </div>
      <div className={`ml-auto px-3 py-2 rounded-xl text-sm font-bold ${positive ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-600'}`}>
        {pct(retPct)}
      </div>
      <div className="text-xs text-gray-400">{investments.length} investment{investments.length !== 1 ? 's' : ''}</div>
    </div>
  )
}

// ── Investment card ───────────────────────────────────────────────────────
function InvestmentCard({ inv, onEdit, onDelete, onRefresh, refreshing }) {
  const meta = TYPE_META[inv.type] || { label: inv.type, color: '#6b7280', bg: '#f9fafb' }
  const ret = calcReturn(inv.invested_amount, inv.current_value)
  const positive = ret.amt >= 0
  const showCAGR = ['mf_lumpsum', 'fd', 'stocks', 'gold', 'epf', 'ppf', 'nps'].includes(inv.type)
  const cagr = showCAGR ? calcCAGR(inv.invested_amount, inv.current_value, inv.start_date) : null
  const canAutoRefresh = ['mf_sip', 'mf_lumpsum', 'stocks', 'gold'].includes(inv.type)

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm hover:shadow-md transition-shadow duration-200 group">
      {/* Card header */}
      <div className="flex items-start justify-between p-5 pb-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <h3 className="font-semibold text-gray-900 truncate">{inv.name}</h3>
            <span className="shrink-0 px-2 py-0.5 rounded-full text-xs font-semibold"
              style={{ backgroundColor: meta.bg, color: meta.color }}>
              {meta.label}
            </span>
          </div>
          <p className="text-xs text-gray-400 truncate">
            {[inv.bank_or_amc || inv.provider, inv.ticker_symbol, inv.account_number].filter(Boolean).join(' · ') || '—'}
          </p>
        </div>
        <div className="flex gap-1 ml-2 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
          {canAutoRefresh && (
            <button onClick={() => onRefresh(inv)}
              disabled={refreshing}
              title="Refresh price"
              className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-blue-500 transition-colors disabled:opacity-50">
              <RefreshIcon spinning={refreshing} />
            </button>
          )}
          <button onClick={() => onEdit(inv)} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-700 transition-colors">
            <EditIcon />
          </button>
          <button onClick={() => onDelete(inv.id)} className="p-1.5 rounded-lg hover:bg-red-50 text-gray-400 hover:text-red-500 transition-colors">
            <TrashIcon />
          </button>
        </div>
      </div>

      {/* Amounts row */}
      <div className="grid grid-cols-2 gap-px bg-gray-100 mx-5 rounded-xl overflow-hidden mb-4">
        <div className="bg-white px-3 py-2.5">
          <p className="text-xs text-gray-400 mb-0.5">Invested</p>
          <p className="text-base font-semibold text-gray-900">{fmt(inv.invested_amount)}</p>
        </div>
        <div className="bg-white px-3 py-2.5">
          <p className="text-xs text-gray-400 mb-0.5">Current Value</p>
          <p className="text-base font-semibold text-gray-900">{fmt(inv.current_value)}</p>
        </div>
      </div>

      {/* Returns row */}
      <div className="flex items-center justify-between px-5 mb-4">
        <div className={`flex items-center gap-2 px-3 py-1.5 rounded-xl text-sm font-semibold ${positive ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-600'}`}>
          <span>{positive ? '▲' : '▼'} {fmt(Math.abs(ret.amt))}</span>
          <span className="text-xs opacity-75">({pct(ret.pct)})</span>
        </div>
        {cagr !== null && (
          <div className="text-right">
            <p className={`text-sm font-bold ${cagr >= 0 ? 'text-green-600' : 'text-red-600'}`}>{pct(cagr)}</p>
            <p className="text-xs text-gray-400">CAGR</p>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between px-5 pb-4">
        <div className="flex items-center gap-2 flex-wrap">
          {inv.goal_title && (
            <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-purple-50 text-purple-700">
              🎯 {inv.goal_title}
            </span>
          )}
          {inv.type === 'mf_sip' && inv.monthly_sip_amount > 0 && (
            <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-blue-50 text-blue-600">
              SIP {fmt(inv.monthly_sip_amount)}/mo
            </span>
          )}
        </div>
        <p className="text-xs text-gray-400 shrink-0">↻ {timeAgo(inv.last_updated_at)}</p>
      </div>
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
    ? { ...BLANK_FORM, ...initial, goal_id: initial.goal_id ?? '' }
    : BLANK_FORM
  )
  const [saving, setSaving] = useState(false)
  const [fetchStatus, setFetchStatus] = useState(null)  // null | 'fetching' | 'ok' | 'error'
  const [fetchMsg, setFetchMsg] = useState('')

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))
  const meta = TYPE_META[form.type] || {}

  // Auto-compute current_value for FD
  useEffect(() => {
    if (form.type === 'fd' && form.invested_amount && form.interest_rate && form.start_date) {
      const cv = form.maturity_date
        ? fdCurrentValue(Number(form.invested_amount), Number(form.interest_rate), form.start_date)
        : fdCurrentValue(Number(form.invested_amount), Number(form.interest_rate), form.start_date)
      set('current_value', cv.toFixed(2))
    }
  }, [form.type, form.invested_amount, form.interest_rate, form.start_date])

  // Auto-compute invested_amount for stocks/gold from units × purchase_price
  useEffect(() => {
    if (['stocks', 'gold'].includes(form.type) && form.units && form.purchase_price) {
      set('invested_amount', (Number(form.units) * Number(form.purchase_price)).toFixed(2))
    }
  }, [form.type, form.units, form.purchase_price])

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

  const handleFetchStock = async () => {
    if (!form.ticker_symbol) return
    setFetchStatus('fetching')
    try {
      const { price } = await window.electronAPI.fetchStockPrice(form.ticker_symbol, form.exchange)
      const cv = form.units ? (Number(form.units) * price).toFixed(2) : price.toFixed(2)
      set('current_value', cv)
      setFetchStatus('ok')
      setFetchMsg(`Price: ₹${price.toLocaleString('en-IN')}`)
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
    try {
      await onSave({
        ...form,
        invested_amount: Number(form.invested_amount) || 0,
        current_value: Number(form.current_value) || 0,
        units: Number(form.units) || 0,
        purchase_price: Number(form.purchase_price) || 0,
        monthly_sip_amount: Number(form.monthly_sip_amount) || 0,
        interest_rate: Number(form.interest_rate) || 0,
        goal_id: form.goal_id || null,
      })
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
              </div>

              {/* Name */}
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Name / Label</label>
                <input autoFocus className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-100"
                  placeholder={form.type === 'mf_sip' ? 'e.g. Mirae Asset Large Cap' : form.type === 'stocks' ? 'e.g. TCS' : 'e.g. SBI FD 2024'}
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
                        <label className="block text-xs text-gray-500 mb-1">Monthly SIP (₹)</label>
                        <input type="number" className="w-full px-3 py-2 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-100"
                          placeholder="e.g. 5000" value={form.monthly_sip_amount} onChange={e => set('monthly_sip_amount', e.target.value)} />
                      </div>
                    )}
                  </div>
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
                  <p className="text-xs font-semibold text-red-700 uppercase tracking-wide">Stock Details</p>
                  <div className="grid grid-cols-3 gap-3">
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">Exchange</label>
                      <div className="flex rounded-xl border border-gray-200 overflow-hidden">
                        {['NSE', 'BSE'].map(ex => (
                          <button key={ex} onClick={() => set('exchange', ex)}
                            className="flex-1 py-2 text-xs font-bold transition-colors"
                            style={{ backgroundColor: form.exchange === ex ? '#EF4444' : 'transparent', color: form.exchange === ex ? '#fff' : '#6b7280' }}>
                            {ex}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">Ticker Symbol</label>
                      <input className="w-full px-3 py-2 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-red-100 uppercase"
                        placeholder="TCS" value={form.ticker_symbol}
                        onChange={e => { set('ticker_symbol', e.target.value.toUpperCase()); set('name', e.target.value.toUpperCase()) }} />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">Quantity</label>
                      <input type="number" className="w-full px-3 py-2 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-red-100"
                        placeholder="e.g. 10" value={form.units} onChange={e => set('units', e.target.value)} />
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Avg Buy Price (₹)</label>
                    <input type="number" className="w-full px-3 py-2 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-red-100"
                      placeholder="e.g. 3500" value={form.purchase_price} onChange={e => set('purchase_price', e.target.value)} />
                  </div>
                  {form.ticker_symbol && (
                    <button onClick={handleFetchStock} disabled={fetchStatus === 'fetching'}
                      className="flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold text-red-700 bg-white border border-red-200 hover:bg-red-50 transition-colors disabled:opacity-50">
                      <RefreshIcon spinning={fetchStatus === 'fetching'} />
                      Fetch {form.exchange} Price for {form.ticker_symbol || '—'}
                    </button>
                  )}
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
                  <p className="text-xs text-gray-400">Current value is updated manually — enter the latest balance below.</p>
                </div>
              )}

              {/* API fetch status */}
              {fetchStatus && (
                <div className={`flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-medium ${fetchStatus === 'ok' ? 'bg-green-50 text-green-700' : fetchStatus === 'error' ? 'bg-red-50 text-red-600' : 'bg-blue-50 text-blue-600'}`}>
                  {fetchStatus === 'fetching' && <span className="w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin shrink-0" />}
                  {fetchStatus === 'ok' && '✓'} {fetchStatus === 'error' && '✗'} {fetchMsg}
                </div>
              )}

              {/* Common fields */}
              <div className="border-t border-gray-100 pt-4 space-y-4">
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

                <div>
                  <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Start Date</label>
                  <input type="date" className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-100"
                    value={form.start_date} onChange={e => set('start_date', e.target.value)} />
                </div>

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

                <div className="bg-white rounded-xl p-3 shadow-sm">
                  <p className="text-xs text-gray-400 mb-0.5">Invested</p>
                  <p className="text-xl font-bold text-gray-900">{fmt(Number(form.invested_amount) || 0)}</p>
                </div>

                <div className="bg-white rounded-xl p-3 shadow-sm">
                  <p className="text-xs text-gray-400 mb-0.5">Current Value</p>
                  <p className="text-xl font-bold text-gray-900">{fmt(Number(form.current_value) || 0)}</p>
                </div>

                {Number(form.invested_amount) > 0 && (
                  <div className={`bg-white rounded-xl p-3 shadow-sm`}>
                    <p className="text-xs text-gray-400 mb-0.5">Returns</p>
                    <p className={`text-xl font-bold ${liveRet.amt >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                      {liveRet.amt >= 0 ? '+' : ''}{fmt(liveRet.amt)}
                    </p>
                    <p className={`text-xs font-semibold ${liveRet.pct >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                      {pct(liveRet.pct)}
                    </p>
                  </div>
                )}

                {form.type === 'fd' && fdMaturity > 0 && (
                  <div className="bg-white rounded-xl p-3 shadow-sm">
                    <p className="text-xs text-gray-400 mb-0.5">Maturity Amount</p>
                    <p className="text-lg font-bold text-purple-700">{fmt(fdMaturity)}</p>
                    <p className="text-xs text-gray-400">{formatDate(form.maturity_date)}</p>
                  </div>
                )}

                {form.type === 'mf_sip' && form.monthly_sip_amount > 0 && (
                  <div className="bg-white rounded-xl p-3 shadow-sm">
                    <p className="text-xs text-gray-400 mb-0.5">Monthly SIP</p>
                    <p className="text-lg font-bold text-blue-700">{fmt(Number(form.monthly_sip_amount))}</p>
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
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('all')
  const [showForm, setShowForm] = useState(false)
  const [editInv, setEditInv] = useState(null)
  const [refreshingId, setRefreshingId] = useState(null)
  const [toast, setToast] = useState(null)

  const showToast = (msg, type = 'ok') => {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 3000)
  }

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [inv, g] = await Promise.all([
        window.electronAPI.getAllInvestments(),
        window.electronAPI.getAllGoals(),
      ])
      setInvestments(inv || [])
      setGoals(g || [])
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
      } else if (inv.type === 'stocks' && inv.ticker_symbol) {
        const { price } = await window.electronAPI.fetchStockPrice(inv.ticker_symbol, inv.exchange || 'NSE')
        newValue = inv.units ? inv.units * price : price
        showToast(`Price updated: ₹${price.toLocaleString('en-IN')}`)
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

  const filtered = investments.filter(i => TYPE_GROUPS[filter]?.(i.type) ?? true)

  return (
    <div className="p-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
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

      {/* Summary bar */}
      {investments.length > 0 && <SummaryBar investments={investments} />}

      {/* Filter tabs */}
      <div className="flex gap-1 mb-6 bg-gray-100 rounded-xl p-1 w-fit">
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

      {/* Cards grid */}
      {loading ? (
        <div className="grid grid-cols-2 gap-5">
          {[1, 2, 3, 4].map(i => <div key={i} className="h-48 bg-gray-100 rounded-2xl animate-pulse" />)}
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex items-center justify-center h-56 rounded-2xl bg-white border border-dashed border-gray-200">
          <div className="text-center">
            <p className="text-4xl mb-3">📈</p>
            <p className="text-base font-semibold text-gray-700">No investments here</p>
            <p className="text-sm text-gray-400 mt-1">
              {filter === 'all' ? 'Tap + Add Investment to get started' : `No ${FILTER_TABS.find(t => t.key === filter)?.label} found`}
            </p>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-5">
          {filtered.map(inv => (
            <InvestmentCard key={inv.id} inv={inv}
              onEdit={(i) => { setEditInv(i); setShowForm(true) }}
              onDelete={handleDelete}
              onRefresh={handleRefresh}
              refreshing={refreshingId === inv.id}
            />
          ))}
        </div>
      )}

      {/* Form modal */}
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
