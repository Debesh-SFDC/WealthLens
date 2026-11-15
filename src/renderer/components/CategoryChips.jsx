import { CATEGORIES } from '../lib/tasks'

// Three small colored chips for picking a task/idea category (Job / Personal /
// Project). `variant="desk"` is the larger glass style used in Desk Mode.
export default function CategoryChips({ value, onChange, variant = 'app', className = '' }) {
  const desk = variant === 'desk'
  return (
    <div role="radiogroup" aria-label="Category" className={`flex items-center gap-1.5 ${className}`}>
      {CATEGORIES.map(c => {
        const on = value === c.id
        return (
          <button
            key={c.id}
            type="button"
            role="radio"
            aria-checked={on}
            title={c.label}
            onClick={() => onChange(c.id)}
            className={desk
              ? 'desk-chip flex items-center gap-2 px-4 rounded-xl font-semibold transition-colors'
              : 'flex items-center gap-1.5 px-2.5 rounded-full text-[11px] font-semibold border transition-colors min-h-[28px]'}
            style={on
              ? { backgroundColor: c.color + (desk ? '40' : '22'), borderColor: c.color, color: desk ? '#fff' : c.color, ...(desk && { boxShadow: `inset 0 0 0 2px ${c.color}` }) }
              : { borderColor: desk ? 'transparent' : '#2A2A2A', color: desk ? 'rgba(255,255,255,0.75)' : '#8A8A8A', ...(desk && { backgroundColor: 'rgba(255,255,255,0.08)' }) }}
          >
            <span className={`${desk ? 'w-3 h-3' : 'w-2 h-2'} rounded-full shrink-0`} style={{ backgroundColor: c.color }} />
            {c.short}
          </button>
        )
      })}
    </div>
  )
}
