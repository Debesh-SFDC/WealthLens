import { useEffect, useState } from 'react'

// Fixed, top-center notification. Stays fully visible for ~2.7s, fades over
// the next 0.3s, then calls onHide (caller owns the `visible` state — this
// component only drives the timing).
export default function Toast({ message, type = 'success', visible, onHide }) {
  const [fading, setFading] = useState(false)

  useEffect(() => {
    if (!visible) { setFading(false); return }
    setFading(false)
    const fadeTimer = setTimeout(() => setFading(true), 2700)
    const hideTimer = setTimeout(() => onHide?.(), 3000)
    return () => { clearTimeout(fadeTimer); clearTimeout(hideTimer) }
  }, [visible, message])

  if (!visible) return null

  return (
    <div
      role="status"
      className="fixed top-4 left-1/2 z-[100] px-5 py-3 rounded-2xl shadow-lg text-sm font-semibold text-white pointer-events-none"
      style={{
        backgroundColor: type === 'error' ? '#EF4444' : '#10B981',
        transform: 'translateX(-50%)',
        opacity: fading ? 0 : 1,
        transition: 'opacity 0.3s ease',
      }}
    >
      {message}
    </div>
  )
}
