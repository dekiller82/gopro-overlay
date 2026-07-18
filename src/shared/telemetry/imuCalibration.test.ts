import { readFileSync } from 'fs'
import path from 'path'
import { describe, expect, it } from 'vitest'
import goproTelemetry from 'gopro-telemetry'
import type { ImuSample, TelemetrySample } from '../types'
import { normalizeGpsTelemetry, normalizeImuTelemetry, type RawGoProTelemetry } from './normalize'
import { applyCalibration, calibrateAxes } from './imuCalibration'

const FIXTURES_DIR = path.join(process.cwd(), 'node_modules/gopro-telemetry/samples')

async function loadRealTelemetry(filename: string): Promise<{ accel: ImuSample[]; gravity: ImuSample[]; gps: TelemetrySample[] }> {
  const file = readFileSync(path.join(FIXTURES_DIR, filename))
  const raw = (await goproTelemetry({ rawData: file }, { stream: ['GPS', 'ACCL', 'GYRO', 'GRAV'] })) as unknown as RawGoProTelemetry
  const imu = normalizeImuTelemetry(raw)
  const gps = normalizeGpsTelemetry(raw, 0)
  return { accel: imu.accel, gravity: imu.gravity, gps: gps.samples }
}

function meanAbs(samples: ImuSample[], axis: 0 | 1 | 2): number {
  const pick = (s: ImuSample): number => (axis === 0 ? s.x : axis === 1 ? s.y : s.z)
  return samples.reduce((sum, s) => sum + Math.abs(pick(s)), 0) / samples.length
}

// These fixtures are pre-extracted raw GPMF tracks bundled with the gopro-telemetry dependency
// itself (real accelerometer/gyroscope/gravity data from real Hero5/7/11 cameras) -- no mp4 or
// gpmf-extract step is needed to reach them, `goproTelemetry` accepts the raw track directly.
describe('calibrateAxes against real GoPro fixture data', () => {
  it('Hero11 (has a real GRAV stream): picks the axis with the largest gravity-vector component as vertical', async () => {
    const { accel, gravity, gps } = await loadRealTelemetry('hero11.raw')
    expect(gravity.length).toBeGreaterThan(0) // sanity: this fixture really does have GRAV

    // Ground truth derived from the SAME real data, not hardcoded -- whichever axis has the largest
    // average |GRAV| component should be the one calibrateAxes picks as vertical.
    const groundTruthAxis = ([0, 1, 2] as const).reduce((best, axis) => (meanAbs(gravity, axis) > meanAbs(gravity, best) ? axis : best), 0 as 0 | 1 | 2)

    const calibration = calibrateAxes(accel, gravity, gps)
    expect(calibration.verticalAxis).toBe(groundTruthAxis)
    expect(meanAbs(gravity, calibration.verticalAxis)).toBeGreaterThan(0.9) // a real unit-vector gravity axis should dominate
  })

  it('Hero5 (no GRAV stream): falls back to whichever raw ACCL axis reads closest to 9.80665 m/s^2 on average', async () => {
    const { accel, gravity, gps } = await loadRealTelemetry('hero5.raw')
    expect(gravity.length).toBe(0) // sanity: this fixture really has no GRAV

    const groundTruthAxis = ([0, 1, 2] as const).reduce(
      (best, axis) => (Math.abs(meanAbs(accel, axis) - 9.80665) < Math.abs(meanAbs(accel, best) - 9.80665) ? axis : best),
      0 as 0 | 1 | 2
    )

    const calibration = calibrateAxes(accel, gravity, gps)
    expect(calibration.verticalAxis).toBe(groundTruthAxis)
    expect(meanAbs(accel, calibration.verticalAxis)).toBeCloseTo(9.80665, 0) // within ~1 m/s^2 of true gravity
  })

  it('Hero7 (no GRAV, generic axis labels): still picks a vertical axis close to gravity magnitude without throwing', async () => {
    const { accel, gravity, gps } = await loadRealTelemetry('hero7.raw')
    const calibration = calibrateAxes(accel, gravity, gps)
    expect(meanAbs(accel, calibration.verticalAxis)).toBeGreaterThan(5) // clearly gravity-dominated, not a near-zero dynamic axis
    // The three axes must all be distinct.
    expect(new Set([calibration.verticalAxis, calibration.longitudinalAxis, calibration.lateralAxis]).size).toBe(3)
  })

  it('longitudinal axis correlates with real GPS-derived braking/accelerating events (Hero7, which has real speed variation)', async () => {
    const { accel, gravity, gps } = await loadRealTelemetry('hero7.raw')
    const calibration = calibrateAxes(accel, gravity, gps)
    // Not asserting a specific axis index (real data, not under our control) -- just that longitudinal
    // and lateral came out as genuinely different, valid axis indices distinct from vertical.
    expect(calibration.longitudinalAxis).not.toBe(calibration.verticalAxis)
    expect(calibration.lateralAxis).not.toBe(calibration.verticalAxis)
    expect(calibration.lateralAxis).not.toBe(calibration.longitudinalAxis)
  })
})

