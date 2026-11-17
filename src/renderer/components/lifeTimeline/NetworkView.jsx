import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react'
import { forceSimulation, forceLink, forceManyBody, forceCollide, forceX, forceY } from 'd3-force'
import { zoom as d3zoom, zoomIdentity } from 'd3-zoom'
import { select } from 'd3-selection'
import { buildGraph, describeNode } from '../../lib/lifeTimelineNetwork'

export const NET_MIN_K = 0.15
export const NET_MAX_K = 6
const LOG_MIN = Math.log(NET_MIN_K)
const LOG_MAX = Math.log(NET_MAX_K)
export const kToSlider = (k) => Math.round(((Math.log(k) - LOG_MIN) / (LOG_MAX - LOG_MIN)) * 1000)
export const sliderToK = (v) => Math.exp(LOG_MIN + (v / 1000) * (LOG_MAX - LOG_MIN))

const truncate = (s, n) => (s.length > n ? `${s.slice(0, n - 1)}…` : s)

// Force layout, run to rest synchronously so the graph appears settled (and
// identical every time — d3-force's initial placement is deterministic).
// Phase hubs are pulled hard to their year on a left→right time axis, so the
// graph still reads as time; everything else is pulled gently toward its year.
function runLayout(graph, range, narrow) {
  const span = Math.max(1, range.end - range.start)
  const W = narrow ? 900 : Math.max(1500, span * 34)
  const H = narrow ? 900 : 680
  const PAD = 80
  const xOfYear = (y) => PAD + ((y - range.start) / span) * (W - 2 * PAD)
  const targetX = (n) => xOfYear(n.year + (n.month ? (n.month - 1) / 12 : 0.5))
  const nodes = graph.nodes.map((n, i) => ({ ...n, x: targetX(n), y: H / 2 + ((i % 9) - 4) * 26 }))
  const links = graph.links.map(l => ({ ...l }))
  const sim = forceSimulation(nodes)
    .force('link', forceLink(links).id(d => d.id)
      .distance(l => (l.kind === 'phase' ? 105 : l.kind === 'dep' ? 130 : l.kind === 'goal' ? 80 : 60))
      .strength(l => (l.kind === 'spine' ? 0.01 : l.kind === 'phase' ? 0.22 : 0.35)))
    .force('charge', forceManyBody().strength(d => (d.kind === 'phase' ? -520 : -180)).distanceMax(420))
    .force('collide', forceCollide(d => d.r + 12).iterations(2))
    .force('x', forceX(targetX).strength(d => (d.kind === 'phase' ? 0.9 : d.kind === 'now' ? 0.5 : 0.12)))
    .force('y', forceY(H / 2).strength(d => (d.kind === 'phase' ? 0.9 : narrow ? 0.02 : 0.05)))
    .stop()
  for (let i = 0; i < 380; i++) sim.tick()
  const byId = new Map(nodes.map(n => [n.id, n]))
  // shorten edges to the node rims so arrowheads stay visible
  const edges = links.map((l, i) => {
    const s = l.source
    const t = l.target
    const dx = t.x - s.x
    const dy = t.y - s.y
    const len = Math.hypot(dx, dy) || 1
    const ux = dx / len
    const uy = dy / len
    const tail = l.kind === 'dep' ? 5 : 0
    return {
      key: `${l.kind}-${s.id}-${t.id}-${i}`, kind: l.kind, s: s.id, t: t.id,
      d: `M${s.x + ux * s.r},${s.y + uy * s.r} L${t.x - ux * (t.r + tail)},${t.y - uy * (t.r + tail)}`,
    }
  })
  return { nodes, byId, edges }
}

function NodeShape({ n }) {
  if (n.kind === 'phase') {
    return (
      <>
        <circle r={n.r} className="nw-hub" />
        <text className="nw-numeral" dy="0.35em">{n.numeral || '•'}</text>
      </>
    )
  }
  if (n.kind === 'goal') {
    const s = n.r * 1.7
    return <rect x={-s / 2} y={-s / 2} width={s} height={s} rx={3} fill={n.color} className="nw-fill" />
  }
  if (n.kind === 'now') {
    return (
      <>
        <circle r={n.r} className="nw-pulse" />
        <circle r={n.r} fill={n.color} className="nw-fill" />
      </>
    )
  }
  return <circle r={n.r} fill={n.color} className="nw-fill" />
}

