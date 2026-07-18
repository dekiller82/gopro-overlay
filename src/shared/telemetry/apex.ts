import type { TelemetrySample } from '../types'
import { gaussianSmoothedValueAt } from './interpolate'

export interface ApexEvent {
  /** The moment of minimum speed -- where deceleration ends and acceleration begins. */
  cts: number
  /** The (smoothed) minimum speed reached, m/s. */
  speedMps: number
}

const DEFAULT_MIN_DROP_MPS = 8
const DEFAULT_MIN_GAP_MS = 1500
/** Damps raw GPS speed jitter that would otherwise create false local minima -- same smoothing
 *  approach (gaussianSmoothedValueAt) already used for the live speedometer readout elsewhere. */
const SMOOTHING_MS = 300

/** Walks outward from index `i` to the nearest local peak on one side, stepping in `direction`
 *  (-1 = backward/before, +1 = forward/after) while the series keeps climbing that way. */
function nearestPeak(speeds: number[], i: number, direction: -1 | 1): number {
  let j = i
  const last = speeds.length - 1
  while ((direction === -1 ? j > 0 : j < last) && speeds[j + direction] >= speeds[j]) {
    j += direction
  }
  return speeds[j]
}

/**
 * Detects "apex" moments: the bottom of a speed dip where heavy deceleration is immediately
 * followed by acceleration (braking into a corner, then getting back on the throttle). A local
 * minimum only counts if the nearest peak on BOTH sides drops by at least `minDropMps` -- rejects
 * minor lifts/noise, not just any wiggle in the speed trace. `minGapMs` between accepted events
 * mirrors detectLapCrossings' own noise-rejection pattern in laps.ts. Independent of any start/finish
 * line or lap detection -- a pure function of the speed curve.
 */
export function detectApexEvents(samples: TelemetrySample[], minDropMps = DEFAULT_MIN_DROP_MPS, minGapMs = DEFAULT_MIN_GAP_MS): ApexEvent[] {
  if (samples.length < 3) return []

  const speeds = samples.map((s) => gaussianSmoothedValueAt(samples, s.cts, SMOOTHING_MS, (s2) => s2.speed2D))

  const events: ApexEvent[] = []
  let lastEventCts = -Infinity

  for (let i = 1; i < speeds.length - 1; i++) {
    const isLocalMin = speeds[i] <= speeds[i - 1] && speeds[i] <= speeds[i + 1]
    if (!isLocalMin) continue

    const dropBefore = nearestPeak(speeds, i, -1) - speeds[i]
    const dropAfter = nearestPeak(speeds, i, 1) - speeds[i]
    if (dropBefore < minDropMps || dropAfter < minDropMps) continue

    const cts = samples[i].cts
    if (cts - lastEventCts < minGapMs) continue

    events.push({ cts, speedMps: speeds[i] })
    lastEventCts = cts
  }

  return events
}
