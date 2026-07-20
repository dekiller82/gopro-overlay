export interface DeliveryPreset {
  id: string
  label: string
  description: string
  /** Output is scaled down to fit within maxWidth x maxHeight (never upscaled past the source's own
   *  resolution) -- same aspect ratio as the source, no cropping. A true vertical/social crop is a
   *  separate, not-yet-built feature; this only changes resolution/bitrate/codec target. */
  maxWidth: number
  maxHeight: number
  videoBitrateKbps: number
  audioBitrateKbps: number
}

/** Not a real preset in the list below -- selecting this in the UI means "use the existing
 *  quality-based (CRF) export exactly as before," so a user who never touches this control gets
 *  byte-for-byte the same export they always have. */
export const SOURCE_QUALITY_PRESET_ID = 'source'

// Bitrate figures are widely-cited platform delivery guidance (not measured on this app's own
// output) -- reasonable starting points for "will this look right after the platform's own
// recompression," not a guarantee of any particular file size.
export const DELIVERY_PRESETS: DeliveryPreset[] = [
  {
    id: 'youtube-4k',
    label: 'YouTube (4K)',
    description: 'Up to 3840x2160, ~45 Mbps video',
    maxWidth: 3840,
    maxHeight: 2160,
    videoBitrateKbps: 45000,
    audioBitrateKbps: 384
  },
  {
    id: 'youtube-1080p',
    label: 'YouTube (1080p)',
    description: 'Up to 1920x1080, ~8 Mbps video',
    maxWidth: 1920,
    maxHeight: 1080,
    videoBitrateKbps: 8000,
    audioBitrateKbps: 384
  },
  {
    id: 'social-1080p',
    label: 'Instagram / TikTok / Reels',
    description: 'Up to 1920x1080, ~8 Mbps video (the platform re-compresses further on upload)',
    maxWidth: 1920,
    maxHeight: 1080,
    videoBitrateKbps: 8000,
    audioBitrateKbps: 128
  },
  {
    id: 'twitter-x',
    label: 'Twitter / X',
    description: 'Up to 1280x720, ~5 Mbps video',
    maxWidth: 1280,
    maxHeight: 720,
    videoBitrateKbps: 5000,
    audioBitrateKbps: 128
  }
]

export function findDeliveryPreset(id: string): DeliveryPreset | null {
  return DELIVERY_PRESETS.find((p) => p.id === id) ?? null
}

/** Resolves a preset's actual output width/height for a given source resolution -- uniform
 *  downscale to fit within the preset's max box (never upscales past source), rounded to the
 *  nearest even number since 4:2:0 chroma subsampling (yuv420p, used by every encoder here) needs
 *  even dimensions. */
export function resolvePresetDimensions(preset: DeliveryPreset, sourceWidth: number, sourceHeight: number): { width: number; height: number } {
  const scale = Math.min(1, preset.maxWidth / sourceWidth, preset.maxHeight / sourceHeight)
  const width = Math.max(2, Math.round((sourceWidth * scale) / 2) * 2)
  const height = Math.max(2, Math.round((sourceHeight * scale) / 2) * 2)
  return { width, height }
}
