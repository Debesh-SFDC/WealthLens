import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { todayIso } from '../../lib/lifeTimeline'

const W = 280
const W_TOUCH = 340

// Compact "Mark achieved" popover anchored to the card's round check button:
// "Achieved on" (default today) and an optional note. Escape or a click
// outside closes it; focus starts on the date and returns to the button.
// touch: larger controls for Desk Mode on a tablet.
export default function AchievePopover({ item, anchor, onSave, onClose, touch = false }) {
  const width = touch ? W_TOUCH : W
  const ref = useRef(null)
  const dateRef = useRef(null)
  const [date, setDate] = useState(todayIso())
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const [pos, setPos] = useState({ left: -9999, top: -9999 })

  // Below the button, flipped above when there's no room; kept on screen.
  useLayoutEffect(() => {
    const r = anchor.getBoundingClientRect()
    const h = ref.current?.offsetHeight || 220
    const vw = window.innerWidth
    const vh = window.innerHeight
    const left = Math.min(vw - width - 12, Math.max(12, r.left + r.width / 2 - width / 2))
    const below = r.bottom + 8
    const top = below + h > vh - 12 ? Math.max(12, r.top - 8 - h) : below
    setPos({ left, top })
  }, [anchor, width])

  useEffect(() => {
    dateRef.current?.focus({ preventScroll: true })
    const close = () => { onClose(); if (anchor.isConnected) anchor.focus({ preventScroll: true }) }
    const onDown = (e) => { if (!ref.current?.contains(e.target) && !anchor.contains(e.target)) onClose() }
    const onKey = (e) => {
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close() }
      // keep Tab inside the popover
      if (e.key === 'Tab' && ref.current) {
        const f = [...ref.current.querySelectorAll('input, textarea, button:not([disabled])')]
        if (!f.length) return
        const first = f[0]
        const last = f[f.length - 1]
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus() }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus() }
      }
    }
    document.addEventListener('pointerdown', onDown, true)
    document.addEventListener('keydown', onKey, true)
    return () => {
      document.removeEventListener('pointerdown', onDown, true)
      document.removeEventListener('keydown', onKey, true)
    }
  }, [anchor, onClose])

  async function submit(e) {
    e.preventDefault()
    if (!date) { setError('Choose a date'); return }
    setBusy(true)
    setError(null)
    try {
      await onSave({ date, note: note.trim() })
    } catch (err) {
      setError(err?.message || 'Could not save')
      setBusy(false)
    }
  }

  const title = item.raw?.title ?? item.title
  return (
    <form
      ref={ref}
      className={`lt-pop${touch ? ' touch' : ''}`}
      role="dialog"
      aria-labelledby="lt-pop-h"
      style={{ left: pos.left, top: pos.top, width }}
      onSubmit={submit}
    >
      <h2 id="lt-pop-h">Mark achieved</h2>
      <p className="lt-pop-t">{title}</p>
      <label htmlFor="lt-pop-date">Achieved on</label>
      <input id="lt-pop-date" ref={dateRef} type="date" value={date} max="2200-12-31" onChange={(e) => setDate(e.target.value)} required />
      <label htmlFor="lt-pop-note">Note <span>(optional)</span></label>
      <input id="lt-pop-note" type="text" value={note} maxLength={300} onChange={(e) => setNote(e.target.value)} placeholder="How it went" />
      {error && <p className="lt-pop-err" role="alert">{error}</p>}
      <div className="lt-pop-actions">
        <button type="button" className="lt-btn" onClick={() => { onClose(); anchor.focus?.({ preventScroll: true }) }}>Cancel</button>
        <button type="submit" className="lt-btn gold" disabled={busy}>{busy ? 'Saving…' : 'Save'}</button>
      </div>
    </form>
  )
}

// Gold burst at a screen point: a ring and 14 sparks, ~700ms, then gone.
export function Burst({ x, y, onDone }) {
  const done = useRef(onDone)
  done.current = onDone
  useEffect(() => {
    const t = setTimeout(() => done.current(), 750)
    return () => clearTimeout(t)
  }, [])
  return (
    <div className="lt-burst" style={{ left: x, top: y }} aria-hidden="true">
      <span className="ring" />
      {Array.from({ length: 14 }, (_, i) => (
        <i key={i} style={{ '--a': `${(i / 14) * 360}deg`, '--d': `${34 + (i % 3) * 10}px` }} />
      ))}
    </div>
  )
}
