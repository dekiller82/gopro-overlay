import type { ImuSample, TelemetrySample } from '../types'
import { findBracketIndex } from './interpolate'

export interface AxisCalibration {
  verticalAxis: 0 | 1 | 2
  verticalSign: 1 | -1
  longitudinalAxis: 0 | 1 | 2
  longitudinalSign: 1 | -1
  lateralAxis: 0 | 1 | 2
  lateralSign: 1 | -1
}

export const GRAVITY_MPS2 = 9.80665

function axisValue(sample: ImuSample, axis: 0 | 1 | 2): number {
  return axis === 0 ? sample.x : axis === 1 ? sample.y : sample.z
}

function meanXYZ(samples: ImuSample[]): [number, number, number] {
  let sx = 0
  let sy = 0
  let sz = 0
  for (const s of samples) {
    sx += s.x
    sy += s.y
    sz += s.z
  }
  return [sx / samples.length, sy / samples.length, sz / samples.length]
}

/**
 * Vertical axis is the one where gravity dominates. GRAV (when present) is already a unit vector,
 * so whichever component has the largest magnitude is vertical. Without GRAV, falls back to whichever
 * raw ACCL axis's own session-average magnitude is closest to 9.80665 m/s^2 -- more robust than
 * "largest magnitude" alone, since a non-vertical axis can have a large but clearly-not-gravity mean
 * on a track with a long straight or a lot of hard acceleration in one direction.
 */
function detectVerticalAxis(accel: ImuSample[], gravity: ImuSample[]): { axis: 0 | 1 | 2; sign: 1 | -1 } {
  if (gravity.length > 0) {
    const means = meanXYZ(gravity)
    let axis: 0 | 1 | 2 = 0
    for (let i = 1; i < 3; i++) if (Math.abs(means[i]) > Math.abs(means[axis])) axis = i as 0 | 1 | 2
    return { axis, sign: means[axis] >= 0 ? 1 : -1 }
  }
  if (accel.length > 0) {
    const means = meanXYZ(accel)
    let axis: 0 | 1 | 2 = 0
    let bestDiff = Math.abs(Math.abs(means[0]) - GRAVITY_MPS2)
    for (let i = 1; i < 3; i++) {
      const diff = Math.abs(Math.abs(means[i]) - GRAVITY_MPS2)
      if (diff < bestDiff) {
        bestDiff = diff
        axis = i as 0 | 1 | 2
      }
    }
    return { axis, sign: means[axis] >= 0 ? 1 : -1 }
  }
  return { axis: 0, sign: 1 }
}

/** dv/dt from GPS speed2D between consecutive samples -- a mount-orientation-independent reference
 *  for "true" longitudinal (forward/back) acceleration, since it's derived from the vehicle's actual
 *  direction of travel, not the camera's own body frame. */
function gpsLongitudinalAccelReference(gpsSamples: TelemetrySample[]): { cts: number; accel: number }[] {
  const reference: { cts: number; accel: number }[] = []
  for (let i = 1; i < gpsSamples.length; i++) {
    const dtSeconds = (gpsSamples[i].cts - gpsSamples[i - 1].cts) / 1000
    if (dtSeconds <= 0) continue
    const dv = gpsSamples[i].speed2D - gpsSamples[i - 1].speed2D
    reference.push({ cts: (gpsSamples[i].cts + gpsSamples[i - 1].cts) / 2, accel: dv / dtSeconds })
  }
  return reference
}

function nearestAxisValue(accel: ImuSample[], axis: 0 | 1 | 2, cts: number): number | null {
  if (accel.length === 0) return null
  const i = findBracketIndex(accel, cts)
  const j = Math.min(i + 1, accel.length - 1)
  const chosen = Math.abs(accel[j].cts - cts) < Math.abs(accel[i].cts - cts) ? j : i
  return axisValue(accel[chosen], axis)
}

function pearsonCorrelation(a: number[], b: number[]): number {
  const n = a.length
  if (n === 0) return 0
  const meanA = a.reduce((s, x) => s + x, 0) / n
  const meanB = b.reduce((s, x) => s + x, 0) / n
  let numerator = 0
  let denomA = 0
  let denomB = 0
  for (let i = 0; i < n; i++) {
    const da = a[i] - meanA
    const db = b[i] - meanB
    numerator += da * db
    denomA += da * da
    denomB += db * db
  }
  const denom = Math.sqrt(denomA * denomB)
  return denom === 0 ? 0 : numerator / denom
}

/**
 * Of the two non-vertical ACCL axes, whichever correlates best with the GPS-derived dv/dt reference
 * is longitudinal (braking/accelerating shows up as a real, matching pattern in that axis regardless
 * of camera mounting orientation or model-specific raw axis order). Needs *some* real braking/
 * accelerating events in the session to calibrate well -- a short, perfectly steady-speed clip won't
 * correlate reliably, which is exactly why a manual override exists in the property panel.
 */
