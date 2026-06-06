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
  return Number(inv.current_value) || 0
}

function calcMonthlySIP(investments) {
  return investments.reduce((sum, inv) => {
    if (inv.type === 'mf_sip') {
      const amt = Number(inv.monthly_sip_amount) || 0
      return sum + (inv.sip_frequency === 'weekly' ? (amt * 52) / 12 : amt)
    }
    if (['epf', 'ppf', 'nps'].includes(inv.type)) {
      return sum + (Number(inv.monthly_sip_amount) || 0)
    }
    if (inv.type === 'insurance') {
      const monthly = Number(inv.monthly_sip_amount) || 0
      const premYears = Number(inv.interest_rate) || 0
      const start = inv.start_date ? new Date(inv.start_date).getTime() : null
      if (!start || !monthly || !premYears) return sum
      const yearsElapsed = (Date.now() - start) / (365.25 * 24 * 60 * 60 * 1000)
      return sum + (yearsElapsed < premYears ? monthly : 0)
    }
    return sum
  }, 0)
}

// ── Per-type projection helpers ───────────────────────────────────────────
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
  // At year 0 show deposited-so-far (consistent with Current NW card)
  if (yearsFromNow === 0) return effectiveCurrentValue(inv)
  const maturityAmt = Number(inv.purchase_price) || 0
  // Insurance is a guaranteed contract — the payout is fixed regardless of when
  // it formally matures. For any future projection year, show the maturity amount.
  if (maturityAmt > 0) return maturityAmt
  // Fallback (no maturity amount set): accumulate premiums up to premium end
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

function projectInvestment(inv, yearsFromNow, rates) {
  const cv = effectiveCurrentValue(inv)
  switch (inv.type) {
    case 'mf_sip': {
      const amt = Number(inv.monthly_sip_amount) || 0
      const sip = inv.sip_frequency === 'weekly' ? (amt * 52) / 12 : amt
      return fvWithSIP(cv, sip, rates.mf / 100, yearsFromNow)
    }
    case 'mf_lumpsum': return fvLumpsum(cv, rates.mf / 100, yearsFromNow)
    case 'stocks':     return fvLumpsum(cv, rates.stocks / 100, yearsFromNow)
    case 'epf':        return fvWithSIP(cv, Number(inv.monthly_sip_amount) || 0, rates.epf / 100, yearsFromNow)
    case 'ppf':        return fvWithSIP(cv, Number(inv.monthly_sip_amount) || 0, rates.ppf / 100, yearsFromNow)
    case 'nps':        return fvWithSIP(cv, Number(inv.monthly_sip_amount) || 0, rates.nps / 100, yearsFromNow)
    case 'fd':         return projectFD(inv, yearsFromNow)
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

// ── Asset breakdown groups ────────────────────────────────────────────────
const ASSET_GROUPS = [
  { key: 'mf',        label: 'Mutual Funds',  color: '#6C63FF', types: ['mf_sip', 'mf_lumpsum'] },
  { key: 'stocks',    label: 'Stocks',         color: '#EF4444', types: ['stocks'] },
  { key: 'epf',       label: 'EPF',            color: '#10B981', types: ['epf'] },
  { key: 'ppf',       label: 'PPF',            color: '#059669', types: ['ppf'] },
  { key: 'nps',       label: 'NPS',            color: '#F59E0B', types: ['nps'] },
  { key: 'fd',        label: 'Fixed Deposits', color: '#8B5CF6', types: ['fd'] },
  { key: 'gold',      label: 'Gold',           color: '#D97706', types: ['gold'] },
  { key: 'insurance', label: 'Insurance',      color: '#0EA5E9', types: ['insurance'] },
]

// ── Scenarios ─────────────────────────────────────────────────────────────
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
  return points
    .map((p, i) => `${i === 0 ? 'M' : 'L'}${sx(p.year).toFixed(1)},${sy(p.value, maxTick).toFixed(1)}`)
    .join(' ')
}

function makeArea(points, maxTick) {
  const bottomY = (PAD.top + PH).toFixed(1)
  return `${makeLine(points, maxTick)} L${sx(TOTAL_YEARS).toFixed(1)},${bottomY} L${PAD.left.toFixed(1)},${bottomY}Z`
}

// ── Chart component ───────────────────────────────────────────────────────
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
              return (
                <circle key={scenario.key} cx={hx} cy={hy} r={4.5}
                  fill={scenario.color} stroke="white" strokeWidth="2" />
              )
            })}
          </>
        )
      })()}

      <line x1={PAD.left} y1={bottomY} x2={PAD.left + PW} y2={bottomY} stroke="#e5e7eb" strokeWidth="1.5" />
    </svg>
  )
}

