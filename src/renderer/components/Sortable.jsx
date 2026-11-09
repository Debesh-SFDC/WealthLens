import { createContext, useContext, useMemo } from 'react'
import {
  DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors,
} from '@dnd-kit/core'
import {
  SortableContext, arrayMove, rectSortingStrategy, sortableKeyboardCoordinates,
  useSortable, verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'

// Drag-and-drop "My Order" building blocks on top of @dnd-kit, which handles
// mouse, touch (Android / iPhone app) and keyboard alike. Drag only ever starts
// from a <DragHandle>; the rest of the card keeps its normal click and scroll
// behaviour. Keyboard: focus the handle, Space to pick up, arrows to move,
// Space to drop, Escape to cancel.

const GOLD = '#D4AF37'

// layout: 'grid' (cards wrap in rows) or 'list' (single column)
export function SortableList({ ids, onReorder, layout = 'list', children }) {
  const sensors = useSensors(
    // A few px of movement before a drag starts, so a tap on the handle stays a tap.
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  const handleDragEnd = ({ active, over }) => {
    if (!over || active.id === over.id) return
    const from = ids.indexOf(active.id)
    const to = ids.indexOf(over.id)
    if (from < 0 || to < 0) return
    onReorder?.(arrayMove(ids, from, to))
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragEnd={handleDragEnd}
      // Portal the screen-reader live region out of the list so it never takes
      // a grid cell or picks up space-y margins.
      accessibility={{ container: typeof document !== 'undefined' ? document.body : undefined }}
    >
      <SortableContext items={ids} strategy={layout === 'grid' ? rectSortingStrategy : verticalListSortingStrategy}>
        {children}
      </SortableContext>
    </DndContext>
  )
}

const HandleContext = createContext(null)

// Wraps one card. While dragging, the card lifts (shadow + gold outline) and
// the others slide out of its way. `disabled` renders it as a plain wrapper.
export function SortableItem({ id, disabled = false, className = '', children }) {
  const {
    attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging,
  } = useSortable({ id, disabled })

  const style = {
    // Translate only — scaling would stretch cards of different heights in a grid.
    transform: CSS.Translate.toString(transform),
    transition,
    position: 'relative',
    zIndex: isDragging ? 30 : undefined,
    borderRadius: '1rem',
    boxShadow: isDragging ? `0 18px 40px rgba(0,0,0,0.6), 0 0 0 2px ${GOLD}` : undefined,
  }

  const handle = useMemo(
    () => ({ attributes, listeners, setActivatorNodeRef, isDragging, disabled }),
    [attributes, listeners, setActivatorNodeRef, isDragging, disabled],
  )

  return (
    <div ref={setNodeRef} style={style} className={className}>
      <HandleContext.Provider value={handle}>{children}</HandleContext.Provider>
    </div>
  )
}

// ⋮⋮ grip. Renders nothing when its item is disabled (e.g. another sort is
// active), so callers can always include it.
export function DragHandle({ label = 'Drag to reorder', className = '' }) {
  const ctx = useContext(HandleContext)
  if (!ctx || ctx.disabled) return null
  const { attributes, listeners, setActivatorNodeRef, isDragging } = ctx
  return (
    <button
      type="button"
      ref={setActivatorNodeRef}
      {...attributes}
      {...listeners}
      aria-label={label}
      title={label}
      onClick={e => e.stopPropagation()}
      className={`flex items-center justify-center w-7 h-8 -ml-1 rounded-lg shrink-0 transition-colors hover:bg-gray-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#D4AF37] ${className}`}
      // touch-action: none lets a touch on the handle drag instead of scroll;
      // everywhere else on the card still scrolls normally.
      style={{ touchAction: 'none', cursor: isDragging ? 'grabbing' : 'grab', color: isDragging ? GOLD : '#8A8A8A' }}
    >
      <svg viewBox="0 0 24 24" className="w-4 h-4" fill="currentColor" aria-hidden="true">
        <circle cx="9" cy="5" r="1.6" /><circle cx="15" cy="5" r="1.6" />
        <circle cx="9" cy="12" r="1.6" /><circle cx="15" cy="12" r="1.6" />
        <circle cx="9" cy="19" r="1.6" /><circle cx="15" cy="19" r="1.6" />
      </svg>
    </button>
  )
}

// Small gold "#1" priority badge.
export function OrderBadge({ n, className = '' }) {
  if (!n) return null
  return (
    <span
      className={`inline-flex items-center px-1.5 py-0.5 rounded-md text-[10px] font-bold leading-none shrink-0 tabular-nums ${className}`}
      style={{ color: GOLD, backgroundColor: 'rgba(212,175,55,0.12)', border: '1px solid rgba(212,175,55,0.35)' }}
      title={`Priority #${n} in My Order`}
    >
      #{n}
    </span>
  )
}

// "Switch to My Order to rearrange" hint, with an optional one-tap switch.
export function ReorderHint({ onSwitch, children = 'Switch to My Order to rearrange' }) {
  return (
    <p className="text-xs text-gray-400 mb-3 flex items-center gap-1.5">
      <span aria-hidden="true">⋮⋮</span>
      {onSwitch ? (
        <button type="button" onClick={onSwitch} className="hover:underline" style={{ color: GOLD }}>{children}</button>
      ) : children}
    </p>
  )
}
