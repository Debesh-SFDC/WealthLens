import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { clampPpy, xOf, yearAt, trackWidth } from '../../lib/lifeTimelineZoom'

const easeInOut = (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2)

// Zoom + scroll state for the line. One value (ppy) plus the scroll offset;
// every change is anchored so the year under a given screen x stays there.
// The scroller's real scrollLeft is written in a layout effect, in the same
// frame as the new track width, so nothing ever jumps.
export default function useLineZoom({ range, scrollerRef, initialPpy, reducedMotion }) {
  const [z, setZ] = useState({ ppy: initialPpy, left: 0 })
  const [vw, setVw] = useState(800)
  const zRef = useRef(z)
  const vwRef = useRef(vw)
  const apply = useRef(false)
  const anim = useRef(0)
  zRef.current = z
  vwRef.current = vw

  const start = range?.start ?? 0

  useEffect(() => {
    const el = scrollerRef.current
    if (!el) return
    const ro = new ResizeObserver(() => setVw(el.clientWidth || 800))
    ro.observe(el)
    setVw(el.clientWidth || 800)
    return () => ro.disconnect()
  }, [scrollerRef, range])

  const clampLeft = useCallback((left, ppy) => {
    if (!range) return 0
    return Math.min(Math.max(0, trackWidth(range, ppy, vwRef.current) - vwRef.current), Math.max(0, left))
  }, [range])

  const set = useCallback((ppy, left) => {
    apply.current = true
    setZ({ ppy, left: clampLeft(left, ppy) })
  }, [clampLeft])

  // Keep the fractional year `anchorYear` under screen x `px` at the new ppy.
  const zoomAt = useCallback((ppy, anchorYear, px) => {
    const p = clampPpy(ppy)
    set(p, xOf(anchorYear, p, start) - px)
  }, [set, start])

  const yearAtPx = useCallback((px) => yearAt(px, zRef.current.left, zRef.current.ppy, start), [start])

  const stopAnim = useCallback(() => { cancelAnimationFrame(anim.current); anim.current = 0 }, [])

  const zoomBy = useCallback((factor, px = vwRef.current / 2) => {
    stopAnim()
    zoomAt(zRef.current.ppy * factor, yearAtPx(px), px)
  }, [zoomAt, yearAtPx, stopAnim])

  // Animated zoom (view switch, buttons, keys): interpolate in log space so
  // the line stretches/compresses at an even pace.
  const animateTo = useCallback((target, { px = vwRef.current / 2, anchorYear, duration = 450 } = {}) => {
    stopAnim()
    const to = clampPpy(target)
    const from = zRef.current.ppy
    const yA = anchorYear ?? yearAtPx(px)
    if (reducedMotion || duration <= 0 || Math.abs(Math.log(to / from)) < 0.001) { zoomAt(to, yA, px); return }
    const t0 = performance.now()
    const step = (now) => {
      const t = Math.min(1, (now - t0) / duration)
      zoomAt(Math.exp(Math.log(from) + (Math.log(to) - Math.log(from)) * easeInOut(t)), yA, px)
      anim.current = t < 1 ? requestAnimationFrame(step) : 0
    }
    anim.current = requestAnimationFrame(step)
  }, [reducedMotion, zoomAt, yearAtPx, stopAnim])

  const panTo = useCallback((left) => set(zRef.current.ppy, left), [set])
  const centerOnYear = useCallback((yf) => panTo(xOf(yf, zRef.current.ppy, start) - vwRef.current / 2), [panTo, start])

  // Scroll events (native scrollbar, inertia, our pan) feed back into state so
  // the visible window re-renders.
  const syncFromScroll = useCallback(() => {
    const el = scrollerRef.current
    if (!el || apply.current) return
    const left = el.scrollLeft
    if (Math.abs(left - zRef.current.left) >= 1) setZ(s => ({ ...s, left }))
  }, [scrollerRef])

  useLayoutEffect(() => {
    if (!apply.current) return
    apply.current = false
    const el = scrollerRef.current
    if (el) el.scrollLeft = z.left
  }, [z, scrollerRef])

  useEffect(() => stopAnim, [stopAnim])

  return { ppy: z.ppy, left: z.left, vw, zoomAt, zoomBy, animateTo, panTo, centerOnYear, yearAtPx, syncFromScroll, stopAnim }
}
