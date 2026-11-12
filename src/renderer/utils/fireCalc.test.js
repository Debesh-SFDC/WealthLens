// Run: node src/renderer/utils/fireCalc.test.js   (plain node:assert, no deps)
import assert from 'node:assert/strict'
import { calculateFIRE, solveExtraMonthlyForTarget, computeBlended } from './fireCalc.js'

const Y0 = 2026
const base = (over = {}) => ({
  currentYear: Y0, currentAge: 32,
  instruments: [], sipStepUpPct: 0, inflationPct: 6,
  expenseNoKids: 1_200_000, expenseOneKid: 1_500_000, expenseTwoKids: 1_800_000,
  kidsPlanned: 0, kid1Year: null, kid2Year: null,
  fireType: 'regular', fireTypeMultiplierOverride: null,
  loans: [], futureExpenses: [], lumpSums: [], additionalInstruments: [],
  ...over,
})
const rowAt = (res, year, key = res.selectedScenarioKey) => res.scenarios[key].yearlyData.find(r => r.year === year)
const noNaN = res => {
  for (const sc of Object.values(res.scenarios)) {
    for (const r of sc.yearlyData) {
      for (const k of ['corpus', 'fiTarget', 'gap', 'monthlySip', 'expenseNominal']) {
        assert.ok(Number.isFinite(r[k]), `${k} not finite in ${r.year}: ${r[k]}`)
      }
    }
  }
}

let passed = 0, failed = 0
function test(name, fn) {
  try { fn(); passed++; console.log(`  ✔ ${name}`) }
  catch (e) { failed++; console.log(`  ✘ ${name}\n      ${e.message}`) }
}

console.log('fireCalc')

test('single instrument, no SIP, 12% for 10 years = balance × 1.12^10', () => {
  const res = calculateFIRE(base({ instruments: [{ name: 'A', currentBalance: 1_000_000, monthlyContribution: 0, annualReturnPct: 12 }] }))
  const got = rowAt(res, Y0 + 10).corpus
  const want = 1_000_000 * Math.pow(1.12, 10)
  assert.ok(Math.abs(got - want) < 0.01, `got ${got}, want ${want}`)
  assert.equal(rowAt(res, Y0).corpus, 1_000_000)
})

test('SIP ₹10,000/mo, 12%, 15 years, no balance ≈ closed-form FV (within 0.5%)', () => {
  const res = calculateFIRE(base({ instruments: [{ name: 'SIP', currentBalance: 0, monthlyContribution: 10_000, annualReturnPct: 12 }] }))
  const got = rowAt(res, Y0 + 15).corpus
  // Closed form with the engine's convention: monthly rate = (1.12)^(1/12) − 1, 180 end-of-month deposits.
  const i = Math.pow(1.12, 1 / 12) - 1
  const want = 10_000 * (Math.pow(1 + i, 180) - 1) / i
  const err = Math.abs(got - want) / want
  assert.ok(err < 0.005, `got ${got.toFixed(0)}, want ${want.toFixed(0)}, err ${(err * 100).toFixed(3)}%`)
})

test('zero balance and zero SIP → 0 corpus, no NaN', () => {
  const res = calculateFIRE(base({ instruments: [{ name: 'Empty', currentBalance: 0, monthlyContribution: 0, annualReturnPct: 12 }] }))
  noNaN(res)
  assert.ok(res.selectedScenario.yearlyData.every(r => r.corpus === 0))
  const empty = calculateFIRE(base({ instruments: [] }))
  noNaN(empty)
  assert.equal(empty.blendedReturnPct, 0)
})

test('garbage inputs (blank / null / NaN strings) never produce NaN', () => {
  const res = calculateFIRE({
    currentYear: Y0, currentAge: null, sipStepUpPct: '', inflationPct: 'abc',
    instruments: [{ name: 'X', currentBalance: '', monthlyContribution: null, annualReturnPct: undefined }],
    expenseNoKids: '', futureExpenses: [{ name: 'F', costToday: '', year: '', financedPct: 'x' }],
    lumpSums: [{ name: 'L', amount: 'NaN', year: null }],
    loans: [{ annualEmi: 'x', startYear: '', endYear: '' }],
  })
  noNaN(res)
  assert.ok(Number.isFinite(computeBlended([{ currentBalance: 'x' }]).blendedAnnual))
})

