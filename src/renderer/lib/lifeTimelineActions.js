// Marking a Life Timeline item achieved (or undoing it). Shared by the Life
// Timeline page and the Desk Mode card so both write exactly the same way.
import bridge from './bridge'
import { fmtDate } from './lifeTimeline'

// "Achieved 12 Mar 2027: note" appended to the existing notes.
export const withNote = (notes, date, note) =>
  (note ? [notes, `Achieved ${fmtDate(date)}: ${note}`].filter(Boolean).join('\n') : notes ?? null)

// item: an entry from buildItems(). Goals change through the Goals API (whole
// row, as the Goals page does) so the Goals page agrees; events through the
// Life Timeline API. date: 'YYYY-MM-DD'.
async function setGoalAchieved(goalId, on, { date, note } = {}, { required = true } = {}) {
  const goals = await bridge.getAllGoals()
  const goal = (goals || []).find(g => Number(g.id) === Number(goalId))
  if (!goal) {
    if (required) throw new Error('That goal no longer exists')
    return
  }
  if (!!Number(goal.is_achieved) === on) return
  await bridge.updateGoal({
    ...goal,
    is_achieved: on,
    // stored like the Goals page's own timestamps; noon UTC keeps the date in every timezone
    achieved_at: on ? `${date}T12:00:00.000Z` : null,
    notes: on ? withNote(goal.notes, date, note) : goal.notes,
  })
}

export async function setAchieved(item, on, { date, note } = {}) {
  if (item.kind === 'goal') {
    await setGoalAchieved(item.id, on, { date, note })
  } else if (item.kind === 'event') {
    const ev = item.raw
    await bridge.updateLifeEvent({
      ...ev,
      status: on ? 'done' : 'planned',
      achieved_at: on ? date : null,
      notes: on ? withNote(ev.notes, date, note) : ev.notes,
    })
    // A linked goal is the same item on the timeline: keep the Goals page in
    // step (the note goes on the event only).
    if (ev.goal_id != null) await setGoalAchieved(ev.goal_id, on, { date }, { required: false })
  } else {
    throw new Error('Only events and goals can be marked achieved')
  }
}
