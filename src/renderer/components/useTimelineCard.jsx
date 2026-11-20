import { useState, useEffect, useCallback } from 'react'
import bridge from '../lib/bridge'
import { setAchieved } from '../lib/lifeTimelineActions'
import AchievePopover, { Burst } from './lifeTimeline/AchievePopover'

const BURST_HOLD_MS = 450 // gold burst plays before the item leaves the card
const wait = (ms) => new Promise(r => setTimeout(r, ms))

// Data and Mark achieved for the Life Timeline card (DeskTimelineCard), shared
// by Desk Mode and the Dashboard so both fetch and write the same way.
// enabled: Admin only. When false nothing is requested and data stays null —
// the Tracker app never calls GET /api/life-timeline (the API rejects it too).
// Any failure just leaves data null, so the card hides; it must never break
// the page it sits on.
// Returns { data, reload, onMark(item, anchorEl), popOpen, closePop, overlays } — render
// `overlays` outside any transformed container (Desk Mode's burn-in shift).
export default function useTimelineCard({ enabled, touch = false }) {
  const [data, setData] = useState(null)
  const [pop, setPop] = useState(null)       // { item, anchor }
  const [bursts, setBursts] = useState([])   // [{ id, x, y }]

  const reload = useCallback(async () => {
    if (!enabled) { setData(null); return }
    try { setData(await bridge.getLifeTimeline()) } catch (e) { console.error('Life Timeline card', e); setData(null) }
  }, [enabled])
  useEffect(() => { reload() }, [reload])

  const save = useCallback(async ({ date, note }) => {
    const { item, anchor } = pop
    await setAchieved(item, true, { date, note })
    setPop(null)
    const r = anchor.getBoundingClientRect()
    setBursts(b => [...b, { id: Date.now() + Math.random(), x: r.left + r.width / 2, y: r.top + r.height / 2 }])
    await Promise.all([reload(), wait(BURST_HOLD_MS)])
  }, [pop, reload])
  const close = useCallback(() => setPop(null), [])
  const onMark = useCallback((item, anchor) => setPop({ item, anchor }), [])

  const overlays = (
    <>
      {pop && <AchievePopover item={pop.item} anchor={pop.anchor} onSave={save} onClose={close} touch={touch} />}
      {bursts.map(b => <Burst key={b.id} x={b.x} y={b.y} onDone={() => setBursts(list => list.filter(x => x.id !== b.id))} />)}
    </>
  )

  return { data: enabled ? data : null, reload, onMark, popOpen: !!pop, closePop: close, overlays }
}
