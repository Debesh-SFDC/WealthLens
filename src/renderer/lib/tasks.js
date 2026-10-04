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
