import { describe, expect, it } from 'vitest'
import type { TelemetrySample } from '../types'
import { computeLapSectors, getSectorStateAt } from './sectors'

function makeSample(cts: number, lat: number, lon: number): TelemetrySample {
  return { cts, lat, lon, altitude: 0, speed2D: 0, speed3D: 0 }
}

/** Straight-line, constant-speed samples from `startCts` to `endCts` -- equal distance per step,
 *  so the 1/3 and 2/3 arc-length cut points land at predictable sample indices/times. `startLon`
 *  must continue from wherever the previous lap's samples left off, or splicing two independently
 *  zero-based lap segments together creates a fake discontinuous "teleport" at the join that
 *  dominates the arc-length total and throws sector detection off (a real bug this test helper
 *  itself hit once -- lon must be a single continuous trajectory across concatenated laps). */
function makeStraightLap(startCts: number, endCts: number, stepMs: number, lonPerStep: number, startLon = 0): TelemetrySample[] {
  const samples: TelemetrySample[] = []
  let lon = startLon
  for (let cts = startCts; cts <= endCts; cts += stepMs) {
    samples.push(makeSample(cts, 51.5, lon))
    lon += lonPerStep
  }
  return samples
}

describe('computeLapSectors', () => {
  it('divides a constant-speed lap into three roughly equal-distance/time sectors', () => {
    // 30 steps of 1000ms each, 0..30000ms, constant speed -> thirds should land near 10000/20000.
    const samples = makeStraightLap(0, 30000, 1000, 0.0001)
    const crossings = [0, 30000]
    const boundaries = computeLapSectors(samples, crossings)
    expect(boundaries.length).toBe(1)
    const b = boundaries[0]
    expect(b.lapNumber).toBe(1)
    expect(b.lapStartCts).toBe(0)
    expect(b.lapEndCts).toBe(30000)
    expect(b.s1Cts).toBeCloseTo(10000, -3)
    expect(b.s2Cts).toBeCloseTo(20000, -3)
  })

  it('produces one boundary set per completed lap, none for an incomplete trailing lap', () => {
    const lap1 = makeStraightLap(0, 30000, 1000, 0.0001)
    const lap2 = makeStraightLap(30000, 60000, 1000, 0.0001, 0.003)
    const trailingPartial = makeStraightLap(60000, 70000, 1000, 0.0001, 0.006) // no closing crossing at 70000+
    const samples = [...lap1, ...lap2.slice(1), ...trailingPartial.slice(1)]
    const crossings = [0, 30000, 60000] // no crossing closing the partial lap
    const boundaries = computeLapSectors(samples, crossings)
    expect(boundaries.length).toBe(2) // only the two fully-closed laps
    expect(boundaries.map((b) => b.lapNumber)).toEqual([1, 2])
  })

  it('handles too few samples in a lap without throwing', () => {
    expect(computeLapSectors([], [0, 30000])).toEqual([])
    expect(computeLapSectors([makeSample(0, 0, 0)], [0, 30000])).toEqual([])
  })
})

describe('getSectorStateAt', () => {
  const lap1 = makeStraightLap(0, 30000, 1000, 0.0001) // sectors at ~10000/20000
  const lap2 = makeStraightLap(30000, 66000, 1000, 0.0001, 0.003) // 36s lap, sectors at ~12000/24000 into it -> 42000/54000 absolute
  const samples = [...lap1, ...lap2.slice(1)]
  const crossings = [0, 30000, 66000]
  const boundaries = computeLapSectors(samples, crossings)

  it('resolves sector 1/2/3 within an in-progress-viewed lap', () => {
    expect(getSectorStateAt(boundaries, 5000).currentSector).toBe(1)
    expect(getSectorStateAt(boundaries, 15000).currentSector).toBe(2)
    expect(getSectorStateAt(boundaries, 25000).currentSector).toBe(3)
  })

  it('reports elapsed time within the current sector, not from the lap start', () => {
    const state = getSectorStateAt(boundaries, 15000) // ~5s into sector 2 (starts ~10000)
    expect(state.currentSector).toBe(2)
    expect(state.currentSectorElapsedMs).toBeCloseTo(5000, -3)
  })

  it('surfaces both S1 and S2 of the current in-progress lap once sector 3 begins', () => {
    const state = getSectorStateAt(boundaries, 25000) // sector 3 of lap 1
    expect(state.currentSector).toBe(3)
    expect(state.currentLapS1Ms).toBeCloseTo(10000, -3)
    expect(state.currentLapS2Ms).toBeCloseTo(10000, -3)
  })

  it('reports no completed lap yet, but does surface the current (in-progress) lap\'s own just-finished sector 1', () => {
    const state = getSectorStateAt(boundaries, 15000) // mid-sector-2 of lap 1 -- its own S1 just finished
    expect(state.lastLap).toBeNull()
    expect(state.currentLapS1Ms).toBeCloseTo(10000, -3)
    expect(state.isCurrentLapS1Best).toBe(true) // only data point so far -- automatically best
    expect(state.bestS1Ms).toBeCloseTo(10000, -3)
    // Sector 2 hasn't finished yet even for the current lap, and no lap has closed at all.
    expect(state.currentLapS2Ms).toBeNull()
    expect(state.bestS2Ms).toBeNull()
    expect(state.bestS3Ms).toBeNull()
  })

  it('reports the completed lap 1 sector times right after it finishes, without leaking lap 2', () => {
    const state = getSectorStateAt(boundaries, 30500) // just after lap 1 closes
    expect(state.lastLap).not.toBeNull()
    expect(state.lastLap?.lapNumber).toBe(1)
    expect(state.lastLap?.s1Ms).toBeCloseTo(10000, -3)
    expect(state.lastLap?.s2Ms).toBeCloseTo(10000, -3)
    expect(state.lastLap?.s3Ms).toBeCloseTo(10000, -3)
    expect(state.isLastS1Best).toBe(true) // only lap so far -- automatically best
  })

  it('tracks per-sector session bests independently across laps and flags whether the last lap tied them', () => {
    const state = getSectorStateAt(boundaries, 66500) // just after lap 2 closes
    expect(state.lastLap?.lapNumber).toBe(2)
    // lap1 sectors ~10000/10000/10000, lap2 (36s lap) sectors ~12000/12000/12000 -- lap1 faster in every sector.
    expect(state.bestS1Ms).toBeCloseTo(10000, -3)
    expect(state.isLastS1Best).toBe(false) // lap 2's own S1 (~12000) is slower than lap 1's best
  })

  it('handles zero boundaries (no completed lap yet) without throwing', () => {
    const state = getSectorStateAt([], 5000)
    expect(state.currentSector).toBe(1)
    expect(state.currentSectorElapsedMs).toBe(0)
    expect(state.lastLap).toBeNull()
  })
})

