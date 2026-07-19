import { convertSpeed, speedUnitLabel, type SpeedUnit } from '../units'
import { DEFAULT_SPEED_SMOOTHING_MS } from '../telemetry/sampleAt'
import { FORMULA1_BOLD } from './fonts'
import { drawOutlinedText, fillRoundedRect, scaleToRect, type Canvas2DLike, type Rect } from './canvas2d'

export interface SpeedometerStyle {
  unit: SpeedUnit
  /** Gaussian smoothing window in ms fed to TelemetrySampler.speedAt to damp GPS jitter on the needle/readout. */
  smoothingMs: number
  /** Gauge scale bounds, in the selected display unit. Ignored by the digital readout. */
  min: number
  max: number
  color: string
  accentColor: string
  showUnit: boolean
  /** 0 disables the outline. */
  textOutlineWidth: number
  textOutlineColor: string
  /** Panel background. Only drawn by the digital readout -- the analog gauge already has its own
   *  circular dial as a visual background, a rectangular panel behind it would fight that look. */
  backgroundColor: string
  backgroundOpacity: number
  /** Nominal corner radius (px at the scaleToRect reference size) of the background panel. 0 = square corners. */
  cornerRadius: number
}

export const DEFAULT_SPEEDOMETER_STYLE: SpeedometerStyle = {
  unit: 'kmh',
  smoothingMs: DEFAULT_SPEED_SMOOTHING_MS,
  min: 0,
  max: 140,
  color: '#ffffff',
  accentColor: '#ff3b30',
  showUnit: true,
  textOutlineWidth: 2,
  textOutlineColor: '#000000',
  backgroundColor: '#0a0a10',
  backgroundOpacity: 0.72,
  cornerRadius: 12
}

export interface DrawSpeedometerOptions {
  rect: Rect
  speedMps: number
  style: SpeedometerStyle
}

const FONT_STACK = 'ui-sans-serif, -apple-system, "Segoe UI", Roboto, sans-serif'
const SPEED_FONT_STACK = `"${FORMULA1_BOLD}", ${FONT_STACK}`

export function drawSpeedometerDigital(ctx: Canvas2DLike, options: DrawSpeedometerOptions): void {
  const { rect, speedMps, style } = options
  const value = convertSpeed(speedMps, style.unit)
  const cx = rect.x + rect.w / 2
  const outlineWidth = scaleToRect(style.textOutlineWidth, rect)

  if (style.backgroundOpacity > 0) {
    ctx.save()
    ctx.globalAlpha = style.backgroundOpacity
    ctx.fillStyle = style.backgroundColor
    fillRoundedRect(ctx, rect.x, rect.y, rect.w, rect.h, scaleToRect(style.cornerRadius, rect))
    ctx.restore()
  }

  // Center the value+unit block as a whole in the panel instead of anchoring the value near the
  // top and the unit at a fixed offset from it -- the old fixed offsets pushed the unit label right
  // to the bottom edge of the background box on shorter panels.
  const valueFontSize = style.showUnit ? rect.h * 0.5 : rect.h * 0.58
  const unitFontSize = rect.h * 0.16
  const unitGap = rect.h * 0.08
  // Digits/uppercase letters in this font have no descenders, so their visible glyph box runs from
  // the baseline up to roughly capHeightRatio * fontSize -- used to center the whole text block by
  // its actual ink, not by font-size boxes that include unused descender space.
  const CAP_HEIGHT_RATIO = 0.72
  const valueCapHeight = valueFontSize * CAP_HEIGHT_RATIO
  const unitCapHeight = unitFontSize * CAP_HEIGHT_RATIO
  const blockHeight = valueCapHeight + (style.showUnit ? unitGap + unitCapHeight : 0)
  const blockTop = rect.y + (rect.h - blockHeight) / 2
  const valueBaselineY = blockTop + valueCapHeight

  ctx.save()
  ctx.textAlign = 'center'
  ctx.textBaseline = 'alphabetic'
  ctx.font = `700 ${Math.round(valueFontSize)}px ${SPEED_FONT_STACK}`
  drawOutlinedText(ctx, Math.round(value).toString(), cx, valueBaselineY, style.color, outlineWidth, style.textOutlineColor)

  if (style.showUnit) {
    ctx.font = `600 ${Math.round(unitFontSize)}px ${SPEED_FONT_STACK}`
    drawOutlinedText(ctx, speedUnitLabel(style.unit), cx, valueBaselineY + unitGap + unitCapHeight, style.accentColor, outlineWidth, style.textOutlineColor)
  }
  ctx.restore()
}

