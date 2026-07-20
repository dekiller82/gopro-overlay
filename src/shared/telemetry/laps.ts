import type { TelemetrySample, LatLon, CrossingAdjustments } from '../types'
import { findBracketIndex } from './interpolate'

// Re-exported for existing call sites -- canonical definitions live in shared/types.ts since both
// are persisted in ProjectPayload/the project file schema, not just used by lap detection.
export type { LatLon, CrossingAdjustments }

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

/** Applies manual per-crossing nudges on top of the raw detected crossings, clamping each adjusted
 *  value so it can never cross past its own neighbor's ORIGINAL (pre-adjustment) position -- a
 *  nudge is meant to correct a few frames of detection noise, not reorder laps. Pure post-process
 *  step, kept separate from the detection loop itself so the loop's own minLapMs gap logic always
 *  runs against the real, unadjusted samples. */
function applyCrossingAdjustments(rawCrossings: number[], adjustments: CrossingAdjustments): number[] {
  if (Object.keys(adjustments).length === 0) return rawCrossings

  const adjusted = rawCrossings.map((cts, i) => cts + (adjustments[String(i)] ?? 0))
  for (let i = 0; i < adjusted.length; i++) {
    const lowerBound = i > 0 ? adjusted[i - 1] + 1 : -Infinity
    const upperBound = i < rawCrossings.length - 1 ? rawCrossings[i + 1] - 1 : Infinity
    adjusted[i] = Math.min(Math.max(adjusted[i], lowerBound), upperBound)
  }
  return adjusted
}

/**
 * Detects start/finish crossings as local minima in distance-to-point that dip under
 * `thresholdMeters`, requiring at least `minLapMs` between consecutive crossings so a slow
 * pass near the line (or GPS noise) doesn't register as multiple laps. Heuristic, not a proper
 * timing loop -- tune the threshold if a track's pit/paddock passes close to the line.
 *
 * `adjustments` applies manual per-crossing corrections (see CrossingAdjustments) after detection.
 */
export function detectLapCrossings(
  samples: TelemetrySample[],
  startFinish: LatLon,
  thresholdMeters = DEFAULT_THRESHOLD_METERS,
  minLapMs = DEFAULT_MIN_LAP_MS,
  adjustments: CrossingAdjustments = {}
): number[] {
  if (samples.length < 3) return []

  const distances = samples.map((s) => distanceMeters(s, startFinish))
  const crossings: number[] = []
  let lastCrossingCts = -Infinity

  for (let i = 1; i < samples.length - 1; i++) {
    const isLocalMin = distances[i] <= distances[i - 1] && distances[i] <= distances[i + 1]
    if (isLocalMin && distances[i] <= thresholdMeters) {
      const cts = samples[i].cts
      if (cts - lastCrossingCts >= minLapMs) {
        crossings.push(cts)
        lastCrossingCts = cts
      }
    }
  }
  return applyCrossingAdjustments(crossings, adjustments)
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