// ── Investment formula description ───────────────────────────────────────
// Returns [{component, value}] — actual computed values for each step of the projection.
// value = null means it's a label-only row (no numeric value to show).
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
    case 'mf_sip': {
      const raw = Number(inv.monthly_sip_amount) || 0
      const sip = inv.sip_frequency === 'weekly' ? (raw * 52) / 12 : raw
      return sipRows(sip, scRates.mf, 'SIP')
    }
    case 'epf':
      return sipRows(Number(inv.monthly_sip_amount) || 0, FIXED_RATES.epf, 'Contribution')
    case 'ppf':
      return sipRows(Number(inv.monthly_sip_amount) || 0, FIXED_RATES.ppf, 'Contribution')
    case 'nps':
      return sipRows(Number(inv.monthly_sip_amount) || 0, scRates.nps, 'Contribution')
    case 'mf_lumpsum':
      return [{ component: `Lumpsum grown @ ${scRates.mf}% p.a.`, value: cv * Math.pow(1 + scRates.mf / 100, years) }]
    case 'stocks':
      return [{ component: `Lumpsum grown @ ${scRates.stocks}% p.a.`, value: cv * Math.pow(1 + scRates.stocks / 100, years) }]
    case 'gold':
      return [{ component: `Lumpsum grown @ ${FIXED_RATES.gold}% p.a. (fixed)`, value: cv * Math.pow(1 + FIXED_RATES.gold / 100, years) }]
    case 'fd': {
      const rate = Number(inv.interest_rate) || 6.5
      return [{ component: `FD grown @ ${rate}% p.a. (individual rate)`, value: projectFD(inv, years) }]
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
    default:
      return [{ component: 'Current value', value: cv }]
  }
}

