import { describe, expect, it } from 'vitest'
import { DELIVERY_PRESETS, findDeliveryPreset, resolvePresetDimensions } from './deliveryPresets'

describe('resolvePresetDimensions', () => {
  const youtube1080p = findDeliveryPreset('youtube-1080p')!

  it('downscales a 4K source to fit within the preset box, preserving aspect ratio', () => {
    const result = resolvePresetDimensions(youtube1080p, 3840, 2160)
    expect(result).toEqual({ width: 1920, height: 1080 })
  })

  it('never upscales past the source resolution', () => {
    const result = resolvePresetDimensions(youtube1080p, 1280, 720)
    expect(result).toEqual({ width: 1280, height: 720 })
  })

  it('scales down uniformly for a non-16:9 source, limited by whichever dimension hits the cap first', () => {
    // 4:3 source wider box test -- height (1440) would exceed maxHeight (1080) before width does.
    const result = resolvePresetDimensions(youtube1080p, 2560, 1920)
    expect(result.height).toBe(1080)
    expect(result.width).toBe(1440) // 2560 * (1080/1920) = 1440
  })

  it('always rounds to an even width/height (required for yuv420p)', () => {
    const result = resolvePresetDimensions(youtube1080p, 3841, 2161)
    expect(result.width % 2).toBe(0)
    expect(result.height % 2).toBe(0)
  })

  it('every listed preset resolves to a sane, even, non-zero box for a real 4K source', () => {
    for (const preset of DELIVERY_PRESETS) {
      const { width, height } = resolvePresetDimensions(preset, 3840, 2160)
      expect(width).toBeGreaterThan(0)
      expect(height).toBeGreaterThan(0)
      expect(width % 2).toBe(0)
      expect(height % 2).toBe(0)
    }
  })
})

describe('findDeliveryPreset', () => {
  it('returns null for an unknown id', () => {
    expect(findDeliveryPreset('not-a-real-preset')).toBeNull()
  })

  it('finds a real preset by id', () => {
    expect(findDeliveryPreset('youtube-4k')?.label).toBe('YouTube (4K)')
  })
})
