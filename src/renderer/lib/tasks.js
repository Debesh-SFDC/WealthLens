// Shared helpers for Tasks & Ideas (Dashboard quick capture, the Tasks & Ideas
// page, and Desk Mode). due_date is stored as local 'YYYY-MM-DD' or
// 'YYYY-MM-DDTHH:MM' (what <input type="date|datetime-local"> produces), so
// "today" comparisons are plain string compares against the local date.

export function localDateStr(d = new Date()) {
  const pad = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

export function dueDay(task) {
  return task.due_date ? task.due_date.slice(0, 10) : null
}

export function isOverdue(task, today = localDateStr()) {
  const day = dueDay(task)
  return task.status === 'pending' && !!day && day < today
}

// done_at is an ISO (UTC) timestamp — convert to the local day before comparing.
export function doneToday(task, today = localDateStr()) {
  return task.status === 'done' && !!task.done_at && localDateStr(new Date(task.done_at)) === today
}

export function formatDue(dueDate, today = localDateStr()) {
  if (!dueDate) return ''
  const [day, time] = dueDate.split('T')
  const tomorrow = localDateStr(new Date(Date.now() + 86400000))
  let label
  if (day === today) label = 'Today'
  else if (day === tomorrow) label = 'Tomorrow'
  else {
    const [y, m, d] = day.split('-').map(Number)
    label = new Date(y, m - 1, d).toLocaleDateString('en-IN', {
      day: 'numeric', month: 'short', ...(y !== new Date().getFullYear() && { year: 'numeric' }),
    })
  }
  if (time) {
    const [h, min] = time.split(':').map(Number)
    const suffix = h >= 12 ? 'pm' : 'am'
    const h12 = h % 12 || 12
    label += ` ${h12}${min ? `:${String(min).padStart(2, '0')}` : ''}${suffix}`
  }
  return label
}

// Pending first by priority, then due date (undated last), then newest.
const PRIORITY_RANK = { high: 0, medium: 1, low: 2 }
export function sortTasks(a, b) {
  const pr = (PRIORITY_RANK[a.priority] ?? 1) - (PRIORITY_RANK[b.priority] ?? 1)
  if (pr) return pr
  if (a.due_date && b.due_date && a.due_date !== b.due_date) return a.due_date < b.due_date ? -1 : 1
  if (a.due_date && !b.due_date) return -1
  if (!a.due_date && b.due_date) return 1
  return (b.created_at || '').localeCompare(a.created_at || '')
}

// What Desk Mode / the dashboard call "today's tasks": anything pending that's
// due today, overdue, or undated (quick captures have no date), plus tasks
// ticked off today so progress reads "3 of 5 done today".
export function todaysTasks(tasks, today = localDateStr()) {
  return tasks.filter(t => t.type === 'task' && (
    (t.status === 'pending' && (!t.due_date || dueDay(t) <= today)) || doneToday(t, today)
  ))
}

export const PRIORITY_COLORS = { high: '#EF4444', medium: '#F59E0B', low: '#10B981' }

// Soft pastel backgrounds for idea cards — picked deterministically from the
// id so a card keeps its color across reloads.
export const IDEA_COLORS = [
  { bg: '#FEF3C7', border: '#FDE68A' },
  { bg: '#DBEAFE', border: '#BFDBFE' },
  { bg: '#FCE7F3', border: '#FBCFE8' },
  { bg: '#D1FAE5', border: '#A7F3D0' },
  { bg: '#EDE9FE', border: '#DDD6FE' },
  { bg: '#FFEDD5', border: '#FED7AA' },
  { bg: '#E0F2FE', border: '#BAE6FD' },
  { bg: '#F3E8FF', border: '#E9D5FF' },
]
export function ideaColor(id) {
  return IDEA_COLORS[Math.abs(Number(id) || 0) % IDEA_COLORS.length]
}

// ── Categories ──────────────────────────────────────────────────────────────
// Every task/idea is 'job' | 'personal' | 'project'; 'project' items can carry
// a free-text project_name tag ("Lifelog", "Metakani"). Gold stays the app
// accent — these colors only mark category.
export const CATEGORIES = [
  { id: 'job',      label: 'Job',              short: 'Job',      color: '#3498DB' },
  { id: 'personal', label: 'Personal',         short: 'Personal', color: '#2ECC71' },
  { id: 'project',  label: 'Personal Project', short: 'Project',  color: '#9B59B6' },
]
export const CATEGORY_META = Object.fromEntries(CATEGORIES.map(c => [c.id, c]))
export function categoryOf(task) {
  return CATEGORY_META[task?.category] ? task.category : 'personal'
}

// Last category used in a quick-capture bar, shared by the Dashboard and Desk
// Mode so the next capture defaults to it.
const LAST_CATEGORY_KEY = 'tasks_last_category'
export function readLastCategory() {
  try {
    const v = localStorage.getItem(LAST_CATEGORY_KEY)
    return CATEGORY_META[v] ? v : 'personal'
  } catch { return 'personal' }
}
export function writeLastCategory(v) {
  try { localStorage.setItem(LAST_CATEGORY_KEY, v) } catch {}
}

// ── Deadlines ───────────────────────────────────────────────────────────────
function parseDay(day) {
  const [y, m, d] = day.split('-').map(Number)
  return new Date(y, m - 1, d)
}
export function addDays(today, n) {
  const d = parseDay(today)
  d.setDate(d.getDate() + n)
  return localDateStr(d)
}
// Whole calendar days from `today` to the task's due day (negative = overdue).
export function daysUntil(task, today = localDateStr()) {
  const day = dueDay(task)
  if (!day) return null
  return Math.round((parseDay(day) - parseDay(today)) / 86400000)
}

export const DUE_COLORS = {
  overdue:  '#F87171',
  today:    '#FB923C',
  tomorrow: '#FBBF24',
  week:     '#FDE047',
  later:    'rgba(255,255,255,0.6)',
  none:     'rgba(255,255,255,0.45)',
}

// Relative, color-coded due label for Desk Mode:
// "3d overdue" · "Today" · "Tomorrow" · "Thu 19 Nov" (≤7 days) · "12 Dec" · "No date"
export function relativeDue(task, today = localDateStr()) {
  const n = daysUntil(task, today)
  if (n === null) return { kind: 'none', label: 'No date', color: DUE_COLORS.none }
  if (n < 0)  return { kind: 'overdue', label: `${-n}d overdue`, color: DUE_COLORS.overdue }
  if (n === 0) return { kind: 'today', label: 'Today', color: DUE_COLORS.today }
  if (n === 1) return { kind: 'tomorrow', label: 'Tomorrow', color: DUE_COLORS.tomorrow }
  const d = parseDay(dueDay(task))
  if (n <= 7) {
    const label = `${d.toLocaleDateString('en-GB', { weekday: 'short' })} ${d.getDate()} ${d.toLocaleDateString('en-GB', { month: 'short' })}`
    return { kind: 'week', label, color: DUE_COLORS.week }
  }
  const sameYear = d.getFullYear() === parseDay(today).getFullYear()
  const label = `${d.getDate()} ${d.toLocaleDateString('en-GB', { month: 'short' })}${sameYear ? '' : ` ${d.getFullYear()}`}`
  return { kind: 'later', label, color: DUE_COLORS.later }
}

// Deadline order: overdue first, then due day ascending, undated last; ties on
// the same day go by priority, then time of day, then newest first.
export function sortByDeadline(a, b) {
  const da = dueDay(a), db = dueDay(b)
  if (da && !db) return -1
  if (!da && db) return 1
  if (da && db && da !== db) return da < db ? -1 : 1
  const pr = (PRIORITY_RANK[a.priority] ?? 1) - (PRIORITY_RANK[b.priority] ?? 1)
  if (pr) return pr
  if (a.due_date && b.due_date && a.due_date !== b.due_date) return a.due_date < b.due_date ? -1 : 1
  return (b.created_at || '').localeCompare(a.created_at || '')
}

// Desk Mode summary strip — counts across every category, tasks only.
export function deadlineCounts(items, today = localDateStr()) {
  const week = addDays(today, 7)
  const c = { overdue: 0, today: 0, week: 0, doneToday: 0 }
  for (const t of items) {
    if (t.type !== 'task') continue
    if (doneToday(t, today)) { c.doneToday++; continue }
    if (t.status !== 'pending') continue
    const day = dueDay(t)
    if (!day) continue
    if (day < today) c.overdue++
    else if (day === today) c.today++
    else if (day <= week) c.week++
  }
  return c
}
