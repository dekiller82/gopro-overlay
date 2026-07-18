import { describe, expect, it } from 'vitest'
import type { ImuSample, TelemetryData, TelemetrySample } from '../types'
import { createTelemetrySampler } from './sampleAt'

function makeSample(cts: number, overrides: Partial<TelemetrySample> = {}): TelemetrySample {
  return { cts, lat: 51.5, lon: -0.1, altitude: 0, speed2D: 0, speed3D: 0, ...overrides }
}

function makeTelemetry(samples: TelemetrySample[], overrides: Partial<TelemetryData> = {}): TelemetryData {
  return {
    deviceName: 'Test Camera',
    gpsStream: 'GPS5',
    samples,
    videoDurationMs: samples.length ? samples[samples.length - 1].cts : 0,
    accel: [],
    gyro: [],
    gravity: [],
    ...overrides
  }
}

describe('createTelemetrySampler', () => {
  it('exposes a track polyline matching sample count', () => {
    const samples = Array.from({ length: 10 }, (_, i) =>
      makeSample(i * 100, { lat: 51.5 + i * 0.0001, lon: -0.1 + i * 0.0001 })
    )
    const sampler = createTelemetrySampler(makeTelemetry(samples))
    expect(sampler.trackPoints).toHaveLength(10)
    expect(sampler.bounds.maxX).toBeGreaterThan(sampler.bounds.minX)
    expect(sampler.bounds.maxY).toBeGreaterThan(sampler.bounds.minY)
  })

  it('positionAt tracks the moving dot smoothly across sample boundaries', () => {
    const samples = Array.from({ length: 5 }, (_, i) => makeSample(i * 200, { lat: 51.5 + i * 0.001, lon: -0.1 }))
    const sampler = createTelemetrySampler(makeTelemetry(samples))

    const start = sampler.positionAt(0)
    const end = sampler.positionAt(800)
    const mid = sampler.positionAt(400)

    expect(mid.y).toBeGreaterThan(start.y)
    expect(mid.y).toBeLessThan(end.y)
  })

  it('speedAt smooths a noisy but flat-average speed toward its mean', () => {
    const values = [0, 10, 0, 10, 0, 10, 0, 10]
    const samples = values.map((v, i) => makeSample(i * 100, { speed2D: v }))
    const sampler = createTelemetrySampler(makeTelemetry(samples))

    const smoothed = sampler.speedAt(400, 400)
    expect(smoothed).toBeGreaterThan(2)
    expect(smoothed).toBeLessThan(8)
  })

  it('speedAt never goes negative or NaN for zero-speed samples', () => {
    const samples = Array.from({ length: 5 }, (_, i) => makeSample(i * 100, { speed2D: 0 }))
    const sampler = createTelemetrySampler(makeTelemetry(samples))
    const v = sampler.speedAt(250)
    expect(Number.isNaN(v)).toBe(false)
    expect(v).toBeGreaterThanOrEqual(0)
  })

  it('handles an empty telemetry sample list without throwing', () => {
    const sampler = createTelemetrySampler(makeTelemetry([]))
    expect(sampler.trackPoints).toEqual([])
    expect(() => sampler.positionAt(0)).not.toThrow()
    expect(() => sampler.speedAt(0)).not.toThrow()
  })
})

function makeImu(cts: number, x: number, y: number, z: number): ImuSample {
  return { cts, x, y, z }
}

describe('createTelemetrySampler IMU methods (gForceAt/gForceHistoryAt/rollAngleAt)', () => {
  // Axis 0 = vertical (~9.8, level), axis 1 = lateral, axis 2 = longitudinal. GPS speed drops then
  // rises to match a real braking-then-accelerating event, so calibrateAxes' correlation picks axis
  // 2 as longitudinal (same convention verified against real fixture data in imuCalibration.test.ts).
  const gpsSamples = [0, 100, 200, 300, 400].map((cts, i) => makeSample(cts, { speed2D: [20, 10, 5, 10, 20][i] }))
  const accel = [
    makeImu(0, 9.8, 0, 5),
    makeImu(100, 9.8, 2, -10),
    makeImu(200, 9.8, -2, -10),
    makeImu(300, 9.8, 2, 10),
    makeImu(400, 9.8, -2, 10)
  ]

  it('hasImuData reflects whether the session has any accel samples at all', () => {
    expect(createTelemetrySampler(makeTelemetry(gpsSamples, { accel })).hasImuData).toBe(true)
    expect(createTelemetrySampler(makeTelemetry(gpsSamples)).hasImuData).toBe(false)
  })

  it('gForceAt reports G-forces relative to 9.80665 m/s^2, using the calibrated longitudinal/lateral axes', () => {
    const sampler = createTelemetrySampler(makeTelemetry(gpsSamples, { accel }))
    const reading = sampler.gForceAt(200, 60)
    // Axis 2 (longitudinal, calibrated) is strongly negative around cts=100-200 (braking) -- expect a
    // real negative G reading, not zero/NaN.
    expect(reading.longitudinalG).toBeLessThan(0)
    expect(Number.isNaN(reading.longitudinalG)).toBe(false)
    expect(Number.isNaN(reading.lateralG)).toBe(false)
  })

  it('gForceAt returns zero, not NaN/throw, when there is no accel data', () => {
    const sampler = createTelemetrySampler(makeTelemetry(gpsSamples))
    expect(sampler.gForceAt(100)).toEqual({ lateralG: 0, longitudinalG: 0 })
  })

  it('gForceHistoryAt returns raw (unsmoothed) points within the requested window, not the whole session', () => {
    const sampler = createTelemetrySampler(makeTelemetry(gpsSamples, { accel }))
    const history = sampler.gForceHistoryAt(300, 150)
    expect(history.length).toBeGreaterThan(0)
    expect(history.length).toBeLessThan(accel.length) // a 150ms window shouldn't include every one of 5 samples spanning 400ms
    for (const p of history) {
      expect(p.cts).toBeGreaterThanOrEqual(150)
      expect(p.cts).toBeLessThanOrEqual(300)
    }
  })

  it('rollAngleAt uses the gravity stream (source "gravity") when present', () => {
    const gravity = [makeImu(0, 0.9, 0.436, 0), makeImu(100, 0.9, 0.436, 0)] // tilted ~26 deg on the lateral axis
    const sampler = createTelemetrySampler(makeTelemetry(gpsSamples, { accel, gravity }))
    const reading = sampler.rollAngleAt(50, 60)
    expect(reading.source).toBe('gravity')
    expect(Math.abs(reading.degrees)).toBeGreaterThan(5)
  })

  it('rollAngleAt falls back to accelerometer tilt (source "accelFallback") when no gravity stream exists', () => {
    const sampler = createTelemetrySampler(makeTelemetry(gpsSamples, { accel }))
    const reading = sampler.rollAngleAt(50, 60)
    expect(reading.source).toBe('accelFallback')
    expect(Number.isNaN(reading.degrees)).toBe(false)
  })

  it('rollAngleAt reads ~0 degrees when level (vertical axis dominant, no lateral tilt)', () => {
    const levelAccel = [makeImu(0, 9.8, 0, 0), makeImu(100, 9.8, 0, 0), makeImu(200, 9.8, 0, 0)]
    const sampler = createTelemetrySampler(makeTelemetry(gpsSamples, { accel: levelAccel }))
    const reading = sampler.rollAngleAt(100, 60)
    expect(Math.abs(reading.degrees)).toBeLessThan(2)
  })
})
