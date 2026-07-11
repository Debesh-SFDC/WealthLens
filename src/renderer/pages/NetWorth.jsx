import { useState, useEffect, useCallback } from 'react'

// ── Formatters ────────────────────────────────────────────────────────────
const INR = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 })
const fmt = v => INR.format(v || 0)

function fmtCr(v) {
  if (Math.abs(v) >= 1e7) return `₹${(v / 1e7).toFixed(2)}Cr`
  if (Math.abs(v) >= 1e5) return `₹${(v / 1e5).toFixed(2)}L`
  if (Math.abs(v) >= 1e3) return `₹${(v / 1e3).toFixed(0)}K`
  return `₹${Math.round(v)}`
}

// ── Investment helpers ────────────────────────────────────────────────────
function effectiveCurrentValue(inv) {
  if (inv.type === 'insurance') {
    const monthly = Number(inv.monthly_sip_amount) || 0
    const premiumYears = Number(inv.interest_rate) || 0
    const maturityAmt = Number(inv.purchase_price) || 0
    const start = inv.start_date ? new Date(inv.start_date).getTime() : null
    const maturityTs = inv.maturity_date ? new Date(inv.maturity_date).getTime() : null
    if (!start || !monthly) return 0
    if (maturityTs && Date.now() >= maturityTs) return maturityAmt
    const msPerMonth = 30.4375 * 24 * 60 * 60 * 1000
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
    const msPerMonth = 30.4375 * 24 * 60 * 60 * 1000
    const n = Math.min(Math.floor((Date.now() - start) / msPerMonth), tenureMonths)
    return n * monthly
  }
  return Number(inv.current_value) || 0
}

// RD: standard recurring-deposit maturity formula (quarterly compounding)
function calcRDMaturity(monthly, annualRatePct, tenureMonths) {
  if (!monthly || !annualRatePct || !tenureMonths) return 0
  const i = annualRatePct / 400
  return monthly * (Math.pow(1 + i, tenureMonths) - 1) / (1 - Math.pow(1 + i, -1 / 3))
}

function calcMonthlySIP(investments) {
  return investments.reduce((sum, inv) => {
    if (inv.type === 'mf_sip') return sum + (Number(inv.monthly_sip_amount) || 0)
    if (['epf', 'ppf', 'nps'].includes(inv.type)) return sum + (Number(inv.monthly_sip_amount) || 0)
    if (inv.type === 'insurance') {
      const monthly = Number(inv.monthly_sip_amount) || 0
      const premYears = Number(inv.interest_rate) || 0
      const start = inv.start_date ? new Date(inv.start_date).getTime() : null
      if (!start || !monthly || !premYears) return sum
      const yearsElapsed = (Date.now() - start) / (365.25 * 24 * 60 * 60 * 1000)
      return sum + (yearsElapsed < premYears ? monthly : 0)
    }
    if (inv.type === 'rd') {
      const monthly = Number(inv.monthly_sip_amount) || 0
      const tenureMonths = Number(inv.units) || 0
      const start = inv.start_date ? new Date(inv.start_date).getTime() : null
      if (!start || !monthly || !tenureMonths) return sum
      const msPerMonth = 30.4375 * 24 * 60 * 60 * 1000
      const monthsElapsed = Math.floor((Date.now() - start) / msPerMonth)
      return sum + (monthsElapsed < tenureMonths ? monthly : 0)
    }
    return sum
  }, 0)
}

// ── Projection helpers ────────────────────────────────────────────────────
const RATE_DEFAULTS = {
  conservative: { mf: 10, stocks: 8,  nps: 9  },
  standard:     { mf: 12, stocks: 12, nps: 10 },
  optimistic:   { mf: 15, stocks: 18, nps: 12 },
}
const FIXED_RATES = { epf: 8.25, ppf: 7.1, gold: 8.5 }

function fvLumpsum(pv, annualRate, years) {
  if (!pv) return 0
  return pv * Math.pow(1 + annualRate, years)
}

function fvWithSIP(pv, monthlySIP, annualRate, years) {
  const rm = Math.pow(1 + annualRate, 1 / 12) - 1
  const n = years * 12
  if (rm === 0) return (pv || 0) + (monthlySIP || 0) * n
  return (pv || 0) * Math.pow(1 + rm, n) + (monthlySIP || 0) * (Math.pow(1 + rm, n) - 1) / rm
}

function projectInsurance(inv, yearsFromNow) {
  if (yearsFromNow === 0) return effectiveCurrentValue(inv)
  const maturityAmt = Number(inv.purchase_price) || 0
  if (maturityAmt > 0) return maturityAmt
  const monthly = Number(inv.monthly_sip_amount) || 0
  const premYears = Number(inv.interest_rate) || 0
  const start = inv.start_date ? new Date(inv.start_date).getTime() : null
  if (!start || !monthly) return 0
  const targetTs = Date.now() + yearsFromNow * 365.25 * 24 * 60 * 60 * 1000
  const premEndTs = start + premYears * 365.25 * 24 * 60 * 60 * 1000
  const msPerMonth = 30.4375 * 24 * 60 * 60 * 1000
  const countUpTo = Math.min(targetTs, premEndTs)
  const months = Math.max(0, Math.floor((countUpTo - start) / msPerMonth))
  return Math.min(months, Math.round(premYears * 12)) * monthly
}