const NetworkView = forwardRef(function NetworkView({ data, hidden, zoomed, reducedMotion, onOpenNode, onScale }, ref) {
  const wrapRef = useRef(null)
  const svgRef = useRef(null)
  const gRef = useRef(null)
  const zoomRef = useRef(null)
  const tRef = useRef(zoomIdentity)
  const fitted = useRef(false)
  const lastPointer = useRef('mouse')
  const [size, setSize] = useState({ w: 800, h: 500 })
  const [t, setT] = useState(zoomIdentity)
  const [hoverId, setHoverId] = useState(null)
  const [focusId, setFocusId] = useState(null)
  const [selectedId, setSelectedId] = useState(null)

  const graph = useMemo(() => buildGraph(data), [data])
  const narrow = size.w < 640
  const layout = useMemo(() => (data ? runLayout(graph, data.range, narrow) : null), [graph, data, narrow])

  useEffect(() => {
    const el = wrapRef.current
    if (!el) return
    const ro = new ResizeObserver(() => setSize({ w: el.clientWidth || 800, h: el.clientHeight || 500 }))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const duration = reducedMotion ? 0 : 320
  const run = useCallback((fn) => {
    const sel = select(svgRef.current)
    if (duration) sel.transition().duration(duration).call(fn)
    else fn(sel)
  }, [duration])

  const fit = useCallback((animate = true) => {
    if (!layout || !zoomRef.current) return
    const xs = layout.nodes.map(n => n.x)
    const ys = layout.nodes.map(n => n.y)
    const pad = 60
    const x0 = Math.min(...xs) - pad
    const x1 = Math.max(...xs) + pad
    const y0 = Math.min(...ys) - pad
    const y1 = Math.max(...ys) + pad
    const k = Math.max(NET_MIN_K, Math.min(2, Math.min(size.w / (x1 - x0), size.h / (y1 - y0))))
    const tr = zoomIdentity.translate(size.w / 2, size.h / 2).scale(k).translate(-(x0 + x1) / 2, -(y0 + y1) / 2)
    if (animate) run(sel => sel.call(zoomRef.current.transform, tr))
    else select(svgRef.current).call(zoomRef.current.transform, tr)
  }, [layout, size, run])

  // d3-zoom: drag and touch pinch pan/zoom; ctrl/cmd + wheel (and trackpad
  // pinch) zooms at the cursor; the plain wheel pans, as on the line.
  useEffect(() => {
    const svg = svgRef.current
    if (!svg) return
    const sel = select(svg)
    const z = d3zoom()
      .scaleExtent([NET_MIN_K, NET_MAX_K])
      .clickDistance(5)
      .filter(e => (e.type === 'wheel' ? e.ctrlKey || e.metaKey : !e.button))
      .wheelDelta(e => -e.deltaY * (e.deltaMode === 1 ? 0.05 : e.deltaMode ? 1 : 0.0025))
      .on('zoom', e => {
        tRef.current = e.transform
        gRef.current?.setAttribute('transform', e.transform.toString())
        setT(e.transform)
        onScale?.(e.transform.k)
      })
    sel.call(z).on('dblclick.zoom', null)
    sel.on('wheel.pan', e => {
      if (e.ctrlKey || e.metaKey) return
      e.preventDefault()
      z.translateBy(sel, -e.deltaX / tRef.current.k, -e.deltaY / tRef.current.k)
    }, { passive: false })
    zoomRef.current = z
    return () => { sel.on('.zoom', null).on('wheel.pan', null) }
  }, [onScale])

  // Fit once there is a layout and the view is actually on screen.
  useEffect(() => {
    if (!hidden && layout && size.w > 0 && !fitted.current) { fitted.current = true; fit(false) }
  }, [hidden, layout, size, fit])
  useEffect(() => { fitted.current = false }, [narrow])

  useImperativeHandle(ref, () => ({
    zoomIn: () => run(sel => zoomRef.current.scaleBy(sel, 1.4)),
    zoomOut: () => run(sel => zoomRef.current.scaleBy(sel, 1 / 1.4)),
    setScale: (k) => zoomRef.current && zoomRef.current.scaleTo(select(svgRef.current), k),
    fit: () => fit(true),
    focusPhase: (phaseId) => {
      const n = layout?.byId.get(`p${phaseId}`)
      if (n) run(sel => zoomRef.current.translateTo(sel, n.x, n.y))
    },
  }), [run, fit, layout])

  const activeId = hoverId ?? focusId ?? selectedId
  const lit = activeId ? graph.neighbours.get(activeId) : null

  const open = (n) => {
    const [sx, sy] = tRef.current.apply([n.x, n.y])
    if (wrapRef.current) wrapRef.current.style.transformOrigin = `${sx}px ${sy}px`
    onOpenNode(n)
  }
  const onNodeClick = (n) => {
    // touch: first tap highlights + shows the tooltip, a second tap opens
    if (lastPointer.current === 'touch' && selectedId !== n.id) { setSelectedId(n.id); return }
    open(n)
  }
  const ensureVisible = (n) => {
    const [sx, sy] = tRef.current.apply([n.x, n.y])
    if (sx < 40 || sy < 40 || sx > size.w - 40 || sy > size.h - 40) run(sel => zoomRef.current.translateTo(sel, n.x, n.y))
  }

  const active = activeId ? layout?.byId.get(activeId) : null
  const tip = active ? describeNode(active) : null
  const tipPos = active ? t.apply([active.x, active.y]) : null
  const inactive = hidden || zoomed

  return (
    <div
      ref={wrapRef}
      className={`lt-network${hidden ? ' lt-hide' : ''}${zoomed ? ' zoom' : ''}`}
      aria-hidden={inactive || undefined}
      onPointerDownCapture={(e) => { lastPointer.current = e.pointerType }}
    >
      <svg ref={svgRef} className="lt-netsvg" role="group" aria-label="Life network: phases, events and goals">
        <defs>
          <marker id="lt-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="8" markerHeight="8" orient="auto-start-reverse">
            <path d="M0,0 L10,5 L0,10 z" className="nw-arrowhead" />
          </marker>
        </defs>
        <g ref={gRef} transform={tRef.current.toString()}>
          <g className="nw-edges" aria-hidden="true">
            {layout?.edges.map(e => {
              const dim = lit && !(lit.has(e.s) && lit.has(e.t))
              return (
                <g key={e.key} className={`nw-edge ${e.kind}${dim ? ' dim' : ''}${lit && !dim ? ' lit' : ''}`}>
                  <path d={e.d} className="glow" />
                  <path d={e.d} className="core" markerEnd={e.kind === 'dep' ? 'url(#lt-arrow)' : undefined} />
                  {e.kind === 'dep' && <path d={e.d} className="pulse" pathLength="100" />}
                </g>
              )
            })}
          </g>
          <g className="nw-nodes">
            {layout?.nodes.map(n => {
              const d = describeNode(n)
              const dim = lit && !lit.has(n.id)
              const showLabel = n.kind === 'phase' || n.kind === 'now' || n.kind === 'retirement' || n.major || (lit && lit.has(n.id))
              const label = n.kind === 'phase' ? n.title : truncate(n.title, 24)
              return (
                <g
                  key={n.id}
                  className={`nw-node ${n.kind}${n.dim ? ' done' : ''}${dim ? ' faded' : ''}${activeId === n.id ? ' active' : ''}`}
                  transform={`translate(${n.x},${n.y})`}
                  tabIndex={inactive ? -1 : 0}
                  role="button"
                  aria-label={[d.title, d.when, d.amount, d.phase ? `phase ${d.phase}` : null, n.assumed ? 'assumed date' : null,
                    n.status === 'done' ? 'done' : n.status === 'dropped' ? 'dropped' : null].filter(Boolean).join(', ')}
                  onMouseEnter={() => setHoverId(n.id)}
                  onMouseLeave={() => setHoverId(null)}
                  onFocus={() => { setFocusId(n.id); ensureVisible(n) }}
                  onBlur={() => setFocusId(null)}
                  onClick={() => onNodeClick(n)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(n) }
                    if (e.key === 'Escape' && selectedId) { e.stopPropagation(); setSelectedId(null) }
                  }}
                >
                  <circle r={n.r + 7} className="nw-ring" />
                  {n.assumed && <circle r={n.r + 3.5} className="nw-assumed" />}
                  <NodeShape n={n} />
                  {showLabel && (
                    <text className={`nw-label${n.kind === 'phase' ? ' hub' : ''}`} y={n.r + (n.kind === 'phase' ? 18 : 14)}>{label}</text>
                  )}
                </g>
              )
            })}
          </g>
        </g>
      </svg>
      {tip && tipPos && !inactive && (
        <div className="lt-tip" role="tooltip" style={{ left: tipPos[0], top: tipPos[1] - active.r * t.k - 12 }}>
          <strong>{tip.title}</strong>
          <span>{tip.when}{tip.amount ? ` · ${tip.amount}` : ''}</span>
          {tip.phase && <small>{tip.phase}</small>}
        </div>
      )}
      <div className="lt-netlegend" aria-hidden="true">
        <span><i className="sq" />Goal</span><span><i className="ring" />Assumed</span><span><i className="arrow" />Happens after</span>
      </div>
    </div>
  )
})

export default NetworkView