test('inflation 0 vs 6 changes the FI target (and 0 is honoured, not replaced by 6)', () => {
  const r0 = calculateFIRE(base({ inflationPct: 0 }))
  const r6 = calculateFIRE(base({ inflationPct: 6 }))
  assert.equal(rowAt(r0, Y0 + 10).fiTarget, 1_200_000 * 30)
  assert.ok(rowAt(r6, Y0 + 10).fiTarget > rowAt(r0, Y0 + 10).fiTarget)
})

test('step-up 0 vs 10 changes the corpus; year 0 contribution has no step-up', () => {
  const inst = [{ name: 'SIP', currentBalance: 0, monthlyContribution: 10_000, annualReturnPct: 0 }]
  const s0 = calculateFIRE(base({ instruments: inst, sipStepUpPct: 0 }))
  const s10 = calculateFIRE(base({ instruments: inst, sipStepUpPct: 10 }))
  // At 0% return, year 1 corpus = exactly 12 un-stepped deposits in both cases.
  assert.equal(rowAt(s0, Y0 + 1).corpus, 120_000)
  assert.equal(rowAt(s10, Y0 + 1).corpus, 120_000)
  // Year 2 adds 12 × 11,000 under 10% step-up.
  assert.ok(Math.abs(rowAt(s10, Y0 + 2).corpus - (120_000 + 132_000)) < 1e-6)
  assert.ok(rowAt(s10, Y0 + 20).corpus > rowAt(s0, Y0 + 20).corpus)
})

test('FI multiple 25 → 40 changes the target (custom override and FIRE type)', () => {
  const c25 = calculateFIRE(base({ fireTypeMultiplierOverride: 25, inflationPct: 0 }))
  const c40 = calculateFIRE(base({ fireTypeMultiplierOverride: 40, inflationPct: 0 }))
  assert.equal(rowAt(c25, Y0).fiTarget, 1_200_000 * 25)
  assert.equal(rowAt(c40, Y0).fiTarget, 1_200_000 * 40)
  const lean = calculateFIRE(base({ fireType: 'lean', inflationPct: 0 }))
  const fat = calculateFIRE(base({ fireType: 'fat', inflationPct: 0 }))
  assert.ok(rowAt(fat, Y0).fiTarget > rowAt(lean, Y0).fiTarget)
})

test('lump sum raises corpus from its year onward only (incl. current year)', () => {
  const inst = [{ name: 'A', currentBalance: 500_000, monthlyContribution: 5_000, annualReturnPct: 10 }]
  const without = calculateFIRE(base({ instruments: inst }))
  const withLs = calculateFIRE(base({ instruments: inst, lumpSums: [{ name: 'Bonus', amount: 300_000, year: Y0 + 3 }] }))
  for (let y = Y0; y < Y0 + 3; y++) assert.equal(rowAt(withLs, y).corpus, rowAt(without, y).corpus, `changed before lump year (${y})`)
  for (let y = Y0 + 3; y <= Y0 + 10; y++) assert.ok(rowAt(withLs, y).corpus > rowAt(without, y).corpus, `not raised in ${y}`)
  const now = calculateFIRE(base({ instruments: inst, lumpSums: [{ name: 'Now', amount: 100_000, year: Y0 }] }))
  assert.equal(rowAt(now, Y0).corpus, 600_000)
})

test('future expense in the current year is deducted; financed part becomes an EMI', () => {
  const inst = [{ name: 'A', currentBalance: 1_000_000, monthlyContribution: 0, annualReturnPct: 10 }]
  const res = calculateFIRE(base({ instruments: inst, futureExpenses: [{ name: 'Car', costToday: 800_000, year: Y0, financedPct: 60, loanInterestPct: 9, loanTenureYears: 3 }] }))
  assert.equal(rowAt(res, Y0).corpus, 1_000_000 - 320_000)
  assert.equal(res.generatedLoans.length, 1)
  assert.ok(rowAt(res, Y0).emiPv > 0)
})

