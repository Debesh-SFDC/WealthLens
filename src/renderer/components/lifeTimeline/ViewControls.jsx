// Header view switcher and the bottom-right zoom controls.

export const VIEWS = [
  { id: 'decades', label: 'Decades' },
  { id: 'years', label: 'Years' },
  { id: 'months', label: 'Months' },
  { id: 'network', label: 'Network' },
]

// Segmented control. `active` is the view whose segment is lit: the current
// zoom level on the line, or 'network'.
export function ViewSwitcher({ active, onChange }) {
  return (
    <div className="lt-seg" role="radiogroup" aria-label="Timeline view">
      {VIEWS.map(v => (
        <button
          key={v.id}
          type="button"
          role="radio"
          aria-checked={active === v.id}
          tabIndex={active === v.id ? 0 : -1}
          className={active === v.id ? 'on' : ''}
          onClick={() => onChange(v.id)}
          onKeyDown={(e) => {
            const i = VIEWS.findIndex(x => x.id === active)
            const step = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 0
            if (!step) return
            e.preventDefault()
            e.stopPropagation()
            const next = VIEWS[(i + step + VIEWS.length) % VIEWS.length]
            const group = e.currentTarget.parentElement // currentTarget is gone once the event finishes
            onChange(next.id)
            requestAnimationFrame(() => group?.querySelector('[aria-checked="true"]')?.focus())
          }}
        >
          {v.label}
        </button>
      ))}
    </div>
  )
}

// + / − buttons, a log-scale slider (hidden on phones) and the level label.
// `slider` is 0..1000. `onFit` adds a Fit button (network view).
export function ZoomControls({ level, slider, onSlider, onIn, onOut, onFit, canIn = true, canOut = true }) {
  return (
    <div className="lt-zoom" role="group" aria-label="Zoom">
      <span className="lt-zlevel" aria-live="polite">{level}</span>
      <button type="button" className="lt-zbtn" onClick={onOut} disabled={!canOut} aria-label="Zoom out" title="Zoom out (−)">−</button>
      <input
        type="range"
        className="lt-zslider"
        min="0"
        max="1000"
        step="1"
        value={slider}
        onChange={(e) => onSlider(Number(e.target.value))}
        aria-label="Zoom level"
        aria-valuetext={level}
      />
      <button type="button" className="lt-zbtn" onClick={onIn} disabled={!canIn} aria-label="Zoom in" title="Zoom in (+)">+</button>
      {onFit && <button type="button" className="lt-zbtn fit" onClick={onFit} title="Fit the whole graph (0)">Fit</button>}
    </div>
  )
}
