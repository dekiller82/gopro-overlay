import { create } from 'zustand'
import type { WidgetInstance } from '@shared/types'
import { createWidget } from '@shared/widgets/defaults'

interface WidgetState {
  widgets: WidgetInstance[]
  selectedId: string | null
  addWidget: (type: WidgetInstance['type']) => void
  updateWidget: (id: string, patch: Partial<WidgetInstance>) => void
  removeWidget: (id: string) => void
  selectWidget: (id: string | null) => void
  bringToFront: (id: string) => void
  loadWidgets: (widgets: WidgetInstance[]) => void
  reset: () => void
}

export const useWidgetStore = create<WidgetState>((set, get) => ({
  widgets: [],
  selectedId: null,

  addWidget: (type) => {
    const widget = createWidget(type)
    set((state) => ({ widgets: [...state.widgets, widget], selectedId: widget.id }))
  },

  updateWidget: (id, patch) =>
    set((state) => ({
      widgets: state.widgets.map((w) => (w.id === id ? ({ ...w, ...patch } as WidgetInstance) : w))
    })),

  removeWidget: (id) =>
    set((state) => ({
      widgets: state.widgets.filter((w) => w.id !== id),
      selectedId: state.selectedId === id ? null : state.selectedId
    })),

  selectWidget: (id) => set({ selectedId: id }),

  bringToFront: (id) => {
    const maxZ = Math.max(0, ...get().widgets.map((w) => w.zIndex))
    get().updateWidget(id, { zIndex: maxZ + 1 })
  },

  loadWidgets: (widgets) => set({ widgets, selectedId: null }),

  reset: () => set({ widgets: [], selectedId: null })
}))
