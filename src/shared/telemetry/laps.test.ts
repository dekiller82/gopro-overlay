import { describe, expect, it } from 'vitest'
import type { TelemetrySample } from '../types'
import { detectLapCrossings, getLapStateAt, lapTimesFromCrossings, nearestLatLon } from './laps'
// Numbering convention under test: the first crossing (e.g. the moment the user scrubs to the
// line and marks it) starts Lap 1 immediately -- there's no separate untimed "Lap 0/out-lap"
// segment before it, so setting the start/finish never appears to "jump to Lap 2" right away.

function makeSample(cts: number, overrides: Partial<TelemetrySample> = {}): TelemetrySample {
  return { cts, lat: 0, lon: 0, altitude: 0, speed2D: 0, speed3D: 0, ...overrides }
}

/**
 * Builds samples that loop past a fixed start/finish point `lapCount` times, each lap
 * `lapDurationMs` long, sampled every `stepMs`. Crossings (distance minima) are phase-shifted to
 * land at lapDurationMs/2, 3*lapDurationMs/2, ... -- safely inside the array, since crossing
 * detection intentionally only considers interior samples (a bracketing sample on each side is
 * needed to confirm a local minimum, so genuine first/last-sample crossings are structurally
 * unrepresentable -- fine in practice, since a real recording essentially never starts or ends on
 * the exact video frame of a line crossing).
 */
function makeLoopedSamples(lapCount: number, lapDurationMs: number, stepMs: number): TelemetrySample[] {
  const startFinish = { lat: 51.5, lon: -0.1 }
  const samples: TelemetrySample[] = []
  const totalMs = lapCount * lapDurationMs
  for (let cts = 0; cts <= totalMs; cts += stepMs) {
    const angle = (2 * Math.PI * (cts - lapDurationMs / 2)) / lapDurationMs
    const distancePhase = (1 - Math.cos(angle)) / 2 // 0 at crossings, 1 at the far side of the loop
    const offsetDeg = distancePhase * 0.01
    samples.push(makeSample(cts, { lat: startFinish.lat + offsetDeg, lon: startFinish.lon }))
  }
  return samples
}

describe('detectLapCrossings', () => {
  const startFinish = { lat: 51.5, lon: -0.1 }

  it('detects one crossing per lap for a clean looped track', () => {
    const samples = makeLoopedSamples(4, 30000, 200)
    const crossings = detectLapCrossings(samples, startFinish, 15, 5000)
    // Crossings phase-shifted to 15000, 45000, 75000, 105000 -- see makeLoopedSamples.
    expect(crossings.length).toBe(4)
    for (let i = 1; i < crossings.length; i++) {
      expect(crossings[i] - crossings[i - 1]).toBeCloseTo(30000, -3)
    }
  })

  it('requires minLapMs between crossings to avoid double-counting a slow wobble near the line', () => {
    const samples = [
      makeSample(0, { lat: 51.51, lon: -0.1 }), // far (boundary sample, excluded from detection anyway)
      makeSample(1000, { lat: 51.5, lon: -0.1 }), // at s/f: local min #1
      makeSample(2000, { lat: 51.5005, lon: -0.1 }), // pulls away momentarily
      makeSample(3000, { lat: 51.5, lon: -0.1 }), // back at s/f: local min #2, too soon after #1 -> suppressed
      makeSample(5000, { lat: 51.51, lon: -0.1 }), // far
      makeSample(30000, { lat: 51.5, lon: -0.1 }), // at s/f: local min #3, well after #1 -> registers
      makeSample(35000, { lat: 51.51, lon: -0.1 }) // far (padding so 30000 isn't a boundary sample)
    ]
    const crossings = detectLapCrossings(samples, startFinish, 20, 10000)
    expect(crossings).toEqual([1000, 30000])
  })

  it('returns no crossings if the track never comes near the start/finish point', () => {
    const samples = Array.from({ length: 20 }, (_, i) => makeSample(i * 1000, { lat: 51.6, lon: -0.2 }))
    expect(detectLapCrossings(samples, startFinish)).toEqual([])
  })

  it('handles too few samples without throwing', () => {
    expect(detectLapCrossings([], startFinish)).toEqual([])
    expect(detectLapCrossings([makeSample(0)], startFinish)).toEqual([])
  })
})

describe('lapTimesFromCrossings', () => {
  it('computes durations between consecutive crossings, excluding the out-lap', () => {
    expect(lapTimesFromCrossings([0, 30000, 65000, 95000])).toEqual([30000, 35000, 30000])
  })

  it('returns an empty array for 0 or 1 crossings', () => {
    expect(lapTimesFromCrossings([])).toEqual([])
    expect(lapTimesFromCrossings([1000])).toEqual([])
  })
})