function detectLongitudinalAxis(accel: ImuSample[], gpsSamples: TelemetrySample[], verticalAxis: 0 | 1 | 2): { axis: 0 | 1 | 2; sign: 1 | -1 } {
  const candidates = ([0, 1, 2] as const).filter((a) => a !== verticalAxis)
  const reference = gpsLongitudinalAccelReference(gpsSamples)

  if (reference.length < 2 || accel.length === 0) {
    return { axis: candidates[0], sign: 1 }
  }

  let bestAxis = candidates[0]
  let bestCorr = 0
  for (const axis of candidates) {
    const matchedAccel: number[] = []
    const matchedRef: number[] = []
    for (const r of reference) {
      const v = nearestAxisValue(accel, axis, r.cts)
      if (v === null) continue
      matchedAccel.push(v)
      matchedRef.push(r.accel)
    }
    const corr = pearsonCorrelation(matchedAccel, matchedRef)
    if (Math.abs(corr) > Math.abs(bestCorr)) {
      bestCorr = corr
      bestAxis = axis
    }
  }
  return { axis: bestAxis, sign: bestCorr >= 0 ? 1 : -1 }
}

/**
 * Resolves which raw ACCL/GYRO/GRAV axis is vertical/longitudinal/lateral for THIS session -- raw
 * axis order is camera-body-relative and not consistent across GoPro models (confirmed by extracting
 * real samples from Hero5/7/11 test fixtures: Hero5/11 read as vertical/lateral/longitudinal at rest,
 * Hero7 only exposes generic axis labels with no reliable semantic mapping). Computed once per
 * session (like the rest of TelemetrySampler's precomputed fields), not per frame.
 */
export function calibrateAxes(accel: ImuSample[], gravity: ImuSample[], gpsSamples: TelemetrySample[]): AxisCalibration {
  const vertical = detectVerticalAxis(accel, gravity)
  const longitudinal = detectLongitudinalAxis(accel, gpsSamples, vertical.axis)
  const lateralAxis = ([0, 1, 2] as const).find((a) => a !== vertical.axis && a !== longitudinal.axis) as 0 | 1 | 2

  return {
    verticalAxis: vertical.axis,
    verticalSign: vertical.sign,
    longitudinalAxis: longitudinal.axis,
    longitudinalSign: longitudinal.sign,
    lateralAxis,
    lateralSign: 1
  }
}

/** Builds an AxisCalibration from the property panel's manual-override fields (used when a widget's
 *  `useManualAxes` style flag is on, bypassing calibrateAxes' auto-detection for that widget instance). */
export function buildManualCalibration(
  verticalAxis: 0 | 1 | 2,
  longitudinalAxis: 0 | 1 | 2,
  verticalInverted: boolean,
  longitudinalInverted: boolean,
  lateralInverted: boolean
): AxisCalibration {
  const lateralAxis = ([0, 1, 2] as const).find((a) => a !== verticalAxis && a !== longitudinalAxis) ?? verticalAxis
  return {
    verticalAxis,
    verticalSign: verticalInverted ? -1 : 1,
    longitudinalAxis,
    longitudinalSign: longitudinalInverted ? -1 : 1,
    lateralAxis,
    lateralSign: lateralInverted ? -1 : 1
  }
}

/** Same as buildManualCalibration but for widgets (Roll/Lean Angle) that only care about
 *  vertical/lateral -- picks vertical+lateral directly instead of deriving lateral from
 *  vertical+longitudinal, since longitudinal is irrelevant to a roll reading. The unused
 *  longitudinal axis/sign are filled in arbitrarily (whichever axis is left, sign +1). */
export function buildManualCalibrationForRoll(verticalAxis: 0 | 1 | 2, lateralAxis: 0 | 1 | 2, verticalInverted: boolean, lateralInverted: boolean): AxisCalibration {
  const longitudinalAxis = ([0, 1, 2] as const).find((a) => a !== verticalAxis && a !== lateralAxis) ?? lateralAxis
  return {
    verticalAxis,
    verticalSign: verticalInverted ? -1 : 1,
    longitudinalAxis,
    longitudinalSign: 1,
    lateralAxis,
    lateralSign: lateralInverted ? -1 : 1
  }
}

/** Projects a raw IMU sample onto the calibrated axes, returning {vertical, longitudinal, lateral} in the sample's own units. */
export function applyCalibration(sample: ImuSample, calibration: AxisCalibration): { vertical: number; longitudinal: number; lateral: number } {
  return {
    vertical: axisValue(sample, calibration.verticalAxis) * calibration.verticalSign,
    longitudinal: axisValue(sample, calibration.longitudinalAxis) * calibration.longitudinalSign,
    lateral: axisValue(sample, calibration.lateralAxis) * calibration.lateralSign
  }
}
