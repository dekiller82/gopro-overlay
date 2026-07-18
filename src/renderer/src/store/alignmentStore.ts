import { create } from 'zustand'

interface AlignmentState {
  /** Fraction of the frame's shorter dimension used as padding by both the one-click align buttons
   *  and live drag-snapping -- shared so the two stay consistent (dragging near an edge snaps to
   *  the exact same spot a button click would produce). Not persisted to the project file -- an
   *  editing-tool preference, not part of the exported video. */
  paddingFraction: number
  snapEnabled: boolean
  setPaddingFraction: (value: number) => void
  setSnapEnabled: (value: boolean) => void
}

export const useAlignmentStore = create<AlignmentState>((set) => ({
  paddingFraction: 0.02,
  snapEnabled: true,
  setPaddingFraction: (value) => set({ paddingFraction: value }),
  setSnapEnabled: (value) => set({ snapEnabled: value })
}))
