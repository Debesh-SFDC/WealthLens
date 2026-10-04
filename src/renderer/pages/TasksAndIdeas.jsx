import { useState, useEffect, useMemo, useRef } from 'react'
import bridge from '../lib/bridge'
import Toast from '../components/Toast'
import {
  localDateStr, dueDay, isOverdue, formatDue, sortTasks, PRIORITY_COLORS, ideaColor,
} from '../lib/tasks'

const PRIORITIES = [
  { id: 'high',   label: 'High' },
  { id: 'medium', label: 'Medium' },
  { id: 'low',    label: 'Low' },
]

// ── Create / edit modal (tasks and ideas share it) ──────────────────────────
function TaskModal({ initial, defaultType, onClose, onSaved }) {
  const editing = !!initial?.id
  const [form, setForm] = useState(() => {
    const [date = '', time = ''] = (initial?.due_date || '').split('T')
    return {
      title: initial?.title || '',
      description: initial?.description || '',
      type: initial?.type || defaultType,
      priority: initial?.priority || 'medium',
      date, time,
    }
  })
  const [saving, setSaving] = useState(false)
  const [error, setError]   = useState('')
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  async function handleSubmit(e) {
    e.preventDefault()
    if (!form.title.trim()) return setError('Title is required')
    setSaving(true)
    const payload = {
      title: form.title.trim(),
      description: form.description.trim() || null,
      type: form.type,
      priority: form.priority,
      due_date: form.type === 'task' && form.date ? (form.time ? `${form.date}T${form.time}` : form.date) : null,
    }
    try {
      if (editing) await bridge.updateTask({ id: initial.id, ...payload })
      else await bridge.createTask(payload)
      onSaved(editing ? 'Saved' : form.type === 'idea' ? '💡 Idea added' : '📝 Task added')
    } catch (err) {
      setError(err?.message || 'Could not save')
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="bg-white rounded-2xl w-full max-w-[460px] shadow-2xl overflow-hidden">
        <div className="px-6 py-5 border-b border-gray-100 flex items-center justify-between">
          <h2 className="text-lg font-bold text-gray-900">
            {editing ? 'Edit' : 'New'} {form.type === 'idea' ? 'Idea' : 'Task'}
          </h2>
          <button onClick={onClose} className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-gray-100 transition-colors">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4 text-gray-500">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div className="flex p-0.5 rounded-xl bg-gray-100">
            {[['task', '✅ Task'], ['idea', '💡 Idea']].map(([id, label]) => (
              <button
                key={id} type="button" onClick={() => set('type', id)}
                className="flex-1 py-2 rounded-lg text-sm font-semibold transition-colors"
                style={form.type === id ? { backgroundColor: '#fff', color: '#6C63FF', boxShadow: '0 1px 2px rgba(0,0,0,0.08)' } : { color: '#6B7280' }}
              >{label}</button>
            ))}
          </div>
          <input
            autoFocus placeholder="Title" value={form.title} onChange={e => set('title', e.target.value)}
            className="w-full px-4 py-3 rounded-xl border border-gray-200 text-base font-semibold text-gray-900 focus:outline-none focus:border-[#6C63FF] focus:ring-2 focus:ring-[#6C63FF]/20"
          />
          <textarea
            rows={form.type === 'idea' ? 5 : 3} placeholder="Description (optional)"
            value={form.description} onChange={e => set('description', e.target.value)}
            className="w-full px-4 py-2.5 rounded-xl border border-gray-200 text-sm text-gray-800 resize-none focus:outline-none focus:border-[#6C63FF]"
          />
          {form.type === 'task' && (
            <>
              <div>
                <p className="text-xs font-semibold text-gray-500 mb-1.5">Priority</p>
                <div className="flex gap-2">
                  {PRIORITIES.map(p => (
                    <button
                      key={p.id} type="button" onClick={() => set('priority', p.id)}
                      className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl border text-sm font-semibold transition-colors"
                      style={form.priority === p.id
                        ? { borderColor: PRIORITY_COLORS[p.id], backgroundColor: PRIORITY_COLORS[p.id] + '15', color: PRIORITY_COLORS[p.id] }
                        : { borderColor: '#E5E7EB', color: '#6B7280' }}
                    >
                      <span className="w-2 h-2 rounded-full" style={{ backgroundColor: PRIORITY_COLORS[p.id] }} />
                      {p.label}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <p className="text-xs font-semibold text-gray-500 mb-1.5">Due (optional)</p>
                <div className="flex gap-2">
                  <input
                    type="date" value={form.date} onChange={e => set('date', e.target.value)}
                    className="flex-1 min-w-0 px-3 py-2.5 rounded-xl border border-gray-200 text-sm text-gray-800 focus:outline-none focus:border-[#6C63FF]"
                  />
                  <input
                    type="time" value={form.time} disabled={!form.date} onChange={e => set('time', e.target.value)}
                    className="w-32 px-3 py-2.5 rounded-xl border border-gray-200 text-sm text-gray-800 focus:outline-none focus:border-[#6C63FF] disabled:opacity-40"
                  />
                </div>
                <div className="flex gap-2 mt-2">
                  {[['Today', 0], ['Tomorrow', 1]].map(([label, offset]) => (
                    <button
                      key={label} type="button"
                      onClick={() => set('date', localDateStr(new Date(Date.now() + offset * 86400000)))}
                      className="px-3 py-1 rounded-full bg-gray-100 text-xs font-semibold text-gray-600 hover:bg-gray-200"
                    >{label}</button>
                  ))}
                  {form.date && (
                    <button type="button" onClick={() => setForm(f => ({ ...f, date: '', time: '' }))} className="px-3 py-1 rounded-full text-xs font-semibold text-gray-400 hover:text-gray-600">Clear</button>
                  )}
                </div>
              </div>
            </>
          )}
          {error && <p className="text-xs font-semibold text-red-500">{error}</p>}
          <div className="flex gap-3 pt-1">
            <button type="button" onClick={onClose} className="flex-1 py-2.5 rounded-xl border border-gray-200 text-sm font-semibold text-gray-600 hover:bg-gray-50 transition-colors">Cancel</button>
            <button type="submit" disabled={saving} className="flex-1 py-2.5 rounded-xl text-white text-sm font-semibold hover:opacity-90 transition-opacity disabled:opacity-60" style={{ backgroundColor: '#6C63FF' }}>{saving ? 'Saving…' : editing ? 'Save' : 'Add'}</button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ── ⋮ overflow menu ─────────────────────────────────────────────────────────
function RowMenu({ items }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)
  useEffect(() => {
    if (!open) return
    const close = (e) => { if (!ref.current?.contains(e.target)) setOpen(false) }
    document.addEventListener('pointerdown', close)
    return () => document.removeEventListener('pointerdown', close)
  }, [open])
  return (
    <div ref={ref} className="relative shrink-0">
      <button
        onClick={(e) => { e.stopPropagation(); setOpen(o => !o) }}
        className="w-8 h-8 rounded-lg flex items-center justify-center text-gray-400 hover:text-gray-700 hover:bg-black/5 transition-colors"
        aria-label="More actions"
      >
        <svg viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4"><circle cx="12" cy="5" r="1.8"/><circle cx="12" cy="12" r="1.8"/><circle cx="12" cy="19" r="1.8"/></svg>
      </button>
      {open && (
        <div className="absolute right-0 top-9 z-20 w-36 py-1 bg-white rounded-xl shadow-lg border border-gray-100">
          {items.map(it => (
            <button
              key={it.label}
              onClick={(e) => { e.stopPropagation(); setOpen(false); it.onClick() }}
              className={`w-full text-left px-3 py-2 text-sm font-medium hover:bg-gray-50 ${it.danger ? 'text-red-500' : 'text-gray-700'}`}
            >{it.label}</button>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Task row ────────────────────────────────────────────────────────────────
// Desktop: hover reveals Edit/Delete. Touch: swipe left reveals them.
function TaskRow({ task, today, onToggle, onEdit, onDelete }) {
  const [completing, setCompleting] = useState(false)
  const [revealed, setRevealed]     = useState(false)
  const touchX = useRef(null)
  const done = task.status === 'done'
  const checked = done || completing
  const overdue = isOverdue(task, today)

  function handleToggle() {
    if (done) return onToggle(task)
    setCompleting(true)
    setTimeout(() => onToggle(task), 450)
  }

  return (
    <div
      className="group relative overflow-hidden rounded-xl"
      onTouchStart={e => { touchX.current = e.touches[0].clientX }}
      onTouchEnd={e => {
        if (touchX.current == null) return
        const dx = e.changedTouches[0].clientX - touchX.current
        if (dx < -50) setRevealed(true)
        else if (dx > 30) setRevealed(false)
        touchX.current = null
      }}
    >
      {/* Swipe-revealed actions sit underneath the card */}
      <div className="absolute inset-y-0 right-0 flex" style={{ visibility: revealed ? 'visible' : 'hidden' }}>
        <button onClick={() => { setRevealed(false); onEdit(task) }} className="w-20 bg-[#6C63FF] text-white text-sm font-semibold">Edit</button>
        <button onClick={() => { setRevealed(false); onDelete(task) }} className="w-20 bg-red-500 text-white text-sm font-semibold">Delete</button>
      </div>
      <div
        className="relative flex items-start gap-3 px-3 py-3 bg-white border border-gray-100 rounded-xl transition-all duration-300"
        style={{ transform: revealed ? 'translateX(-160px)' : 'none', opacity: done ? 0.55 : 1 }}
      >
        <button
          onClick={handleToggle}
          aria-label={done ? 'Mark as pending' : 'Mark as done'}
          className="mt-0.5 w-6 h-6 shrink-0 rounded-md border-2 flex items-center justify-center transition-all duration-300"
          style={{
            borderColor: checked ? '#10B981' : '#D1D5DB',
            backgroundColor: checked ? '#10B981' : 'transparent',
            transform: completing ? 'scale(1.15)' : 'scale(1)',
          }}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth={3.5} strokeLinecap="round" strokeLinejoin="round"
            className="w-3.5 h-3.5 transition-opacity duration-200" style={{ opacity: checked ? 1 : 0 }}>
            <polyline points="20 6 9 17 4 12" />
          </svg>
        </button>
        <div className="flex-1 min-w-0" onClick={() => !done && onEdit(task)} role="button">
          <p
            className="text-sm font-semibold text-gray-900 break-words line-through"
            style={{ textDecorationColor: checked ? '#6B7280' : 'transparent', transition: 'text-decoration-color 0.3s ease' }}
          >
            {task.title}
          </p>
          {task.description && !done && <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">{task.description}</p>}
          {(task.due_date || done) && (
            <p className="text-xs mt-1 font-medium" style={{ color: overdue ? '#EF4444' : '#9CA3AF' }}>
              {done
                ? `Done ${task.done_at ? formatDue(localDateStr(new Date(task.done_at)), today) : ''}`
                : `${overdue ? 'Overdue · ' : 'Due: '}${formatDue(task.due_date, today)}`}
            </p>
          )}
        </div>
        <span className="mt-2 w-2 h-2 rounded-full shrink-0" title={`${task.priority} priority`} style={{ backgroundColor: PRIORITY_COLORS[task.priority] || '#D1D5DB' }} />
        <div className="hidden lg:group-hover:flex items-center gap-1 shrink-0">
          {!done && <button onClick={() => onEdit(task)} className="px-2 py-1 rounded-md text-xs font-semibold text-gray-500 hover:bg-gray-100">Edit</button>}
          <button onClick={() => onDelete(task)} className="px-2 py-1 rounded-md text-xs font-semibold text-red-500 hover:bg-red-50">Delete</button>
        </div>
        <RowMenu items={[
          ...(!done ? [{ label: 'Edit', onClick: () => onEdit(task) }] : []),
          { label: 'Delete', danger: true, onClick: () => onDelete(task) },
        ]} />
      </div>
    </div>
  )
}

function Section({ title, count, accent, children }) {
  return (
    <div>
      <div className="flex items-center gap-2 mb-2 px-1">
        <h3 className="text-xs font-bold uppercase tracking-wider" style={{ color: accent || '#6B7280' }}>{title}</h3>
        <span className="text-xs font-semibold text-gray-400">{count}</span>
      </div>
      <div className="space-y-2">{children}</div>
    </div>
  )
}

// ── Inline quick input (top of each tab) ────────────────────────────────────
function QuickInput({ type, onAdded, onError }) {
  const [text, setText] = useState('')
  const [saving, setSaving] = useState(false)
  async function submit(e) {
    e.preventDefault()
    const title = text.trim()
    if (!title || saving) return
    setSaving(true)
    try {
      await bridge.createTask({ title, type })
      setText('')
      onAdded()
    } catch (err) { onError(err.message || 'Could not save') }
    finally { setSaving(false) }
  }
  return (
    <form onSubmit={submit} className="flex gap-2">
      <input
        value={text} onChange={e => setText(e.target.value)} enterKeyHint="done"
        placeholder={type === 'idea' ? '💡 Capture an idea… (Enter to save)' : '📝 Quick add a task… (Enter to save)'}
        className="flex-1 min-w-0 h-12 sm:h-11 px-4 rounded-xl border border-gray-200 bg-white text-base sm:text-sm focus:outline-none focus:ring-2 focus:ring-[#6C63FF]/30 focus:border-[#6C63FF]"
      />
      <button type="submit" disabled={!text.trim() || saving} className="shrink-0 h-12 sm:h-11 px-5 rounded-xl text-white text-sm font-bold disabled:opacity-40" style={{ backgroundColor: '#6C63FF' }}>Add</button>
    </form>
  )
}

// ── Page ────────────────────────────────────────────────────────────────────
export default function TasksAndIdeas() {
  const [tab, setTab]         = useState('tasks')
  const [items, setItems]     = useState([])
  const [loading, setLoading] = useState(true)
  const [modal, setModal]     = useState(null) // { initial?, type }
  const [ideaSort, setIdeaSort] = useState('recent')
  const [showArchived, setShowArchived] = useState(false)
  const [expandedIdea, setExpandedIdea] = useState(null)
  const [toast, setToast] = useState({ visible: false, message: '', type: 'success' })
  const showToast = (message, type = 'success') => setToast({ visible: true, message, type })

  async function load() {
    try {
      setItems(await bridge.getTasks() || [])
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }
  useEffect(() => { load() }, [])

  const today = localDateStr()

  const taskGroups = useMemo(() => {
    const tasks = items.filter(t => t.type === 'task')
    const pending = tasks.filter(t => t.status === 'pending').sort(sortTasks)
    return {
      today:    pending.filter(t => t.due_date && dueDay(t) <= today),
      upcoming: pending.filter(t => t.due_date && dueDay(t) > today)
        .sort((a, b) => a.due_date.localeCompare(b.due_date)),
      noDate:   pending.filter(t => !t.due_date),
      done:     tasks.filter(t => t.status === 'done')
        .sort((a, b) => (b.done_at || '').localeCompare(a.done_at || '')),
    }
  }, [items, today])

  const ideas = useMemo(() => {
    const list = items.filter(t => t.type === 'idea' && (showArchived ? t.status === 'archived' : t.status !== 'archived'))
    return list.sort((a, b) => ideaSort === 'recent'
      ? (b.created_at || '').localeCompare(a.created_at || '')
      : (a.created_at || '').localeCompare(b.created_at || ''))
  }, [items, ideaSort, showArchived])

  async function toggleTask(task) {
    const status = task.status === 'done' ? 'pending' : 'done'
    setItems(list => list.map(t => t.id === task.id ? { ...t, status, done_at: status === 'done' ? new Date().toISOString() : null } : t))
    try { await bridge.updateTask({ id: task.id, status }) }
    catch (err) { showToast(err.message || 'Could not update', 'error'); load() }
  }

  async function remove(task) {
    if (!confirm(`Delete "${task.title}"?`)) return
    try {
      await bridge.deleteTask(task.id)
      setItems(list => list.filter(t => t.id !== task.id))
    } catch (err) { showToast(err.message || 'Could not delete', 'error') }
  }

  async function setIdeaStatus(idea, status) {
    try {
      await bridge.updateTask({ id: idea.id, status })
      showToast(status === 'archived' ? 'Idea archived' : 'Idea restored')
      load()
    } catch (err) { showToast(err.message || 'Could not update', 'error') }
  }

  const rowProps = { today, onToggle: toggleTask, onEdit: (t) => setModal({ initial: t, type: t.type }), onDelete: remove }
  const pendingCount = taskGroups.today.length + taskGroups.upcoming.length + taskGroups.noDate.length

  return (
    <div className="p-3 sm:p-6 max-w-4xl mx-auto space-y-4">
      {/* Internal tabs + add button */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex p-1 rounded-xl bg-gray-100">
          {[['tasks', '✅ Tasks', pendingCount], ['ideas', '💡 Ideas', items.filter(t => t.type === 'idea' && t.status !== 'archived').length]].map(([id, label, n]) => (
            <button
              key={id} onClick={() => setTab(id)}
              className="px-4 py-2 rounded-lg text-sm font-semibold transition-colors flex items-center gap-1.5"
              style={tab === id ? { backgroundColor: '#fff', color: '#1a1a2e', boxShadow: '0 1px 3px rgba(0,0,0,0.08)' } : { color: '#6B7280' }}
            >
              {label}
              {n > 0 && <span className="px-1.5 rounded-full text-[10px] font-bold" style={{ backgroundColor: tab === id ? '#6C63FF' : '#D1D5DB', color: '#fff' }}>{n}</span>}
            </button>
          ))}
        </div>
        <button
          onClick={() => setModal({ type: tab === 'ideas' ? 'idea' : 'task' })}
          className="h-10 px-4 rounded-xl text-white text-sm font-bold hover:opacity-90 flex items-center gap-1.5 shadow-sm"
          style={{ backgroundColor: '#6C63FF' }}
        >
          <span className="text-base leading-none">+</span> {tab === 'ideas' ? 'New Idea' : 'Add Task'}
        </button>
      </div>

      <QuickInput type={tab === 'ideas' ? 'idea' : 'task'} onAdded={load} onError={(m) => showToast(m, 'error')} />

      {loading ? (
        <div className="space-y-2">
          {[0, 1, 2].map(i => <div key={i} className="h-16 bg-white rounded-xl border border-gray-100 animate-pulse" />)}
        </div>
      ) : tab === 'tasks' ? (
        <div className="space-y-6">
          {pendingCount === 0 && taskGroups.done.length === 0 && (
            <div className="text-center py-16">
              <p className="text-4xl mb-2">✅</p>
              <p className="text-sm font-semibold text-gray-700">No tasks yet</p>
              <p className="text-xs text-gray-400 mt-1">Type above and press Enter to add one.</p>
            </div>
          )}
          {pendingCount === 0 && taskGroups.done.length > 0 && (
            <div className="text-center py-8 rounded-2xl bg-emerald-50 border border-emerald-100">
              <p className="text-2xl mb-1">🎉</p>
              <p className="text-sm font-semibold text-emerald-700">All caught up!</p>
            </div>
          )}
          {taskGroups.today.length > 0 && (
            <Section title="Today" count={taskGroups.today.length} accent="#6C63FF">
              {taskGroups.today.map(t => <TaskRow key={t.id} task={t} {...rowProps} />)}
            </Section>
          )}
          {taskGroups.upcoming.length > 0 && (
            <Section title="Upcoming" count={taskGroups.upcoming.length}>
              {taskGroups.upcoming.map(t => <TaskRow key={t.id} task={t} {...rowProps} />)}
            </Section>
          )}
          {taskGroups.noDate.length > 0 && (
            <Section title="No Date" count={taskGroups.noDate.length}>
              {taskGroups.noDate.map(t => <TaskRow key={t.id} task={t} {...rowProps} />)}
            </Section>
          )}
          {taskGroups.done.length > 0 && (
            <Section title="Completed" count={taskGroups.done.length} accent="#10B981">
              {taskGroups.done.map(t => <TaskRow key={t.id} task={t} {...rowProps} />)}
            </Section>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-2">
            <div className="flex gap-1.5">
              {[['recent', 'Recent'], ['oldest', 'Oldest']].map(([id, label]) => (
                <button
                  key={id} onClick={() => setIdeaSort(id)}
                  className="px-3 py-1.5 rounded-full text-xs font-semibold transition-colors"
                  style={ideaSort === id ? { backgroundColor: '#1a1a2e', color: '#fff' } : { backgroundColor: '#F3F4F6', color: '#6B7280' }}
                >{label}</button>
              ))}
            </div>
            <button onClick={() => setShowArchived(s => !s)} className="text-xs font-semibold text-gray-500 hover:text-gray-800">
              {showArchived ? '← Back to ideas' : 'View archived'}
            </button>
          </div>

          {ideas.length === 0 ? (
            <div className="text-center py-16">
              <p className="text-4xl mb-2">💡</p>
              <p className="text-sm font-semibold text-gray-700">{showArchived ? 'No archived ideas' : 'No ideas yet'}</p>
              {!showArchived && <p className="text-xs text-gray-400 mt-1">Capture the next spark above.</p>}
            </div>
          ) : (
            // Masonry via CSS columns — cards keep their natural height.
            <div className="columns-1 sm:columns-2 lg:columns-3 gap-3">
              {ideas.map(idea => {
                const c = ideaColor(idea.id)
                const expanded = expandedIdea === idea.id
                return (
                  <div
                    key={idea.id}
                    onClick={() => setExpandedIdea(expanded ? null : idea.id)}
                    className="break-inside-avoid mb-3 rounded-2xl border p-4 cursor-pointer transition-shadow hover:shadow-md"
                    style={{ backgroundColor: c.bg, borderColor: c.border }}
                  >
                    <div className="flex items-start gap-2">
                      <p className="flex-1 min-w-0 text-sm font-bold text-gray-900 break-words">{idea.title}</p>
                      <RowMenu items={[
                        { label: 'Edit', onClick: () => setModal({ initial: idea, type: 'idea' }) },
                        idea.status === 'archived'
                          ? { label: 'Restore', onClick: () => setIdeaStatus(idea, 'pending') }
                          : { label: 'Archive', onClick: () => setIdeaStatus(idea, 'archived') },
                        { label: 'Delete', danger: true, onClick: () => remove(idea) },
                      ]} />
                    </div>
                    {idea.description && (
                      <p className={`text-xs text-gray-700 mt-1.5 whitespace-pre-wrap break-words ${expanded ? '' : 'line-clamp-5'}`}>{idea.description}</p>
                    )}
                    <p className="text-[10px] font-semibold text-gray-500/80 mt-3">
                      {new Date(idea.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                    </p>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {modal && (
        <TaskModal
          initial={modal.initial}
          defaultType={modal.type}
          onClose={() => setModal(null)}
          onSaved={(msg) => { setModal(null); showToast(msg); load() }}
        />
      )}

      <Toast message={toast.message} type={toast.type} visible={toast.visible} onHide={() => setToast(t => ({ ...t, visible: false }))} />
    </div>
  )
}
