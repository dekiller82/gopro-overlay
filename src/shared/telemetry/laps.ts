import type { TelemetrySample, LatLon } from '../types'
import { findBracketIndex } from './interpolate'

// Re-exported for existing call sites -- canonical definition now lives in shared/types.ts since
// it's used by the global start/finish line (ProjectPayload), not just lap detection.
export type { LatLon }

export interface LapHistoryEntry {
  lapNumber: number
  timeMs: number
  /** True if this is (tied for) the fastest completed lap so far. */
  isBest: boolean
}

export interface LapState {
  /** 1-indexed, the lap currently in progress at the queried time. Setting the start/finish point
   * and immediately crossing it starts Lap 1 -- it does not jump straight to Lap 2. */
  lapNumber: number
  currentLapElapsedMs: number
  /** Duration of the most recently *completed* lap (null until one full lap has been finished). */
  lastLapMs: number | null
  bestLapMs: number | null
  /** True if the lap that just completed is a new (or tied) session-best -- drives the "new fastest lap" flash. */
  isNewBest: boolean
  /** Most recently completed laps, newest first, for an on-widget lap history list. */
  history: LapHistoryEntry[]
}

const EARTH_RADIUS_M = 6371000
const DEFAULT_THRESHOLD_METERS = 15
const DEFAULT_MIN_LAP_MS = 10000
// Raised from an earlier cap of 5 to comfortably cover the F1-style timing tower's configurable
// row count (property panel caps that at 20) -- cheap either way, this loop is O(min(laps, cap)).
const MAX_HISTORY_ENTRIES = 50

/** Flat-earth approximation, accurate enough at track scale (a few km at most). */
export function distanceMeters(a: LatLon, b: LatLon): number {
  const meanLatRad = (((a.lat + b.lat) / 2) * Math.PI) / 180
  const dLat = ((a.lat - b.lat) * Math.PI) / 180
  const dLon = (((a.lon - b.lon) * Math.PI) / 180) * Math.cos(meanLatRad)
  return Math.sqrt(dLat * dLat + dLon * dLon) * EARTH_RADIUS_M
}

/** Nearest raw sample's lat/lon to video time `cts` -- precise enough for marking a start/finish line by scrubbing to the crossing frame. */
export function nearestLatLon(samples: TelemetrySample[], cts: number): LatLon | null {
  if (samples.length === 0) return null
  const i = findBracketIndex(samples, cts)
  const j = Math.min(i + 1, samples.length - 1)
  const chosen = Math.abs(samples[j].cts - cts) < Math.abs(samples[i].cts - cts) ? j : i
  return { lat: samples[chosen].lat, lon: samples[chosen].lon }
}

/**
 * Sub-sample estimate of the true closest-approach time around a detected local-minimum sample,
 * fit by a parabola through the minimum and its two neighbors' SQUARED distances -- squared
 * distance is (near-exactly) quadratic in time for a path moving at roughly constant velocity past
 * a fixed point, which holds well over the short (~50-200ms) window between 3 consecutive GPS
 * samples even though raw distance itself isn't quadratic. Without this, the crossing time is
 * quantized to whichever raw sample happened to be nearest, which can shift lap splits by up to
 * half a sample interval for no reason related to the driver's actual line.
 *
 * Uses the classic equal-spacing parabolic-interpolation formula (offset expressed as a fraction of
 * one local sample step, not solved from the raw unequally-spaced timestamps) specifically because
 * that formula is provably bounded to +/-0.5 of a step for any genuine local minimum -- safe even
 * if real sample spacing isn't perfectly uniform, since it can never extrapolate past either
 * neighbor. Falls back to the raw sample's own cts if the fit is degenerate (near-duplicate
 * timestamps, or a perfectly flat/noisy triple with no real curvature).
 */
function interpolateCrossingCts(prevCts: number, atCts: number, nextCts: number, distPrev: number, distAt: number, distNext: number): number {
  const y0 = distPrev * distPrev
  const y1 = distAt * distAt
  const y2 = distNext * distNext
  const denom = y0 - 2 * y1 + y2
  if (!Number.isFinite(denom) || Math.abs(denom) < 1e-9) return atCts

  const offset = Math.max(-0.5, Math.min(0.5, (y0 - y2) / (2 * denom)))
  const avgStepMs = (nextCts - prevCts) / 2
  return atCts + offset * avgStepMs
}

