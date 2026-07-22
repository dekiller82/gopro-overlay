import type { TelemetrySample } from '../types'

export interface AccelSplit {
  targetMps: number
  /** Absolute cts this target speed was first reached, null if the run never reached it. */
  cts: number | null
  timeMs: number | null
}

export interface AccelRun {
  launchCts: number
  /** Where this run "ends" for bookkeeping (vehicle drops back near-stationary, or the recording
   *  ends still moving) -- doesn't affect split correctness, only whether the widget treats it as
   *  still-in-progress vs. holding a finished result. */
  endCts: number
  splits: AccelSplit[]
}

export interface AccelSplitState {
  targetMps: number
  timeMs: number | null
}

export interface AccelRunState {
  isActive: boolean
  /** ms since the current/most-recent run's launch, null if no run has started by `cts` yet. */
  elapsedMs: number | null
  currentSplits: AccelSplitState[]
  bestSplits: AccelSplitState[]
}

export const DEFAULT_STATIONARY_THRESHOLD_MPS = 1.4 // ~5 km/h -- near-stopped, not just "slow corner"
export const DEFAULT_MIN_STATIONARY_MS = 500

/** Largest index >= fromIdx where a stretch of samples at/under thresholdMps has held for at least
 *  minStationaryMs, i.e. the start of a "the vehicle is genuinely stopped" stretch -- a single noisy
 *  low-speed sample doesn't count. Returns -1 if no such stretch exists at or after fromIdx. */
function findStationaryStart(samples: TelemetrySample[], fromIdx: number, thresholdMps: number, minStationaryMs: number): number {
  let stretchStart = -1
  for (let i = fromIdx; i < samples.length; i++) {
    if (samples[i].speed2D <= thresholdMps) {
      if (stretchStart === -1) stretchStart = i
      if (samples[i].cts - samples[stretchStart].cts >= minStationaryMs) return stretchStart
    } else {
      stretchStart = -1
    }
  }
  return -1
}

/**
 * Detects "launches" the same way Dragy does: a genuine stop (held for at least `minStationaryMs`
 * at/under `stationaryThresholdMps`), followed by acceleration -- the instant speed first exceeds
 * the threshold after that stop is cts=0 for the run. For each configured target speed, records the
 * first time it's reached after launch (null if never reached before the vehicle stops again or the
 * recording ends). Requires a fresh genuine stop before the next launch can be detected, so a single
 * launch can't retrigger multiple times from GPS noise around the threshold.
 *
 * Heuristic, not a proper start-line beam like a real Dragy unit -- tune stationaryThresholdMps up
 * if a track's slow corners are slow enough to false-trigger a "stop", or down if GPS noise at a
 * genuine standstill occasionally reads above it.
 */
export function detectAccelRuns(
  samples: TelemetrySample[],
  targetSpeedsMps: number[],
  stationaryThresholdMps = DEFAULT_STATIONARY_THRESHOLD_MPS,
  minStationaryMs = DEFAULT_MIN_STATIONARY_MS
): AccelRun[] {
  if (samples.length < 2 || targetSpeedsMps.length === 0) return []

  const runs: AccelRun[] = []
  let i = 0

  while (i < samples.length) {
    const stationaryStart = findStationaryStart(samples, i, stationaryThresholdMps, minStationaryMs)
    if (stationaryStart === -1) break

    let launchIdx = -1
    for (let j = stationaryStart; j < samples.length; j++) {
      if (samples[j].speed2D > stationaryThresholdMps) {
        launchIdx = j
        break
      }
    }
    if (launchIdx === -1) break // stayed stationary through the rest of the recording

    const launchCts = samples[launchIdx].cts
    const splits: AccelSplit[] = targetSpeedsMps.map((targetMps) => ({ targetMps, cts: null, timeMs: null }))
    let nextStationaryIdx = -1

    for (let j = launchIdx; j < samples.length; j++) {
      for (const split of splits) {
        if (split.cts === null && samples[j].speed2D >= split.targetMps) {
          split.cts = samples[j].cts
          split.timeMs = split.cts - launchCts
        }
      }
      if (samples[j].speed2D <= stationaryThresholdMps) {
        nextStationaryIdx = j
        break
      }
    }

    const endCts = nextStationaryIdx >= 0 ? samples[nextStationaryIdx].cts : samples[samples.length - 1].cts
    runs.push({ launchCts, endCts, splits })

    i = nextStationaryIdx >= 0 ? nextStationaryIdx : samples.length
  }

  return runs
}

/**
 * Resolves the run in progress (or most recently launched) at `cts`, plus a best-of-session time per
 * target speed -- both scoped to only what's actually happened AT OR BEFORE `cts`, same "don't leak
 * future data while scrubbing earlier in the video" discipline as getLapStateAt. A split only counts
 * toward "current"/"best" once its own reached-cts is <= the query cts, even if the run that contains
 * it launched earlier.
 */
export function getAccelRunStateAt(runs: AccelRun[], targetSpeedsMps: number[], cts: number): AccelRunState {
  let idx = -1
  for (let i = 0; i < runs.length; i++) {
    if (runs[i].launchCts <= cts) idx = i
    else break
  }

  const bestSplits: AccelSplitState[] = targetSpeedsMps.map((targetMps) => ({ targetMps, timeMs: null }))
  for (let i = 0; i <= idx; i++) {
    for (const split of runs[i].splits) {
      if (split.cts === null || split.cts > cts) continue
      const best = bestSplits.find((b) => b.targetMps === split.targetMps)
      if (best && (best.timeMs === null || split.timeMs! < best.timeMs)) best.timeMs = split.timeMs
    }
  }

  if (idx === -1) {
    return {
      isActive: false,
      elapsedMs: null,
      currentSplits: targetSpeedsMps.map((targetMps) => ({ targetMps, timeMs: null })),
      bestSplits
    }
  }

  const run = runs[idx]
  const currentSplits: AccelSplitState[] = run.splits.map((split) => ({
    targetMps: split.targetMps,
    timeMs: split.cts !== null && split.cts <= cts ? split.timeMs : null
  }))

  return {
    isActive: cts <= run.endCts,
    elapsedMs: cts - run.launchCts,
    currentSplits,
    bestSplits
  }
}
