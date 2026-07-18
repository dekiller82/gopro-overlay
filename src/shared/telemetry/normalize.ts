import type { ImuSample, TelemetryData, TelemetrySample } from '../types'

interface RawStream {
  samples?: { cts: number; value: number[] }[]
}

interface RawGpsStream {
  'device name': string
  streams?: Record<string, RawStream>
}

export type RawGoProTelemetry = Record<string | number, RawGpsStream>

export interface GpsTelemetryResult {
  deviceName: string
  gpsStream: 'GPS5' | 'GPS9'
  samples: TelemetrySample[]
  videoDurationMs: number
}

/**
 * gopro-telemetry with `stream: 'GPS'` yields either a GPS5 or GPS9 stream per
 * device. Both share the same first 5 value indices: lat, lon, alt, speed2D, speed3D.
 */
export function normalizeGpsTelemetry(raw: RawGoProTelemetry, videoDurationMs: number): GpsTelemetryResult {
  for (const key of Object.keys(raw)) {
    const device = raw[key]
    const streams = device.streams ?? {}
    const gpsStream = (streams.GPS9 ? 'GPS9' : streams.GPS5 ? 'GPS5' : null) as 'GPS5' | 'GPS9' | null
    if (!gpsStream) continue

    const rawSamples = streams[gpsStream]?.samples ?? []
    const samples: TelemetrySample[] = rawSamples
      .filter((s) => Array.isArray(s.value) && s.value.length >= 5)
      .map((s) => ({
        cts: s.cts,
        lat: s.value[0],
        lon: s.value[1],
        altitude: s.value[2],
        speed2D: s.value[3],
        speed3D: s.value[4]
      }))

    if (samples.length === 0) continue

    return {
      deviceName: device['device name'] ?? 'Unknown device',
      gpsStream,
      samples,
      videoDurationMs
    }
  }

  throw new Error('No GPS telemetry (GPS5/GPS9) found in this file')
}

export interface ImuTelemetryResult {
  accel: ImuSample[]
  gyro: ImuSample[]
  gravity: ImuSample[]
}

// GoPro's native ACCL/GYRO rate is ~200Hz -- far more than any visual widget needs and would
// otherwise bloat the telemetry cache JSON for a long session. Time-based (not stride-based)
// decimation so it doesn't need to know or guess the native rate.
const MAX_IMU_SAMPLE_RATE_HZ = 25
const MIN_IMU_SAMPLE_GAP_MS = 1000 / MAX_IMU_SAMPLE_RATE_HZ

function decimateImuSamples(samples: ImuSample[]): ImuSample[] {
  if (samples.length === 0) return []
  const kept: ImuSample[] = [samples[0]]
  let lastKeptCts = samples[0].cts
  for (let i = 1; i < samples.length; i++) {
    if (samples[i].cts - lastKeptCts >= MIN_IMU_SAMPLE_GAP_MS) {
      kept.push(samples[i])
      lastKeptCts = samples[i].cts
    }
  }
  return kept
}

function extractImuStream(stream: RawStream | undefined): ImuSample[] {
  const rawSamples = stream?.samples ?? []
  const samples: ImuSample[] = rawSamples
    .filter((s) => Array.isArray(s.value) && s.value.length >= 3)
    .map((s) => ({ cts: s.cts, x: s.value[0], y: s.value[1], z: s.value[2] }))
  return decimateImuSamples(samples)
}

/**
 * Accelerometer (ACCL) and gyroscope (GYRO) are present on every GoPro model tested (Hero5/7/11);
 * the gravity vector (GRAV) only exists on newer cameras/firmware and is legitimately absent
 * otherwise -- callers must not assume it's there. Raw axis order is camera-body-relative and
 * inconsistent across camera models (confirmed by extracting real samples from all three test
 * fixtures during design -- Hero5/11 read as vertical/lateral/longitudinal at rest, Hero7 only
 * exposes generic "z,x,y" labels) -- axis semantics are resolved separately by
 * shared/telemetry/imuCalibration.ts, not here.
 */
export function normalizeImuTelemetry(raw: RawGoProTelemetry): ImuTelemetryResult {
  for (const key of Object.keys(raw)) {
    const device = raw[key]
    const streams = device.streams ?? {}
    const accel = extractImuStream(streams.ACCL)
    const gyro = extractImuStream(streams.GYRO)
    const gravity = extractImuStream(streams.GRAV)
    if (accel.length > 0 || gyro.length > 0 || gravity.length > 0) {
      return { accel, gyro, gravity }
    }
  }
  return { accel: [], gyro: [], gravity: [] }
}

/** Combines GPS + IMU normalization into the full TelemetryData shape parseGoProTelemetry returns. */
export function normalizeTelemetry(raw: RawGoProTelemetry, videoDurationMs: number): TelemetryData {
  const gps = normalizeGpsTelemetry(raw, videoDurationMs)
  const imu = normalizeImuTelemetry(raw)
  return { ...gps, ...imu }
}
