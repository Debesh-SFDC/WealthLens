import { useMemo, useState } from 'react'

// Shared date picker for "Add Expense" everywhere (Dashboard modal, Expenses
// modal, TrackerHome). Quick chips for the common cases + an inline native
// date input for anything else, clamped to the last 30 days.

function isoDaysAgo(n) {
  const d = new Date()
  d.setDate(d.getDate() - n)
  return d.toISOString().slice(0, 10)
}

export const expenseToday = () => isoDaysAgo(0)

// Short label for the success toast: "Today" | "Yesterday" | "Day Before" | "7 Sep"
export function expenseDateShortLabel(date) {
  if (date === isoDaysAgo(0)) return 'Today'
  if (date === isoDaysAgo(1)) return 'Yesterday'
  if (date === isoDaysAgo(2)) return 'Day Before'
  return new Date(date + 'T00:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })
}

// Long label for the "Logging for:" line: "Mon, 7 Sep 2026" (or the friendly name)
export function expenseDateLongLabel(date) {
  if (date === isoDaysAgo(0)) return 'Today'
  if (date === isoDaysAgo(1)) return 'Yesterday'
  if (date === isoDaysAgo(2)) return 'Day Before'
  return new Date(date + 'T00:00:00').toLocaleDateString('en-IN', {
    weekday: 'short', day: 'numeric', month: 'short', year: 'numeric',
  })
}

export default function ExpenseDateChips({ value, onChange }) {
  const { today, yesterday, dayBefore, minDate } = useMemo(() => ({
    today: isoDaysAgo(0),
    yesterday: isoDaysAgo(1),
    dayBefore: isoDaysAgo(2),
    minDate: isoDaysAgo(30),
  }), [])

  const presets = [
    { label: '📅 Today', date: today },
    { label: 'Yesterday', date: yesterday },
    { label: 'Day Before', date: dayBefore },
  ]
  const isCustom = Boolean(value) && value !== today && value !== yesterday && value !== dayBefore
  const [showPicker, setShowPicker] = useState(isCustom)

  const chipStyle = (active) => active
    ? { backgroundColor: '#6C63FF', color: '#fff' }
    : { backgroundColor: '#F3F4F6', color: '#6B7280' }

  return (
    <div>
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-xs font-semibold text-gray-500">Date:</span>
        {presets.map(p => (
          <button
            key={p.label}
            type="button"
            onClick={() => { onChange(p.date); setShowPicker(false) }}
            className="px-3 py-1.5 rounded-full text-xs font-semibold transition-colors"
            style={chipStyle(!showPicker && value === p.date)}
          >
            {p.label}
          </button>
        ))}
        <button
          type="button"
          onClick={() => setShowPicker(v => !v)}
          className="px-3 py-1.5 rounded-full text-xs font-semibold transition-colors flex items-center gap-1"
          style={chipStyle(showPicker || isCustom)}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" style={{ width: 12, height: 12 }}>
            <rect x="3" y="4" width="18" height="18" rx="2" />
            <path d="M16 2v4M8 2v4M3 10h18" />
          </svg>
          Pick Date
        </button>
        {showPicker && (
          <input
            type="date"
            value={value}
            max={today}
            min={minDate}
            onChange={e => { if (e.target.value) onChange(e.target.value) }}
            className="text-xs text-gray-700 outline-none border border-gray-200 rounded-xl px-2 py-1.5 bg-white"
            style={{ maxWidth: 150 }}
          />
        )}
      </div>
      <p className="text-xs text-gray-400 mt-2">
        Logging for: <span className="font-semibold text-gray-700">{expenseDateLongLabel(value)}</span>
      </p>
    </div>
  )
}
