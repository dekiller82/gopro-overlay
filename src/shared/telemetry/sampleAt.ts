import type { ImuSample, TelemetryData, TelemetrySample } from '../types'
import { findBracketIndex, gaussianSmoothedValueAt, positionAt, projectTrack, smoothTrackPoints, type ProjectedPoint } from './interpolate'
import { applyCalibration, calibrateAxes, GRAVITY_MPS2, type AxisCalibration } from './imuCalibration'
import { distanceMeters } from './laps'

export interface TrackBounds {
  minX: number
  maxX: number
  minY: number
  maxY: number
}

export interface GForceReading {
  lateralG: number
  longitudinalG: number
}

export interface GForceHistoryPoint extends GForceReading {
  cts: number
}

export interface RollAngleReading {
  degrees: number
  /** Whether this reading came from the real gravity-vector stream (accurate, no cornering
   *  contamination) or the accelerometer-tilt fallback (reads exaggerated during hard cornering --
   *  see shared/render/drawRollAngle.ts). */
  source: 'gravity' | 'accelFallback'
}

export interface SessionStats {
  /** Cumulative GPS arc-length from the very start of the recording up to `cts`, meters. */
  totalDistanceM: number
  /** Fastest speed2D reached anywhere up to `cts`, m/s -- deliberately bounded by `cts` (not the
   *  whole session's precomputed max) so this stays correct if scrubbed to earlier than the actual
   *  session end, same "never leak future data" discipline as lap/sector state. */
  maxSpeedMps: number
}

export interface TelemetrySampler {
  /** Raw telemetry samples, e.g. for lap-crossing detection against a start/finish lat/lon. */
  samples: TelemetrySample[]
  /** Static, precomputed track polyline in local planar meters (equirectangular projection). */
  trackPoints: ProjectedPoint[]
  bounds: TrackBounds
  /** Raw speed2D per sample, 1:1 index-aligned with trackPoints/samples -- for the GPS Track
   *  widget's optional speed/braking-colored line. Precomputed once so per-frame drawing never
   *  re-walks the full samples array. */
  trackSpeeds: number[]
  /** cts per sample, 1:1 index-aligned with trackPoints/trackSpeeds -- needed alongside trackSpeeds
   *  to compute per-segment acceleration (braking color mode) without re-reading `samples` itself. */
  trackCts: number[]
  /** Session-relative min/max of trackSpeeds, precomputed once. */
  speedBounds: { min: number; max: number }
  /** Smoothly interpolated position (Catmull-Rom) at video time `cts` (ms). */
  positionAt: (cts: number) => ProjectedPoint
  /**
   * Speed (m/s) at video time `cts`, Gaussian-smoothed over a `smoothingMs` window to damp
   * raw GPS jitter. A window floor keeps the result continuous between samples even at
   * smoothingMs = 0.
   */
  speedAt: (cts: number, smoothingMs?: number) => number
  /** Whether the session had ACCL data to calibrate against at all -- widgets show an
   *  "unavailable" state instead of a misleading reading when this is false. */
  hasImuData: boolean
  /** Axis mapping auto-detected once for this session (see imuCalibration.ts). Callers can pass
   *  their own override (property-panel manual axis mapping) instead of using this default. */
  defaultAxisCalibration: AxisCalibration
  /** Gaussian-smoothed lateral/longitudinal G-force at `cts`, projected onto the calibrated axes. */
  gForceAt: (cts: number, smoothingMs?: number, calibrationOverride?: AxisCalibration) => GForceReading
  /** Raw (unsmoothed -- a real friction-circle trail is a scatter, not a smooth line) calibrated
   *  G-force points in the last `windowMs` up to `cts`, for a fading trail. */
  gForceHistoryAt: (cts: number, windowMs: number, calibrationOverride?: AxisCalibration) => GForceHistoryPoint[]
  /** Roll/lean angle in degrees at `cts`, from the gravity-vector stream when present, otherwise a
   *  raw-accelerometer-tilt fallback (see RollAngleReading.source). Only the vertical/lateral axes of
   *  `calibrationOverride` matter here (longitudinal is irrelevant to roll). */
  rollAngleAt: (cts: number, smoothingMs?: number, calibrationOverride?: AxisCalibration) => RollAngleReading
  /** Total distance covered and fastest speed reached, both bounded to "up to `cts`" -- for the
   *  Session Summary widget. Precomputed once as parallel prefix arrays (like trackSpeeds), not
   *  recomputed per query. */
  sessionStatsAt: (cts: number) => SessionStats
}

const MIN_SMOOTHING_MS = 60
export const DEFAULT_SPEED_SMOOTHING_MS = 350
export const DEFAULT_GFORCE_SMOOTHING_MS = 150
export const DEFAULT_ROLL_SMOOTHING_MS = 150

function computeBounds(points: ProjectedPoint[]): TrackBounds {
  if (points.length === 0) return { minX: 0, maxX: 0, minY: 0, maxY: 0 }
  let minX = points[0].x
  let maxX = points[0].x
  let minY = points[0].y
  let maxY = points[0].y
  for (const p of points) {
    if (p.x < minX) minX = p.x
    if (p.x > maxX) maxX = p.x
    if (p.y < minY) minY = p.y
    if (p.y > maxY) maxY = p.y
  }
  return { minX, maxX, minY, maxY }
}

/** Parallel prefix arrays (1:1 index-aligned with `samples`): cumulative arc-length distance and
 *  running-max speed up to and including that sample index. Computed once per sampler, same cost
 *  class as trackSpeeds/trackCts, so sessionStatsAt is a cheap index lookup per query rather than
 *  an O(n) rescan every frame. */
