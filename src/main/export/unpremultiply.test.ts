import { describe, expect, it } from 'vitest'
import { unpremultiplyRgbaInPlace } from './unpremultiply'

describe('unpremultiplyRgbaInPlace', () => {
  it('leaves fully opaque and fully transparent pixels unchanged', () => {
    const buf = Buffer.from([255, 0, 0, 255, 0, 0, 0, 0])
    unpremultiplyRgbaInPlace(buf)
    expect([...buf]).toEqual([255, 0, 0, 255, 0, 0, 0, 0])
  })

  it('recovers straight alpha from empirically-observed premultiplied output', () => {
    // Measured from @napi-rs/canvas: rgba(0,0,255,0.5) -> premultiplied (0,0,127,127)
    const buf = Buffer.from([0, 0, 127, 127])
    unpremultiplyRgbaInPlace(buf)
    expect(buf[0]).toBe(0)
    expect(buf[1]).toBe(0)
    expect(buf[2]).toBeGreaterThanOrEqual(253)
    expect(buf[3]).toBe(127)
  })

  it('recovers straight alpha at 25% opacity', () => {
    // Measured: rgba(255,255,255,0.25) -> premultiplied (63,63,63,63)
    const buf = Buffer.from([63, 63, 63, 63])
    unpremultiplyRgbaInPlace(buf)
    expect(buf[0]).toBeGreaterThanOrEqual(250)
    expect(buf[1]).toBeGreaterThanOrEqual(250)
    expect(buf[2]).toBeGreaterThanOrEqual(250)
    expect(buf[3]).toBe(63)
  })

  it('clamps rather than overflowing when factor rounding pushes past 255', () => {
    const buf = Buffer.from([254, 254, 254, 254])
    unpremultiplyRgbaInPlace(buf)
    expect(buf[0]).toBeLessThanOrEqual(255)
    expect(buf[1]).toBeLessThanOrEqual(255)
    expect(buf[2]).toBeLessThanOrEqual(255)
  })

  it('processes multiple pixels independently', () => {
    const buf = Buffer.from([255, 0, 0, 255, 63, 63, 63, 63, 0, 0, 0, 0])
    unpremultiplyRgbaInPlace(buf)
    expect(buf[0]).toBe(255)
    expect(buf[4]).toBeGreaterThanOrEqual(250)
    expect(buf[8]).toBe(0)
    expect(buf[11]).toBe(0)
  })
})
