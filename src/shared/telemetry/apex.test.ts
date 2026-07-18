import { describe, expect, it } from 'vitest'
import type { TelemetrySample } from '../types'
import { detectApexEvents } from './apex'

function makeSample(cts: number, speed2D: number): TelemetrySample {
  return { cts, lat: 0, lon: 0, altitude: 0, speed2D, speed3D: speed2D }
}

/** Linear speed ramp from `fromSpeed` to `toSpeed` over [startCts, endCts], sampled every `stepMs`. */
function ramp(startCts: number, endCts: number, stepMs: number, fromSpeed: number, toSpeed: number): TelemetrySample[] {
  const samples: TelemetrySample[] = []
  for (let cts = startCts; cts <= endCts; cts += stepMs) {
    const t = (cts - startCts) / (endCts - startCts)
    samples.push(makeSample(cts, fromSpeed + (toSpeed - fromSpeed) * t))
  }
  return samples
}

describe('detectApexEvents', () => {
  it('detects a single clean braking-then-accelerating zone', () => {
    // 30 -> 8 m/s braking, then 8 -> 30 m/s acceleration -- one clear apex around cts=1000.
    const samples = [...ramp(0, 1000, 100, 30, 8), ...ramp(1000, 2000, 100, 8, 30).slice(1)]
    const events = detectApexEvents(samples, 8, 1500)
    expect(events.length).toBe(1)
    expect(events[0].cts).toBeGreaterThan(700)
    expect(events[0].cts).toBeLessThan(1300)
    expect(events[0].speedMps).toBeLessThan(15)
  })

  it('ignores a minor lift that never drops below the threshold', () => {
    // Only a 4 m/s dip (30 -> 26 -> 30) -- well under an 8 m/s minDropMps threshold.
    const samples = [...ramp(0, 1000, 100, 30, 26), ...ramp(1000, 2000, 100, 26, 30).slice(1)]
    const events = detectApexEvents(samples, 8, 1500)
    expect(events).toEqual([])
  })

  it('suppresses a second dip that arrives before minGapMs has elapsed', () => {
    // Two big dips back-to-back, ~1275ms apart -- closer than a 1500ms minGapMs.
    const dip1 = [...ramp(0, 1000, 100, 30, 8), ...ramp(1000, 2000, 100, 8, 30).slice(1)]
    const dip2 = [...ramp(2000, 2300, 100, 30, 8), ...ramp(2300, 3000, 100, 8, 30).slice(1)]
    const samples = [...dip1, ...dip2.slice(1)]
    const events = detectApexEvents(samples, 8, 1500)
    expect(events.length).toBe(1) // only the first is accepted
  })

  it('accepts a second dip once minGapMs has elapsed since the last accepted one', () => {
    const dip1 = [...ramp(0, 1000, 100, 30, 8), ...ramp(1000, 2000, 100, 8, 30).slice(1)]
    const dip2 = [...ramp(6000, 7000, 100, 30, 8), ...ramp(7000, 8000, 100, 8, 30).slice(1)]
    const samples = [...dip1, ...dip2.slice(1)]
    const events = detectApexEvents(samples, 8, 1500)
    expect(events.length).toBe(2)
  })

  it('detects multiple well-separated apexes in one session and ignores an in-between minor lift', () => {
    const dip1 = [...ramp(0, 1000, 100, 30, 8), ...ramp(1000, 2000, 100, 8, 30).slice(1)]
    const minorLift = [...ramp(4000, 5000, 100, 30, 26), ...ramp(5000, 6000, 100, 26, 30).slice(1)]
    const dip2 = [...ramp(8000, 9000, 100, 30, 8), ...ramp(9000, 10000, 100, 8, 30).slice(1)]
    const samples = [...dip1, ...minorLift.slice(1), ...dip2.slice(1)]
    const events = detectApexEvents(samples, 8, 1500)
    expect(events.length).toBe(2)
  })

  it('handles too few samples without throwing', () => {
    expect(detectApexEvents([])).toEqual([])
    expect(detectApexEvents([makeSample(0, 20), makeSample(100, 20)])).toEqual([])
  })

  it('does not flag a flat (constant-speed) session as having any apex', () => {
    const samples = ramp(0, 5000, 200, 20, 20)
    expect(detectApexEvents(samples)).toEqual([])
  })
})
