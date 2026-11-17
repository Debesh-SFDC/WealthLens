import { useEffect, useState } from 'react'
import { readError } from './EventModal'

const INPUT = 'w-full px-3 py-2 rounded-xl border border-gray-200 text-sm text-gray-800 bg-dark-card focus:outline-none focus:border-[#D4AF37] focus:ring-2 focus:ring-[#D4AF37]/20'

// Edit the chapter list. Saving sends the whole list (PUT /phases); rows
// removed here are soft-deleted on the server.
export default function PhasesModal({ phases, defaultYear, onSave, onClose }) {
  const [rows, setRows] = useState(() => phases.map(p => ({
    id: p.id, numeral: p.numeral || '', name: p.name, start_year: String(p.start_year),
  })))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') { e.stopPropagation(); onClose() } }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [onClose])

  const update = (i, k, v) => setRows(r => r.map((row, j) => (j === i ? { ...row, [k]: v } : row)))
  const remove = (i) => setRows(r => r.filter((_, j) => j !== i))
  const add = () => setRows(r => [...r, { id: null, numeral: '', name: '', start_year: String(defaultYear) }])

  async function save(e) {
    e.preventDefault()
    setSaving(true)
    setError(null)
    try {
      await onSave(rows.map(r => ({
        id: r.id ?? null, numeral: r.numeral.trim() || null, name: r.name.trim(), start_year: Number(r.start_year),
      })))
    } catch (err) {
      setError(readError(err))
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-sm p-4"
      onClick={e => e.target === e.currentTarget && onClose()}>
      <div role="dialog" aria-modal="true" aria-labelledby="lt-phases-title"
        className="bg-dark-card rounded-2xl w-full max-w-[520px] shadow-2xl overflow-hidden max-h-[90vh] overflow-y-auto">
        <div className="px-6 py-5 border-b border-gray-100 flex items-center justify-between sticky top-0 bg-dark-card z-10">
          <h2 id="lt-phases-title" className="text-lg font-bold text-gray-900">Chapters</h2>
          <button type="button" onClick={onClose} aria-label="Close"
            className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-gray-100 transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#D4AF37]">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4 text-gray-500">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>
        <form onSubmit={save} className="p-6 space-y-3">
          <div className="grid grid-cols-[64px_1fr_92px_36px] gap-2 text-xs font-semibold text-gray-500 uppercase tracking-wide">
            <span>No.</span><span>Name</span><span>From</span><span />
          </div>
          {rows.map((r, i) => (
            <div key={r.id ?? `new${i}`} className="grid grid-cols-[64px_1fr_92px_36px] gap-2 items-center">
              <input aria-label={`Chapter ${i + 1} numeral`} className={INPUT} maxLength={12} placeholder="I"
                value={r.numeral} onChange={e => update(i, 'numeral', e.target.value)} />
              <input aria-label={`Chapter ${i + 1} name`} className={INPUT} required maxLength={80} placeholder="Name"
                value={r.name} onChange={e => update(i, 'name', e.target.value)} />
              <input aria-label={`Chapter ${i + 1} start year`} className={INPUT} required type="number" min="1900" max="2200"
                value={r.start_year} onChange={e => update(i, 'start_year', e.target.value)} />
              <button type="button" onClick={() => remove(i)} aria-label={`Remove chapter ${r.name || i + 1}`}
                className="w-9 h-9 rounded-xl flex items-center justify-center text-gray-500 hover:text-red-700 hover:bg-gray-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#D4AF37]">
                ✕
              </button>
            </div>
          ))}
          <button type="button" onClick={add}
            className="text-sm font-semibold text-[#D4AF37] hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#D4AF37] rounded">
            + Add chapter
          </button>
          {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose}
              className="flex-1 py-2.5 rounded-xl border border-gray-200 text-sm font-semibold text-gray-600 hover:bg-gray-50 transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#D4AF37]">
              Cancel
            </button>
            <button type="submit" disabled={saving}
              className="flex-1 py-2.5 rounded-xl text-[#0A0A0A] text-sm font-semibold hover:opacity-90 disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#D4AF37]"
              style={{ background: 'linear-gradient(135deg, #D4AF37, #B8960C)' }}>
              {saving ? 'Saving…' : 'Save chapters'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