// ── Asset type breakdown modal ────────────────────────────────────────────
function TypeBreakdownModal({ group, investments, rates, retirementYear, onClose }) {
  const groupInvs = investments.filter(inv => group.types.includes(inv.type))

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ backgroundColor: 'rgba(0,0,0,0.45)' }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl flex flex-col"
        style={{ maxHeight: '82vh' }}>

        {/* Header */}
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
          {/* 3-scenario summary */}
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
                    {sc.key === 'conservative' || sc.key === 'standard' || sc.key === 'optimistic'
                      ? rates[sc.key].mf != null
                        ? `MF ${rates[sc.key].mf}%  ·  Stocks ${rates[sc.key].stocks}%  ·  NPS ${rates[sc.key].nps}%`
                        : ''
                      : ''}
                  </p>
                </div>
              )
            })}
          </div>

          {/* Per-investment cards */}
          {groupInvs.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-6">No investments in this category</p>
          ) : (
            <div className="space-y-3">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Per Investment</p>
              {groupInvs.map(inv => {
                const cv = effectiveCurrentValue(inv)
                const rawSip = Number(inv.monthly_sip_amount) || 0
                const sipDisplay = inv.type === 'mf_sip' && inv.sip_frequency === 'weekly'
                  ? (rawSip * 52) / 12 : rawSip
                const sipLabel = inv.type === 'insurance' ? 'Premium' : 'Monthly SIP'
                const hasSip = ['mf_sip', 'epf', 'ppf', 'nps', 'insurance'].includes(inv.type) && rawSip > 0

                // Breakdown rows from standard scenario (row labels are the same across scenarios)
                const stdBreakdown = calcBreakdown(inv, retirementYear, rates.standard)
                const hasMultipleValueRows = stdBreakdown.filter(r => r.value !== null).length > 1

                return (
                  <div key={inv.id} className="border border-gray-100 rounded-xl overflow-hidden bg-gray-50">
                    {/* Header */}
                    <div className="px-4 pt-3.5 pb-2">
                      <p className="text-sm font-semibold text-gray-800">{inv.name}</p>
                      <p className="text-xs text-gray-400 mt-0.5 capitalize">
                        {inv.type.replace(/_/g, ' ')}
                        {inv.account_number ? ` · ${inv.account_number}` : ''}
                      </p>
                    </div>

                    {/* Key facts chips */}
                    <div className="px-4 pb-3 flex flex-wrap gap-1.5">
                      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-white border border-gray-200 text-xs font-medium text-gray-700">
                        <span className="text-gray-400">Current</span> {fmtCr(cv)}
                      </span>
                      {hasSip && (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-white border border-gray-200 text-xs font-medium text-gray-700">
                          <span className="text-gray-400">{sipLabel}</span> {fmt(sipDisplay)}/mo
                          {inv.sip_frequency === 'weekly' && (
                            <span className="text-gray-400">(weekly)</span>
                          )}
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

                    {/* Calculation breakdown table */}
                    <div className="border-t border-gray-100 bg-white">
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="border-b border-gray-100 bg-gray-50">
                            <th className="text-left px-4 py-2 text-gray-400 font-medium">Calculation step</th>
                            {SCENARIOS.map(sc => (
                              <th key={sc.key} className="text-right px-3 py-2 font-bold" style={{ color: sc.color }}>
                                {sc.label}
                              </th>
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
                                const total = projectInvestment(inv, retirementYear, r)
                                return (
                                  <td key={sc.key} className="px-3 py-2.5 text-right font-bold" style={{ color: sc.color }}>
                                    {fmtCr(total)}
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

// ── Goals utilities ───────────────────────────────────────────────────────
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

// ── Goals constants ───────────────────────────────────────────────────────
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

const GOAL_BLANK_FORM = {
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

// ── Icons ─────────────────────────────────────────────────────────────────
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

// ── GoalCard ──────────────────────────────────────────────────────────────
function GoalCard({ goal, investments, onEdit, onView, onDelete }) {
  const linked = investments.filter(i => i.goal_id === goal.id)
  const saved = linked.reduce((s, i) => s + effectiveCurrentValue(i), 0)
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
        <div className="w-12 h-12 rounded-xl flex items-center justify-center text-2xl shrink-0 select-none"
          style={{ backgroundColor: accent + '18' }}>
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

// ── GoalFormModal ─────────────────────────────────────────────────────────
function GoalFormModal({ initial, allInvestments, onSave, onClose }) {
  const [form, setForm] = useState(() => initial
    ? { ...GOAL_BLANK_FORM, ...initial, use_age: false, current_age: '', target_amount: initial.target_amount ?? '' }
    : GOAL_BLANK_FORM
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
  const currentSaved = allInvestments
    .filter(i => linkedIds.includes(i.id))
    .reduce((s, i) => s + effectiveCurrentValue(i), 0)
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

        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 shrink-0">
          <h2 className="text-lg font-bold text-gray-900">{initial ? 'Edit Goal' : 'New Goal'}</h2>
          <button onClick={onClose} className="p-1.5 rounded-xl hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors">
            <CloseIcon />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          <div className="grid grid-cols-5 gap-6">

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

              {/* Color picker */}
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
                          <p className="text-xs text-gray-400">{inv.type?.replace(/_/g, ' ')} · {fmt(effectiveCurrentValue(inv))}</p>
                        </div>
                      </label>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Live preview */}
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

// ── GoalDetail ────────────────────────────────────────────────────────────
function GoalDetail({ goal, investments, onBack, onAchieve, onEdit }) {
  const linked = investments.filter(i => i.goal_id === goal.id)
  const saved = linked.reduce((s, i) => s + effectiveCurrentValue(i), 0)
  const curYear = new Date().getFullYear()
  const years = yearsFromNow(goal.target_year || curYear)
  const target = inflationTarget(goal.target_amount || 0, years, goal.inflation_rate || 6)
  const months = monthsFromNow(goal.target_year || curYear)
  const pct = target > 0 ? Math.min(100, (saved / target) * 100) : 0
  const sip = sipNeeded(target, saved, months)
  const accent = goal.color || '#6C63FF'

  return (
    <div className="p-8 max-w-3xl">
      <div className="flex items-center justify-between mb-6">
        <button onClick={onBack}
          className="flex items-center gap-1.5 text-sm font-medium text-gray-500 hover:text-gray-900 transition-colors">
          <BackIcon /> Back to Wealth &amp; Goals
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

      <div className="grid grid-cols-3 gap-4 mb-5">
        {[
          { label: "Today's Cost", value: fmt(goal.target_amount || 0), sub: "at today's prices", ac: null },
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
                  <p className="font-semibold text-gray-800">{fmt(effectiveCurrentValue(inv))}</p>
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

// ── Main page ─────────────────────────────────────────────────────────────
export default function NetWorth() {
  const [investments, setInvestments] = useState([])
  const [goals, setGoals] = useState([])
  const [loading, setLoading] = useState(true)
  const [hoveredYear, setHoveredYear] = useState(null)
  const [retirementYear, setRetirementYear] = useState(14)
  const [selectedBreakdownGroup, setSelectedBreakdownGroup] = useState(null)

  // Per-scenario, per-type adjustable rates (only MF, Stocks, NPS are editable)
  const [rates, setRates] = useState({
    conservative: { ...RATE_DEFAULTS.conservative },
    standard:     { ...RATE_DEFAULTS.standard },
    optimistic:   { ...RATE_DEFAULTS.optimistic },
  })

  // Goals state
  const [goalView, setGoalView] = useState(null)       // null | 'detail'
  const [selectedGoal, setSelectedGoal] = useState(null)
  const [showGoalForm, setShowGoalForm] = useState(false)
  const [editGoal, setEditGoal] = useState(null)
  const [goalFilter, setGoalFilter] = useState('all')  // 'all'|'need'|'want'|'achieved'

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

  // ── Goals handlers ──────────────────────────────────────────────────────
  const handleSaveGoal = async (formData) => {
    const { linkedInvestmentIds, prevLinkedIds, use_age, target_age, current_age, ...data } = formData
    let goalId
    if (editGoal) {
      await window.electronAPI.updateGoal({ ...data, id: editGoal.id, is_achieved: editGoal.is_achieved ? 1 : 0 })
      goalId = editGoal.id
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
    setShowGoalForm(false)
    setEditGoal(null)
    await load()
  }

  const handleDeleteGoal = async (id) => {
    if (!window.confirm('Delete this goal?')) return
    await window.electronAPI.deleteGoal(id)
    if (selectedGoal?.id === id) { setGoalView(null); setSelectedGoal(null) }
    await load()
  }

  const handleAchieve = async (id) => {
    const g = goals.find(x => x.id === id)
    if (!g) return
    await window.electronAPI.updateGoal({ ...g, is_achieved: 1 })
    await load()
    if (selectedGoal?.id === id) setSelectedGoal(p => ({ ...p, is_achieved: 1 }))
  }

  const openGoalEdit = (g) => { setEditGoal(g); setShowGoalForm(true) }

  // ── GoalDetail full-page view ───────────────────────────────────────────
  if (goalView === 'detail' && selectedGoal) {
    return (
      <>
        <GoalDetail
          goal={selectedGoal}
          investments={investments}
          onBack={() => { setGoalView(null); setSelectedGoal(null) }}
          onAchieve={handleAchieve}
          onEdit={openGoalEdit}
        />
        {showGoalForm && (
          <GoalFormModal
            initial={editGoal}
            allInvestments={investments}
            onSave={handleSaveGoal}
            onClose={() => { setShowGoalForm(false); setEditGoal(null) }}
          />
        )}
      </>
    )
  }

  // ── Loading skeleton ────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="p-6 space-y-4">
        {[1, 2, 3, 4].map(i => <div key={i} className="h-24 bg-gray-100 rounded-2xl animate-pulse" />)}
      </div>
    )
  }

  // ── Projection data ─────────────────────────────────────────────────────
  const currentNW = investments.reduce((s, inv) => s + effectiveCurrentValue(inv), 0)
  const monthlySIP = calcMonthlySIP(investments)

  // Merge per-scenario user rates with fixed rates
  const allSeries = SCENARIOS.map(sc => {
    const mergedRates = { ...rates[sc.key], ...FIXED_RATES }
    return {
      scenario: sc,
      points: projectAll(investments, TOTAL_YEARS, mergedRates),
    }
  })

  const rawMax = Math.max(...allSeries.flatMap(s => s.points.map(p => p.value)), 1)
  const { ticks: yTicks, maxTick } = computeYAxis(rawMax)

  const retirementRow = allSeries.map(({ scenario, points }) => ({
    scenario,
    value: points[retirementYear]?.value || 0,
  }))
  const finalRow = allSeries.map(({ scenario, points }) => ({
    scenario,
    value: points[TOTAL_YEARS]?.value || 0,
  }))
  const hoveredRow = hoveredYear !== null
    ? allSeries.map(({ scenario, points }) => ({ scenario, value: points[hoveredYear]?.value || 0 }))
    : null

  // Standard scenario rates for asset breakdown
  const standardRates = { ...rates.standard, ...FIXED_RATES }

  // Asset breakdown at retirement (all 3 scenarios)
  const assetBreakdownGroups = ASSET_GROUPS.map(group => {
    const groupInvs = investments.filter(inv => group.types.includes(inv.type))
    if (groupInvs.length === 0) return null
    const values = {}
    SCENARIOS.forEach(sc => {
      const r = { ...rates[sc.key], ...FIXED_RATES }
      values[sc.key] = Math.round(groupInvs.reduce((s, inv) => s + projectInvestment(inv, retirementYear, r), 0))
    })
    const value = values.standard
    return { ...group, value, values }
  }).filter(Boolean).filter(g => g.value > 0)

  const breakdownTotal = assetBreakdownGroups.reduce((s, g) => s + g.value, 0)

  // Goals filtering
  const filteredGoals = goals.filter(g => {
    if (goalFilter === 'need') return g.type === 'need' && !g.is_achieved
    if (goalFilter === 'want') return g.type === 'want' && !g.is_achieved
    if (goalFilter === 'achieved') return Boolean(g.is_achieved)
    return !g.is_achieved
  })

  const hasInvestments = investments.length > 0

  return (
    <div className="p-6">
      {/* Page Header */}
      <div className="mb-5">
        <h2 className="text-2xl font-bold text-gray-900">Wealth &amp; Goals</h2>
        <p className="mt-1 text-sm text-gray-500">
          Net worth projection · 3 scenarios · Goals tracker
        </p>
      </div>

      {/* ── NET WORTH SECTION (only if investments exist) ── */}
      {hasInvestments ? (
        <>
          {/* Summary cards */}
          <div className="grid grid-cols-4 gap-3 mb-5">
            <div className="bg-white rounded-2xl p-4 border border-gray-100 shadow-sm">
              <p className="text-xs text-gray-400 mb-1">Current Net Worth</p>
              <p className="text-xl font-bold text-gray-900">{fmtCr(currentNW)}</p>
              <p className="text-xs text-gray-400 mt-0.5">{investments.length} investment{investments.length !== 1 ? 's' : ''}</p>
            </div>

            <div className="bg-white rounded-2xl p-4 border border-gray-100 shadow-sm">
              <p className="text-xs text-gray-400 mb-1">Monthly SIP Total</p>
              <p className="text-xl font-bold text-gray-900">{fmt(monthlySIP)}</p>
              <p className="text-xs text-gray-400 mt-0.5">MF + EPF + NPS + PPF</p>
            </div>

            <div className="rounded-2xl p-4 border shadow-sm" style={{ backgroundColor: '#f5f3ff', borderColor: '#ede9fe' }}>
              <p className="text-xs font-semibold mb-1" style={{ color: '#7C3AED' }}>At Retirement ({retirementYear}Y)</p>
              <p className="text-xl font-bold text-gray-900">{fmtCr(retirementRow[1].value)}</p>
              <p className="text-xs text-gray-400 mt-0.5">
                {fmtCr(retirementRow[0].value)} – {fmtCr(retirementRow[2].value)}
              </p>
            </div>

            <div className="bg-white rounded-2xl p-4 border border-gray-100 shadow-sm">
              <p className="text-xs text-gray-400 mb-1">At 22 Years</p>
              <p className="text-xl font-bold text-gray-800">{fmtCr(finalRow[1].value)}</p>
              <p className="text-xs text-gray-400 mt-0.5">
                {fmtCr(finalRow[0].value)} – {fmtCr(finalRow[2].value)}
              </p>
            </div>
          </div>

          {/* Chart card */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 mb-4">
            <div className="flex items-start justify-between mb-4">
              <div>
                <p className="text-sm font-bold text-gray-800">Projected Net Worth Growth</p>
                <p className="text-xs text-gray-400 mt-0.5">
                  Starting {fmtCr(currentNW)} corpus + {fmt(monthlySIP)}/mo SIP · per-type compound rates
                </p>
              </div>
              <div className="flex items-center gap-5">
                {SCENARIOS.map(sc => (
                  <div key={sc.key} className="flex items-center gap-1.5">
                    <svg width="24" height="10">
                      <line x1="0" y1="5" x2="24" y2="5" stroke={sc.color} strokeWidth="2.5" strokeLinecap="round" />
                    </svg>
                    <span className="text-xs font-medium text-gray-600">{sc.label}</span>
                    <span className="text-[11px] text-gray-400">({rates[sc.key].mf}% MF)</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Retirement year selector */}
            <div className="flex items-center gap-4 mb-4 px-1 py-3 rounded-xl bg-gray-50 border border-gray-100">
              <div className="shrink-0">
                <p className="text-xs font-semibold text-gray-700">Retirement at Year</p>
                <p className="text-xs text-gray-400">drag to adjust</p>
              </div>
              <input
                type="range" min="1" max={TOTAL_YEARS} step="1"
                value={retirementYear}
                onChange={e => setRetirementYear(Number(e.target.value))}
                className="flex-1 accent-indigo-500 cursor-pointer"
                style={{ accentColor: '#6C63FF' }}
              />
              <div className="shrink-0 text-right w-20">
                <p className="text-lg font-bold text-indigo-600">Year {retirementYear}</p>
                <p className="text-xs text-gray-400">{fmtCr(retirementRow[1].value)}</p>
              </div>
            </div>

            <ProjectionChart
              allSeries={allSeries}
              maxTick={maxTick}
              yTicks={yTicks}
              hoveredYear={hoveredYear}
              onHover={setHoveredYear}
              retirementYear={retirementYear}
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

          {/* Scenario retirement cards */}
          <div className="grid grid-cols-3 gap-3 mb-4">
            {retirementRow.map(({ scenario, value }) => {
              const multiple = currentNW > 0 ? (value / currentNW).toFixed(1) : null
              return (
                <div key={scenario.key} className="rounded-2xl p-4 border"
                  style={{ backgroundColor: scenario.color + '12', borderColor: scenario.color + '35' }}>
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-xs font-bold uppercase tracking-wide" style={{ color: scenario.color }}>
                      {scenario.label}
                    </span>
                    <span className="text-xs font-semibold px-2 py-0.5 rounded-full"
                      style={{ backgroundColor: scenario.color + '20', color: scenario.color }}>
                      MF {rates[scenario.key].mf}% · Stocks {rates[scenario.key].stocks}%
                    </span>
                  </div>
                  <p className="text-2xl font-bold text-gray-900 mb-0.5">{fmtCr(value)}</p>
                  <p className="text-xs text-gray-400">at retirement · Year {retirementYear}</p>
                  {multiple && (
                    <p className="text-xs font-semibold mt-2" style={{ color: scenario.color }}>
                      {multiple}× your current net worth
                    </p>
                  )}
                </div>
              )
            })}
          </div>

          {/* Asset Type × Scenario Breakdown at Retirement */}
          {assetBreakdownGroups.length > 0 && (
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 mb-4">
              <div className="flex items-center justify-between mb-1">
                <p className="text-sm font-bold text-gray-800">Investment Type Breakdown at Retirement</p>
                <span className="text-xs px-2.5 py-1 rounded-full font-semibold bg-indigo-50 text-indigo-600">Year {retirementYear}</span>
              </div>
              <p className="text-xs text-gray-400 mb-4">Projected value at Year {retirementYear} across all 3 scenarios · click a row to see detailed calculation</p>

              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-100">
                      <th className="text-left text-xs font-semibold text-gray-400 pb-3 w-36">Asset Type</th>
                      <th className="text-right text-xs font-semibold pb-3 px-4" style={{ color: SCENARIOS[0].color }}>
                        Conservative<br/>
                        <span className="font-normal text-gray-400">{rates.conservative.mf}% MF</span>
                      </th>
                      <th className="text-right text-xs font-semibold pb-3 px-4" style={{ color: SCENARIOS[1].color }}>
                        Market Standard<br/>
                        <span className="font-normal text-gray-400">{rates.standard.mf}% MF</span>
                      </th>
                      <th className="text-right text-xs font-semibold pb-3 px-4" style={{ color: SCENARIOS[2].color }}>
                        Optimistic<br/>
                        <span className="font-normal text-gray-400">{rates.optimistic.mf}% MF</span>
                      </th>
                      <th className="text-right text-xs font-semibold text-gray-400 pb-3 pl-4 w-16">% of Std</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {assetBreakdownGroups
                      .slice()
                      .sort((a, b) => b.value - a.value)
                      .map(group => {
                        const pctVal = breakdownTotal > 0 ? (group.value / breakdownTotal) * 100 : 0
                        return (
                          <tr key={group.key}
                            className="hover:bg-indigo-50 transition-colors cursor-pointer"
                            onClick={() => setSelectedBreakdownGroup(group)}
                            title="Click to see detailed calculation">
                            <td className="py-2.5">
                              <div className="flex items-center gap-2">
                                <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: group.color }} />
                                <span className="text-sm font-medium text-gray-700">{group.label}</span>
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} className="w-3 h-3 text-gray-300">
                                  <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
                                </svg>
                              </div>
                            </td>
                            <td className="py-2.5 px-4 text-right">
                              <span className="text-sm font-semibold" style={{ color: SCENARIOS[0].color }}>{fmtCr(group.values.conservative)}</span>
                            </td>
                            <td className="py-2.5 px-4 text-right">
                              <div className="flex flex-col items-end gap-0.5">
                                <span className="text-sm font-bold" style={{ color: SCENARIOS[1].color }}>{fmtCr(group.values.standard)}</span>
                                <div className="w-20 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                                  <div className="h-full rounded-full" style={{ width: `${pctVal}%`, backgroundColor: group.color }} />
                                </div>
                              </div>
                            </td>
                            <td className="py-2.5 px-4 text-right">
                              <span className="text-sm font-semibold" style={{ color: SCENARIOS[2].color }}>{fmtCr(group.values.optimistic)}</span>
                            </td>
                            <td className="py-2.5 pl-4 text-right">
                              <span className="text-xs text-gray-500">{pctVal.toFixed(1)}%</span>
                            </td>
                          </tr>
                        )
                      })}
                  </tbody>
                  <tfoot>
                    <tr className="border-t-2 border-gray-200">
                      <td className="py-3 text-sm font-bold text-gray-700">Total</td>
                      {SCENARIOS.map(sc => {
                        const total = assetBreakdownGroups.reduce((s, g) => s + g.values[sc.key], 0)
                        return (
                          <td key={sc.key} className="py-3 px-4 text-right">
                            <span className="text-sm font-bold" style={{ color: sc.color }}>{fmtCr(total)}</span>
                          </td>
                        )
                      })}
                      <td className="py-3 pl-4 text-right">
                        <span className="text-xs font-bold text-gray-400">100%</span>
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          )}

          {/* Asset type detail modal */}
          {selectedBreakdownGroup && (
            <TypeBreakdownModal
              group={selectedBreakdownGroup}
              investments={investments}
              rates={rates}
              retirementYear={retirementYear}
              onClose={() => setSelectedBreakdownGroup(null)}
            />
          )}

          {/* Rate editor */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 mb-4">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-4">
              Customize Return Rates
            </p>

            {/* 3×3 grid: columns = scenarios, rows = MF/Stocks/NPS */}
            <div className="overflow-x-auto">
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
                              className="w-14 text-right px-2 py-1.5 rounded-lg border border-gray-200 text-sm font-bold focus:outline-none focus:ring-2 focus:ring-blue-100 transition-colors"
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

            {/* Fixed rate badges */}
            <div className="mt-4 pt-4 border-t border-gray-100">
              <p className="text-xs font-semibold text-gray-400 mb-2">Fixed Rates (not editable)</p>
              <div className="flex flex-wrap gap-2">
                {[
                  { label: 'EPF', value: '8.25%' },
                  { label: 'PPF', value: '7.1%' },
                  { label: 'Gold', value: '8.5%' },
                  { label: 'FD', value: 'individual rates' },
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
        </>
      ) : (
        /* No investments: show empty state for net worth section */
        <div className="flex items-center justify-center h-48 bg-white rounded-2xl border border-dashed border-gray-200 mb-6">
          <div className="text-center">
            <p className="text-4xl mb-3">📊</p>
            <p className="text-base font-semibold text-gray-700">Add investments to see projections</p>
            <p className="text-sm text-gray-400 mt-1">Net worth chart will appear once you have investments</p>
          </div>
        </div>
      )}

      {/* ── GOALS SECTION ── */}
      <div className="border-t border-gray-200 pt-6 mt-2">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-xl font-bold text-gray-900">Goals</h3>
            <p className="text-sm text-gray-500 mt-0.5">
              {goals.filter(g => !g.is_achieved).length} active · {goals.filter(g => g.is_achieved).length} achieved
            </p>
          </div>
          <button
            onClick={() => { setEditGoal(null); setShowGoalForm(true) }}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-white text-sm font-semibold hover:opacity-90 transition-opacity"
            style={{ backgroundColor: '#6C63FF' }}
          >
            <span className="text-base font-bold leading-none">+</span>
            Add Goal
          </button>
        </div>

        {/* Filter pills */}
        <div className="flex gap-1 mb-5 bg-gray-100 rounded-xl p-1 w-fit">
          {[
            { key: 'all', label: 'Active' },
            { key: 'need', label: 'Needs' },
            { key: 'want', label: 'Wants' },
            { key: 'achieved', label: 'Achieved' },
          ].map(t => (
            <button key={t.key} onClick={() => setGoalFilter(t.key)}
              className="px-4 py-1.5 rounded-lg text-sm font-semibold transition-all"
              style={{
                backgroundColor: goalFilter === t.key ? '#fff' : 'transparent',
                color: goalFilter === t.key ? '#1a1a2e' : '#9ca3af',
                boxShadow: goalFilter === t.key ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
              }}>
              {t.label}
            </button>
          ))}
        </div>

        {/* Goal cards grid */}
        {filteredGoals.length === 0 ? (
          <div className="flex items-center justify-center h-48 rounded-2xl bg-white border border-dashed border-gray-200">
            <div className="text-center">
              <p className="text-4xl mb-3">{goalFilter === 'achieved' ? '🏆' : '🎯'}</p>
              <p className="text-base font-semibold text-gray-700">
                {goalFilter === 'achieved' ? 'No achieved goals yet' : 'No goals yet'}
              </p>
              <p className="text-sm text-gray-400 mt-1">
                {goalFilter === 'achieved' ? 'Keep working towards your goals!' : '+ Add Goal to get started'}
              </p>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-2 xl:grid-cols-3 gap-5">
            {filteredGoals.map(g => (
              <GoalCard key={g.id} goal={g} investments={investments}
                onEdit={openGoalEdit}
                onView={(g) => { setSelectedGoal(g); setGoalView('detail') }}
                onDelete={handleDeleteGoal} />
            ))}
          </div>
        )}
      </div>

      {/* Goal form modal */}
      {showGoalForm && (
        <GoalFormModal
          initial={editGoal}
          allInvestments={investments}
          onSave={handleSaveGoal}
          onClose={() => { setShowGoalForm(false); setEditGoal(null) }}
        />
      )}
    </div>
  )
}
