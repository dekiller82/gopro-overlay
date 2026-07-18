import { describe, expect, it } from 'vitest'
import type { TelemetrySample } from '../types'
import {
  createMonotoneCubicInterpolant,
  findBracketIndex,
  gaussianSmoothedValueAt,
  positionAt,
  projectTrack,
  smoothTrackPoints
} from './interpolate'

function makeSample(cts: number, overrides: Partial<TelemetrySample> = {}): TelemetrySample {
  return { cts, lat: 0, lon: 0, altitude: 0, speed2D: 0, speed3D: 0, ...overrides }
}

describe('findBracketIndex', () => {
  const samples = [makeSample(0), makeSample(100), makeSample(200), makeSample(300)]

  it('clamps to first index below range', () => {
    expect(findBracketIndex(samples, -50)).toBe(0)
  })

  it('clamps to last index above range', () => {
    expect(findBracketIndex(samples, 999)).toBe(3)
  })

  it('finds the exact bracketing sample', () => {
    expect(findBracketIndex(samples, 150)).toBe(1)
    expect(findBracketIndex(samples, 250)).toBe(2)
  })

  it('returns exact index when cts matches a sample', () => {
    expect(findBracketIndex(samples, 200)).toBe(2)
  })
})

describe('projectTrack + positionAt', () => {
  it('passes exactly through sample positions', () => {
    const samples = [
      makeSample(0, { lat: 51.5, lon: -0.1 }),
      makeSample(100, { lat: 51.501, lon: -0.101 }),
      makeSample(200, { lat: 51.502, lon: -0.102 })
    ]
    const points = projectTrack(samples)

    for (let i = 0; i < samples.length; i++) {
      const p = positionAt(samples, points, samples[i].cts)
      expect(p.x).toBeCloseTo(points[i].x, 6)
      expect(p.y).toBeCloseTo(points[i].y, 6)
    }
  })

  it('interpolates between two points without wild extrapolation', () => {
    const samples = [makeSample(0, { lat: 0, lon: 0 }), makeSample(100, { lat: 0.001, lon: 0.001 })]
    const points = projectTrack(samples)
    const mid = positionAt(samples, points, 50)

    const minX = Math.min(points[0].x, points[1].x)
    const maxX = Math.max(points[0].x, points[1].x)
    expect(mid.x).toBeGreaterThanOrEqual(minX - 1e-6)
    expect(mid.x).toBeLessThanOrEqual(maxX + 1e-6)
  })

  it('handles a single sample without throwing', () => {
    const samples = [makeSample(0, { lat: 1, lon: 2 })]
    const points = projectTrack(samples)
    expect(positionAt(samples, points, 500)).toEqual(points[0])
  })

  it('handles zero samples without throwing', () => {
    expect(projectTrack([])).toEqual([])
    expect(positionAt([], [], 0)).toEqual({ x: 0, y: 0 })
  })
})

describe('createMonotoneCubicInterpolant', () => {
  it('passes exactly through given points', () => {
    const xs = [0, 100, 200, 300, 400]
    const ys = [0, 5, 4, 9, 20]
    const f = createMonotoneCubicInterpolant(xs, ys)
    for (let i = 0; i < xs.length; i++) {
      expect(f(xs[i])).toBeCloseTo(ys[i], 9)
    }
  })

  it('does not overshoot past local min/max for a monotonic dataset', () => {
    const xs = [0, 100, 200, 300, 400, 500]
    const ys = [0, 2, 2.5, 10, 10.2, 20]
    const f = createMonotoneCubicInterpolant(xs, ys)

    for (let x = 0; x <= 500; x += 5) {
      const y = f(x)
      // Global monotonic dataset -> interpolant should stay within global [min, max]
      expect(y).toBeGreaterThanOrEqual(Math.min(...ys) - 1e-6)
      expect(y).toBeLessThanOrEqual(Math.max(...ys) + 1e-6)
    }
  })

  it('clamps outside the domain to the endpoint values', () => {
    const f = createMonotoneCubicInterpolant([0, 100], [10, 20])
    expect(f(-50)).toBe(10)
    expect(f(500)).toBe(20)
  })

  it('handles a single point', () => {
    const f = createMonotoneCubicInterpolant([42], [7])
    expect(f(0)).toBe(7)
    expect(f(1000)).toBe(7)
  })

  it('handles zero points', () => {
    const f = createMonotoneCubicInterpolant([], [])
    expect(f(0)).toBe(0)
  })
})