const GAUGE_START_ANGLE = Math.PI * 0.75
const GAUGE_END_ANGLE = Math.PI * 2.25
const GAUGE_SWEEP = GAUGE_END_ANGLE - GAUGE_START_ANGLE
// 9 intervals -> 10 labeled ticks (0, 10, 20, ... in a 0-90 range) -- lines up on round numbers for
// the common "0 to a multiple of 10/90" gauge ranges this widget is normally configured with.
const TICK_COUNT = 9

export function drawSpeedometerAnalog(ctx: Canvas2DLike, options: DrawSpeedometerOptions): void {
  const { rect, speedMps, style } = options
  const value = convertSpeed(speedMps, style.unit)
  const span = style.max - style.min || 1
  const clamped = Math.min(style.max, Math.max(style.min, value))
  const ratio = (clamped - style.min) / span
  const needleAngle = GAUGE_START_ANGLE + ratio * GAUGE_SWEEP

  const cx = rect.x + rect.w / 2
  const cy = rect.y + rect.h / 2
  // Smaller than the old 0.92 factor -- this style prints tick-value labels (e.g. "0".."90") just
  // outside the dial ring, so the ring itself needs to sit further in from the widget's edge to
  // leave room for that text instead of clipping it.
  const radius = (Math.min(rect.w, rect.h) / 2) * 0.74
  const trackRadius = radius * 0.86
  const outlineWidth = scaleToRect(style.textOutlineWidth, rect)

  // Thin unfilled tick marks across the whole sweep (not a continuous background track) -- ticks
  // beyond the current value stay as bare reference marks instead of a lit/dimmed track.
  ctx.save()
  ctx.strokeStyle = style.color
  ctx.globalAlpha = 0.55
  ctx.lineWidth = Math.max(1, radius * 0.02)
  for (let i = 0; i <= TICK_COUNT; i++) {
    const angle = GAUGE_START_ANGLE + (i / TICK_COUNT) * GAUGE_SWEEP
    const inner = radius * 0.92
    const outer = radius * 1.0
    ctx.beginPath()
    ctx.moveTo(cx + Math.cos(angle) * inner, cy + Math.sin(angle) * inner)
    ctx.lineTo(cx + Math.cos(angle) * outer, cy + Math.sin(angle) * outer)
    ctx.stroke()
  }
  ctx.restore()

  // Progress ring, rendered as a chain of rounded pill segments (dashed stroke with round caps)
  // rather than one smooth arc, from the gauge's zero point up to the current value.
  ctx.save()
  ctx.strokeStyle = style.accentColor
  const trackWidth = Math.max(2, radius * 0.16)
  ctx.lineWidth = trackWidth
  ctx.lineCap = 'round'
  ctx.setLineDash([trackWidth * 0.9, trackWidth * 0.85])
  ctx.beginPath()
  ctx.arc(cx, cy, trackRadius, GAUGE_START_ANGLE, needleAngle)
  ctx.stroke()
  ctx.setLineDash([])
  ctx.restore()

  // Hollow tip marker sitting on the ring at the current value, in place of a center needle.
  ctx.save()
  ctx.strokeStyle = style.color
  ctx.lineWidth = Math.max(1.5, radius * 0.035)
  ctx.beginPath()
  ctx.arc(cx + Math.cos(needleAngle) * trackRadius, cy + Math.sin(needleAngle) * trackRadius, trackWidth * 0.62, 0, Math.PI * 2)
  ctx.stroke()
  ctx.restore()

  // Numeric label at every major tick, just outside the ring.
  ctx.save()
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.font = `600 ${Math.round(radius * 0.16)}px ${SPEED_FONT_STACK}`
  for (let i = 0; i <= TICK_COUNT; i++) {
    const angle = GAUGE_START_ANGLE + (i / TICK_COUNT) * GAUGE_SWEEP
    const tickValue = style.min + (i / TICK_COUNT) * span
    const labelRadius = radius * 1.2
    drawOutlinedText(
      ctx,
      Math.round(tickValue).toString(),
      cx + Math.cos(angle) * labelRadius,
      cy + Math.sin(angle) * labelRadius,
      style.color,
      outlineWidth,
      style.textOutlineColor
    )
  }
  ctx.restore()

  ctx.save()
  ctx.textAlign = 'center'
  ctx.textBaseline = 'alphabetic'
  ctx.font = `700 ${Math.round(radius * 0.5)}px ${SPEED_FONT_STACK}`
  drawOutlinedText(ctx, Math.round(value).toString(), cx, cy + radius * 0.2, style.color, outlineWidth, style.textOutlineColor)

  if (style.showUnit) {
    ctx.font = `600 ${Math.round(radius * 0.18)}px ${SPEED_FONT_STACK}`
    drawOutlinedText(ctx, speedUnitLabel(style.unit), cx, cy + radius * 0.44, style.accentColor, outlineWidth, style.textOutlineColor)
  }
  ctx.restore()
}
