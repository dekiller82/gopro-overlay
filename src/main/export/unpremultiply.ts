/**
 * @napi-rs/canvas's `Canvas.data()` returns premultiplied-alpha RGBA (verified empirically:
 * rgba(255,255,255,0.25) reads back as ~63,63,63,63, not 255,255,255,63). ffmpeg's `rgba`
 * pix_fmt expects straight alpha, so semi-transparent pixels (glow, opacity, anti-aliased
 * edges) would composite too dark without this conversion. Mutates `buffer` in place.
 */
export function unpremultiplyRgbaInPlace(buffer: Buffer | Uint8Array): void {
  for (let i = 0; i < buffer.length; i += 4) {
    const a = buffer[i + 3]
    if (a === 0 || a === 255) continue
    const factor = 255 / a
    buffer[i] = Math.min(255, Math.round(buffer[i] * factor))
    buffer[i + 1] = Math.min(255, Math.round(buffer[i + 1] * factor))
    buffer[i + 2] = Math.min(255, Math.round(buffer[i + 2] * factor))
  }
}
