import type { DeltaState } from '../telemetry/deltaTime'
import { FORMULA1_BOLD } from './fonts'
import { drawFixedWidthText, drawOutlinedText, fillRoundedRect, fitFontSizePx, scaleToRect, type Canvas2DLike, type Rect } from './canvas2d'

export interface DeltaTimeStyle {
  /** No baseline lap yet (still on the first timed lap). */
  neutralColor: string
  /** Negative delta -- running ahead of the baseline. */
  fasterColor: string
  /** Positive delta -- running behind the baseline. */
  slowerColor: string
  /** '' hides the label row. */
  label: string
  labelColor: string
  /** 0 disables the outline. */
  textOutlineWidth: number
  textOutlineColor: string
  backgroundColor: string
  backgroundOpacity: number
  /** Nominal corner radius (px at the scaleToRect reference size) of the background panel. 0 = square corners. */
  cornerRadius: number
}

export const DEFAULT_DELTA_TIME_STYLE: DeltaTimeStyle = {
  neutralColor: '#ffffff',
  fasterColor: '#3ddc71',
  slowerColor: '#ff3b30',
  label: 'DELTA',
  labelColor: '#ffffff',
  textOutlineWidth: 2,
  textOutlineColor: '#000000',
  backgroundColor: '#0a0a10',
  backgroundOpacity: 0.72,
  cornerRadius: 12
}

export interface DrawDeltaTimeOptions {
  rect: Rect
  style: DeltaTimeStyle
  deltaState: DeltaState | null
}

const FONT_STACK = 'ui-sans-serif, -apple-system, "Segoe UI", Roboto, sans-serif'
const DELTA_FONT_STACK = `"${FORMULA1_BOLD}", ${FONT_STACK}`
/** Longest realistic delta string, sized against ONCE (not the live text) so the value doesn't
 *  jitter in size as its digits change frame to frame -- same discipline as Sector Timer/Timer. */
const VALUE_SIZING_REFERENCE = '-00.00'

/** Signed seconds.centiseconds, e.g. "+0.42" / "-1.05" -- iRacing-style delta display (not mm:ss, deltas are normally well under a minute). */
function formatDelta(ms: number): string {
  const sign = ms < 0 ? '-' : '+'
  const abs = Math.round(Math.abs(ms))
  const seconds = Math.floor(abs / 1000)
  const centis = Math.floor((abs % 1000) / 10)
  return `${sign}${seconds}.${String(centis).padStart(2, '0')}`
}

/** iRacing-style live delta to the best completed lap so far: green/negative when ahead of that
 *  lap's own pace at the same distance-into-the-lap, red/positive when behind. */
export function drawDeltaTime(ctx: Canvas2DLike, options: DrawDeltaTimeOptions): void {
  const { rect, style, deltaState } = options

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
  const labelH = hasLabel ? rect.h * 0.28 : 0

  if (hasLabel) {
    ctx.save()
    ctx.textAlign = 'center'
    ctx.textBaseline = 'alphabetic'
    fitFontSizePx(ctx, style.label, rect.w * 0.9, labelH * 0.8, '700', DELTA_FONT_STACK)
    drawOutlinedText(ctx, style.label.toUpperCase(), cx, rect.y + labelH * 0.75, style.labelColor, outlineWidth, style.textOutlineColor)
    ctx.restore()
  }

  const deltaMs = deltaState?.deltaMs ?? null
  const text = deltaMs === null ? '--.--' : formatDelta(deltaMs)
  const color = deltaMs === null ? style.neutralColor : deltaMs < 0 ? style.fasterColor : style.slowerColor

  ctx.save()
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  fitFontSizePx(ctx, VALUE_SIZING_REFERENCE, rect.w * 0.92, (rect.h - labelH) * 0.7, '700', DELTA_FONT_STACK)
  drawFixedWidthText(ctx, text, cx, rect.y + labelH + (rect.h - labelH) / 2, color, outlineWidth, style.textOutlineColor)
  ctx.restore()
}
