import { describe, expect, it } from 'vitest'
import { DEFAULT_GPS_STYLE, effectiveGpsBounds } from './drawGpsWidget'

const FULL_TRACK_BOUNDS = { minX: -500, maxX: 500, minY: -300, maxY: 300 }
const DOT_POSITION = { x: 120, y: -40 }

describe('effectiveGpsBounds', () => {
  it("'full' mode (default) returns the track's own bounds unchanged", () => {
    const style = { ...DEFAULT_GPS_STYLE, viewMode: 'full' as const }
    expect(effectiveGpsBounds(style, FULL_TRACK_BOUNDS, DOT_POSITION)).toEqual(FULL_TRACK_BOUNDS)
  })

  it("'window' mode returns a square centered on the current position, sized by windowRadiusM", () => {
    const style = { ...DEFAULT_GPS_STYLE, viewMode: 'window' as const, windowRadiusM: 25 }
    const bounds = effectiveGpsBounds(style, FULL_TRACK_BOUNDS, DOT_POSITION)
    expect(bounds).toEqual({ minX: 95, maxX: 145, minY: -65, maxY: -15 })
    // Genuinely a square (equal spans), not derived from the track's own (different) aspect ratio.
    expect(bounds.maxX - bounds.minX).toBe(bounds.maxY - bounds.minY)
  })

  it("'window' mode ignores the track's own bounds entirely -- only depends on the current position", () => {
    const style = { ...DEFAULT_GPS_STYLE, viewMode: 'window' as const, windowRadiusM: 10 }
    const withOneTrack = effectiveGpsBounds(style, FULL_TRACK_BOUNDS, DOT_POSITION)
    const withADifferentTrack = effectiveGpsBounds(style, { minX: -5000, maxX: 5000, minY: -5000, maxY: 5000 }, DOT_POSITION)
    expect(withOneTrack).toEqual(withADifferentTrack)
  })

  it('a larger windowRadiusM produces a proportionally larger window', () => {
    const narrow = effectiveGpsBounds({ ...DEFAULT_GPS_STYLE, viewMode: 'window', windowRadiusM: 10 }, FULL_TRACK_BOUNDS, DOT_POSITION)
    const wide = effectiveGpsBounds({ ...DEFAULT_GPS_STYLE, viewMode: 'window', windowRadiusM: 50 }, FULL_TRACK_BOUNDS, DOT_POSITION)
    expect(wide.maxX - wide.minX).toBe(5 * (narrow.maxX - narrow.minX))
  })
})