function projectFD(inv, yearsFromNow) {
  const cv = Number(inv.current_value) || 0
  const rate = (Number(inv.interest_rate) || 6.5) / 100
  const maturityTs = inv.maturity_date ? new Date(inv.maturity_date).getTime() : null
  if (maturityTs) {
    const yearsToMat = (maturityTs - Date.now()) / (365.25 * 24 * 60 * 60 * 1000)
    if (yearsFromNow >= yearsToMat && yearsToMat > 0) return fvLumpsum(cv, rate, yearsToMat)
  }
  return fvLumpsum(cv, rate, yearsFromNow)
}

function projectRD(inv, yearsFromNow) {
  if (yearsFromNow === 0) return effectiveCurrentValue(inv)
  const maturityAmt = Number(inv.purchase_price) || 0
  if (maturityAmt > 0) return maturityAmt
  const monthly = Number(inv.monthly_sip_amount) || 0
  const tenureMonths = Number(inv.units) || 0
  const rate = Number(inv.interest_rate) || 0
  return calcRDMaturity(monthly, rate, tenureMonths)
}

function projectInvestment(inv, yearsFromNow, rates) {
  const cv = effectiveCurrentValue(inv)
  switch (inv.type) {
    case 'mf_sip':     return fvWithSIP(cv, Number(inv.monthly_sip_amount) || 0, rates.mf / 100, yearsFromNow)
    case 'mf_lumpsum': return fvLumpsum(cv, rates.mf / 100, yearsFromNow)
    case 'stocks':     return fvLumpsum(cv, rates.stocks / 100, yearsFromNow)
    case 'epf':        return fvWithSIP(cv, Number(inv.monthly_sip_amount) || 0, rates.epf / 100, yearsFromNow)
    case 'ppf':        return fvWithSIP(cv, Number(inv.monthly_sip_amount) || 0, rates.ppf / 100, yearsFromNow)
    case 'nps':        return fvWithSIP(cv, Number(inv.monthly_sip_amount) || 0, rates.nps / 100, yearsFromNow)
    case 'fd':         return projectFD(inv, yearsFromNow)
    case 'rd':         return projectRD(inv, yearsFromNow)
    case 'gold':       return fvLumpsum(cv, rates.gold / 100, yearsFromNow)
    case 'insurance':  return projectInsurance(inv, yearsFromNow)
    default:           return cv
  }
}

function projectAll(investments, years, rates) {
  return Array.from({ length: years + 1 }, (_, y) => ({
    year: y,
    value: Math.round(investments.reduce((s, inv) => s + projectInvestment(inv, y, rates), 0)),
  }))
}

// ── Asset groups ──────────────────────────────────────────────────────────
const ASSET_GROUPS = [
  { key: 'mf',        label: 'Mutual Funds',  color: '#6C63FF', types: ['mf_sip', 'mf_lumpsum'] },
  { key: 'stocks',    label: 'Stocks',         color: '#EF4444', types: ['stocks'] },
  { key: 'epf',       label: 'EPF',            color: '#10B981', types: ['epf'] },
  { key: 'ppf',       label: 'PPF',            color: '#059669', types: ['ppf'] },
  { key: 'nps',       label: 'NPS',            color: '#F59E0B', types: ['nps'] },
  { key: 'fd',        label: 'Fixed Deposits', color: '#8B5CF6', types: ['fd'] },
  { key: 'rd',        label: 'Recurring Deposits', color: '#0D9488', types: ['rd'] },
  { key: 'gold',      label: 'Gold',           color: '#D97706', types: ['gold'] },
  { key: 'insurance', label: 'Insurance',      color: '#0EA5E9', types: ['insurance'] },
]

const SCENARIOS = [
  { key: 'conservative', label: 'Conservative',    color: '#3B82F6', gradId: 'nwGradC2' },
  { key: 'standard',     label: 'Market Standard', color: '#10B981', gradId: 'nwGradS2' },
  { key: 'optimistic',   label: 'Optimistic',      color: '#F59E0B', gradId: 'nwGradO2' },
]

const TOTAL_YEARS = 22

// ── Chart constants ───────────────────────────────────────────────────────
const CW = 800, CH = 340
const PAD = { top: 24, right: 28, bottom: 52, left: 88 }
const PW = CW - PAD.left - PAD.right
const PH = CH - PAD.top - PAD.bottom