test('extras > 0 give an earlier-or-equal FIRE year and higher corpus vs baseline', () => {
  const inst = [
    { name: 'EPF', currentBalance: 3_000_000, monthlyContribution: 0, annualReturnPct: 8.25 },
    { name: 'MF', currentBalance: 1_000_000, monthlyContribution: 20_000, annualReturnPct: 12 },
  ]
  // Low-return extra used to *lower* the blended rate on the whole corpus.
  const res = calculateFIRE(base({ instruments: inst, additionalInstruments: [{ name: 'FD', monthlyAmount: 50_000, annualReturnPct: 7 }] }))
  assert.ok(res.enhanced)
  const b = res.selectedScenario, e = res.enhanced.selectedScenario
  if (b.fireYear != null) assert.ok(e.fireYear != null && e.fireYear <= b.fireYear, `enhanced ${e.fireYear} vs ${b.fireYear}`)
  for (let i = 1; i < b.yearlyData.length; i++) assert.ok(e.yearlyData[i].corpus > b.yearlyData[i].corpus)
})

test('kids 0 / 1 / 2 scenarios give different targets', () => {
  const res = calculateFIRE(base({ kidsPlanned: 2, kid1Year: Y0 + 2, kid2Year: Y0 + 4 }))
  const y = Y0 + 5
  const t0 = rowAt(res, y, 'noKids').fiTarget, t1 = rowAt(res, y, 'oneKid').fiTarget, t2 = rowAt(res, y, 'twoKids').fiTarget
  assert.ok(t0 < t1 && t1 < t2, `${t0} ${t1} ${t2}`)
  assert.equal(res.selectedScenarioKey, 'twoKids')
})

test('excluded instruments (includeInCorpus: false) add nothing', () => {
  const inst = [{ name: 'MF', currentBalance: 1_000_000, monthlyContribution: 10_000, annualReturnPct: 12 }]
  const a = calculateFIRE(base({ instruments: inst }))
  const b = calculateFIRE(base({ instruments: [...inst, { name: 'Insurance', currentBalance: 900_000, monthlyContribution: 0, annualReturnPct: 15, includeInCorpus: false }] }))
  assert.equal(rowAt(b, Y0 + 10).corpus, rowAt(a, Y0 + 10).corpus)
  assert.equal(b.totalMonthlyContribution, a.totalMonthlyContribution)
})

test('target-date check and extra-SIP solve close the gap', () => {
  const inputs = base({
    instruments: [{ name: 'MF', currentBalance: 2_000_000, monthlyContribution: 30_000, annualReturnPct: 12 }],
    targetRetirementDate: '2041-08-12', sipStepUpPct: 5,
  })
  const res = calculateFIRE(inputs)
  assert.equal(res.targetCheck.targetYear, 2041)
  const solved = solveExtraMonthlyForTarget(inputs)
  if (res.targetCheck.gap >= 0) {
    assert.equal(solved.extraMonthly, 0)
  } else {
    assert.ok(solved.extraMonthly > 0)
    const withExtra = calculateFIRE({ ...inputs, additionalInstruments: [{ name: 'x', monthlyAmount: solved.extraMonthly, annualReturnPct: solved.returnPct }] })
    assert.ok(rowAt(withExtra.enhanced, 2041).gap >= -1, 'solved SIP does not reach target')
    const under = calculateFIRE({ ...inputs, additionalInstruments: [{ name: 'x', monthlyAmount: solved.extraMonthly - 50, annualReturnPct: solved.returnPct }] })
    assert.ok(rowAt(under.enhanced, 2041).gap < 0, 'solution is not minimal')
  }
})

console.log(`\n${passed} passed, ${failed} failed`)
if (failed) process.exit(1)
