// Net worth — the one calculation behind every net worth figure in the app:
// the Net Worth page, the dashboard stat, the Retirement Countdown and goals
// with auto_source = 'net_worth'. Moved verbatim from NetWorth.jsx (the
// reference figure), so the page's number is unchanged to the rupee.
//
// Net worth = sum over live investments (deleted_at IS NULL) of
// effectiveCurrentValue(): insurance and RD are valued from their premium /
// instalment schedule (or the maturity amount once matured), every other type
// uses its stored current_value. There are no asset / liability tables.
//
// ESM (.mjs) on purpose: the renderer and the Electron main bundle import it
// directly, and the CommonJS Express server loads it with import() (see
// src/server/netWorth.js), so no build config has to convert CommonJS.

const MS_PER_MONTH = 30.4375 * 24 * 60 * 60 * 1000

export function effectiveCurrentValue(inv, now = Date.now()) {
  if (inv.type === 'insurance') {
    const monthly = Number(inv.monthly_sip_amount) || 0
    const premiumYears = Number(inv.interest_rate) || 0
    const maturityAmt = Number(inv.purchase_price) || 0
    const start = inv.start_date ? new Date(inv.start_date).getTime() : null
    const maturityTs = inv.maturity_date ? new Date(inv.maturity_date).getTime() : null
    if (!start || !monthly) return 0
    if (maturityTs && now >= maturityTs) return maturityAmt
    const n = Math.min(Math.floor((now - start) / MS_PER_MONTH), Math.round(premiumYears * 12))
    return n * monthly
  }
  if (inv.type === 'rd') {
    const monthly = Number(inv.monthly_sip_amount) || 0
    const tenureMonths = Number(inv.units) || 0
    const maturityAmt = Number(inv.purchase_price) || 0
    const start = inv.start_date ? new Date(inv.start_date).getTime() : null
    const maturityTs = inv.maturity_date ? new Date(inv.maturity_date).getTime() : null
    if (!start || !monthly) return 0
    if (maturityTs && now >= maturityTs) return maturityAmt
    const n = Math.min(Math.floor((now - start) / MS_PER_MONTH), tenureMonths)
    return n * monthly
  }
  return Number(inv.current_value) || 0
}

// investments: rows from investments:getAll / GET /api/investments (already
// live-only); rows with deleted_at set are skipped anyway.
export function computeNetWorth(investments, now = Date.now()) {
  return (investments || []).reduce((s, inv) => (inv.deleted_at ? s : s + effectiveCurrentValue(inv, now)), 0)
}

// The rows computeNetWorth needs, for both backends.
export const NET_WORTH_SQL = `SELECT type, current_value, monthly_sip_amount, interest_rate, purchase_price,
  units, start_date, maturity_date FROM investments WHERE deleted_at IS NULL`

// Goals whose current_amount is live, not the stored column.
export const AUTO_SOURCES = ['net_worth']

// The live current_amount for an auto-tracked goal (the stored column is
// only a cache); other goals pass through untouched.
export function withLiveAmount(goal, netWorth) {
  if (!goal || goal.auto_source !== 'net_worth' || netWorth == null) return goal
  return { ...goal, current_amount: netWorth }
}
