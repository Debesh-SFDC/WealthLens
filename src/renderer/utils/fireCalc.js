// Pure FIRE (Financial Independence, Retire Early) calculation engine.
// No UI, no IPC — takes a plain inputs object, returns a plain results object.
//
// Model (all rows are "year Y", Y = currentYear + t):
//   - Each included instrument is projected on its own:
//       balance(0)   = currentBalance
//       balance(t+1) = balance(t) × (1 + r) + monthly(t) × FV12(r)
//       monthly(t)   = monthly0 × (1 + stepUp)^t          (t = 0 → no step-up)
//       FV12(r)      = FV of 12 end-of-month deposits at rm = (1+r)^(1/12) − 1
//   - Lump sums and the cash part of future expenses land in a separate "cash flows"
//     bucket in their own year (including the current year), which then compounds at
//     the portfolio's display-blended return.
//   - Corpus(Y) = Σ instrument balances + cash-flow bucket (floored at 0 for display).
//   - FI target(Y) = inflated life-stage expense × FI multiple + PV of EMIs still running.

export const FIRE_MULTIPLIERS = { lean: 25, regular: 30, fat: 40, barista: 20 }
export const DEFAULT_RETIREMENT_DATE = '2041-08-12'
const MIN_PROJECTION_YEARS = 40
const MAX_PROJECTION_YEARS = 80
const EMI_DISCOUNT_RATE = 0.07

// ── Input sanitising ───────────────────────────────────────────────────────
// Blank / null / NaN → fallback. A real 0 stays 0.
export function num(v, fallback = 0) {
  if (v === null || v === undefined || v === '') return fallback
  const n = Number(v)
  return Number.isFinite(n) ? n : fallback
}
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v))
const RATE_MIN = -50, RATE_MAX = 50 // % per year
const rate = (v, fb = 0) => clamp(num(v, fb), RATE_MIN, RATE_MAX)
const yearOrNull = v => {
  const n = num(v, null)
  return n != null && n >= 1900 && n <= 2200 ? Math.round(n) : null
}

// FV of 12 end-of-month deposits of 1 at an annual effective rate (percent).
export function fv12(annualPct) {
  const r = annualPct / 100
  if (r <= -1) return 12
  const rm = Math.pow(1 + r, 1 / 12) - 1
  if (Math.abs(rm) < 1e-12) return 12
  return (Math.pow(1 + rm, 12) - 1) / rm
}

function normalizeInstrument(i) {
  return {
    name: i?.name || 'Investment',
    type: i?.type || null,
    key: i?.key ?? null,
    currentBalance: Math.max(0, num(i?.currentBalance, 0)),
    monthlyContribution: Math.max(0, num(i?.monthlyContribution, 0)),
    annualReturnPct: rate(i?.annualReturnPct, 0),
    includeInCorpus: i?.includeInCorpus !== false,
    isExtra: !!i?.isExtra,
    note: i?.note || null, // UI-only: why it's excluded / where the rate came from
  }
}

// Display-only blended return, weighted by (balance + 12 × monthly SIP).
export function computeBlended(instruments) {
  const list = (instruments || []).map(normalizeInstrument)
  const totalMonthly = list.reduce((s, i) => s + i.monthlyContribution, 0)
  const totalWeight = list.reduce((s, i) => s + i.currentBalance + 12 * i.monthlyContribution, 0)
  const blendedAnnual = totalWeight > 0
    ? list.reduce((s, i) => s + (i.currentBalance + 12 * i.monthlyContribution) / totalWeight * i.annualReturnPct, 0)
    : 0
  return { totalMonthly, blendedAnnual, blendedMonthly: blendedAnnual / 12 }
}

// ── Loans ──────────────────────────────────────────────────────────────────
function generateLoansFromExpenses(futureExpenses, inflationPct, currentYear) {
  const generated = []
  for (const fe of futureExpenses) {
    if (fe.financedPct <= 0 || fe.year == null) continue
    const n = Math.round(fe.loanTenureYears * 12)
    if (n <= 0) continue
    const yearsFromNow = Math.max(0, fe.year - currentYear)
    // Loan principal is the financed share of the cost inflated to the purchase year.
    const loanAmount = fe.costToday * (fe.financedPct / 100) * Math.pow(1 + inflationPct / 100, yearsFromNow)
    const mr = fe.loanInterestPct / 1200
    const monthlyEmi = mr === 0
      ? loanAmount / n
      : loanAmount * (mr * Math.pow(1 + mr, n)) / (Math.pow(1 + mr, n) - 1)
    generated.push({
      name: fe.name,
      annualEmi: monthlyEmi * 12,
      loanAmount,
      startYear: fe.year,
      endYear: fe.year + Math.round(fe.loanTenureYears),
      generated: true,
    })
  }
  return generated
}

