import { create } from 'zustand'
import type { WidgetInstance } from '@shared/types'
import { createWidget } from '@shared/widgets/defaults'

interface WidgetState {
  widgets: WidgetInstance[]
  selectedId: string | null
  canUndo: boolean
  canRedo: boolean
  addWidget: (type: WidgetInstance['type']) => void
  updateWidget: (id: string, patch: Partial<WidgetInstance>) => void
  removeWidget: (id: string) => void
  selectWidget: (id: string | null) => void
  bringToFront: (id: string) => void
  loadWidgets: (widgets: WidgetInstance[]) => void
  /** Bulk-replaces the widget list within the CURRENT editing session (e.g. applying a saved
   *  layout preset) -- unlike loadWidgets (opening a fresh project, where the old undo history is
   *  meaningless), this is a single undoable step so "applied the wrong layout" can be undone. */
  applyWidgets: (widgets: WidgetInstance[]) => void
  reset: () => void
  undo: () => void
  redo: () => void
}

// Undo history lives outside the reactive store state (past/future stacks themselves don't need to
// trigger re-renders, only the canUndo/canRedo booleans derived from them do) and is intentionally
// module-level rather than per-widget -- one shared timeline across every widget edit, same as a
// real editor's Ctrl+Z.
let past: WidgetInstance[][] = []
let future: WidgetInstance[][] = []
// Coalesces a whole burst of rapid-fire mutations (dragging a slider/color picker fires onChange
// continuously, not just on release) into ONE undo step, so undo doesn't move the value back by a
// single tick at a time. A quiet period this long with no further mutation ends the current burst;
// the next mutation after that starts a new one.
const BURST_QUIET_MS = 500
let burstActive = false
let burstTimer: ReturnType<typeof setTimeout> | null = null

/** Call from every mutating action BEFORE applying its change. Pushes the pre-mutation snapshot
 *  onto the undo stack only if this is the first mutation of a new burst, and always invalidates
 *  redo history (a fresh edit after undoing makes the old "future" branch unreachable, same as any
 *  standard undo/redo timeline). */
function recordHistoryPoint(currentWidgets: WidgetInstance[]): void {
  if (!burstActive) {
    past = [...past, currentWidgets]
    future = []
    burstActive = true
  }
  if (burstTimer) clearTimeout(burstTimer)
  burstTimer = setTimeout(() => {
    burstActive = false
  }, BURST_QUIET_MS)
}

export const useWidgetStore = create<WidgetState>((set, get) => ({
  widgets: [],
  selectedId: null,
  canUndo: false,
  canRedo: false,

  addWidget: (type) => {
    recordHistoryPoint(get().widgets)
    const widget = createWidget(type)
    set((state) => ({ widgets: [...state.widgets, widget], selectedId: widget.id, canUndo: true, canRedo: false }))
  },

  updateWidget: (id, patch) => {
    recordHistoryPoint(get().widgets)
    set((state) => ({
      widgets: state.widgets.map((w) => (w.id === id ? ({ ...w, ...patch } as WidgetInstance) : w)),
      canUndo: true,
      canRedo: false
    }))
  },

  removeWidget: (id) => {
    recordHistoryPoint(get().widgets)
    set((state) => ({
      widgets: state.widgets.filter((w) => w.id !== id),
      selectedId: state.selectedId === id ? null : state.selectedId,
      canUndo: true,
      canRedo: false
    }))
  },

  selectWidget: (id) => set({ selectedId: id }),

  bringToFront: (id) => {
    const maxZ = Math.max(0, ...get().widgets.map((w) => w.zIndex))
    get().updateWidget(id, { zIndex: maxZ + 1 })
  },

  loadWidgets: (widgets) => {
    past = []
    future = []
    burstActive = false
    set({ widgets, selectedId: null, canUndo: false, canRedo: false })
  },

  applyWidgets: (widgets) => {
    recordHistoryPoint(get().widgets)
    set({ widgets, selectedId: null, canUndo: true, canRedo: false })
  },

  reset: () => {
    past = []
    future = []
    burstActive = false
    set({ widgets: [], selectedId: null, canUndo: false, canRedo: false })
  },

  undo: () => {
    if (past.length === 0) return
    burstActive = false
    if (burstTimer) clearTimeout(burstTimer)
    const previous = past[past.length - 1]
    past = past.slice(0, -1)
    future = [...future, get().widgets]
    set({ widgets: previous, canUndo: past.length > 0, canRedo: true })
  },

  redo: () => {
    if (future.length === 0) return
    burstActive = false
    if (burstTimer) clearTimeout(burstTimer)
    const next = future[future.length - 1]
    future = future.slice(0, -1)
    past = [...past, get().widgets]
    set({ widgets: next, canUndo: true, canRedo: future.length > 0 })
  }
}))