/**
 * Detects start/finish crossings as local minima in distance-to-point that dip under
 * `thresholdMeters`, requiring at least `minLapMs` between consecutive crossings so a slow
 * pass near the line (or GPS noise) doesn't register as multiple laps. Heuristic, not a proper
 * timing loop -- tune the threshold if a track's pit/paddock passes close to the line. Crossing
 * times are refined to sub-sample precision (see interpolateCrossingCts) rather than snapped to
 * whichever raw GPS sample happened to be nearest.
 */
export function detectLapCrossings(
  samples: TelemetrySample[],
  startFinish: LatLon,
  thresholdMeters = DEFAULT_THRESHOLD_METERS,
  minLapMs = DEFAULT_MIN_LAP_MS
): number[] {
  if (samples.length < 3) return []

  const distances = samples.map((s) => distanceMeters(s, startFinish))
  const crossings: number[] = []
  let lastCrossingCts = -Infinity

  for (let i = 1; i < samples.length - 1; i++) {
    const isLocalMin = distances[i] <= distances[i - 1] && distances[i] <= distances[i + 1]
    if (isLocalMin && distances[i] <= thresholdMeters) {
      const cts = interpolateCrossingCts(samples[i - 1].cts, samples[i].cts, samples[i + 1].cts, distances[i - 1], distances[i], distances[i + 1])
      if (cts - lastCrossingCts >= minLapMs) {
        crossings.push(cts)
        lastCrossingCts = cts
      }
    }
  }
  return crossings
}

/** Lap durations between consecutive crossings; the out-lap before the first crossing is excluded. */
export function lapTimesFromCrossings(crossings: number[]): number[] {
  const laps: number[] = []
  for (let i = 1; i < crossings.length; i++) {
    laps.push(crossings[i] - crossings[i - 1])
  }
  return laps
}

/**
 * Resolves which lap is in progress at `cts` and its running/last/best/history, given precomputed
 * crossings. Numbering: the first crossing (whether reached naturally or created by the user
 * scrubbing to the line and marking it) starts Lap 1, not Lap 2 -- there is no separate untimed
 * "out lap" before it.
 */
export function getLapStateAt(crossings: number[], cts: number): LapState {
  let idx = -1
  for (let i = 0; i < crossings.length; i++) {
    if (crossings[i] <= cts) idx = i
    else break
  }

  const lapStartCts = idx >= 0 ? crossings[idx] : 0
  // Only laps completed by `cts` count -- using the full crossings array here would leak future
  // laps into "best"/"last"/history while scrubbing earlier in the video than they occurred.
  const lapTimes = lapTimesFromCrossings(crossings.slice(0, idx + 1))

  const bestLapMs = lapTimes.length > 0 ? Math.min(...lapTimes) : null
  const lastLapMs = lapTimes.length > 0 ? lapTimes[lapTimes.length - 1] : null
  const isNewBest = lastLapMs !== null && bestLapMs !== null && lastLapMs === bestLapMs

  const history: LapHistoryEntry[] = []
  for (let i = lapTimes.length - 1; i >= 0 && history.length < MAX_HISTORY_ENTRIES; i--) {
    history.push({ lapNumber: i + 1, timeMs: lapTimes[i], isBest: bestLapMs !== null && lapTimes[i] === bestLapMs })
  }

  return {
    lapNumber: Math.max(1, idx + 1),
    currentLapElapsedMs: Math.max(0, cts - lapStartCts),
    lastLapMs,
    bestLapMs,
    isNewBest,
    history
  }
}

export interface LapRange {
  lapNumber: number
  startCts: number
  endCts: number
  timeMs: number
}

/** The single fastest COMPLETED lap across the whole session (not "as of" any particular query time
 *  -- unlike getLapStateAt's bestLapMs, this is meant for one-shot actions like "jump to it" or
 *  "export it", which should always target the session's real best lap regardless of where the
 *  video happens to be scrubbed to right now). Null if fewer than one full lap exists. */
export function fastestLapRange(crossings: number[]): LapRange | null {
  const lapTimes = lapTimesFromCrossings(crossings)
  if (lapTimes.length === 0) return null

  let bestIndex = 0
  for (let i = 1; i < lapTimes.length; i++) {
    if (lapTimes[i] < lapTimes[bestIndex]) bestIndex = i
  }

  return {
    lapNumber: bestIndex + 1,
    startCts: crossings[bestIndex],
    endCts: crossings[bestIndex + 1],
    timeMs: lapTimes[bestIndex]
  }
}
