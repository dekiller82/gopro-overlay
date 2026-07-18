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

  ctx.save()
  ctx.textAlign = 'center'
  ctx.textBaseline = 'alphabetic'
  ctx.font = `700 ${Math.round(rect.h * 0.62)}px ${SPEED_FONT_STACK}`
  drawOutlinedText(ctx, Math.round(value).toString(), cx, rect.y + rect.h * 0.72, style.color, outlineWidth, style.textOutlineColor)

  if (style.showUnit) {
    ctx.font = `600 ${Math.round(rect.h * 0.2)}px ${SPEED_FONT_STACK}`
    drawOutlinedText(ctx, speedUnitLabel(style.unit), cx, rect.y + rect.h * 0.98, style.accentColor, outlineWidth, style.textOutlineColor)
  }
  ctx.restore()
}

const GAUGE_START_ANGLE = Math.PI * 0.75
const GAUGE_END_ANGLE = Math.PI * 2.25
const GAUGE_SWEEP = GAUGE_END_ANGLE - GAUGE_START_ANGLE
const TICK_COUNT = 8

export function drawSpeedometerAnalog(ctx: Canvas2DLike, options: DrawSpeedometerOptions): void {
  const { rect, speedMps, style } = options
  const value = convertSpeed(speedMps, style.unit)
  const span = style.max - style.min || 1
  const clamped = Math.min(style.max, Math.max(style.min, value))
  const ratio = (clamped - style.min) / span
  const needleAngle = GAUGE_START_ANGLE + ratio * GAUGE_SWEEP

  const cx = rect.x + rect.w / 2
  const cy = rect.y + rect.h / 2
  const radius = (Math.min(rect.w, rect.h) / 2) * 0.92
  const trackRadius = radius * 0.85
  const outlineWidth = scaleToRect(style.textOutlineWidth, rect)

  ctx.save()
  ctx.strokeStyle = 'rgba(255,255,255,0.22)'
  ctx.lineWidth = Math.max(2, radius * 0.07)
  ctx.lineCap = 'round'
  ctx.beginPath()
  ctx.arc(cx, cy, trackRadius, GAUGE_START_ANGLE, GAUGE_END_ANGLE)
  ctx.stroke()
  ctx.restore()

  ctx.save()
  ctx.strokeStyle = style.accentColor
  ctx.lineWidth = Math.max(2, radius * 0.07)
  ctx.lineCap = 'round'
  ctx.beginPath()
  ctx.arc(cx, cy, trackRadius, GAUGE_START_ANGLE, needleAngle)
  ctx.stroke()
  ctx.restore()

  ctx.save()
  ctx.strokeStyle = style.color
  ctx.lineWidth = Math.max(1, radius * 0.018)
  for (let i = 0; i <= TICK_COUNT; i++) {
    const angle = GAUGE_START_ANGLE + (i / TICK_COUNT) * GAUGE_SWEEP
    const inner = radius * 0.66
    const outer = radius * 0.78
    ctx.beginPath()
    ctx.moveTo(cx + Math.cos(angle) * inner, cy + Math.sin(angle) * inner)
    ctx.lineTo(cx + Math.cos(angle) * outer, cy + Math.sin(angle) * outer)
    ctx.stroke()
  }
  ctx.restore()

  ctx.save()
  ctx.strokeStyle = style.accentColor
  ctx.lineWidth = Math.max(2, radius * 0.055)
  ctx.lineCap = 'round'
  ctx.beginPath()
  ctx.moveTo(cx, cy)
  ctx.lineTo(cx + Math.cos(needleAngle) * radius * 0.58, cy + Math.sin(needleAngle) * radius * 0.58)
  ctx.stroke()
  ctx.restore()

  ctx.save()
  ctx.fillStyle = style.color
  ctx.beginPath()
  ctx.arc(cx, cy, radius * 0.055, 0, Math.PI * 2)
  ctx.fill()
  ctx.restore()

  ctx.save()
  ctx.textAlign = 'center'
  ctx.textBaseline = 'alphabetic'
  ctx.font = `700 ${Math.round(radius * 0.38)}px ${SPEED_FONT_STACK}`
  drawOutlinedText(ctx, Math.round(value).toString(), cx, cy + radius * 0.42, style.color, outlineWidth, style.textOutlineColor)

  if (style.showUnit) {
    ctx.font = `600 ${Math.round(radius * 0.14)}px ${SPEED_FONT_STACK}`
    drawOutlinedText(ctx, speedUnitLabel(style.unit), cx, cy + radius * 0.62, style.accentColor, outlineWidth, style.textOutlineColor)
  }
  ctx.restore()
}