function computeYAxis(maxVal) {
  if (maxVal <= 0) return { ticks: [0], maxTick: 1e6 }
  const rawStep = maxVal / 5
  const mag = Math.pow(10, Math.floor(Math.log10(rawStep)))
  const norm = rawStep / mag
  const niceNorm = norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 2.5 ? 2.5 : norm <= 5 ? 5 : 10
  const step = niceNorm * mag
  const maxTick = Math.ceil((maxVal * 1.12) / step) * step
  const ticks = []
  for (let v = 0; v <= maxTick + step * 0.001; v += step) ticks.push(v)
  return { ticks, maxTick }
}

const sx = year => PAD.left + (year / TOTAL_YEARS) * PW
const sy = (val, maxTick) => PAD.top + PH - (val / maxTick) * PH

function makeLine(points, maxTick) {
  return points.map((p, i) => `${i === 0 ? 'M' : 'L'}${sx(p.year).toFixed(1)},${sy(p.value, maxTick).toFixed(1)}`).join(' ')
}

function makeArea(points, maxTick) {
  const bottomY = (PAD.top + PH).toFixed(1)
  return `${makeLine(points, maxTick)} L${sx(TOTAL_YEARS).toFixed(1)},${bottomY} L${PAD.left.toFixed(1)},${bottomY}Z`
}

