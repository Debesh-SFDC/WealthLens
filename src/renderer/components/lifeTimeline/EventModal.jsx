import { useEffect, useState } from 'react'
import { MONTHS, CATEGORY_LABELS, STATUS_LABELS } from '../../lib/lifeTimeline'

const INPUT = 'w-full px-4 py-2.5 rounded-xl border border-gray-200 text-sm text-gray-800 bg-dark-card focus:outline-none focus:border-[#D4AF37] focus:ring-2 focus:ring-[#D4AF37]/20'
const LABEL = 'text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5 block'

function Toggle({ checked, onChange, label, hint }) {
  return (
    <label className="flex items-start gap-3 cursor-pointer select-none">
      <input type="checkbox" className="mt-0.5 w-4 h-4 accent-[#D4AF37]" checked={checked} onChange={e => onChange(e.target.checked)} />
      <span>
        <span className="text-sm font-medium text-gray-800 block">{label}</span>
        {hint && <span className="text-xs text-gray-500">{hint}</span>}
      </span>
    </label>
  )
}

// Add/edit one life event. Same shell as the app's other form modals
// (see TravelPage TripFormModal). Delete is two-step inside the modal rather
// than a browser confirm(), which would block Electron/automation.
export default function EventModal({ event, defaultYear, range, events = [], onSave, onDelete, onClose }) {
  const editing = !!event?.id
  const [form, setForm] = useState(() => ({
    title: event?.title ?? '',
    year: String(event?.year ?? defaultYear),
    month: event?.month != null ? String(event.month) : '',
    amount: event?.amount != null ? String(event.amount) : '',
    amount_note: event?.amount_note ?? '',
    category: event?.category ?? 'other',
    is_assumed: !!event?.is_assumed,
    is_major: !!event?.is_major,
    status: event?.status ?? 'planned',
    notes: event?.notes ?? '',
    depends_on_id: event?.depends_on_id != null ? String(event.depends_on_id) : '',
  }))
  const [saving, setSaving] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [error, setError] = useState(null)
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') { e.stopPropagation(); onClose() } }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [onClose])

  const years = []
  for (let y = range.start; y <= range.end; y++) years.push(y)

  // Other events this one can follow. Events that already (directly or
  // indirectly) happen after this one are left out, so no loop can be picked.
  const afterOptions = (() => {
    const after = new Map(events.map(e => [e.id, e.depends_on_id ?? null]))
    const followsThis = (id) => {
      for (let cur = id, i = 0; cur != null && i <= after.size; i++) {
        if (cur === event?.id) return true
        cur = after.get(cur) ?? null
      }
      return false
    }
    return events
      .filter(e => e.id !== event?.id && !(editing && followsThis(e.id)))
      .sort((a, b) => a.year - b.year || (a.month ?? 13) - (b.month ?? 13) || a.title.localeCompare(b.title))
  })()

  async function handleSubmit(e) {
    e.preventDefault()
    if (!form.title.trim()) return
    setSaving(true)
    setError(null)
    try {
      await onSave({
        ...(editing ? { id: event.id } : {}),
        title: form.title.trim(),
        year: Number(form.year),
        month: form.month ? Number(form.month) : null,
        // keep an existing day only while the month is unchanged
        day: editing && event.day != null && Number(form.month) === event.month ? event.day : null,
        amount: form.amount === '' ? null : Number(form.amount),
        amount_note: form.amount_note.trim() || null,
        category: form.category,
        is_assumed: form.is_assumed,
        is_major: form.is_major,
        status: form.status,
        notes: form.notes.trim() || null,
        goal_id: event?.goal_id ?? null,
        depends_on_id: form.depends_on_id ? Number(form.depends_on_id) : null,
      })
    } catch (err) {
      setError(readError(err))
      setSaving(false)
    }
  }

  async function handleDelete() {
    if (!confirmDelete) { setConfirmDelete(true); return }
    setSaving(true)
    setError(null)
    try {
      await onDelete(event.id)
    } catch (err) {
      setError(readError(err))
      setSaving(false)
      setConfirmDelete(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-sm p-4"
      onClick={e => e.target === e.currentTarget && onClose()}
    >
      <div role="dialog" aria-modal="true" aria-labelledby="lt-event-title"
        className="bg-dark-card rounded-2xl w-full max-w-[480px] shadow-2xl overflow-hidden max-h-[90vh] overflow-y-auto">
        <div className="px-6 py-5 border-b border-gray-100 flex items-center justify-between sticky top-0 bg-dark-card z-10">
          <h2 id="lt-event-title" className="text-lg font-bold text-gray-900">{editing ? 'Edit event' : 'New event'}</h2>
          <button type="button" onClick={onClose} aria-label="Close"
            className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-gray-100 transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#D4AF37]">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4 text-gray-500">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label htmlFor="lt-f-title" className={LABEL}>Title *</label>
            <input id="lt-f-title" autoFocus required type="text" maxLength={200} placeholder="e.g. Move to Bhubaneswar"
              value={form.title} onChange={e => set('title', e.target.value)} className={`${INPUT} font-medium`} />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="lt-f-year" className={LABEL}>Year</label>
              <select id="lt-f-year" value={form.year} onChange={e => set('year', e.target.value)} className={INPUT}>
                {years.map(y => <option key={y} value={y}>{y}</option>)}
              </select>
            </div>
            <div>
              <label htmlFor="lt-f-month" className={LABEL}>Month <span className="font-normal normal-case text-gray-400">optional</span></label>
              <select id="lt-f-month" value={form.month} onChange={e => set('month', e.target.value)} className={INPUT}>
                <option value="">Sometime this year</option>
                {MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="lt-f-amount" className={LABEL}>Amount (₹)</label>
              <input id="lt-f-amount" type="number" inputMode="decimal" step="any" placeholder="Optional"
                value={form.amount} onChange={e => set('amount', e.target.value)} className={INPUT} />
            </div>
            <div>
              <label htmlFor="lt-f-category" className={LABEL}>Category</label>
              <select id="lt-f-category" value={form.category} onChange={e => set('category', e.target.value)} className={INPUT}>
                {Object.entries(CATEGORY_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </div>
          </div>

          <div>
            <label htmlFor="lt-f-amount-note" className={LABEL}>Amount note <span className="font-normal normal-case text-gray-400">optional</span></label>
            <input id="lt-f-amount-note" type="text" maxLength={200} placeholder="e.g. Moving Fund ₹2L"
              value={form.amount_note} onChange={e => set('amount_note', e.target.value)} className={INPUT} />
          </div>

          <div>
            <label htmlFor="lt-f-after" className={LABEL}>Happens after <span className="font-normal normal-case text-gray-400">optional</span></label>
            <select id="lt-f-after" value={form.depends_on_id} onChange={e => set('depends_on_id', e.target.value)} className={INPUT}>
              <option value="">Nothing in particular</option>
              {afterOptions.map(o => (
                <option key={o.id} value={o.id}>{o.year}{o.month ? ` ${MONTHS[o.month - 1]}` : ''} · {o.title}</option>
              ))}
            </select>
            <p className="text-xs text-gray-500 mt-1">Shown as an arrow in the Network view.</p>
          </div>

          <fieldset>
            <legend className={LABEL}>Status</legend>
            <div className="flex rounded-xl border border-gray-200 overflow-hidden w-fit">
              {Object.entries(STATUS_LABELS).map(([key, label]) => (
                <button key={key} type="button" onClick={() => set('status', key)} aria-pressed={form.status === key}
                  className="px-4 py-2 text-xs font-semibold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[#D4AF37]"
                  style={form.status === key
                    ? { background: 'linear-gradient(135deg, #D4AF37, #B8960C)', color: '#0A0A0A' }
                    : { backgroundColor: '#1A1A1A', color: '#8A8A8A' }}>
                  {label}
                </button>
              ))}
            </div>
          </fieldset>

          <div className="space-y-3">
            <Toggle checked={form.is_assumed} onChange={v => set('is_assumed', v)}
              label="Assumed date" hint="A guess, not a commitment — shown with a dashed blue card" />
            <Toggle checked={form.is_major} onChange={v => set('is_major', v)}
              label="Major event" hint="Large glowing node on the timeline" />
          </div>

          <div>
            <label htmlFor="lt-f-notes" className={LABEL}>Notes <span className="font-normal normal-case text-gray-400">optional</span></label>
            <textarea id="lt-f-notes" rows={3} maxLength={4000} placeholder="Optional notes…"
              value={form.notes} onChange={e => set('notes', e.target.value)} className={`${INPUT} resize-none`} />
          </div>

          {error && <p role="alert" className="text-sm text-red-700">{error}</p>}

          <div className="flex flex-wrap gap-3 pt-2">
            {editing && (
              <button type="button" onClick={handleDelete} disabled={saving}
                className="px-4 py-2.5 rounded-xl border text-sm font-semibold transition-colors disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#E74C3C]"
                style={confirmDelete
                  ? { backgroundColor: '#E74C3C', borderColor: '#E74C3C', color: '#fff' }
                  : { borderColor: '#5A2A25', color: '#E74C3C' }}>
                {confirmDelete ? 'Confirm delete' : 'Delete'}
              </button>
            )}
            <button type="button" onClick={onClose}
              className="flex-1 py-2.5 rounded-xl border border-gray-200 text-sm font-semibold text-gray-600 hover:bg-gray-50 transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#D4AF37]">
              Cancel
            </button>
            <button type="submit" disabled={saving || !form.title.trim()}
              className="flex-1 py-2.5 rounded-xl text-[#0A0A0A] text-sm font-semibold hover:opacity-90 transition-opacity disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#D4AF37]"
              style={{ background: 'linear-gradient(135deg, #D4AF37, #B8960C)' }}>
              {saving ? 'Saving…' : editing ? 'Save changes' : 'Add event'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// Web errors arrive as the raw response text ('{"error":"..."}'); IPC errors
// as "Error invoking remote method ...: Error: <message>".
export function readError(err) {
  const msg = String(err?.message || err || 'Something went wrong')
  try { return JSON.parse(msg).error || msg } catch { /* not JSON */ }
  const m = msg.match(/Error: ([^]*)$/)
  return m ? m[1] : msg
}