function computeSessionStatsCurve(samples: TelemetrySample[]): { cumDistanceM: number[]; runningMaxSpeedMps: number[] } {
  const cumDistanceM: number[] = new Array(samples.length)
  const runningMaxSpeedMps: number[] = new Array(samples.length)
  let cum = 0
  let maxSpeed = 0
  for (let i = 0; i < samples.length; i++) {
    if (i > 0) cum += distanceMeters(samples[i - 1], samples[i])
    maxSpeed = Math.max(maxSpeed, samples[i].speed2D)
    cumDistanceM[i] = cum
    runningMaxSpeedMps[i] = maxSpeed
  }
  return { cumDistanceM, runningMaxSpeedMps }
}

function computeSpeedBounds(speeds: number[]): { min: number; max: number } {
  if (speeds.length === 0) return { min: 0, max: 0 }
  let min = speeds[0]
  let max = speeds[0]
  for (const s of speeds) {
    if (s < min) min = s
    if (s > max) max = s
  }
  return { min, max }
}

export function createTelemetrySampler(telemetry: TelemetryData): TelemetrySampler {
  const samples = telemetry.samples
  // Smoothed once here so the drawn track line and the moving dot (which interpolates between
  // these same points) always agree -- the dot never appears to drift off the line.
  const trackPoints = smoothTrackPoints(projectTrack(samples))
  const bounds = computeBounds(trackPoints)
  const trackSpeeds = samples.map((s) => s.speed2D)
  const trackCts = samples.map((s) => s.cts)
  const speedBounds = computeSpeedBounds(trackSpeeds)
  const sessionStatsCurve = computeSessionStatsCurve(samples)

  function sessionStatsAt(cts: number): SessionStats {
    if (samples.length === 0) return { totalDistanceM: 0, maxSpeedMps: 0 }
    const idx = findBracketIndex(samples, cts)
    return { totalDistanceM: sessionStatsCurve.cumDistanceM[idx], maxSpeedMps: sessionStatsCurve.runningMaxSpeedMps[idx] }
  }

  const accel = telemetry.accel
  const gravity = telemetry.gravity
  const defaultAxisCalibration = calibrateAxes(accel, gravity, samples)

  function gForceAt(cts: number, smoothingMs = DEFAULT_GFORCE_SMOOTHING_MS, calibrationOverride?: AxisCalibration): GForceReading {
    if (accel.length === 0) return { lateralG: 0, longitudinalG: 0 }
    const cal = calibrationOverride ?? defaultAxisCalibration
    const window = Math.max(MIN_SMOOTHING_MS, smoothingMs)
    const longitudinalMps2 = gaussianSmoothedValueAt(accel, cts, window, (s: ImuSample) => applyCalibration(s, cal).longitudinal)
    const lateralMps2 = gaussianSmoothedValueAt(accel, cts, window, (s: ImuSample) => applyCalibration(s, cal).lateral)
    return { longitudinalG: longitudinalMps2 / GRAVITY_MPS2, lateralG: lateralMps2 / GRAVITY_MPS2 }
  }

  function gForceHistoryAt(cts: number, windowMs: number, calibrationOverride?: AxisCalibration): GForceHistoryPoint[] {
    if (accel.length === 0) return []
    const cal = calibrationOverride ?? defaultAxisCalibration
    const startCts = cts - windowMs
    const startIdx = findBracketIndex(accel, startCts)
    const endIdx = findBracketIndex(accel, cts)
    const points: GForceHistoryPoint[] = []
    for (let i = startIdx; i <= endIdx; i++) {
      if (accel[i].cts < startCts || accel[i].cts > cts) continue
      const projected = applyCalibration(accel[i], cal)
      points.push({ cts: accel[i].cts, longitudinalG: projected.longitudinal / GRAVITY_MPS2, lateralG: projected.lateral / GRAVITY_MPS2 })
    }
    return points
  }

  function rollAngleAt(cts: number, smoothingMs = DEFAULT_ROLL_SMOOTHING_MS, calibrationOverride?: AxisCalibration): RollAngleReading {
    const cal = calibrationOverride ?? defaultAxisCalibration
    const window = Math.max(MIN_SMOOTHING_MS, smoothingMs)
    const source = gravity.length > 0 ? gravity : accel
    if (source.length === 0) return { degrees: 0, source: 'accelFallback' }

    const lateral = gaussianSmoothedValueAt(source, cts, window, (s: ImuSample) => applyCalibration(s, cal).lateral)
    const vertical = gaussianSmoothedValueAt(source, cts, window, (s: ImuSample) => applyCalibration(s, cal).vertical)
    const degrees = (Math.atan2(lateral, vertical) * 180) / Math.PI
    return { degrees, source: gravity.length > 0 ? 'gravity' : 'accelFallback' }
  }

  return {
    samples,
    trackPoints,
    bounds,
    trackSpeeds,
    trackCts,
    speedBounds,
    positionAt: (cts: number) => positionAt(samples, trackPoints, cts),
    speedAt: (cts: number, smoothingMs = DEFAULT_SPEED_SMOOTHING_MS) =>
      gaussianSmoothedValueAt(samples, cts, Math.max(MIN_SMOOTHING_MS, smoothingMs), (s) => s.speed2D),
    hasImuData: accel.length > 0,
    defaultAxisCalibration,
    gForceAt,
    gForceHistoryAt,
    rollAngleAt,
    sessionStatsAt
  }
}
