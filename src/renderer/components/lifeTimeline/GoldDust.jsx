import { useEffect, useRef } from 'react'

// Drifting gold dust behind the timeline — the page's one canvas. Sized to its
// parent with a ResizeObserver (device-pixel-ratio aware). With reduced motion
// the particles are drawn once and stay still.
export default function GoldDust({ reducedMotion }) {
  const ref = useRef(null)

  useEffect(() => {
    const cv = ref.current
    if (!cv) return
    const cx = cv.getContext('2d')
    if (!cx) return
    const color = getComputedStyle(cv).getPropertyValue('--gold-primary').trim() || '#D4AF37'
    let particles = []
    let w = 0
    let h = 0
    let raf = 0

    const draw = () => {
      cx.clearRect(0, 0, w, h)
      cx.fillStyle = color
      for (const p of particles) {
        cx.globalAlpha = p.a
        cx.beginPath()
        cx.arc(p.x, p.y, p.r, 0, Math.PI * 2)
        cx.fill()
        if (!reducedMotion) {
          p.x += p.v
          if (p.x > w + 2) p.x = -2
        }
      }
      cx.globalAlpha = 1
    }

    const size = () => {
      const rect = cv.parentElement.getBoundingClientRect()
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      w = Math.max(1, rect.width)
      h = Math.max(1, rect.height)
      cv.width = Math.round(w * dpr)
      cv.height = Math.round(h * dpr)
      cx.setTransform(dpr, 0, 0, dpr, 0, 0)
      // ~90 particles on a desktop-sized stage, fewer on a phone
      const count = Math.round(Math.min(110, Math.max(30, (w * h) / 11000)))
      particles = Array.from({ length: count }, () => ({
        x: Math.random() * w,
        y: Math.random() * h,
        r: Math.random() * 1.4 + 0.3,
        v: Math.random() * 0.25 + 0.05,
        a: Math.random() * 0.5 + 0.1,
      }))
      draw()
    }

    size()
    const ro = new ResizeObserver(size)
    ro.observe(cv.parentElement)
    if (!reducedMotion) {
      const loop = () => { draw(); raf = requestAnimationFrame(loop) }
      raf = requestAnimationFrame(loop)
    }
    return () => { cancelAnimationFrame(raf); ro.disconnect() }
  }, [reducedMotion])

  return <canvas ref={ref} className="lt-dust" aria-hidden="true" />
}
