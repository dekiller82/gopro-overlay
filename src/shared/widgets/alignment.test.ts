import { describe, expect, it } from 'vitest'
import { alignedX, alignedY, computeSnap } from './alignment'

describe('alignedX', () => {
  it('left aligns to the padding fraction exactly', () => {
    expect(alignedX(0.2, 'left', 0.05)).toBe(0.05)
  })

  it('centers the widget horizontally, accounting for its own width', () => {
    expect(alignedX(0.2, 'centerH', 0.05)).toBeCloseTo(0.4, 6) // (1 - 0.2) / 2
  })

  it('right aligns so the widget\'s own right edge sits at (1 - padding)', () => {
    const x = alignedX(0.2, 'right', 0.05)
    expect(x + 0.2).toBeCloseTo(0.95, 6)
  })

  it('padding of 0 puts left/right flush against the frame edges', () => {
    expect(alignedX(0.3, 'left', 0)).toBe(0)
    expect(alignedX(0.3, 'right', 0)).toBeCloseTo(0.7, 6)
  })
})

describe('alignedY', () => {
  it('top aligns to the padding fraction exactly', () => {
    expect(alignedY(0.15, 'top', 0.02)).toBe(0.02)
  })

  it('centers the widget vertically, accounting for its own height', () => {
    expect(alignedY(0.4, 'centerV', 0.02)).toBeCloseTo(0.3, 6) // (1 - 0.4) / 2
  })

  it('bottom aligns so the widget\'s own bottom edge sits at (1 - padding)', () => {
    const y = alignedY(0.1, 'bottom', 0.03)
    expect(y + 0.1).toBeCloseTo(0.97, 6)
  })
})

describe('computeSnap', () => {
  const frameWidth = 1000
  const frameHeight = 500
  const pixelW = 100
  const pixelH = 50
  const paddingFraction = 0.02 // -> 0.02 * min(1000,500) = 10px

  it('snaps to the left edge (with padding) when close', () => {
    const result = computeSnap(12, 200, pixelW, pixelH, frameWidth, frameHeight, paddingFraction)
    expect(result.x).toBe(10) // paddingPx
    expect(result.guideXPx).toBe(10)
  })

  it('snaps to the horizontal center when close', () => {
    const centerX = (frameWidth - pixelW) / 2 // 450
    const result = computeSnap(centerX + 3, 200, pixelW, pixelH, frameWidth, frameHeight, paddingFraction)
    expect(result.x).toBe(centerX)
    expect(result.guideXPx).toBe(frameWidth / 2) // guide at the frame's centerline, not the widget's offset edge
  })

  it('snaps to the right edge (with padding) when close', () => {
    const rightX = frameWidth - pixelW - 10 // 890
    const result = computeSnap(rightX - 2, 200, pixelW, pixelH, frameWidth, frameHeight, paddingFraction)
    expect(result.x).toBe(rightX)
    expect(result.guideXPx).toBe(frameWidth - 10)
  })

  it('snaps to the vertical center when close', () => {
    const centerY = (frameHeight - pixelH) / 2 // 225
    const result = computeSnap(200, centerY - 4, pixelW, pixelH, frameWidth, frameHeight, paddingFraction)
    expect(result.y).toBe(centerY)
    expect(result.guideYPx).toBe(frameHeight / 2)
  })

  it('does not snap when far from every candidate on either axis', () => {
    const result = computeSnap(300, 300, pixelW, pixelH, frameWidth, frameHeight, paddingFraction)
    expect(result.x).toBe(300)
    expect(result.y).toBe(300)
    expect(result.guideXPx).toBeNull()
    expect(result.guideYPx).toBeNull()
  })

  it('snaps X and Y independently -- one axis can snap while the other does not', () => {
    const centerX = (frameWidth - pixelW) / 2
    const result = computeSnap(centerX + 1, 300, pixelW, pixelH, frameWidth, frameHeight, paddingFraction)
    expect(result.x).toBe(centerX)
    expect(result.guideXPx).not.toBeNull()
    expect(result.y).toBe(300)
    expect(result.guideYPx).toBeNull()
  })

  it('respects a custom snap threshold', () => {
    const centerX = (frameWidth - pixelW) / 2
    const justOutsideDefault = centerX + 9 // default threshold is 8px
    const noSnap = computeSnap(justOutsideDefault, 300, pixelW, pixelH, frameWidth, frameHeight, paddingFraction)
    expect(noSnap.guideXPx).toBeNull()

    const widerThreshold = computeSnap(justOutsideDefault, 300, pixelW, pixelH, frameWidth, frameHeight, paddingFraction, 12)
    expect(widerThreshold.guideXPx).not.toBeNull()
  })

  it('scales padding by the frame\'s shorter dimension for both axes, so visual padding is equal on all sides', () => {
    // A wide 1000x500 frame -- padding should be the SAME pixel value (10px) whether it's applied
    // to the x or y axis, not frameWidth*0.02=20px horizontally vs frameHeight*0.02=10px vertically.
    const leftSnap = computeSnap(11, 300, pixelW, pixelH, frameWidth, frameHeight, paddingFraction)
    const topSnap = computeSnap(300, 11, pixelW, pixelH, frameWidth, frameHeight, paddingFraction)
    expect(leftSnap.x).toBe(10)
    expect(topSnap.y).toBe(10)
  })
})
