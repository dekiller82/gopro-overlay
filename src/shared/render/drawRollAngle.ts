import type { RollAngleReading } from '../telemetry/sampleAt'
import { FORMULA1_BOLD } from './fonts'
import { drawOutlinedText, fillRoundedRect, fitFontSizePx, scaleToRect, type Canvas2DLike, type Rect } from './canvas2d'

export interface RollAngleStyle {
  color: string
  label: string
  labelColor: string
  /** 0 disables the outline. */
  textOutlineWidth: number
  textOutlineColor: string
  backgroundColor: string
  backgroundOpacity: number
  /** Nominal corner radius (px at the scaleToRect reference size) of the background panel. 0 = square corners. */
  cornerRadius: number
  smoothingMs: number
  /** Degrees represented by the tilt bar's full swing to either side, e.g. 45. */
  maxAngleScale: number
  barColor: string
  /** Shows a small note when the reading came from the accelerometer-tilt fallback (no gravity
   *  stream on this camera/file) instead of the real gravity vector -- reads exaggerated during hard
   *  cornering, a real limitation of accelerometer-only tilt sensing. */
  showAccuracyCaveat: boolean
  /** When true, bypasses auto-calibration for this widget instance using the fields below. */
  useManualAxes: boolean
  verticalAxis: 0 | 1 | 2
  lateralAxis: 0 | 1 | 2
  verticalInverted: boolean
  lateralInverted: boolean
}

export const DEFAULT_ROLL_ANGLE_STYLE: RollAngleStyle = {
  color: '#ffffff',
  label: 'ROLL',
  labelColor: '#ffffff',
  textOutlineWidth: 2,
  textOutlineColor: '#000000',
  backgroundColor: '#0a0a10',
  backgroundOpacity: 0.72,
  cornerRadius: 12,
  smoothingMs: 150,
  maxAngleScale: 45,
  barColor: '#ff3b30',
  showAccuracyCaveat: true,
  useManualAxes: false,
  verticalAxis: 0,
  lateralAxis: 1,
  verticalInverted: false,
  lateralInverted: false
}

export interface DrawRollAngleOptions {
  rect: Rect
  style: RollAngleStyle
  reading: RollAngleReading
  hasImuData: boolean
}

const FONT_STACK = 'ui-sans-serif, -apple-system, "Segoe UI", Roboto, sans-serif'
const ROLL_FONT_STACK = `"${FORMULA1_BOLD}", ${FONT_STACK}`

/**
 * Numeric roll/lean angle readout ("12° LEFT" style) plus a horizon-bar graphic that visually tilts
 * with the current angle -- an at-a-glance body-roll (car) / lean-angle (motorcycle) indicator.
 */
export function drawRollAngle(ctx: Canvas2DLike, options: DrawRollAngleOptions): void {
  const { rect, style, reading, hasImuData } = options

  if (style.backgroundOpacity > 0) {
    ctx.save()
    ctx.globalAlpha = style.backgroundOpacity
    ctx.fillStyle = style.backgroundColor
    fillRoundedRect(ctx, rect.x, rect.y, rect.w, rect.h, scaleToRect(style.cornerRadius, rect))
    ctx.restore()
  }

  const outlineWidth = scaleToRect(style.textOutlineWidth, rect)
  const cx = rect.x + rect.w / 2
  const hasLabel = Boolean(style.label)
  const labelH = hasLabel ? rect.h * 0.16 : 0

  if (hasLabel) {
    ctx.save()
    ctx.textAlign = 'center'
    ctx.textBaseline = 'alphabetic'
    fitFontSizePx(ctx, style.label, rect.w * 0.9, labelH * 0.75, '700', ROLL_FONT_STACK)
    drawOutlinedText(ctx, style.label.toUpperCase(), cx, rect.y + labelH * 0.72, style.labelColor, outlineWidth, style.textOutlineColor)
    ctx.restore()
  }

  if (!hasImuData) {
    ctx.save()
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    const text = 'No accelerometer data'
    fitFontSizePx(ctx, text, rect.w * 0.85, rect.h * 0.1, '600', ROLL_FONT_STACK)
    drawOutlinedText(ctx, text, cx, rect.y + labelH + (rect.h - labelH) / 2, style.color, outlineWidth, style.textOutlineColor)
    ctx.restore()
    return
  }

  const barAreaTop = rect.y + labelH
  const barAreaH = (rect.h - labelH) * 0.42
  const barCy = barAreaTop + barAreaH / 2
  const barHalfW = rect.w * 0.38
  const angleRad = (reading.degrees * Math.PI) / 180

  ctx.save()
  ctx.translate(cx, barCy)
  ctx.rotate(angleRad)
  ctx.strokeStyle = style.barColor
  ctx.lineWidth = scaleToRect(4, rect)
  ctx.lineCap = 'round'
  ctx.beginPath()
  ctx.moveTo(-barHalfW, 0)
  ctx.lineTo(barHalfW, 0)
  ctx.stroke()
  ctx.fillStyle = style.barColor
  ctx.beginPath()
  ctx.arc(0, 0, scaleToRect(5, rect), 0, Math.PI * 2)
  ctx.fill()
  ctx.restore()

  const direction = Math.abs(reading.degrees) < 0.5 ? '' : reading.degrees > 0 ? ' RIGHT' : ' LEFT'
  const valueText = `${Math.round(Math.abs(reading.degrees))}°${direction}`
  const valueAreaY = barAreaTop + barAreaH + (rect.h - labelH - barAreaH) / 2

  ctx.save()
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  // Sized once against a fixed reference (the widest realistic case, "00° RIGHT"), not the live text
  // -- keeps the font size stable as the direction word/digit count change, matching every other
  // ticking value in this app. A single drawOutlinedText call (not per-character) -- this angle
  // reading isn't a fast-ticking many-digit value like a lap clock, so proportional-width jitter
  // isn't the concern fixed-width digits exist for elsewhere.
  fitFontSizePx(ctx, '00° RIGHT', rect.w * 0.92, (rect.h - labelH - barAreaH) * 0.55, '700', ROLL_FONT_STACK)
  drawOutlinedText(ctx, valueText, cx, valueAreaY, style.color, outlineWidth, style.textOutlineColor)
  ctx.restore()

  if (style.showAccuracyCaveat && reading.source === 'accelFallback') {
    ctx.save()
    ctx.globalAlpha = 0.75
    ctx.textAlign = 'center'
    ctx.textBaseline = 'alphabetic'
    const noteSize = Math.max(7, Math.round(rect.h * 0.04))
    ctx.font = `500 ${noteSize}px ${ROLL_FONT_STACK}`
    ctx.fillStyle = style.color
    ctx.fillText('estimated (no gravity sensor)', cx, rect.y + rect.h - noteSize * 0.5)
    ctx.restore()
  }
}
