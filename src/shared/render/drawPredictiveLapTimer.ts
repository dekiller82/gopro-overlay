import { formatTime } from '../format'
import type { DeltaState } from '../telemetry/deltaTime'
import { FORMULA1_BOLD, FORMULA1_REGULAR } from './fonts'
import { drawFixedWidthText, drawOutlinedText, fitFontSizePx, scaleToRect, type Canvas2DLike, type Rect } from './canvas2d'

export interface PredictiveLapTimerStyle {
  color: string
  /** '' hides the label row. */
  label: string
  labelColor: string
  /** Small +/- sub-readout beneath the predicted time, reusing the same delta-coloring convention as the Delta Time widget. */
  showDelta: boolean
  fasterColor: string
  slowerColor: string
  /** 0 disables the outline. */
  textOutlineWidth: number
  textOutlineColor: string
  backgroundColor: string
  backgroundOpacity: number
}

export const DEFAULT_PREDICTIVE_LAP_TIMER_STYLE: PredictiveLapTimerStyle = {
  color: '#ffffff',
  label: 'PREDICTED',
  labelColor: '#ffffff',
  showDelta: true,
  fasterColor: '#3ddc71',
  slowerColor: '#ff3b30',
  textOutlineWidth: 2,
  textOutlineColor: '#000000',
  backgroundColor: '#0a0a10',
  backgroundOpacity: 0.72
}

export interface DrawPredictiveLapTimerOptions {
  rect: Rect
  style: PredictiveLapTimerStyle
  deltaState: DeltaState | null
}

const FONT_STACK = 'ui-sans-serif, -apple-system, "Segoe UI", Roboto, sans-serif'
const PREDICTIVE_FONT_STACK = `"${FORMULA1_BOLD}", ${FONT_STACK}`
// Formula1 Bold's ':' glyph renders as a period-like blob in this canvas environment (a real bug
// found via headless render -- the Regular weight's ':' renders correctly, matching the existing
// elapsed-mode Timer's own font choice for the same kind of colon-bearing ticking value). Used only
// for the mm:ss.ss predicted time text below; the label/delta sub-readout have no colon and stay Bold.
const TIME_FONT_STACK = `"${FORMULA1_REGULAR}", ${FONT_STACK}`
/** Sized once against a fixed reference, not the live (per-frame-changing) text -- same anti-jitter discipline as every other timer widget in this app. */
const TIME_SIZING_REFERENCE = '00:00.00'
const DELTA_SIZING_REFERENCE = '-00.00'

function formatDelta(ms: number): string {
  const sign = ms < 0 ? '-' : '+'
  const abs = Math.round(Math.abs(ms))
  const seconds = Math.floor(abs / 1000)
  const centis = Math.floor((abs % 1000) / 10)
  return `${sign}${seconds}.${String(centis).padStart(2, '0')}`
}

/** Projected final lap time at the current pace: the baseline (best completed) lap's own total time
 *  plus the live delta to it -- i.e. "if you keep this exact gap to your best lap for the rest of the
 *  lap, this is what you'll finish with." Shares the same DeltaState as the Delta Time widget. */
export function drawPredictiveLapTimer(ctx: Canvas2DLike, options: DrawPredictiveLapTimerOptions): void {
  const { rect, style, deltaState } = options

  if (style.backgroundOpacity > 0) {
    ctx.save()
    ctx.globalAlpha = style.backgroundOpacity
    ctx.fillStyle = style.backgroundColor
    ctx.fillRect(rect.x, rect.y, rect.w, rect.h)
    ctx.restore()
  }

  const outlineWidth = scaleToRect(style.textOutlineWidth, rect)
  const cx = rect.x + rect.w / 2
  const hasLabel = Boolean(style.label)
  const showDeltaRow = style.showDelta
  const labelH = hasLabel ? rect.h * 0.22 : 0
  const deltaH = showDeltaRow ? rect.h * 0.24 : 0
  const timeH = rect.h - labelH - deltaH

  if (hasLabel) {
    ctx.save()
    ctx.textAlign = 'center'
    ctx.textBaseline = 'alphabetic'
    fitFontSizePx(ctx, style.label, rect.w * 0.9, labelH * 0.75, '700', PREDICTIVE_FONT_STACK)
    drawOutlinedText(ctx, style.label.toUpperCase(), cx, rect.y + labelH * 0.72, style.labelColor, outlineWidth, style.textOutlineColor)
    ctx.restore()
  }

  const predictedMs = deltaState?.predictedLapMs ?? null
  const timeText = predictedMs === null ? '--:--.--' : formatTime(predictedMs, true)

  ctx.save()
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  fitFontSizePx(ctx, TIME_SIZING_REFERENCE, rect.w * 0.92, timeH * 0.62, '700', TIME_FONT_STACK)
  drawOutlinedText(ctx, timeText, cx, rect.y + labelH + timeH / 2, style.color, outlineWidth, style.textOutlineColor)
  ctx.restore()

  if (!showDeltaRow) return

  const deltaMs = deltaState?.deltaMs ?? null
  const deltaText = deltaMs === null ? '--.--' : formatDelta(deltaMs)
  const deltaColor = deltaMs === null ? style.color : deltaMs < 0 ? style.fasterColor : style.slowerColor

  ctx.save()
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  fitFontSizePx(ctx, DELTA_SIZING_REFERENCE, rect.w * 0.7, deltaH * 0.65, '700', PREDICTIVE_FONT_STACK)
  drawFixedWidthText(ctx, deltaText, cx, rect.y + labelH + timeH + deltaH / 2, deltaColor, outlineWidth, style.textOutlineColor)
  ctx.restore()
}
