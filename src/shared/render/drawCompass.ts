import { FORMULA1_BOLD } from './fonts'
import { drawOutlinedText, fillRoundedRect, fitFontSizePx, scaleToRect, type Canvas2DLike, type Rect } from './canvas2d'

export interface CompassStyle {
  label: string
  color: string
  labelColor: string
  textOutlineWidth: number
  textOutlineColor: string
  backgroundColor: string
  backgroundOpacity: number
  cornerRadius: number
  smoothingMs: number
}

export const DEFAULT_COMPASS_STYLE: CompassStyle = {
  label: 'HEADING',
  color: '#ffffff',
  labelColor: '#9a9aa4',
  textOutlineWidth: 2,
  textOutlineColor: '#000000',
  backgroundColor: '#0a0a10',
  backgroundOpacity: 0.72,
  cornerRadius: 12,
  smoothingMs: 400
}

export interface DrawCompassOptions {
  rect: Rect
  style: CompassStyle
  /** Degrees, 0-360 (0=N, 90=E, ...) -- resolved by the caller via sampler.headingAt. */
  headingDeg: number
}

const FONT_STACK = 'ui-sans-serif, -apple-system, "Segoe UI", Roboto, sans-serif'
const COMPASS_FONT_STACK = `"${FORMULA1_BOLD}", ${FONT_STACK}`
const COMPASS_POINTS = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW']

function compassPointLabel(deg: number): string {
  const idx = Math.round(deg / 22.5) % COMPASS_POINTS.length
  return COMPASS_POINTS[idx]
}

function formatHeading(deg: number): string {
  const rounded = Math.round(deg) % 360
  return `${String(rounded).padStart(3, '0')}° ${compassPointLabel(rounded)}`
}

/**
 * A digital heading readout ("047° NE") derived from GPS course-over-ground -- GoPro cameras have
 * no magnetometer, so this is direction-of-travel, not the camera's own facing direction, and reads
 * meaninglessly while stationary (see sampleAt.ts's headingAt/computeHeadingComponents).
 */
export function drawCompass(ctx: Canvas2DLike, options: DrawCompassOptions): void {
  const { rect, style, headingDeg } = options

  if (style.backgroundOpacity > 0) {
    ctx.save()
    ctx.globalAlpha = style.backgroundOpacity
    ctx.fillStyle = style.backgroundColor
    fillRoundedRect(ctx, rect.x, rect.y, rect.w, rect.h, scaleToRect(style.cornerRadius, rect))
    ctx.restore()
  }

  const cx = rect.x + rect.w / 2
  const outlineWidth = scaleToRect(style.textOutlineWidth, rect)
  const hasLabel = Boolean(style.label)
  const labelH = hasLabel ? rect.h * 0.32 : 0

  if (hasLabel) {
    ctx.save()
    ctx.textAlign = 'center'
    ctx.textBaseline = 'alphabetic'
    fitFontSizePx(ctx, style.label, rect.w * 0.9, labelH * 0.75, '700', COMPASS_FONT_STACK)
    drawOutlinedText(ctx, style.label.toUpperCase(), cx, rect.y + labelH * 0.72, style.labelColor, outlineWidth, style.textOutlineColor)
    ctx.restore()
  }

  const valueText = formatHeading(headingDeg)
  const valueAreaH = rect.h - labelH
  ctx.save()
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  fitFontSizePx(ctx, '000° WSW', rect.w * 0.85, valueAreaH * 0.6, '700', COMPASS_FONT_STACK)
  drawOutlinedText(ctx, valueText, cx, rect.y + labelH + valueAreaH / 2, style.color, outlineWidth, style.textOutlineColor)
  ctx.restore()
}
