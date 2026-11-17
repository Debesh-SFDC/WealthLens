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

    const spawn = (x0, x1, y0, y1) => ({
      x: x0 + Math.random() * (x1 - x0),
      y: y0 + Math.random() * (y1 - y0),
      r: Math.random() * 1.4 + 0.3,
      v: Math.random() * 0.25 + 0.05,
      a: Math.random() * 0.5 + 0.1,
    })

    // Resizes (window, sidebar collapse, wide view) keep the existing dust in
    // place and only add or drop particles, so an animated width change
    // doesn't re-scatter the whole field every frame.
    const size = () => {
      const rect = cv.parentElement.getBoundingClientRect()
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      const nw = Math.max(1, rect.width)
      const nh = Math.max(1, rect.height)
      if (nw === w && nh === h) return
      cv.width = Math.round(nw * dpr)
      cv.height = Math.round(nh * dpr)
      cx.setTransform(dpr, 0, 0, dpr, 0, 0)
      // ~90 particles on a desktop-sized stage, fewer on a phone
      const count = Math.round(Math.min(110, Math.max(30, (nw * nh) / 11000)))
      if (!particles.length) {
        particles = Array.from({ length: count }, () => spawn(0, nw, 0, nh))
      } else {
        particles = particles.filter(p => p.x <= nw + 2 && p.y <= nh)
        // fill newly revealed space first, then anywhere
        while (particles.length < count) {
          particles.push(nw > w ? spawn(w, nw, 0, nh) : nh > h ? spawn(0, nw, h, nh) : spawn(0, nw, 0, nh))
        }
        if (particles.length > count) particles.length = count
      }
      w = nw
      h = nh
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