describe('getLapStateAt', () => {
  // Realistic: video starts before the driver ever reaches the line (first crossing at 5s, not 0).
  // Laps (between consecutive crossings): 30000, 35000, 30000.
  const crossings = [5000, 35000, 70000, 100000]

  it('reports lap 1 in progress, no completed laps yet, before the first crossing', () => {
    const state = getLapStateAt(crossings, 0)
    expect(state.lapNumber).toBe(1)
    expect(state.currentLapElapsedMs).toBe(0)
    expect(state.lastLapMs).toBeNull()
    expect(state.bestLapMs).toBeNull()
    expect(state.isNewBest).toBe(false)
    expect(state.history).toEqual([])
  })

  it('starts Lap 1 (not Lap 2) right at the first crossing -- the bug report this guards against', () => {
    const state = getLapStateAt(crossings, 5000) // the instant of the first crossing itself
    expect(state.lapNumber).toBe(1)
    expect(state.currentLapElapsedMs).toBe(0)
  })

  it('reports the correct in-progress lap and elapsed time mid-lap, with lap 1 now in history', () => {
    const state = getLapStateAt(crossings, 45000) // 10s into lap 2 (started at crossings[1]=35000)
    expect(state.lapNumber).toBe(2)
    expect(state.currentLapElapsedMs).toBe(10000)
    expect(state.lastLapMs).toBe(30000) // lap 1: crossings[0] -> crossings[1] = 5000 -> 35000
    expect(state.bestLapMs).toBe(30000)
    expect(state.isNewBest).toBe(true) // only one lap so far -- it's automatically the best
    expect(state.history).toEqual([{ lapNumber: 1, timeMs: 30000, isBest: true }])
  })

  it('reports the most recently completed lap, running best, and lap history', () => {
    const state = getLapStateAt(crossings, 101000) // just after the 4th crossing
    expect(state.lapNumber).toBe(4)
    expect(state.currentLapElapsedMs).toBe(1000)
    expect(state.lastLapMs).toBe(30000) // lap 3: 70000 -> 100000
    expect(state.bestLapMs).toBe(30000) // min(30000, 35000, 30000)
    expect(state.isNewBest).toBe(true) // lap 3 ties the best set on lap 1
    expect(state.history).toEqual([
      { lapNumber: 3, timeMs: 30000, isBest: true },
      { lapNumber: 2, timeMs: 35000, isBest: false },
      { lapNumber: 1, timeMs: 30000, isBest: true }
    ])
  })

  it('marks isNewBest false when the last lap is slower than an earlier best', () => {
    const state = getLapStateAt(crossings, 71000) // just after 70000, lap 2 (35000->70000, 35000ms) just completed
    expect(state.lastLapMs).toBe(35000)
    expect(state.bestLapMs).toBe(30000) // lap 1 (30000) is still faster
    expect(state.isNewBest).toBe(false)
  })

  it('caps history length at 50 most recent laps (comfortably covers the F1 timing tower\'s max row count)', () => {
    const manyCrossings = Array.from({ length: 60 }, (_, i) => i * 30000) // 59 completed laps by the end
    const state = getLapStateAt(manyCrossings, 60 * 30000)
    expect(state.history.length).toBe(50)
    expect(state.history[0].lapNumber).toBe(59) // newest first
    expect(state.history[49].lapNumber).toBe(10)
  })

  it('handles zero crossings (start/finish not reached yet) without throwing', () => {
    const state = getLapStateAt([], 5000)
    expect(state.lapNumber).toBe(1)
    expect(state.currentLapElapsedMs).toBe(5000)
    expect(state.lastLapMs).toBeNull()
    expect(state.bestLapMs).toBeNull()
    expect(state.isNewBest).toBe(false)
    expect(state.history).toEqual([])
  })
})

describe('nearestLatLon', () => {
  it('returns the lat/lon of the nearest sample to the given time', () => {
    const samples = [makeSample(0, { lat: 1, lon: 1 }), makeSample(1000, { lat: 2, lon: 2 }), makeSample(2000, { lat: 3, lon: 3 })]
    expect(nearestLatLon(samples, 900)).toEqual({ lat: 2, lon: 2 })
  })

  it('returns null for an empty sample list', () => {
    expect(nearestLatLon([], 500)).toBeNull()
  })
})
