// Pure FIRE (Financial Independence, Retire Early) calculation engine.
// No UI, no IPC — takes a plain inputs object, returns a plain results object.

export const FIRE_MULTIPLIERS = { lean: 25, regular: 30, fat: 40, barista: 20 }
const PROJECTION_YEARS = 40
const EMI_DISCOUNT_RATE = 0.07

// Step 1 — blended return rate, weighted by each instrument's monthly contribution.
// Falls back to weighting by current balance when nobody has a monthly contribution,
// so a portfolio that's 100% lumpsum/EPF-passbook-only still yields a usable blend.
export function computeBlended(instruments) {
  const totalMonthly = instruments.reduce((s, i) => s + (Number(i.monthlyContribution) || 0), 0)

  let blendedAnnual = 0
  if (totalMonthly > 0) {
    blendedAnnual = instruments.reduce((s, i) => {
      const weight = (Number(i.monthlyContribution) || 0) / totalMonthly
      return s + weight * (Number(i.annualReturnPct) || 0)
    }, 0)
  } else {
    const totalBalance = instruments.reduce((s, i) => s + (Number(i.currentBalance) || 0), 0)
    if (totalBalance > 0) {
      blendedAnnual = instruments.reduce((s, i) => {
        const weight = (Number(i.currentBalance) || 0) / totalBalance
        return s + weight * (Number(i.annualReturnPct) || 0)
      }, 0)
    }
  }

  return { totalMonthly, blendedAnnual, blendedMonthly: blendedAnnual / 12 }
}

// Step 2 — auto-generate loan/EMI entries from financed future expenses.
function generateLoansFromExpenses(futureExpenses, inflationPct, currentYear) {
  const generated = []
  for (const fe of futureExpenses) {
    const financedPct = Number(fe.financedPct) || 0
    if (financedPct <= 0) continue

    const yearsFromNow = fe.year - currentYear
    const loanAmount = Number(fe.costToday) * (financedPct / 100) * Math.pow(1 + inflationPct / 100, yearsFromNow)

    const monthlyRate = (Number(fe.loanInterestPct) || 0) / 1200
    const n = (Number(fe.loanTenureYears) || 0) * 12
    if (n <= 0) continue

    const monthlyEmi = monthlyRate === 0
      ? loanAmount / n
      : loanAmount * (monthlyRate * Math.pow(1 + monthlyRate, n)) / (Math.pow(1 + monthlyRate, n) - 1)

    generated.push({
      name: fe.name,
      annualEmi: monthlyEmi * 12,
      startYear: fe.year,
      endYear: fe.year + Number(fe.loanTenureYears),
    })
  }
  return generated
}

// Step 4a — kid stage at a given year, gated by how many kids this scenario plans for.
function kidsAtYear(year, scenarioKidsPlanned, kid1Year, kid2Year) {
  let kids = 0
  if (scenarioKidsPlanned >= 1 && kid1Year != null && year >= kid1Year) kids = 1
  if (scenarioKidsPlanned >= 2 && kid2Year != null && year >= kid2Year) kids = 2
  return kids
}

