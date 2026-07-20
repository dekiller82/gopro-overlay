import { describe, expect, it } from 'vitest'
import { chromiumFeaturesFor } from './chromiumFeatures'

describe('chromiumFeaturesFor', () => {
  it('enables Linux VA-API hardware decode in addition to the baseline HEVC feature', () => {
    expect(chromiumFeaturesFor('linux')).toEqual([
      'PlatformHEVCDecoderSupport',
      'AcceleratedVideoDecodeLinuxZeroCopyGL',
      'AcceleratedVideoDecodeLinuxGL'
    ])
  })

  it('only enables the baseline HEVC feature on Windows', () => {
    expect(chromiumFeaturesFor('win32')).toEqual(['PlatformHEVCDecoderSupport'])
  })

  it('only enables the baseline HEVC feature on macOS', () => {
    expect(chromiumFeaturesFor('darwin')).toEqual(['PlatformHEVCDecoderSupport'])
  })
})
