import { create } from 'zustand'
import type { ImportResult, LatLon } from '@shared/types'

interface ProjectState {
  imported: ImportResult | null
  /** Position within the GLOBAL stitched timeline (spans every clip), ms. */
  currentTimeMs: number
  isPlaying: boolean
  /** Shared by every widget that needs lap/sector detection (timer in laps mode, sectorTimer, and
   *  any future widget with the same need) -- set once, used everywhere. */
  startFinish: LatLon | null
  /** Whole-sequence trim, global ms spanning all clips. */
  trimStartMs: number
  trimEndMs: number
  setImported: (imported: ImportResult | null) => void
  /** Appending more clips to an in-progress edit -- unlike setImported, this does NOT reset the
   *  playhead/startFinish/trim (the user is extending their existing timeline, not starting a new
   *  one). If trim previously extended to the old sequence's end, it's extended to the new end too
   *  (newly added clips are included in the export range by default); an explicit trim point
   *  somewhere in the middle is left alone. */
  updateImportedClips: (imported: ImportResult) => void
  setCurrentTimeMs: (ms: number) => void
  setIsPlaying: (playing: boolean) => void
  setStartFinish: (latLon: LatLon | null) => void
  setTrim: (trimStartMs: number, trimEndMs: number) => void
}

export const useProjectStore = create<ProjectState>((set) => ({
  imported: null,
  currentTimeMs: 0,
  isPlaying: false,
  startFinish: null,
  trimStartMs: 0,
  trimEndMs: 0,
  setImported: (imported) =>
    set({
      imported,
      currentTimeMs: 0,
      isPlaying: false,
      startFinish: null,
      trimStartMs: 0,
      trimEndMs: imported?.telemetry.videoDurationMs ?? 0
    }),
  updateImportedClips: (imported) =>
    set((state) => ({
      imported,
      trimEndMs:
        state.imported && state.trimEndMs >= state.imported.telemetry.videoDurationMs
          ? imported.telemetry.videoDurationMs
          : state.trimEndMs
    })),
  setCurrentTimeMs: (currentTimeMs) => set({ currentTimeMs }),
  setIsPlaying: (isPlaying) => set({ isPlaying }),
  setStartFinish: (startFinish) => set({ startFinish }),
  setTrim: (trimStartMs, trimEndMs) => set({ trimStartMs, trimEndMs })
}))