function emiPvAt(loans, year) {
  const active = loans.filter(l => l.startYear <= year && year < l.endYear)
  const pv = active.reduce((s, l) => {
    const n = l.endYear - year
    return s + l.annualEmi * (1 - Math.pow(1 + EMI_DISCOUNT_RATE, -n)) / EMI_DISCOUNT_RATE
  }, 0)
  return { active, pv }
}

function kidsAtYear(year, scenarioKidsPlanned, kid1Year, kid2Year) {
  let kids = 0
  if (scenarioKidsPlanned >= 1 && kid1Year != null && year >= kid1Year) kids = 1
  if (scenarioKidsPlanned >= 2 && kid2Year != null && year >= kid2Year) kids = 2
  return kids
}

// ── Normalise the whole inputs object once ─────────────────────────────────
export function normalizeInputs(inputs = {}) {
  const currentYear = Math.round(num(inputs.currentYear, new Date().getFullYear()))
  const ageKnown = num(inputs.currentAge, null) != null
  const currentAge = Math.round(clamp(num(inputs.currentAge, 30), 0, 120))
  const inflationPct = clamp(num(inputs.inflationPct, 6), 0, 30)
  const sipStepUpPct = clamp(num(inputs.sipStepUpPct, 0), -50, 100)
  const fireType = FIRE_MULTIPLIERS[inputs.fireType] ? inputs.fireType : 'regular'
  const override = num(inputs.fireTypeMultiplierOverride, null)
  const fiMultiple = clamp(
    override != null && override > 0 ? override : (FIRE_MULTIPLIERS[fireType] ?? num(inputs.fiMultiple, 30)),
    1, 200
  )
  const baristaAnnualIncome = fireType === 'barista' ? Math.max(0, num(inputs.baristaAnnualIncome, 0)) : 0

  const targetDateStr = typeof inputs.targetRetirementDate === 'string' && /^\d{4}-\d{2}-\d{2}/.test(inputs.targetRetirementDate)
    ? inputs.targetRetirementDate.slice(0, 10) : null
  const targetYear = targetDateStr ? Number(targetDateStr.slice(0, 4)) : null

  const futureExpenses = (inputs.futureExpenses || []).map(fe => ({
    name: fe?.name || 'Expense',
    costToday: Math.max(0, num(fe?.costToday, 0)),
    year: yearOrNull(fe?.year),
    financedPct: clamp(num(fe?.financedPct, 0), 0, 100),
    loanInterestPct: clamp(num(fe?.loanInterestPct, 0), 0, 50),
    loanTenureYears: clamp(num(fe?.loanTenureYears, 0), 0, 40),
  }))
  const lumpSums = (inputs.lumpSums || []).map(ls => ({
    name: ls?.name || 'Lump sum',
    amount: num(ls?.amount, 0),
    year: yearOrNull(ls?.year),
  }))
  const loans = (inputs.loans || []).map(l => ({
    name: l?.name || 'Loan',
    loanType: l?.loanType || 'other',
    annualEmi: Math.max(0, num(l?.annualEmi, 0)),
    startYear: yearOrNull(l?.startYear),
    endYear: yearOrNull(l?.endYear),
  })).filter(l => l.annualEmi > 0 && l.startYear != null && l.endYear != null && l.endYear > l.startYear)

  const additionalInstruments = (inputs.additionalInstruments || []).map(a => ({
    name: a?.name || 'Extra investment',
    monthlyAmount: Math.max(0, num(a?.monthlyAmount, 0)),
    annualReturnPct: rate(a?.annualReturnPct, 0),
  })).filter(a => a.monthlyAmount > 0)

  const kidsPlanned = clamp(Math.round(num(inputs.kidsPlanned, 0)), 0, 2)

  const lastYear = Math.max(currentYear + MIN_PROJECTION_YEARS, targetYear != null ? targetYear + 1 : 0)
  const projectionYears = Math.min(MAX_PROJECTION_YEARS, lastYear - currentYear)

  return {
    currentYear, currentAge, ageKnown,
    retirementAge: num(inputs.retirementAge, null),
    targetRetirementDate: targetDateStr, targetYear,
    inflationPct, sipStepUpPct, fireType, fiMultiple,
    fiMultipleSource: override != null && override > 0 ? 'custom' : 'fireType',
    baristaAnnualIncome,
    expenseNoKids: Math.max(0, num(inputs.expenseNoKids, 0)),
    expenseOneKid: Math.max(0, num(inputs.expenseOneKid, 0)),
    expenseTwoKids: Math.max(0, num(inputs.expenseTwoKids, 0)),
    kidsPlanned,
    kid1Year: yearOrNull(inputs.kid1Year),
    kid2Year: yearOrNull(inputs.kid2Year),
    instruments: (inputs.instruments || []).map(normalizeInstrument),
    additionalInstruments,
    loans, futureExpenses, lumpSums,
    projectionYears,
  }
}

