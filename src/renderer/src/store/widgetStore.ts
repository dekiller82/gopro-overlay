import { create } from 'zustand'
import type { WidgetInstance } from '@shared/types'
import { createWidget } from '@shared/widgets/defaults'

interface WidgetState {
  widgets: WidgetInstance[]
  /** The "primary" selection -- drives the property panel, which can only show one widget's fields
   *  at a time. Always a member of selectedIds (or null exactly when selectedIds is empty). */
  selectedId: string | null
  /** Full multi-selection set (shift-click adds/removes members). Group drag/nudge/delete/align all
   *  operate over this whole set; a single click collapses it back down to one member. */
  selectedIds: string[]
  canUndo: boolean
  canRedo: boolean
  addWidget: (type: WidgetInstance['type']) => void
  updateWidget: (id: string, patch: Partial<WidgetInstance>) => void
  removeWidget: (id: string) => void
  removeWidgets: (ids: string[]) => void
  /** additive (shift-click) toggles the id's membership in selectedIds instead of replacing the
   *  whole selection with just this one id. Passing null always clears the selection entirely. */
  selectWidget: (id: string | null, additive?: boolean) => void
  /** Moves every widget in `ids` by the same (x,y) fraction delta -- used for group drag and for
   *  arrow-key nudge, both of which move every selected widget together. */
  moveWidgetsBy: (ids: string[], dxFrac: number, dyFrac: number) => void
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
// Every widget selection (a plain click, even without dragging) calls bringToFront, which is a
// mutation just like any style edit -- so a long, actively-edited session accumulates a history
// entry roughly every time the user clicks a different widget, not just on deliberate style
// changes. Left uncapped, `past` grew for the entire lifetime of the editor with no ceiling at
// all; capped here so total memory for the undo stack stays bounded regardless of session length.
const MAX_UNDO_HISTORY = 200

/** Call from every mutating action BEFORE applying its change. Pushes the pre-mutation snapshot
 *  onto the undo stack only if this is the first mutation of a new burst, and always invalidates
 *  redo history (a fresh edit after undoing makes the old "future" branch unreachable, same as any
 *  standard undo/redo timeline). */
function recordHistoryPoint(currentWidgets: WidgetInstance[]): void {
  if (!burstActive) {
    past = [...past, currentWidgets]
    if (past.length > MAX_UNDO_HISTORY) past = past.slice(past.length - MAX_UNDO_HISTORY)
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
  selectedIds: [],
  canUndo: false,
  canRedo: false,

  addWidget: (type) => {
    recordHistoryPoint(get().widgets)
    const widget = createWidget(type)
    set((state) => ({
      widgets: [...state.widgets, widget],
      selectedId: widget.id,
      selectedIds: [widget.id],
      canUndo: true,
      canRedo: false
    }))
  },

  updateWidget: (id, patch) => {
    recordHistoryPoint(get().widgets)
    set((state) => ({
      widgets: state.widgets.map((w) => (w.id === id ? ({ ...w, ...patch } as WidgetInstance) : w)),
      canUndo: true,
      canRedo: false
    }))
  },

  removeWidget: (id) => get().removeWidgets([id]),

  removeWidgets: (ids) => {
    const idSet = new Set(ids)
    recordHistoryPoint(get().widgets)
    set((state) => {
      const selectedIds = state.selectedIds.filter((existingId) => !idSet.has(existingId))
      return {
        widgets: state.widgets.filter((w) => !idSet.has(w.id)),
        selectedIds,
        selectedId: state.selectedId && idSet.has(state.selectedId) ? (selectedIds[selectedIds.length - 1] ?? null) : state.selectedId,
        canUndo: true,
        canRedo: false
      }
    })
  },

  selectWidget: (id, additive = false) => {
    if (id === null) {
      set({ selectedId: null, selectedIds: [] })
      return
    }
    if (!additive) {
      set({ selectedId: id, selectedIds: [id] })
      return
    }
    set((state) => {
      const isMember = state.selectedIds.includes(id)
      const selectedIds = isMember ? state.selectedIds.filter((existingId) => existingId !== id) : [...state.selectedIds, id]
      const selectedId = isMember ? (state.selectedId === id ? (selectedIds[selectedIds.length - 1] ?? null) : state.selectedId) : id
      return { selectedId, selectedIds }
    })
  },

  moveWidgetsBy: (ids, dxFrac, dyFrac) => {
    if (ids.length === 0) return
    const idSet = new Set(ids)
    recordHistoryPoint(get().widgets)
    set((state) => ({
      widgets: state.widgets.map((w) => (idSet.has(w.id) ? { ...w, x: w.x + dxFrac, y: w.y + dyFrac } : w)),
      canUndo: true,
      canRedo: false
    }))
  },

  bringToFront: (id) => {
    const maxZ = Math.max(0, ...get().widgets.map((w) => w.zIndex))
    get().updateWidget(id, { zIndex: maxZ + 1 })
  },

  loadWidgets: (widgets) => {
    past = []
    future = []
    burstActive = false
    set({ widgets, selectedId: null, selectedIds: [], canUndo: false, canRedo: false })
  },

  applyWidgets: (widgets) => {
    recordHistoryPoint(get().widgets)
    set({ widgets, selectedId: null, selectedIds: [], canUndo: true, canRedo: false })
  },

  reset: () => {
    past = []
    future = []
    burstActive = false
    set({ widgets: [], selectedId: null, selectedIds: [], canUndo: false, canRedo: false })
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
    if (past.length > MAX_UNDO_HISTORY) past = past.slice(past.length - MAX_UNDO_HISTORY)
    set({ widgets: next, canUndo: true, canRedo: future.length > 0 })
  }
}))