// ── Projection Chart ──────────────────────────────────────────────────────
function ProjectionChart({ allSeries, maxTick, yTicks, hoveredYear, onHover, retirementYear }) {
  const bottomY = PAD.top + PH
  const retX = sx(retirementYear)
  const X_TICKS = [0, 2, 4, 6, 8, 10, 12, 14, 16, 18, 20, 22]

  const handleMouseMove = e => {
    const rect = e.currentTarget.getBoundingClientRect()
    const svgX = (e.clientX - rect.left) * (CW / rect.width)
    const year = Math.round(((svgX - PAD.left) / PW) * TOTAL_YEARS)
    onHover(Math.max(0, Math.min(TOTAL_YEARS, year)))
  }

  return (
    <svg viewBox={`0 0 ${CW} ${CH}`} className="w-full select-none"
      onMouseMove={handleMouseMove} onMouseLeave={() => onHover(null)}>
      <defs>
        {SCENARIOS.map(sc => (
          <linearGradient key={sc.gradId} id={sc.gradId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={sc.color} stopOpacity="0.18" />
            <stop offset="100%" stopColor={sc.color} stopOpacity="0.01" />
          </linearGradient>
        ))}
      </defs>

      {yTicks.map(tick => {
        const y = sy(tick, maxTick)
        if (y < PAD.top - 2 || y > bottomY + 2) return null
        return (
          <g key={tick}>
            <line x1={PAD.left} y1={y} x2={PAD.left + PW} y2={y}
              stroke={tick === 0 ? '#e5e7eb' : '#f3f4f6'} strokeWidth={tick === 0 ? 1.5 : 1} />
            <text x={PAD.left - 10} y={y + 4} textAnchor="end"
              style={{ fontSize: '11px', fill: '#9ca3af', fontFamily: 'inherit' }}>
              {fmtCr(tick)}
            </text>
          </g>
        )
      })}

      {X_TICKS.map(y => {
        const x = sx(y)
        const isRetire = y === retirementYear
        return (
          <g key={y}>
            <line x1={x} y1={bottomY} x2={x} y2={bottomY + 5}
              stroke={isRetire ? '#6C63FF' : '#e5e7eb'} strokeWidth={isRetire ? 2 : 1} />
            <text x={x} y={bottomY + 18} textAnchor="middle"
              style={{ fontSize: '11px', fontFamily: 'inherit', fill: isRetire ? '#6C63FF' : '#9ca3af', fontWeight: isRetire ? 700 : 400 }}>
              {y === 0 ? 'Now' : `${y}Y`}
            </text>
            {isRetire && (
              <text x={x} y={bottomY + 32} textAnchor="middle"
                style={{ fontSize: '9.5px', fontFamily: 'inherit', fill: '#6C63FF', fontWeight: 600 }}>
                Retire
              </text>
            )}
          </g>
        )
      })}

      {allSeries.map(({ scenario, points }) => (
        <path key={`area-${scenario.key}`} d={makeArea(points, maxTick)} fill={`url(#${scenario.gradId})`} />
      ))}
      {allSeries.map(({ scenario, points }) => (
        <path key={`line-${scenario.key}`} d={makeLine(points, maxTick)}
          fill="none" stroke={scenario.color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
      ))}

      <line x1={retX} y1={PAD.top} x2={retX} y2={bottomY}
        stroke="#6C63FF" strokeWidth="1.5" strokeDasharray="5,4" opacity="0.65" />

      {hoveredYear !== null && (() => {
        const hx = sx(hoveredYear)
        return (
          <>
            <line x1={hx} y1={PAD.top} x2={hx} y2={bottomY}
              stroke="#374151" strokeWidth="1" strokeDasharray="3,3" opacity="0.35" />
            {allSeries.map(({ scenario, points }) => {
              const pt = points[hoveredYear]
              const hy = sy(pt.value, maxTick)
              return <circle key={scenario.key} cx={hx} cy={hy} r={4.5}
                fill={scenario.color} stroke="white" strokeWidth="2" />
            })}
          </>
        )
      })()}

      <line x1={PAD.left} y1={bottomY} x2={PAD.left + PW} y2={bottomY} stroke="#e5e7eb" strokeWidth="1.5" />
    </svg>
  )
}

// ── Breakdown formula helper ──────────────────────────────────────────────
function calcBreakdown(inv, years, scRates) {
  const cv = effectiveCurrentValue(inv)

  function sipRows(sip, rate, label = 'SIP') {
    const rm = Math.pow(1 + rate / 100, 1 / 12) - 1
    const n = years * 12
    const corpusGrowth = cv * Math.pow(1 + rm, n)
    const sipGrowth = rm > 0 ? sip * (Math.pow(1 + rm, n) - 1) / rm : sip * n
    return [
      { component: `Corpus growth @ ${rate}% p.a.`, value: corpusGrowth },
      { component: `${label} accumulation @ ${rate}% p.a.`, value: sipGrowth },
    ]
  }

  switch (inv.type) {
    case 'mf_sip':     return sipRows(Number(inv.monthly_sip_amount) || 0, scRates.mf, 'SIP')
    case 'epf':        return sipRows(Number(inv.monthly_sip_amount) || 0, FIXED_RATES.epf, 'Contribution')
    case 'ppf':        return sipRows(Number(inv.monthly_sip_amount) || 0, FIXED_RATES.ppf, 'Contribution')
    case 'nps':        return sipRows(Number(inv.monthly_sip_amount) || 0, scRates.nps, 'Contribution')
    case 'mf_lumpsum': return [{ component: `Lumpsum grown @ ${scRates.mf}% p.a.`, value: cv * Math.pow(1 + scRates.mf / 100, years) }]
    case 'stocks':     return [{ component: `Lumpsum grown @ ${scRates.stocks}% p.a.`, value: cv * Math.pow(1 + scRates.stocks / 100, years) }]
    case 'gold':       return [{ component: `Lumpsum grown @ ${FIXED_RATES.gold}% p.a. (fixed)`, value: cv * Math.pow(1 + FIXED_RATES.gold / 100, years) }]
    case 'fd': {
      const rate = Number(inv.interest_rate) || 6.5
      return [{ component: `FD grown @ ${rate}% p.a. (individual rate)`, value: projectFD(inv, years) }]
    }
    case 'rd': {
      const maturity = Number(inv.purchase_price) || 0
      const monthly = Number(inv.monthly_sip_amount) || 0
      const tenureMonths = Number(inv.units) || 0
      return [
        { component: `Deposits paid (${fmt(monthly)}/mo × ${tenureMonths}mo)`, value: null },
        { component: 'Guaranteed maturity payout', value: maturity },
      ]
    }
    case 'insurance': {
      const maturity = Number(inv.purchase_price) || 0
      const monthly = Number(inv.monthly_sip_amount) || 0
      const premYears = Number(inv.interest_rate) || 0
      return [
        { component: `Premium paid (${fmt(monthly)}/mo × ${premYears}Y)`, value: null },
        { component: 'Guaranteed maturity payout', value: maturity },
      ]
    }
    default: return [{ component: 'Current value', value: cv }]
  }
}

// ── Type breakdown modal ──────────────────────────────────────────────────
function TypeBreakdownModal({ group, investments, rates, retirementYear, onClose }) {
  const groupInvs = investments.filter(inv => group.types.includes(inv.type))

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ backgroundColor: 'rgba(0,0,0,0.45)' }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl flex flex-col" style={{ maxHeight: '82vh' }}>

        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: group.color }} />
            <div>
              <p className="text-base font-bold text-gray-900">{group.label}</p>
              <p className="text-xs text-gray-400">Projection at Year {retirementYear} · {groupInvs.length} investment{groupInvs.length !== 1 ? 's' : ''}</p>
            </div>
          </div>
          <button onClick={onClose}
            className="p-2 rounded-xl text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors text-lg font-bold leading-none">
            ×
          </button>
        </div>

        <div className="overflow-y-auto px-6 py-5 space-y-5">
          <div className="grid grid-cols-3 gap-3">
            {SCENARIOS.map(sc => {
              const r = { ...rates[sc.key], ...FIXED_RATES }
              const total = Math.round(groupInvs.reduce((s, inv) => s + projectInvestment(inv, retirementYear, r), 0))
              return (
                <div key={sc.key} className="rounded-xl p-3.5 border"
                  style={{ backgroundColor: sc.color + '10', borderColor: sc.color + '30' }}>
                  <p className="text-xs font-bold uppercase tracking-wide mb-1" style={{ color: sc.color }}>{sc.label}</p>
                  <p className="text-xl font-bold text-gray-900">{fmtCr(total)}</p>
                  <p className="text-xs text-gray-400 mt-0.5">
                    {rates[sc.key].mf != null ? `MF ${rates[sc.key].mf}% · Stocks ${rates[sc.key].stocks}% · NPS ${rates[sc.key].nps}%` : ''}
                  </p>
                </div>
              )
            })}
          </div>

          {groupInvs.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-6">No investments in this category</p>
          ) : (
            <div className="space-y-3">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Per Investment</p>
              {groupInvs.map(inv => {
                const cv = effectiveCurrentValue(inv)
                const rawSip = Number(inv.monthly_sip_amount) || 0
                const hasSip = ['mf_sip', 'epf', 'ppf', 'nps', 'insurance'].includes(inv.type) && rawSip > 0
                const stdBreakdown = calcBreakdown(inv, retirementYear, rates.standard)
                const hasMultipleValueRows = stdBreakdown.filter(r => r.value !== null).length > 1

                return (
                  <div key={inv.id} className="border border-gray-100 rounded-xl overflow-hidden bg-gray-50">
                    <div className="px-4 pt-3.5 pb-2">
                      <p className="text-sm font-semibold text-gray-800">{inv.name}</p>
                      <p className="text-xs text-gray-400 mt-0.5 capitalize">
                        {inv.type.replace(/_/g, ' ')}
                        {inv.account_number ? ` · ${inv.account_number}` : ''}
                      </p>
                    </div>
                    <div className="px-4 pb-3 flex flex-wrap gap-1.5">
                      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-white border border-gray-200 text-xs font-medium text-gray-700">
                        <span className="text-gray-400">Current</span> {fmtCr(cv)}
                      </span>
                      {hasSip && (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-white border border-gray-200 text-xs font-medium text-gray-700">
                          <span className="text-gray-400">{inv.type === 'insurance' ? 'Premium' : 'Monthly SIP'}</span> {fmt(rawSip)}/mo
                        </span>
                      )}
                      {inv.type === 'insurance' && Number(inv.purchase_price) > 0 && (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-white border border-gray-200 text-xs font-medium text-gray-700">
                          <span className="text-gray-400">Maturity</span> {fmtCr(Number(inv.purchase_price))}
                        </span>
                      )}
                      {inv.type === 'fd' && Number(inv.interest_rate) > 0 && (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-white border border-gray-200 text-xs font-medium text-gray-700">
                          <span className="text-gray-400">FD Rate</span> {inv.interest_rate}%
                        </span>
                      )}
                    </div>
                    <div className="border-t border-gray-100 bg-white">
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="border-b border-gray-100 bg-gray-50">
                            <th className="text-left px-4 py-2 text-gray-400 font-medium">Calculation step</th>
                            {SCENARIOS.map(sc => (
                              <th key={sc.key} className="text-right px-3 py-2 font-bold" style={{ color: sc.color }}>{sc.label}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-50">
                          {stdBreakdown.map((row, rowIdx) => (
                            <tr key={rowIdx}>
                              <td className="px-4 py-2 text-gray-600">{row.component}</td>
                              {SCENARIOS.map(sc => {
                                const breakdown = calcBreakdown(inv, retirementYear, rates[sc.key])
                                const step = breakdown[rowIdx]
                                return (
                                  <td key={sc.key} className="px-3 py-2 text-right font-semibold text-gray-800">
                                    {step?.value != null ? fmtCr(step.value) : '—'}
                                  </td>
                                )
                              })}
                            </tr>
                          ))}
                        </tbody>
                        {hasMultipleValueRows && (
                          <tfoot>
                            <tr className="border-t-2 border-gray-200 bg-gray-50">
                              <td className="px-4 py-2.5 font-bold text-gray-700">Total at Year {retirementYear}</td>
                              {SCENARIOS.map(sc => {
                                const r = { ...rates[sc.key], ...FIXED_RATES }
                                return (
                                  <td key={sc.key} className="px-3 py-2.5 text-right font-bold" style={{ color: sc.color }}>
                                    {fmtCr(projectInvestment(inv, retirementYear, r))}
                                  </td>
                                )
                              })}
                            </tr>
                          </tfoot>
                        )}
                      </table>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────
export default function NetWorth() {
  const [investments, setInvestments] = useState([])
  const [loading, setLoading] = useState(true)
  const [hoveredYear, setHoveredYear] = useState(null)
  const [retirementYear, setRetirementYear] = useState(14)
  const [selectedBreakdownGroup, setSelectedBreakdownGroup] = useState(null)
  const [showRates, setShowRates] = useState(false)

  const [rates, setRates] = useState({
    conservative: { ...RATE_DEFAULTS.conservative },
    standard:     { ...RATE_DEFAULTS.standard },
    optimistic:   { ...RATE_DEFAULTS.optimistic },
  })

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const inv = await window.electronAPI.getAllInvestments()
      setInvestments(inv || [])
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  if (loading) {
    return (
      <div className="p-6 space-y-4">
        {[1, 2, 3, 4].map(i => <div key={i} className="h-24 bg-gray-100 rounded-2xl animate-pulse" />)}
      </div>
    )
  }

  const currentNW = investments.reduce((s, inv) => s + effectiveCurrentValue(inv), 0)
  const monthlySIP = calcMonthlySIP(investments)

  const allSeries = SCENARIOS.map(sc => ({
    scenario: sc,
    points: projectAll(investments, TOTAL_YEARS, { ...rates[sc.key], ...FIXED_RATES }),
  }))

  const rawMax = Math.max(...allSeries.flatMap(s => s.points.map(p => p.value)), 1)
  const { ticks: yTicks, maxTick } = computeYAxis(rawMax)

  const retirementRow = allSeries.map(({ scenario, points }) => ({ scenario, value: points[retirementYear]?.value || 0 }))
  const finalRow = allSeries.map(({ scenario, points }) => ({ scenario, value: points[TOTAL_YEARS]?.value || 0 }))
  const hoveredRow = hoveredYear !== null
    ? allSeries.map(({ scenario, points }) => ({ scenario, value: points[hoveredYear]?.value || 0 }))
    : null

  const assetBreakdownGroups = ASSET_GROUPS.map(group => {
    const groupInvs = investments.filter(inv => group.types.includes(inv.type))
    if (groupInvs.length === 0) return null
    const values = {}
    SCENARIOS.forEach(sc => {
      const r = { ...rates[sc.key], ...FIXED_RATES }
      values[sc.key] = Math.round(groupInvs.reduce((s, inv) => s + projectInvestment(inv, retirementYear, r), 0))
    })
    return { ...group, value: values.standard, values }
  }).filter(Boolean).filter(g => g.value > 0).sort((a, b) => b.value - a.value)

  const breakdownTotal = assetBreakdownGroups.reduce((s, g) => s + g.value, 0)

  const hasInvestments = investments.length > 0
  const stdRetireValue = retirementRow[1].value
  const consRetireValue = retirementRow[0].value
  const optRetireValue = retirementRow[2].value

  return (
    <div className="p-6">
      {/* Page header */}
      <div className="mb-5">
        <h2 className="text-2xl font-bold text-gray-900">Net Worth</h2>
        <p className="mt-1 text-sm text-gray-500">Net worth projection · 3 scenarios</p>
      </div>

      {hasInvestments ? (
        <>
          {/* ── HERO: Current NW ── */}
          <div className="rounded-2xl p-6 mb-5 border"
            style={{ background: 'linear-gradient(135deg, #f5f3ff 0%, #ede9fe 100%)', borderColor: '#ddd6fe' }}>
            <div className="flex items-end justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide mb-1" style={{ color: '#7C3AED' }}>Current Net Worth</p>
                <p className="text-5xl font-bold text-gray-900 leading-none mb-2">{fmtCr(currentNW)}</p>
                <p className="text-sm text-gray-500">{investments.length} investments tracked</p>
              </div>
              <div className="text-right">
                <p className="text-xs text-gray-400 mb-0.5">Monthly SIP</p>
                <p className="text-3xl font-bold" style={{ color: '#6C63FF' }}>{fmt(monthlySIP)}</p>
                <p className="text-xs text-gray-400 mt-1">MF + EPF + NPS + PPF</p>
              </div>
            </div>
          </div>

          {/* ── SCENARIO CARDS ── */}
          <div className="grid grid-cols-3 gap-3 mb-5">
            {retirementRow.map(({ scenario, value }, idx) => {
              const multiple = currentNW > 0 ? (value / currentNW).toFixed(1) : null
              const end = finalRow[idx].value
              return (
                <div key={scenario.key} className="bg-white rounded-2xl p-5 border shadow-sm"
                  style={{ borderColor: scenario.color + '35' }}>
                  <div className="flex items-center gap-2 mb-3">
                    <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: scenario.color }} />
                    <span className="text-xs font-bold uppercase tracking-wide" style={{ color: scenario.color }}>{scenario.label}</span>
                  </div>
                  <p className="text-2xl font-bold text-gray-900 mb-0.5">{fmtCr(value)}</p>
                  <p className="text-xs text-gray-400 mb-3">at retirement · Year {retirementYear}</p>
                  <div className="flex items-center justify-between text-xs border-t border-gray-50 pt-3">
                    {multiple && (
                      <span className="font-semibold" style={{ color: scenario.color }}>{multiple}× current</span>
                    )}
                    <span className="text-gray-400">{fmtCr(end)} @ 22Y</span>
                  </div>
                </div>
              )
            })}
          </div>

          {/* ── PROJECTION CHART ── */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 mb-4">
            <div className="flex items-start justify-between mb-4">
              <div>
                <p className="text-sm font-bold text-gray-800">Projected Net Worth Growth</p>
                <p className="text-xs text-gray-400 mt-0.5">
                  {fmtCr(currentNW)} corpus + {fmt(monthlySIP)}/mo SIP · per-type compound rates
                </p>
              </div>
              <div className="flex items-center gap-5">
                {SCENARIOS.map(sc => (
                  <div key={sc.key} className="flex items-center gap-1.5">
                    <svg width="24" height="10">
                      <line x1="0" y1="5" x2="24" y2="5" stroke={sc.color} strokeWidth="2.5" strokeLinecap="round" />
                    </svg>
                    <span className="text-xs font-medium text-gray-600">{sc.label}</span>
                    <span className="text-[11px] text-gray-400">({rates[sc.key].mf}%)</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Retirement slider */}
            <div className="flex items-center gap-4 mb-4 px-4 py-3 rounded-xl bg-gray-50 border border-gray-100">
              <div className="shrink-0">
                <p className="text-xs font-semibold text-gray-700">Retirement at Year</p>
                <p className="text-xs text-gray-400">drag to adjust</p>
              </div>
              <input type="range" min="1" max={TOTAL_YEARS} step="1" value={retirementYear}
                onChange={e => setRetirementYear(Number(e.target.value))}
                className="flex-1 cursor-pointer" style={{ accentColor: '#6C63FF' }} />
              <div className="shrink-0 text-right w-24">
                <p className="text-lg font-bold text-indigo-600">Year {retirementYear}</p>
                <p className="text-xs text-gray-400">{fmtCr(stdRetireValue)}</p>
              </div>
            </div>

            <ProjectionChart
              allSeries={allSeries} maxTick={maxTick} yTicks={yTicks}
              hoveredYear={hoveredYear} onHover={setHoveredYear} retirementYear={retirementYear}
            />

            <div className="mt-3 pt-3 border-t border-gray-100 min-h-[36px] flex items-center gap-6 flex-wrap">
              {hoveredRow ? (
                <>
                  <span className="text-xs font-bold text-gray-500 w-16 shrink-0">
                    {hoveredYear === 0 ? 'Now' : `Year ${hoveredYear}`}
                    {hoveredYear === retirementYear && (
                      <span className="ml-1.5 font-semibold" style={{ color: '#6C63FF' }}> · Retire</span>
                    )}
                  </span>
                  {hoveredRow.map(({ scenario, value }) => (
                    <div key={scenario.key} className="flex items-center gap-1.5">
                      <div className="w-2 h-2 rounded-full" style={{ backgroundColor: scenario.color }} />
                      <span className="text-xs text-gray-400">{scenario.label}:</span>
                      <span className="text-xs font-bold text-gray-800">{fmtCr(value)}</span>
                    </div>
                  ))}
                </>
              ) : (
                <span className="text-xs text-gray-400">Hover over the chart to see values</span>
              )}
            </div>
          </div>

          {/* ── PORTFOLIO BREAKDOWN ── */}
          {assetBreakdownGroups.length > 0 && (
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 mb-4">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <p className="text-sm font-bold text-gray-800">Portfolio Breakdown at Retirement</p>
                  <p className="text-xs text-gray-400 mt-0.5">
                    Year {retirementYear} · Market Standard scenario · click a card for details
                  </p>
                </div>
                <span className="text-sm font-bold text-gray-700">{fmtCr(breakdownTotal)}</span>
              </div>

              {/* Stacked bar */}
              <div className="flex h-3 rounded-full overflow-hidden mb-5 gap-px">
                {assetBreakdownGroups.map(g => {
                  const pct = breakdownTotal > 0 ? (g.value / breakdownTotal) * 100 : 0
                  if (pct < 0.5) return null
                  return (
                    <div key={g.key} style={{ width: `${pct}%`, backgroundColor: g.color, minWidth: 3 }}
                      title={`${g.label}: ${pct.toFixed(1)}%`} />
                  )
                })}
              </div>

              {/* Asset cards */}
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2.5">
                {assetBreakdownGroups.map(g => {
                  const pct = breakdownTotal > 0 ? (g.value / breakdownTotal) * 100 : 0
                  return (
                    <button key={g.key} onClick={() => setSelectedBreakdownGroup(g)}
                      className="text-left p-3.5 rounded-xl border hover:shadow-sm transition-all group/card"
                      style={{ borderColor: g.color + '35', backgroundColor: g.color + '08' }}>
                      <div className="flex items-center gap-2 mb-2">
                        <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: g.color }} />
                        <span className="text-xs font-semibold text-gray-600 truncate">{g.label}</span>
                      </div>
                      <p className="text-base font-bold text-gray-900">{fmtCr(g.value)}</p>
                      <div className="flex items-center justify-between mt-1">
                        <span className="text-xs text-gray-400">{pct.toFixed(1)}%</span>
                        <span className="text-[10px] text-gray-300 group-hover/card:text-indigo-400 transition-colors">details →</span>
                      </div>
                    </button>
                  )
                })}
              </div>

              {/* Scenario comparison strip */}
              <div className="mt-4 pt-4 border-t border-gray-100">
                <p className="text-xs text-gray-400 mb-2">Total across all scenarios at Year {retirementYear}</p>
                <div className="flex gap-4">
                  {SCENARIOS.map(sc => {
                    const total = assetBreakdownGroups.reduce((s, g) => s + g.values[sc.key], 0)
                    return (
                      <div key={sc.key} className="flex items-center gap-2">
                        <div className="w-2 h-2 rounded-full" style={{ backgroundColor: sc.color }} />
                        <span className="text-xs text-gray-500">{sc.label}:</span>
                        <span className="text-xs font-bold" style={{ color: sc.color }}>{fmtCr(total)}</span>
                      </div>
                    )
                  })}
                </div>
              </div>
            </div>
          )}

          {selectedBreakdownGroup && (
            <TypeBreakdownModal
              group={selectedBreakdownGroup} investments={investments}
              rates={rates} retirementYear={retirementYear}
              onClose={() => setSelectedBreakdownGroup(null)}
            />
          )}

          {/* ── RETURN RATE SETTINGS (collapsible) ── */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm mb-5 overflow-hidden">
            <button
              onClick={() => setShowRates(v => !v)}
              className="w-full flex items-center justify-between px-5 py-4 hover:bg-gray-50 transition-colors">
              <div className="flex items-center gap-3">
                <span className="text-sm font-semibold text-gray-700">Return Rate Settings</span>
                <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-500">
                  {rates.standard.mf}% MF · {rates.standard.stocks}% Stocks · {rates.standard.nps}% NPS
                </span>
              </div>
              <span className={`text-gray-400 transition-transform duration-200 ${showRates ? 'rotate-180' : ''}`}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
                  <polyline points="6 9 12 15 18 9"/>
                </svg>
              </span>
            </button>

            {showRates && (
              <div className="px-5 pb-5 border-t border-gray-100">
                <div className="overflow-x-auto mt-4">
                  <table className="w-full text-sm">
                    <thead>
                      <tr>
                        <th className="text-left text-xs font-semibold text-gray-400 pb-3 w-28">Asset Type</th>
                        {SCENARIOS.map(sc => (
                          <th key={sc.key} className="text-center pb-3 px-4">
                            <div className="flex items-center justify-center gap-1.5">
                              <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: sc.color }} />
                              <span className="text-xs font-semibold" style={{ color: sc.color }}>{sc.label}</span>
                            </div>
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {[
                        { key: 'mf',     label: 'Mutual Funds (MF)' },
                        { key: 'stocks', label: 'Stocks' },
                        { key: 'nps',    label: 'NPS' },
                      ].map(row => (
                        <tr key={row.key}>
                          <td className="py-2.5 text-sm text-gray-700 font-medium">{row.label}</td>
                          {SCENARIOS.map(sc => (
                            <td key={sc.key} className="py-2.5 px-4 text-center">
                              <div className="flex items-center justify-center gap-1">
                                <input
                                  type="number" min="1" max="35" step="0.5"
                                  value={rates[sc.key][row.key]}
                                  onChange={e => {
                                    const v = parseFloat(e.target.value)
                                    if (!isNaN(v) && v > 0 && v <= 35)
                                      setRates(r => ({ ...r, [sc.key]: { ...r[sc.key], [row.key]: v } }))
                                  }}
                                  className="w-14 text-right px-2 py-1.5 rounded-lg border border-gray-200 text-sm font-bold focus:outline-none focus:ring-2 focus:ring-blue-100"
                                  style={{ color: sc.color }}
                                />
                                <span className="text-xs text-gray-400 font-medium">%</span>
                              </div>
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="mt-4 pt-4 border-t border-gray-100">
                  <p className="text-xs font-semibold text-gray-400 mb-2">Fixed Rates (not editable)</p>
                  <div className="flex flex-wrap gap-2">
                    {[
                      { label: 'EPF', value: '8.25%' },
                      { label: 'PPF', value: '7.1%' },
                      { label: 'Gold', value: '8.5%' },
                      { label: 'FD', value: 'individual rates' },
                      { label: 'RD', value: 'individual rates' },
                      { label: 'Insurance', value: 'deposited → maturity' },
                    ].map(b => (
                      <span key={b.label} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-600">
                        <span className="font-semibold">{b.label}</span>
                        <span className="text-gray-400">{b.value}</span>
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        </>
      ) : (
        <div className="flex items-center justify-center h-48 bg-white rounded-2xl border border-dashed border-gray-200 mb-6">
          <div className="text-center">
            <p className="text-4xl mb-3">📊</p>
            <p className="text-base font-semibold text-gray-700">Add investments to see projections</p>
            <p className="text-sm text-gray-400 mt-1">Net worth chart will appear once you have investments</p>
          </div>
        </div>
      )}
    </div>
  )
}