// ── Corpus projection (independent of kids scenario) ──────────────────────
// Returns per-year corpus + per-year monthly contribution for the given instruments.
function projectCorpus(n, instruments) {
  const included = instruments.filter(i => i.includeInCorpus)
  const { blendedAnnual } = computeBlended(included)
  const factors = included.map(i => fv12(i.annualReturnPct))
  const stepUp = 1 + n.sipStepUpPct / 100
  const inflate = t => Math.pow(1 + n.inflationPct / 100, t)

  const balances = included.map(i => i.currentBalance)
  let cashBucket = 0
  const rows = []

  for (let t = 0; t <= n.projectionYears; t++) {
    const year = n.currentYear + t
    if (t > 0) {
      for (let k = 0; k < included.length; k++) {
        const inst = included[k]
        const monthlyPrev = inst.monthlyContribution * Math.pow(stepUp, t - 1)
        balances[k] = balances[k] * (1 + inst.annualReturnPct / 100) + monthlyPrev * factors[k]
      }
      cashBucket *= 1 + blendedAnnual / 100
    }
    // Cash flows dated this year (current year included).
    let lumpIn = 0, cashOut = 0
    for (const ls of n.lumpSums) if (ls.year === year) lumpIn += ls.amount
    for (const fe of n.futureExpenses) {
      if (fe.year === year) cashOut += fe.costToday * inflate(t) * (1 - fe.financedPct / 100)
    }
    cashBucket += lumpIn - cashOut

    const instrumentTotal = balances.reduce((s, b) => s + b, 0)
    const rawCorpus = instrumentTotal + cashBucket
    const monthlySip = included.reduce((s, i) => s + i.monthlyContribution, 0) * Math.pow(stepUp, t)
    rows.push({
      year, t,
      corpus: Math.max(0, Number.isFinite(rawCorpus) ? rawCorpus : 0),
      monthlySip: Number.isFinite(monthlySip) ? monthlySip : 0,
      lumpIn, cashOut,
    })
  }
  return { rows, blendedAnnual, totalMonthly: included.reduce((s, i) => s + i.monthlyContribution, 0) }
}

function scenarioTargets(n, allLoans, scenarioKidsPlanned) {
  const out = []
  for (let t = 0; t <= n.projectionYears; t++) {
    const year = n.currentYear + t
    const kids = kidsAtYear(year, scenarioKidsPlanned, n.kid1Year, n.kid2Year)
    let baseExpense = kids === 0 ? n.expenseNoKids : kids === 1 ? n.expenseOneKid : n.expenseTwoKids
    if (n.fireType === 'barista') baseExpense = Math.max(0, baseExpense - n.baristaAnnualIncome)
    const expenseNominal = baseExpense * Math.pow(1 + n.inflationPct / 100, t)
    const { active, pv } = emiPvAt(allLoans, year)
    out.push({ year, kids, expenseNominal, activeLoans: active, emiPv: pv, fiTarget: expenseNominal * n.fiMultiple + pv })
  }
  return out
}

function buildScenario(n, corpusRows, targets) {
  let fireYear = null
  const yearlyData = corpusRows.map((c, idx) => {
    const tg = targets[idx]
    const gap = c.corpus - tg.fiTarget
    // A zero target (no expenses entered) is not "FIRE reached".
    const hit = tg.fiTarget > 0 && c.corpus >= tg.fiTarget
    if (hit && fireYear === null) fireYear = c.year
    return {
      year: c.year, age: n.currentAge + c.t,
      corpus: c.corpus, fiTarget: tg.fiTarget, gap, hit,
      expenseNominal: tg.expenseNominal, kidsAtThisYear: tg.kids,
      activeLoans: tg.activeLoans, emiPv: tg.emiPv,
      monthlySip: c.monthlySip,
    }
  })
  const yearsToFIRE = fireYear !== null ? fireYear - n.currentYear : null
  return { fireYear, yearsToFIRE, ageAtFIRE: yearsToFIRE !== null ? n.currentAge + yearsToFIRE : null, yearlyData }
}

const SCENARIO_KEY_BY_KIDS = { 0: 'noKids', 1: 'oneKid', 2: 'twoKids' }

