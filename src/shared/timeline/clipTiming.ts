import type { ClipInfo } from '../types'

/**
 * Which clip a global-timeline position falls within. Clips are contiguous, so this is just
 * "find the last clip whose startOffsetMs is <= globalMs" -- clamped to a valid index so an
 * out-of-range globalMs (e.g. exactly at or past the very end) still returns the last clip rather
 * than -1. Both `VideoPlayer.tsx` and `Timeline.tsx` derive this independently from the same
 * global `currentTimeMs`, rather than one component depending on the other's internal state.
 */
export function clipIndexAtGlobalMs(clips: ClipInfo[], globalMs: number): number {
  if (clips.length === 0) return -1
  let idx = 0
  for (let i = 0; i < clips.length; i++) {
    if (clips[i].startOffsetMs <= globalMs) idx = i
    else break
  }
  return idx
}

/** The clip-local position (ms since that clip's own start) for a given global-timeline position. */
export function localMsWithinClip(clip: ClipInfo, globalMs: number): number {
  return globalMs - clip.startOffsetMs
}
