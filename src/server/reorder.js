// Shared helpers for the drag-and-drop "reorder" endpoints. A drop sends the
// full new order as an id list; the handler writes sort_order = index for every
// id in ONE UPDATE (a CASE expression), so the whole reorder is atomic on both
// SQLite and Postgres without needing a pooled transaction client.

const MAX_IDS = 2000

// Returns the ids as positive integers, or null if the body is malformed
// (not an array, empty, too long, non-integer or duplicate ids).
function parseIds(raw) {
  if (!Array.isArray(raw) || raw.length === 0 || raw.length > MAX_IDS) return null
  const ids = raw.map(Number)
  if (ids.some(n => !Number.isInteger(n) || n <= 0)) return null
  if (new Set(ids).size !== ids.length) return null
  return ids
}

// Builds `SET sort_order = CASE id WHEN ? THEN 0 ... END, updated_at = ?
// WHERE id IN (?, ...)` plus its params. `extraWhere` / `extraParams` add the
// ownership scope (e.g. `AND user_id = ?`).
function buildReorder(table, ids, now, extraWhere = '', extraParams = []) {
  const cases = ids.map((_, i) => `WHEN ? THEN ${i}`).join(' ')
  const inList = ids.map(() => '?').join(', ')
  const sql = `UPDATE ${table} SET sort_order = CASE id ${cases} END, updated_at = ?
    WHERE id IN (${inList}) AND deleted_at IS NULL ${extraWhere}`
  return { sql, params: [...ids, now, ...ids, ...extraParams] }
}

module.exports = { parseIds, buildReorder }
