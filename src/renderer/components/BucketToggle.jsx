import { BUCKET_META } from '../lib/bucket'

// Need/Want toggle for the add-expense forms. Auto-selects the category's
// default bucket (the parent owns that); the user can tap the other option to
// override. `hint` is shown only when the parent decides the choice is an
// override of the category default.
export default function BucketToggle({ value, onChange, hint }) {
  return (
    <div>
      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">This expense is a</p>
      <div className="flex gap-2">
        {['need', 'want'].map(b => {
          const m = BUCKET_META[b]
          const active = value === b
          return (
            <button
              key={b}
              type="button"
              onClick={() => onChange(b)}
              className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl text-sm font-semibold border-2 transition-colors"
              style={active
                ? { backgroundColor: m.bg, borderColor: m.color, color: m.color }
                : { backgroundColor: '#fff', borderColor: '#E5E7EB', color: '#6B7280' }}
            >
              <span>{m.dot}</span>
              {m.label}
              {active && <span className="text-xs">✓</span>}
            </button>
          )
        })}
      </div>
      {hint && <p className="text-xs text-gray-400 mt-1.5 leading-snug">{hint}</p>}
    </div>
  )
}
