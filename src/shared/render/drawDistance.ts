import { formatDistance, type SpeedUnit } from '../units'
import { FORMULA1_BOLD } from './fonts'
import { drawOutlinedText, fillRoundedRect, fitFontSizePx, scaleToRect, type Canvas2DLike, type Rect } from './canvas2d'

export interface DistanceStyle {
  label: string
  /** 'mph' means imperial (mi), anything else metric (km) -- see units.ts's formatDistance. */
  unit: SpeedUnit
  color: string
  labelColor: string
  textOutlineWidth: number
  textOutlineColor: string
  backgroundColor: string
  backgroundOpacity: number
  cornerRadius: number
}

export const DEFAULT_DISTANCE_STYLE: DistanceStyle = {
  label: 'DISTANCE',
  unit: 'kmh',
  color: '#ffffff',
  labelColor: '#9a9aa4',
  textOutlineWidth: 2,
  textOutlineColor: '#000000',
  backgroundColor: '#0a0a10',
  backgroundOpacity: 0.72,
  cornerRadius: 12
}

export interface DrawDistanceOptions {
  rect: Rect
  style: DistanceStyle
  /** Cumulative GPS arc-length from the very start of the recording, meters -- resolved by the
   *  caller via sampler.distanceAt. */
  distanceM: number
}

const FONT_STACK = 'ui-sans-serif, -apple-system, "Segoe UI", Roboto, sans-serif'
const DISTANCE_FONT_STACK = `"${FORMULA1_BOLD}", ${FONT_STACK}`

/**
 * A standalone live "distance covered so far" readout -- total session distance already exists
 * bundled inside the Session Summary outro card, but there was previously no way to keep a running
 * distance counter on screen throughout the ride/session itself.
 */
export function drawDistance(ctx: Canvas2DLike, options: DrawDistanceOptions): void {
  const { rect, style, distanceM } = options

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
    fitFontSizePx(ctx, style.label, rect.w * 0.9, labelH * 0.75, '700', DISTANCE_FONT_STACK)
    drawOutlinedText(ctx, style.label.toUpperCase(), cx, rect.y + labelH * 0.72, style.labelColor, outlineWidth, style.textOutlineColor)
    ctx.restore()
  }

  const valueText = formatDistance(distanceM, style.unit)
  const valueAreaH = rect.h - labelH
  ctx.save()
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  // Sized against a fixed reference width, not the live text, so it doesn't jitter as the digit
  // count changes -- same reasoning as every other ticking value in this app.
  fitFontSizePx(ctx, '000.00 km', rect.w * 0.85, valueAreaH * 0.6, '700', DISTANCE_FONT_STACK)
  drawOutlinedText(ctx, valueText, cx, rect.y + labelH + valueAreaH / 2, style.color, outlineWidth, style.textOutlineColor)
  ctx.restore()
}