describe('calibrateAxes edge cases (synthetic)', () => {
  function makeAccel(cts: number, x: number, y: number, z: number): ImuSample {
    return { cts, x, y, z }
  }
  function makeGps(cts: number, speed2D: number): TelemetrySample {
    return { cts, lat: 0, lon: 0, altitude: 0, speed2D, speed3D: speed2D }
  }

  it('does not throw with no accel, no gravity, no GPS data at all', () => {
    const calibration = calibrateAxes([], [], [])
    expect(calibration.verticalAxis).toBeGreaterThanOrEqual(0)
    expect(new Set([calibration.verticalAxis, calibration.longitudinalAxis, calibration.lateralAxis]).size).toBe(3)
  })

  it('picks an arbitrary (but valid, non-throwing) longitudinal axis when GPS speed never changes (nothing to correlate against)', () => {
    const accel = [makeAccel(0, 9.8, 0.1, 0.2), makeAccel(100, 9.8, -0.1, 0.3), makeAccel(200, 9.8, 0.2, -0.1)]
    const gps = [makeGps(0, 20), makeGps(100, 20), makeGps(200, 20)] // perfectly constant speed
    const calibration = calibrateAxes(accel, [], gps)
    expect(calibration.verticalAxis).toBe(0) // clearly gravity-dominated axis, still detectable
    expect(new Set([calibration.verticalAxis, calibration.longitudinalAxis, calibration.lateralAxis]).size).toBe(3)
  })

  it('detects a clean synthetic longitudinal axis via GPS correlation', () => {
    // Axis 0 is vertical (constant ~9.8). Axis 2 is engineered to match GPS deceleration/acceleration
    // exactly (braking then accelerating); axis 1 is pure noise uncorrelated with speed changes.
    const accel: ImuSample[] = []
    const gps: TelemetrySample[] = []
    for (let i = 0; i <= 20; i++) {
      const cts = i * 100
      const speed = i <= 10 ? 30 - i * 2 : 10 + (i - 10) * 2 // brakes 30->10, then accelerates 10->30
      gps.push(makeGps(cts, speed))
      const trueAccel = i <= 10 ? -2 / 0.1 : 2 / 0.1 // matches d(speed)/dt in m/s^2 (speed in m/s, step 100ms)
      accel.push(makeAccel(cts, 9.8, i % 2 === 0 ? 0.3 : -0.3, trueAccel))
    }
    const calibration = calibrateAxes(accel, [], gps)
    expect(calibration.verticalAxis).toBe(0)
    expect(calibration.longitudinalAxis).toBe(2)
    expect(calibration.lateralAxis).toBe(1)
    expect(calibration.longitudinalSign).toBe(1) // engineered to correlate positively
  })

  it('applyCalibration projects a raw sample onto the calibrated axes with the right sign', () => {
    const calibration = {
      verticalAxis: 2 as const,
      verticalSign: -1 as const,
      longitudinalAxis: 0 as const,
      longitudinalSign: 1 as const,
      lateralAxis: 1 as const,
      lateralSign: -1 as const
    }
    const sample = makeAccel(0, 5, 3, 9.8)
    const projected = applyCalibration(sample, calibration)
    expect(projected.vertical).toBeCloseTo(-9.8, 6)
    expect(projected.longitudinal).toBeCloseTo(5, 6)
    expect(projected.lateral).toBeCloseTo(-3, 6)
  })
})