describe('gaussianSmoothedValueAt', () => {
  it('returns the constant value regardless of noise-free constant samples', () => {
    const samples = Array.from({ length: 20 }, (_, i) => makeSample(i * 100, { speed2D: 15 }))
    for (let t = 0; t <= 1900; t += 137) {
      expect(gaussianSmoothedValueAt(samples, t, 300, (s) => s.speed2D)).toBeCloseTo(15, 6)
    }
  })

  it('damps noise toward the local mean', () => {
    const noisy = [10, 20, 10, 20, 10, 20, 10, 20, 10, 20]
    const samples = noisy.map((v, i) => makeSample(i * 100, { speed2D: v }))
    const smoothed = gaussianSmoothedValueAt(samples, 450, 300, (s) => s.speed2D)
    // Raw alternates between 10 and 20; a wide smoothing window should land close to the 15 mean
    expect(smoothed).toBeGreaterThan(12)
    expect(smoothed).toBeLessThan(18)
  })

  it('stays continuous as time advances (no discontinuous jumps)', () => {
    const noisy = [5, 25, 8, 22, 6, 24, 9, 21]
    const samples = noisy.map((v, i) => makeSample(i * 100, { speed2D: v }))

    let prev = gaussianSmoothedValueAt(samples, 0, 250, (s) => s.speed2D)
    let maxDelta = 0
    for (let t = 1; t <= 700; t++) {
      const cur = gaussianSmoothedValueAt(samples, t, 250, (s) => s.speed2D)
      maxDelta = Math.max(maxDelta, Math.abs(cur - prev))
      prev = cur
    }
    // Per-millisecond delta should be tiny for a smooth kernel over these value ranges
    expect(maxDelta).toBeLessThan(0.5)
  })

  it('handles a single sample without throwing', () => {
    const samples = [makeSample(0, { speed2D: 42 })]
    expect(gaussianSmoothedValueAt(samples, 5000, 300, (s) => s.speed2D)).toBe(42)
  })

  it('handles zero samples without throwing', () => {
    expect(gaussianSmoothedValueAt([] as TelemetrySample[], 0, 300, (s) => s.speed2D)).toBe(0)
  })
})

describe('smoothTrackPoints', () => {
  it('damps a single noisy outlier toward its neighbors', () => {
    const points = [
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 2, y: 0 },
      { x: 3, y: 50 }, // outlier
      { x: 4, y: 0 },
      { x: 5, y: 0 },
      { x: 6, y: 0 }
    ]
    const smoothed = smoothTrackPoints(points, 3)
    expect(smoothed[3].y).toBeLessThan(50)
    expect(smoothed[3].y).toBeGreaterThan(0)
  })

  it('leaves a perfectly straight line unchanged', () => {
    const points = Array.from({ length: 10 }, (_, i) => ({ x: i, y: i * 2 }))
    const smoothed = smoothTrackPoints(points, 2)
    for (let i = 2; i < 8; i++) {
      expect(smoothed[i].x).toBeCloseTo(points[i].x, 9)
      expect(smoothed[i].y).toBeCloseTo(points[i].y, 9)
    }
  })

  it('shifts endpoints by at most the window radius (clamped window, not unbounded drift)', () => {
    const points = Array.from({ length: 10 }, (_, i) => ({ x: i, y: 0 }))
    const smoothed = smoothTrackPoints(points, 3)
    expect(Math.abs(smoothed[0].x - points[0].x)).toBeLessThanOrEqual(3)
    expect(Math.abs(smoothed[9].x - points[9].x)).toBeLessThanOrEqual(3)
  })

  it('returns points unchanged for windowRadius 0', () => {
    const points = [{ x: 0, y: 0 }, { x: 5, y: 5 }, { x: 1, y: 9 }]
    expect(smoothTrackPoints(points, 0)).toEqual(points)
  })

  it('handles 0, 1, and 2 points without throwing', () => {
    expect(smoothTrackPoints([])).toEqual([])
    expect(smoothTrackPoints([{ x: 1, y: 2 }])).toEqual([{ x: 1, y: 2 }])
    const two = [{ x: 0, y: 0 }, { x: 1, y: 1 }]
    expect(smoothTrackPoints(two)).toEqual(two)
  })
})
