import { useState, useEffect } from 'react'
import bridge from '../lib/bridge'

// Dashboard "Quick Capture" — one-line add for tasks/ideas, no modal. Below
// the input, the 3 most recent pending tasks render as chips; tapping one
// marks it done.
export default function QuickCapture({ onToast }) {
  const [type, setType]       = useState('task')
  const [text, setText]       = useState('')
  const [saving, setSaving]   = useState(false)
  const [pending, setPending] = useState([])
  const [completing, setCompleting] = useState(null)

  async function loadPending() {
    try {
      const rows = await bridge.getTasks({ type: 'task', status: 'pending' })
      setPending((rows || []).slice(0, 3))
    } catch {}
  }

  useEffect(() => { loadPending() }, [])

  async function handleAdd(e) {
    e?.preventDefault()
    const title = text.trim()
    if (!title || saving) return
    setSaving(true)
    try {
      await bridge.createTask({ title, type })
      setText('')
      onToast?.(type === 'idea' ? '💡 Idea captured' : '📝 Task added')
      if (type === 'task') loadPending()
    } catch (err) {
      onToast?.(err.message || 'Could not save', 'error')
    } finally {
      setSaving(false)
    }
  }

  async function markDone(task) {
    setCompleting(task.id)
    try {
      await bridge.updateTask({ id: task.id, status: 'done' })
      // Let the strike-through play before the chip drops out.
      setTimeout(() => { setCompleting(null); loadPending() }, 350)
    } catch (err) {
      setCompleting(null)
      onToast?.(err.message || 'Could not update', 'error')
    }
  }

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
      <div className="flex items-center justify-between gap-2 mb-3">
        <h3 className="text-sm font-bold text-gray-900">Quick Capture</h3>
        <div className="flex p-0.5 rounded-lg bg-gray-100">
          {[['task', '📝 Task'], ['idea', '💡 Idea']].map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => setType(id)}
              className="px-3 py-1.5 rounded-md text-xs font-semibold transition-colors min-h-[32px]"
              style={type === id
                ? { backgroundColor: '#fff', color: '#6C63FF', boxShadow: '0 1px 2px rgba(0,0,0,0.08)' }
                : { color: '#6B7280' }}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <form onSubmit={handleAdd} className="flex gap-2">
        <input
          value={text}
          onChange={e => setText(e.target.value)}
          placeholder={type === 'idea' ? 'Jot down an idea…' : "What's on your mind?"}
          enterKeyHint="done"
          className="flex-1 min-w-0 h-12 sm:h-11 px-4 rounded-xl border border-gray-200 text-base sm:text-sm focus:outline-none focus:ring-2 focus:ring-[#6C63FF]/30 focus:border-[#6C63FF]"
        />
        <button
          type="submit"
          disabled={!text.trim() || saving}
          className="shrink-0 h-12 sm:h-11 px-5 rounded-xl text-white text-sm font-bold hover:opacity-90 transition-opacity disabled:opacity-40"
          style={{ backgroundColor: '#6C63FF' }}
        >
          Add
        </button>
      </form>

      {pending.length > 0 && (
        <div className="flex flex-wrap gap-2 mt-3">
          {pending.map(t => {
            const done = completing === t.id
            return (
              <button
                key={t.id}
                onClick={() => markDone(t)}
                disabled={done}
                title="Mark done"
                className="group flex items-center gap-1.5 max-w-full px-3 py-1.5 rounded-full bg-gray-50 border border-gray-200 text-xs font-medium text-gray-700 hover:border-[#10B981] hover:bg-emerald-50 transition-all min-h-[32px]"
                style={{ opacity: done ? 0.5 : 1 }}
              >
                <span
                  className="w-3.5 h-3.5 rounded-full border-2 shrink-0 flex items-center justify-center transition-colors"
                  style={{ borderColor: done ? '#10B981' : '#D1D5DB', backgroundColor: done ? '#10B981' : 'transparent' }}
                >
                  {done && <span className="text-white text-[8px] leading-none">✓</span>}
                </span>
                <span className={`truncate ${done ? 'line-through' : ''}`}>{t.title}</span>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
