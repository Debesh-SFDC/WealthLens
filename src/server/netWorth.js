// Server access to the shared net worth calculation (src/shared/netWorth.mjs).
// That module is ESM so the renderer can import it too; this CommonJS server
// loads it once with import().
let modPromise = null
const load = () => (modPromise ||= import('../shared/netWorth.mjs'))

// Live net worth, the same figure the Net Worth page shows.
async function liveNetWorth(db) {
  const m = await load()
  const { rows } = await db.query(m.NET_WORTH_SQL)
  return m.computeNetWorth(rows)
}

// Goals with auto_source = 'net_worth' get the live figure as current_amount
// (the stored column is only a cache). Queries net worth only when needed.
async function withLiveGoalAmounts(db, goals) {
  if (!goals?.some(g => g.auto_source === 'net_worth')) return goals
  const m = await load()
  const nw = await liveNetWorth(db)
  return goals.map(g => m.withLiveAmount(g, nw))
}

module.exports = { liveNetWorth, withLiveGoalAmounts, load }
