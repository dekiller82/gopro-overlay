import { describe, expect, it } from 'vitest'
import type { TelemetrySample } from '../types'
import { computeLapDistanceCurves, getDeltaStateAt } from './deltaTime'

function makeSample(cts: number, lat: number, lon: number): TelemetrySample {
  return { cts, lat, lon, altitude: 0, speed2D: 0, speed3D: 0 }
}

/** Straight-line, constant-speed samples -- same helper shape as sectors.test.ts. `startLon` must
 *  continue from wherever the previous lap's samples left off, or splicing independently-zeroed lap
 *  segments together creates a fake distance "teleport" at the join (a mistake this project has
 *  made twice already -- see sectors.test.ts/project memory). */
function makeStraightLap(startCts: number, endCts: number, stepMs: number, lonPerStep: number, startLon = 0): TelemetrySample[] {
  const samples: TelemetrySample[] = []
  let lon = startLon
  for (let cts = startCts; cts <= endCts; cts += stepMs) {
    samples.push(makeSample(cts, 51.5, lon))
    lon += lonPerStep
  }
  return samples
}

// lap1/lap2: identical 30s pace (30 steps x 1000ms, same lonPerStep) -> same total distance, tie as baseline.
// lap3: same total distance covered in 24s (30 steps x 800ms) -> faster, becomes the new best once it closes.
// lap4: same total distance covered in 36s (30 steps x 1200ms) -> slower than the lap3 baseline.
const lap1 = makeStraightLap(0, 30000, 1000, 0.0001)
const lap2 = makeStraightLap(30000, 60000, 1000, 0.0001, 0.003)
const lap3 = makeStraightLap(60000, 84000, 800, 0.0001, 0.006)
const lap4 = makeStraightLap(84000, 120000, 1200, 0.0001, 0.009)
const samples = [...lap1, ...lap2.slice(1), ...lap3.slice(1), ...lap4.slice(1)]
const crossings = [0, 30000, 60000, 84000, 120000]
const curves = computeLapDistanceCurves(samples, crossings)

describe('computeLapDistanceCurves', () => {
  it('builds one curve per completed lap with the right total time/distance', () => {
    expect(curves.length).toBe(4)
    expect(curves.map((c) => c.totalTimeMs)).toEqual([30000, 30000, 24000, 36000])
    // All four laps cover the same physical distance (30 steps of the same lonPerStep).
    const distances = curves.map((c) => c.totalDistanceM)
    for (const d of distances) expect(d).toBeCloseTo(distances[0], 1)
  })

  it('timeAtDistance passes through the halfway point at the halfway time for a constant-pace lap', () => {
    const halfDistance = curves[0].totalDistanceM / 2
    expect(curves[0].timeAtDistance(halfDistance)).toBeCloseTo(15000, -2)
  })
})

describe('getDeltaStateAt', () => {
  it('reports null delta/baseline before any lap has completed', () => {
    const state = getDeltaStateAt(curves, crossings, samples, 15000) // mid lap1
    expect(state.deltaMs).toBeNull()
    expect(state.baselineLapMs).toBeNull()
    expect(state.predictedLapMs).toBeNull()
  })

  it('reports ~0 delta when the current lap exactly matches the baseline pace', () => {
    const state = getDeltaStateAt(curves, crossings, samples, 45000) // mid lap2, matches lap1's pace
    expect(state.baselineLapMs).toBeCloseTo(30000, -2)
    expect(state.deltaMs).toBeCloseTo(0, -2)
  })

  it('reports a negative delta when running faster than the baseline', () => {
    const state = getDeltaStateAt(curves, crossings, samples, 72000) // mid lap3, faster pace
    expect(state.baselineLapMs).toBeCloseTo(30000, -2) // lap3 hasn't closed yet -- baseline still lap1/2
    expect(state.deltaMs).toBeLessThan(-1000)
  })

  it('updates the baseline to a new best once a faster lap completes', () => {
    const before = getDeltaStateAt(curves, crossings, samples, 50000) // mid lap2, before lap3 exists
    expect(before.baselineLapMs).toBeCloseTo(30000, -2)

    const after = getDeltaStateAt(curves, crossings, samples, 90000) // mid lap4, after lap3 closed
    expect(after.baselineLapMs).toBeCloseTo(24000, -2) // lap3 is now the fastest completed lap
  })

  it('reports a positive delta when running slower than the baseline', () => {
    const state = getDeltaStateAt(curves, crossings, samples, 102000) // mid lap4, slower pace, baseline is lap3
    expect(state.baselineLapMs).toBeCloseTo(24000, -2)
    expect(state.deltaMs).toBeGreaterThan(1000)
  })

  it('predictedLapMs always equals baselineLapMs + deltaMs', () => {
    const state = getDeltaStateAt(curves, crossings, samples, 102000)
    expect(state.predictedLapMs).toBeCloseTo((state.baselineLapMs ?? 0) + (state.deltaMs ?? 0), 6)
  })

  it('handles zero crossings/curves without throwing', () => {
    const state = getDeltaStateAt([], [], samples, 5000)
    expect(state.deltaMs).toBeNull()
  })
})

describe('getDeltaStateAt ghostCts (GPS Track "ghost" marker)', () => {
  it('is null before any baseline lap exists', () => {
    const state = getDeltaStateAt(curves, crossings, samples, 15000) // mid lap1, no baseline yet
    expect(state.ghostCts).toBeNull()
  })

  // Resolved at the baseline's SAME ELAPSED TIME into its own lap, not the same distance -- same
  // distance would place the ghost at nearly the same physical track spot as the live dot always
  // (see DeltaState.ghostCts's own doc comment for why that would show no gap at all).
  it('resolves to lapStartCts + currentElapsedMs on the baseline lap, not a distance-matched point', () => {
    const state = getDeltaStateAt(curves, crossings, samples, 45000) // mid lap2, 15000ms into it; baseline is lap1 [0,30000]
    expect(state.ghostCts).toBeCloseTo(0 + 15000, -1) // baseline's own lapStartCts (0) + 15000ms
  })

  it('tracks a later baseline (lap3) once it becomes the new best', () => {
    const state = getDeltaStateAt(curves, crossings, samples, 102000) // mid lap4, 18000ms into it; baseline is lap3 [60000,84000]
    expect(state.ghostCts).toBeCloseTo(60000 + 18000, -1)
  })

  it('clamps to the baseline lap\'s own end instead of overshooting past it', () => {
    // 26000ms into lap4 -- more than baseline lap3's own 24000ms total, so lapStartCts+elapsed
    // (60000+26000=86000) would land 2000ms PAST lap3's own lapEndCts (84000). Must clamp there.
    const state = getDeltaStateAt(curves, crossings, samples, 110000)
    expect(state.ghostCts).toBe(84000)
  })
})