function runScenario(inputs, resolved, scenarioKidsPlanned) {
  const {
    currentYear, currentAge, inflationPct, fiMultiple, fireType, baristaAnnualIncome,
    expenseNoKids, expenseOneKid, expenseTwoKids, kid1Year, kid2Year,
    sipStepUpPct, lumpSums, futureExpenses,
  } = inputs
  const { totalMonthly, blendedAnnual, blendedMonthly, initialCorpus, allLoans } = resolved

  const yearlyData = []
  let prevCorpus = initialCorpus
  let fireYear = null

  for (let year = currentYear; year <= currentYear + PROJECTION_YEARS; year++) {
    const yearsFromNow = year - currentYear
    const kids = kidsAtYear(year, scenarioKidsPlanned, kid1Year, kid2Year)

    let baseExpense = kids === 0 ? expenseNoKids : kids === 1 ? expenseOneKid : expenseTwoKids
    if (fireType === 'barista' && baristaAnnualIncome) {
      baseExpense = Math.max(0, baseExpense - baristaAnnualIncome)
    }

    const expenseNominal = baseExpense * Math.pow(1 + inflationPct / 100, yearsFromNow)
    const core = expenseNominal * fiMultiple

    const activeLoans = allLoans.filter(l => l.startYear <= year && year < l.endYear)
    const totalEmiPv = activeLoans.reduce((s, l) => {
      const n = l.endYear - year
      return s + l.annualEmi * (1 - Math.pow(1 + EMI_DISCOUNT_RATE, -n)) / EMI_DISCOUNT_RATE
    }, 0)
    const fiTarget = core + totalEmiPv

    let corpus
    if (year === currentYear) {
      corpus = initialCorpus
    } else {
      const monthlyRate = blendedMonthly / 100
      const currentMonthly = totalMonthly * Math.pow(1 + sipStepUpPct / 100, yearsFromNow)
      const sipContribution = monthlyRate === 0
        ? currentMonthly * 12
        : currentMonthly * (Math.pow(1 + monthlyRate, 12) - 1) / monthlyRate

      corpus = prevCorpus * (1 + blendedAnnual / 100) + sipContribution

      for (const ls of lumpSums) {
        if (ls.year === year) corpus += Number(ls.amount) || 0
      }

      for (const fe of futureExpenses) {
        if (fe.year === year) {
          const financedPct = Number(fe.financedPct) || 0
          const cashPortion = Number(fe.costToday) * Math.pow(1 + inflationPct / 100, yearsFromNow) * (1 - financedPct / 100)
          corpus -= cashPortion
          corpus = Math.max(0, corpus)
        }
      }
    }

    const gap = corpus - fiTarget
    const hit = corpus >= fiTarget
    if (hit && fireYear === null) fireYear = year

    yearlyData.push({
      year, age: currentAge + yearsFromNow, corpus, fiTarget, gap, hit,
      expenseNominal, kidsAtThisYear: kids, activeLoans,
    })

    prevCorpus = corpus
  }

  const yearsToFIRE = fireYear !== null ? fireYear - currentYear : null
  const ageAtFIRE = fireYear !== null ? currentAge + yearsToFIRE : null

  return { fireYear, ageAtFIRE, yearsToFIRE, yearlyData }
}

export function calculateFIRE(inputs) {
  const {
    currentYear, currentAge, retirementAge,
    instruments = [], sipStepUpPct = 0,
    expenseNoKids = 0, expenseOneKid = 0, expenseTwoKids = 0,
    kidsPlanned = 0, kid1Year = null, kid2Year = null,
    inflationPct = 6, fiMultiple = 30, fireType = 'regular', fireTypeMultiplierOverride = null,
    baristaAnnualIncome = null,
    loans = [], futureExpenses = [], lumpSums = [],
  } = inputs

  const { totalMonthly, blendedAnnual, blendedMonthly } = computeBlended(instruments)
  const initialCorpus = instruments.reduce((s, i) => s + (Number(i.currentBalance) || 0), 0)
  const generatedLoans = generateLoansFromExpenses(futureExpenses, inflationPct, currentYear)
  const allLoans = [...loans, ...generatedLoans]

  const resolvedFiMultiple = fireTypeMultiplierOverride || FIRE_MULTIPLIERS[fireType] || fiMultiple || 30

  const normalizedInputs = {
    currentYear, currentAge, retirementAge, inflationPct,
    fiMultiple: resolvedFiMultiple, fireType, baristaAnnualIncome,
    expenseNoKids, expenseOneKid, expenseTwoKids, kid1Year, kid2Year,
    sipStepUpPct, lumpSums, futureExpenses,
  }
  const resolved = { totalMonthly, blendedAnnual, blendedMonthly, initialCorpus, allLoans }

  const scenarios = {
    noKids: runScenario(normalizedInputs, resolved, 0),
    oneKid: runScenario(normalizedInputs, resolved, 1),
    twoKids: runScenario(normalizedInputs, resolved, 2),
  }

  const scenarioKeyByKidsPlanned = { 0: 'noKids', 1: 'oneKid', 2: 'twoKids' }
  const selectedScenarioKey = scenarioKeyByKidsPlanned[kidsPlanned] || 'noKids'

  return {
    blendedReturnPct: blendedAnnual,
    totalMonthlyContribution: totalMonthly,
    fiMultiple: resolvedFiMultiple,
    generatedLoans,
    scenarios,
    selectedScenarioKey,
    selectedScenario: scenarios[selectedScenarioKey],
  }
}
