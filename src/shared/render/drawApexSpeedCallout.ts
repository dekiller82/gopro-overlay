import type { ApexEvent } from '../telemetry/apex'
import { convertSpeed, speedUnitLabel, type SpeedUnit } from '../units'
import { FORMULA1_BOLD } from './fonts'
import { drawFixedWidthText, drawOutlinedText, fitFontSizePx, scaleToRect, type Canvas2DLike, type Rect } from './canvas2d'

export interface ApexSpeedCalloutStyle {
  unit: SpeedUnit
  color: string
  /** 0 disables the outline. */
  textOutlineWidth: number
  textOutlineColor: string
  backgroundColor: string
  backgroundOpacity: number
  /** How long the callout stays visible after each detected apex, ms. */
  flashDurationMs: number
  /** Minimum speed drop (m/s) on BOTH sides of a dip to count as a real apex, not track noise. */
  minDropMps: number
  /** Minimum gap between consecutive detected apexes, ms. */
  minGapMs: number
  /** '' hides the label, e.g. 'APEX'. */
  label: string
}

export const DEFAULT_APEX_SPEED_CALLOUT_STYLE: ApexSpeedCalloutStyle = {
  unit: 'kmh',
  color: '#ffffff',
  textOutlineWidth: 2,
  textOutlineColor: '#000000',
  backgroundColor: '#0a0a10',
  backgroundOpacity: 0.72,
  flashDurationMs: 3000,
  minDropMps: 8,
  minGapMs: 1500,
  label: 'APEX'
}

export interface DrawApexSpeedCalloutOptions {
  rect: Rect
  style: ApexSpeedCalloutStyle
  /** Precomputed once by the caller (detectApexEvents is per-widget-style, not shared like lap/sector state). */
  events: ApexEvent[]
  cts: number
}

const FONT_STACK = 'ui-sans-serif, -apple-system, "Segoe UI", Roboto, sans-serif'
const APEX_FONT_STACK = `"${FORMULA1_BOLD}", ${FONT_STACK}`
const VALUE_SIZING_REFERENCE = '000'
/** Fraction of flashDurationMs the callout stays at full opacity before it starts fading out. */
const HOLD_FRACTION = 0.25

function mostRecentActiveEvent(events: ApexEvent[], cts: number, flashDurationMs: number): ApexEvent | null {
  let best: ApexEvent | null = null
  for (const event of events) {
    if (event.cts > cts) continue
    const elapsed = cts - event.cts
    if (elapsed >= flashDurationMs) continue
    if (!best || event.cts > best.cts) best = event
  }
  return best
}

/**
 * A temporary "APEX 74 km/h" graphic that flashes right as the driver gets back on the throttle
 * after the slowest point of a corner (see shared/telemetry/apex.ts for detection). Unlike every
 * other widget in this app, it draws NOTHING at all outside its flash window -- no persistent panel
 * -- since the whole point is a momentary callout, not an always-visible readout.
 */
export function drawApexSpeedCallout(ctx: Canvas2DLike, options: DrawApexSpeedCalloutOptions): void {
  const { rect, style, events, cts } = options
  const event = mostRecentActiveEvent(events, cts, style.flashDurationMs)
  if (!event) return

  const progress = (cts - event.cts) / style.flashDurationMs
  const alpha = progress < HOLD_FRACTION ? 1 : Math.max(0, 1 - (progress - HOLD_FRACTION) / (1 - HOLD_FRACTION))
  if (alpha <= 0) return

  ctx.save()
  ctx.globalAlpha = alpha

  if (style.backgroundOpacity > 0) {
    ctx.save()
    ctx.globalAlpha = alpha * style.backgroundOpacity
    ctx.fillStyle = style.backgroundColor
    ctx.fillRect(rect.x, rect.y, rect.w, rect.h)
    ctx.restore()
  }

  const outlineWidth = scaleToRect(style.textOutlineWidth, rect)
  const cx = rect.x + rect.w / 2
  const hasLabel = Boolean(style.label)
  const labelH = hasLabel ? rect.h * 0.32 : 0

  if (hasLabel) {
    ctx.save()
    ctx.textAlign = 'center'
    ctx.textBaseline = 'alphabetic'
    fitFontSizePx(ctx, style.label, rect.w * 0.9, labelH * 0.75, '700', APEX_FONT_STACK)
    drawOutlinedText(ctx, style.label.toUpperCase(), cx, rect.y + labelH * 0.72, style.color, outlineWidth, style.textOutlineColor)
    ctx.restore()
  }

  const value = Math.round(convertSpeed(event.speedMps, style.unit))
  const valueAreaH = rect.h - labelH

  ctx.save()
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  fitFontSizePx(ctx, VALUE_SIZING_REFERENCE, rect.w * 0.6, valueAreaH * 0.62, '700', APEX_FONT_STACK)
  drawFixedWidthText(ctx, String(value), cx, rect.y + labelH + valueAreaH * 0.4, style.color, outlineWidth, style.textOutlineColor)
  ctx.restore()

  ctx.save()
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.font = `600 ${Math.round(valueAreaH * 0.2)}px ${APEX_FONT_STACK}`
  drawOutlinedText(ctx, speedUnitLabel(style.unit), cx, rect.y + labelH + valueAreaH * 0.78, style.color, outlineWidth, style.textOutlineColor)
  ctx.restore()

  ctx.restore()
}