function runFullCalc(n, instruments) {
  const generatedLoans = generateLoansFromExpenses(n.futureExpenses, n.inflationPct, n.currentYear)
  const allLoans = [...n.loans, ...generatedLoans]
  const proj = projectCorpus(n, instruments)

  const scenarios = {
    noKids: buildScenario(n, proj.rows, scenarioTargets(n, allLoans, 0)),
    oneKid: buildScenario(n, proj.rows, scenarioTargets(n, allLoans, 1)),
    twoKids: buildScenario(n, proj.rows, scenarioTargets(n, allLoans, 2)),
  }
  const selectedScenarioKey = SCENARIO_KEY_BY_KIDS[n.kidsPlanned] || 'noKids'
  const sel = scenarios[selectedScenarioKey]

  let targetCheck = null
  if (n.targetYear != null) {
    const row = sel.yearlyData.find(r => r.year === n.targetYear)
    if (row) {
      targetCheck = {
        targetDate: n.targetRetirementDate, targetYear: n.targetYear,
        age: row.age, corpus: row.corpus, needed: row.fiTarget, gap: row.gap,
        ahead: row.gap >= 0,
      }
    } else {
      targetCheck = { targetDate: n.targetRetirementDate, targetYear: n.targetYear, outOfRange: true }
    }
  }

  return {
    blendedReturnPct: proj.blendedAnnual,
    totalMonthlyContribution: proj.totalMonthly,
    fiMultiple: n.fiMultiple,
    generatedLoans,
    allLoans,
    scenarios,
    selectedScenarioKey,
    selectedScenario: sel,
    targetCheck,
  }
}

function extrasAsInstruments(additionalInstruments) {
  return additionalInstruments.map(a => normalizeInstrument({
    name: a.name, currentBalance: 0, monthlyContribution: a.monthlyAmount,
    annualReturnPct: a.annualReturnPct, includeInCorpus: true, isExtra: true,
  }))
}

// inputs.additionalInstruments: [{ name, monthlyAmount, annualReturnPct }] — hypothetical
// extra SIPs from the "What If I Invest More?" simulator. When present, the projection
// is also run with them merged in (`enhanced`).
export function calculateFIRE(inputs = {}) {
  const n = normalizeInputs(inputs)
  const baseline = runFullCalc(n, n.instruments)
  const enhanced = n.additionalInstruments.length
    ? runFullCalc(n, [...n.instruments, ...extrasAsInstruments(n.additionalInstruments)])
    : null
  return { ...baseline, enhanced, inputsUsed: n }
}

// Smallest extra monthly SIP (stepping up at the same rate, earning the portfolio's
// blended return) such that corpus ≥ FI target in the target year, for the selected
// scenario. Solved by bisection. Returns:
//   { extraMonthly: 0 } when already on track,
//   { extraMonthly: X, returnPct } when reachable,
//   { extraMonthly: null, reason } when no SIP can help (e.g. target is this year).
export function solveExtraMonthlyForTarget(inputs = {}) {
  const n = normalizeInputs({ ...inputs, additionalInstruments: [] })
  if (n.targetYear == null) return { extraMonthly: null, reason: 'No target date' }
  const base = runFullCalc(n, n.instruments)
  const tc = base.targetCheck
  if (!tc || tc.outOfRange) return { extraMonthly: null, reason: 'Target date outside projection range' }
  if (tc.needed <= 0) return { extraMonthly: null, reason: 'No expenses entered' }
  if (tc.gap >= 0) return { extraMonthly: 0, returnPct: base.blendedReturnPct }
  if (n.targetYear <= n.currentYear) return { extraMonthly: null, reason: 'Target year is the current year — a new SIP has no time to grow' }

  const returnPct = base.blendedReturnPct
  const gapAt = x => {
    const extra = normalizeInstrument({ name: 'Extra SIP', currentBalance: 0, monthlyContribution: x, annualReturnPct: returnPct, isExtra: true })
    const r = runFullCalc(n, [...n.instruments, extra]).targetCheck
    return r.gap
  }
  let lo = 0, hi = 1000
  let guard = 0
  while (gapAt(hi) < 0) {
    lo = hi; hi *= 2
    if (++guard > 40 || hi > 1e10) return { extraMonthly: null, reason: 'Not reachable with any realistic SIP' }
  }
  for (let i = 0; i < 60 && hi - lo > 1; i++) {
    const mid = (lo + hi) / 2
    if (gapAt(mid) >= 0) hi = mid
    else lo = mid
  }
  return { extraMonthly: Math.ceil(hi), returnPct }
}
