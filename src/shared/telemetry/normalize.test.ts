import { describe, expect, it } from 'vitest'
import { normalizeGpsTelemetry, type RawGoProTelemetry } from './normalize'

function rawWithGps5Samples(samples: { cts: number; value: number[] }[]): RawGoProTelemetry {
  return {
    1: {
      'device name': 'Test Camera',
      streams: { GPS5: { samples } }
    }
  }
}

describe('normalizeGpsTelemetry', () => {
  it('keeps real GPS fixes', () => {
    const result = normalizeGpsTelemetry(
      rawWithGps5Samples([
        { cts: 0, value: [51.5, -0.12, 35, 10, 10] },
        { cts: 1000, value: [51.5001, -0.1201, 35, 12, 12] }
      ]),
      2000
    )
    expect(result.samples).toHaveLength(2)
    expect(result.samples[0].lat).toBe(51.5)
  })

  // Confirmed against a real clip whose GPS module never acquired a lock for its entire ~4.8min
  // duration: gopro-telemetry still returns a structurally valid GPS5 stream, but every sample's
  // lat/lon is exactly (0, 0) -- GoPro's own convention for "no fix yet". Before this fix, that
  // silently produced a "successful" import with a degenerate single-point track instead of the
  // clear "no GPS" error this file already has for the totally-missing-stream case.
  it('throws a clear error when every sample is a (0, 0) no-fix reading', () => {
    expect(() =>
      normalizeGpsTelemetry(
        rawWithGps5Samples([
          { cts: 0, value: [0, 0, -17, 0, 0] },
          { cts: 1000, value: [0, 0, -17, 0, 0] },
          { cts: 2000, value: [0, 0, -17, 0, 0] }
        ]),
        3000
      )
    ).toThrow(/GPS/)
  })

  it('filters out only the no-fix samples when GPS lock is acquired partway through', () => {
    const result = normalizeGpsTelemetry(
      rawWithGps5Samples([
        { cts: 0, value: [0, 0, -17, 0, 0] },
        { cts: 1000, value: [0, 0, -17, 0, 0] },
        { cts: 2000, value: [51.5, -0.12, 35, 5, 5] },
        { cts: 3000, value: [51.5001, -0.1201, 35, 8, 8] }
      ]),
      4000
    )
    expect(result.samples).toHaveLength(2)
    expect(result.samples[0].cts).toBe(2000)
  })

  it('falls through to a second device if the first has no usable GPS', () => {
    const raw: RawGoProTelemetry = {
      1: { 'device name': 'No fix', streams: { GPS5: { samples: [{ cts: 0, value: [0, 0, 0, 0, 0] }] } } },
      2: { 'device name': 'Good fix', streams: { GPS5: { samples: [{ cts: 0, value: [40, 10, 5, 1, 1] }] } } }
    }
    const result = normalizeGpsTelemetry(raw, 1000)
    expect(result.deviceName).toBe('Good fix')
  })

  it('throws when no GPS stream exists at all', () => {
    expect(() => normalizeGpsTelemetry({ 1: { 'device name': 'x', streams: {} } }, 1000)).toThrow(/GPS/)
  })
})