describe('out-lap handling (video starts before the driver ever reaches the line)', () => {
  // Realistic: first crossing isn't at cts=0 -- there's a real lead-in ("out lap") before it.
  // 5s lead-in at constant speed -> its own thirds land near ~1667/3333, so both query points
  // below (200, 1000) stay safely within sector 1 -- comparing elapsed time only makes sense
  // within the same sector, since each sector's elapsed resets to 0 at its own start.
  const outLap = makeStraightLap(0, 5000, 500, 0.0001) // no crossing at its start
  const outLapEndLon = 0.0001 * (5000 / 500) // continuing the trajectory exactly, not a guessed value
  const lap1 = makeStraightLap(5000, 35000, 1000, 0.0001, outLapEndLon) // 30s genuine timed lap, sectors ~10000/20000 into it
  const samples = [...outLap, ...lap1.slice(1)]
  const crossings = [5000, 35000]
  const boundaries = computeLapSectors(samples, crossings)

  it('still resolves a live current sector + elapsed time during the out-lap -- the bug report this guards against', () => {
    // Previously this was frozen at sector 1 / elapsed 0 for the whole out-lap, since no boundary
    // entry existed for the segment before the first crossing.
    const early = getSectorStateAt(boundaries, 200)
    expect(early.currentSector).toBe(1)
    expect(early.currentSectorElapsedMs).toBeCloseTo(200, -2)

    const later = getSectorStateAt(boundaries, 1000)
    expect(later.currentSector).toBe(1) // still sector 1 -- a valid same-sector comparison
    expect(later.currentSectorElapsedMs).toBeGreaterThan(early.currentSectorElapsedMs)
  })

  it('does not count the out-lap itself as a completed timed lap once it ends', () => {
    // cts=5000 is exactly when the out-lap ends (the first crossing) -- no genuine lap has
    // finished yet, so lastLap/bests must still be null, matching lapTimesFromCrossings excluding it.
    const state = getSectorStateAt(boundaries, 5001)
    expect(state.lastLap).toBeNull()
    expect(state.bestS1Ms).toBeNull()
  })

  it('reports the first genuine timed lap normally once it completes', () => {
    // Precision here is deliberately loose -- exact even-split arithmetic is already covered by
    // the "divides a constant-speed lap into three roughly equal-distance/time sectors" test
    // above with cleaner data; this test's purpose is the out-lap boundary, not re-verifying that.
    const state = getSectorStateAt(boundaries, 35500)
    expect(state.lastLap?.lapNumber).toBe(1)
    expect(state.lastLap?.s1Ms).toBeCloseTo(10000, -4)
    expect(state.lastLap?.s2Ms).toBeCloseTo(10000, -4)
    expect((state.lastLap?.s1Ms ?? 0) + (state.lastLap?.s2Ms ?? 0) + (state.lastLap?.s3Ms ?? 0)).toBe(30000)
  })
})

describe('recording cuts off mid-lap after a completed lap (the "sector 3 never ends" bug report)', () => {
  // Lap 1 completes normally (0 -> 30000). The recording then continues into a NEW lap that never
  // reaches a closing crossing (e.g. the camera was turned off mid-lap) -- only ONE crossing at
  // 30000 exists for this second lap, so it has no boundary entry at all.
  const lap1 = makeStraightLap(0, 30000, 1000, 0.0001)
  const trailingPartial = makeStraightLap(30000, 50000, 1000, 0.0001, 0.003) // no closing crossing
  const samples = [...lap1, ...trailingPartial.slice(1)]
  const crossings = [0, 30000]
  const boundaries = computeLapSectors(samples, crossings)

  it('resets to sector 1 (counting from the last known crossing) instead of continuing to grow from the previous lap\'s stale sector-2 cutoff', () => {
    // Before the fix, this kept using lap 1's own s2Cts (~20000) as the sector-2/3 divider even
    // though we're now well into a completely different, still-open lap -- so "sector 3" elapsed
    // time never reset and just grew forever, looking like it "never ends".
    const state = getSectorStateAt(boundaries, 40000) // 10s into the new, unclosed lap
    expect(state.currentSector).toBe(1)
    expect(state.currentSectorElapsedMs).toBeCloseTo(10000, -3)
  })

  it('still reports lap 1 as the last completed lap throughout the open trailing lap', () => {
    const state = getSectorStateAt(boundaries, 45000)
    expect(state.lastLap?.lapNumber).toBe(1)
  })
})
