import { describe, expect, it } from 'vitest'
import type { TelemetrySample } from '../types'
import { detectAccelRuns, getAccelRunStateAt } from './accelRuns'

function makeSample(cts: number, speed2D: number): TelemetrySample {
  return { cts, lat: 0, lon: 0, altitude: 0, speed2D, speed3D: speed2D }
}

// Two separate launches: a stop, an acceleration reaching both target speeds, another stop, then a
// SECOND launch that reaches both targets faster -- exercises multi-run detection and the
// best-of-session bookkeeping (should pick run 2's faster times, not run 1's).
const TWO_RUN_SAMPLES: TelemetrySample[] = [
  makeSample(0, 0),
  makeSample(200, 0),
  makeSample(400, 0),
  makeSample(600, 0), // held <=threshold for 600ms by here -- a genuine stop
  makeSample(800, 5), // launch 1 (speed now > threshold)
  makeSample(1000, 10), // reaches target 10 -- split @ 200ms
  makeSample(1200, 15),
  makeSample(1400, 20), // reaches target 20 -- split @ 600ms
  makeSample(1600, 20),
  makeSample(1800, 0), // stops again
  makeSample(2000, 0),
  makeSample(2300, 0), // held <=threshold for 500ms by here -- a second genuine stop
  makeSample(2500, 8), // launch 2
  makeSample(2600, 10), // reaches target 10 -- split @ 100ms (faster than run 1)
  makeSample(2800, 20), // reaches target 20 -- split @ 300ms (faster than run 1)
  makeSample(3000, 20),
  makeSample(3200, 0) // stops, but not held long enough for a 3rd run to be detectable
]
const TARGETS_MPS = [10, 20]

describe('detectAccelRuns', () => {
  it('detects a launch as a genuine stop followed by acceleration, not just any low-speed sample', () => {
    const runs = detectAccelRuns(TWO_RUN_SAMPLES, TARGETS_MPS)
    expect(runs).toHaveLength(2)
    expect(runs[0].launchCts).toBe(800)
    expect(runs[1].launchCts).toBe(2500)
  })

  it('times each target speed split from its own run\'s launch instant', () => {
    const runs = detectAccelRuns(TWO_RUN_SAMPLES, TARGETS_MPS)
    expect(runs[0].splits[0]).toEqual({ targetMps: 10, cts: 1000, timeMs: 200 })
    expect(runs[0].splits[1]).toEqual({ targetMps: 20, cts: 1400, timeMs: 600 })
    expect(runs[1].splits[0]).toEqual({ targetMps: 10, cts: 2600, timeMs: 100 })
    expect(runs[1].splits[1]).toEqual({ targetMps: 20, cts: 2800, timeMs: 300 })
  })

  it('marks a split unreached (null) if the run never got there', () => {
    const runs = detectAccelRuns(TWO_RUN_SAMPLES, [10, 20, 30])
    expect(runs[0].splits[2]).toEqual({ targetMps: 30, cts: null, timeMs: null })
  })

  it('returns no runs for an empty sample array or no target speeds', () => {
    expect(detectAccelRuns([], TARGETS_MPS)).toEqual([])
    expect(detectAccelRuns(TWO_RUN_SAMPLES, [])).toEqual([])
  })

  it('finds no launch at all if the vehicle never actually stops', () => {
    const alwaysMoving = TWO_RUN_SAMPLES.map((s) => ({ ...s, speed2D: Math.max(5, s.speed2D) }))
    expect(detectAccelRuns(alwaysMoving, TARGETS_MPS)).toEqual([])
  })
})

describe('getAccelRunStateAt', () => {
  const runs = detectAccelRuns(TWO_RUN_SAMPLES, TARGETS_MPS)

  it('reports no current run and no best times before the first launch', () => {
    const state = getAccelRunStateAt(runs, TARGETS_MPS, 100)
    expect(state.isActive).toBe(false)
    expect(state.elapsedMs).toBeNull()
    expect(state.currentSplits).toEqual([{ targetMps: 10, timeMs: null }, { targetMps: 20, timeMs: null }])
    expect(state.bestSplits).toEqual([{ targetMps: 10, timeMs: null }, { targetMps: 20, timeMs: null }])
  })

  it('mid-run 1: only reveals splits already reached by the query cts, not ones still ahead', () => {
    const state = getAccelRunStateAt(runs, TARGETS_MPS, 1000)
    expect(state.isActive).toBe(true)
    expect(state.elapsedMs).toBe(200)
    expect(state.currentSplits).toEqual([{ targetMps: 10, timeMs: 200 }, { targetMps: 20, timeMs: null }])
    // Run 2 hasn't happened yet at cts=1000 -- best must not leak its (faster) future times in.
    expect(state.bestSplits).toEqual([{ targetMps: 10, timeMs: 200 }, { targetMps: 20, timeMs: null }])
  })

  it('after both runs: best-of-session picks run 2\'s faster times over run 1\'s slower ones', () => {
    const state = getAccelRunStateAt(runs, TARGETS_MPS, 3200)
    expect(state.currentSplits).toEqual([{ targetMps: 10, timeMs: 100 }, { targetMps: 20, timeMs: 300 }])
    expect(state.bestSplits).toEqual([{ targetMps: 10, timeMs: 100 }, { targetMps: 20, timeMs: 300 }])
  })
})
