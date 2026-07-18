import { describe, expect, it } from 'vitest'
import type { TelemetrySample } from '../types'
import { computeCurrentLapSpeedTrace, computeLapSpeedTraces } from './speedTrace'

function makeSample(cts: number, lon: number, speed2D: number): TelemetrySample {
  return { cts, lat: 51.5, lon, altitude: 0, speed2D, speed3D: speed2D }
}

/** Straight-line lap with linearly-varying speed (constant per-step distance so cumulative distance
 *  is easy to reason about) -- continues `lon` from `startLon` so consecutive laps form one
 *  continuous trajectory (the lon-reset mistake this project has hit before). */
function makeLap(startCts: number, endCts: number, stepMs: number, lonPerStep: number, startLon: number, speedStart: number, speedEnd: number): TelemetrySample[] {
  const samples: TelemetrySample[] = []
  const steps = (endCts - startCts) / stepMs
  let lon = startLon
  for (let i = 0; i <= steps; i++) {
    const t = i / steps
    samples.push(makeSample(startCts + i * stepMs, lon, speedStart + (speedEnd - speedStart) * t))
    lon += lonPerStep
  }
  return samples
}

// lap1: 0-10000ms, 10 steps, speed ramps 10 -> 20 m/s. lap2: 10000-20000ms, 10 steps, speed ramps 20 -> 10 m/s.
const lap1 = makeLap(0, 10000, 1000, 0.0001, 0, 10, 20)
const lap2 = makeLap(10000, 20000, 1000, 0.0001, 0.001, 20, 10)
const samples = [...lap1, ...lap2.slice(1)]
const crossings = [0, 10000, 20000]

describe('computeLapSpeedTraces', () => {
  const traces = computeLapSpeedTraces(samples, crossings)

  it('builds one trace per completed lap', () => {
    expect(traces.length).toBe(2)
    expect(traces.map((t) => t.lapNumber)).toEqual([1, 2])
  })

  it('starts each trace at distance 0 and ends at its own totalDistanceM', () => {
    for (const trace of traces) {
      expect(trace.points[0].distanceM).toBe(0)
      expect(trace.points[trace.points.length - 1].distanceM).toBeCloseTo(trace.totalDistanceM, 6)
    }
  })

  it('records strictly non-decreasing cumulative distance', () => {
    for (const trace of traces) {
      for (let i = 1; i < trace.points.length; i++) {
        expect(trace.points[i].distanceM).toBeGreaterThanOrEqual(trace.points[i - 1].distanceM)
      }
    }
  })

  it('records the raw sample speed at each point, matching the ramp direction per lap', () => {
    const [trace1, trace2] = traces
    expect(trace1.points[0].speedMps).toBeCloseTo(10, 6)
    expect(trace1.points[trace1.points.length - 1].speedMps).toBeCloseTo(20, 6)
    expect(trace2.points[0].speedMps).toBeCloseTo(20, 6)
    expect(trace2.points[trace2.points.length - 1].speedMps).toBeCloseTo(10, 6)
  })

  it('handles zero crossings without throwing', () => {
    expect(computeLapSpeedTraces(samples, [])).toEqual([])
    expect(computeLapSpeedTraces([], [0, 10000])).toEqual([])
  })
})

describe('computeCurrentLapSpeedTrace', () => {
  it('returns a partial trace for the lap in progress, bounded to cts', () => {
    const trace = computeCurrentLapSpeedTrace(samples, crossings, 15000) // mid lap2
    expect(trace).not.toBeNull()
    expect(trace!.lapNumber).toBe(2)
    expect(trace!.points[0].distanceM).toBe(0)
    // Should NOT include the full lap -- only up to cts=15000 (roughly half of lap2).
    expect(trace!.totalDistanceM).toBeLessThan(computeLapSpeedTraces(samples, crossings)[1].totalDistanceM)
    expect(trace!.points[trace!.points.length - 1].speedMps).toBeCloseTo(15, 0) // ~halfway through the 20->10 ramp
  })

  it('treats the out-lap (before the first crossing) as lap 1', () => {
    const trace = computeCurrentLapSpeedTrace(samples, crossings, 5000)
    expect(trace!.lapNumber).toBe(1)
  })

  it('grows monotonically as cts advances through the same lap', () => {
    const early = computeCurrentLapSpeedTrace(samples, crossings, 12000)
    const later = computeCurrentLapSpeedTrace(samples, crossings, 18000)
    expect(later!.totalDistanceM).toBeGreaterThan(early!.totalDistanceM)
  })

  it('handles empty samples without throwing', () => {
    expect(computeCurrentLapSpeedTrace([], [], 1000)).toBeNull()
  })
})
