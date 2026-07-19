import type { LapState } from '../telemetry/laps'
import { formatTime } from '../format'
import { FORMULA1_BOLD, FORMULA1_REGULAR } from './fonts'
import { drawOutlinedText, fillRoundedRect, fitFontSizePx, scaleToRect, type Canvas2DLike, type Rect } from './canvas2d'

export interface LapConsistencyStyle {
  title: string
  /** How many of the most recent completed laps to show, oldest to newest left-to-right. */
  maxLapsShown: number
  barColor: string
  bestLapColor: string
  labelColor: string
  showLapTimes: boolean
  textOutlineWidth: number
  textOutlineColor: string
  backgroundColor: string
  backgroundOpacity: number
  cornerRadius: number
}

export const DEFAULT_LAP_CONSISTENCY_STYLE: LapConsistencyStyle = {
  title: 'LAP CONSISTENCY',
  maxLapsShown: 10,
  barColor: '#9a9aa4',
  bestLapColor: '#b026ff',
  labelColor: '#9a9aa4',
  showLapTimes: true,
  textOutlineWidth: 2,
  textOutlineColor: '#000000',
  backgroundColor: '#0a0a10',
  backgroundOpacity: 0.72,
  cornerRadius: 12
}

export interface DrawLapConsistencyOptions {
  rect: Rect
  style: LapConsistencyStyle
  /** Same LapState every lap/sector-derived widget already receives -- "as of" the queried cts, so
   *  scrubbing early in the video never shows laps that haven't happened yet from that point. */
  lapState: LapState | null
}

const FONT_STACK = 'ui-sans-serif, -apple-system, "Segoe UI", Roboto, sans-serif'
const TITLE_FONT_STACK = `"${FORMULA1_BOLD}", ${FONT_STACK}`
const VALUE_FONT_STACK = `"${FORMULA1_REGULAR}", ${FONT_STACK}`

/**
 * A glance-able bar chart of the most recent completed laps -- taller bar = a relatively faster lap
 * (scaled between the shown laps' own min/max time, not from zero, so real differences between
 * otherwise-similar lap times are actually visible), fastest lap highlighted in its own color.
 * Complements the Speed/Distance graph widget rather than replacing it: this shows lap-to-lap
 * consistency at a glance, not the shape of any single lap.
 */
export function drawLapConsistency(ctx: Canvas2DLike, options: DrawLapConsistencyOptions): void {
  const { rect, style, lapState } = options
  const outlineWidth = scaleToRect(style.textOutlineWidth, rect)

  if (style.backgroundOpacity > 0) {
    ctx.save()
    ctx.globalAlpha = style.backgroundOpacity
    ctx.fillStyle = style.backgroundColor
    fillRoundedRect(ctx, rect.x, rect.y, rect.w, rect.h, scaleToRect(style.cornerRadius, rect))
    ctx.restore()
  }

  const cx = rect.x + rect.w / 2
  const titleY = rect.y + rect.h * 0.14
  if (style.title) {
    ctx.textAlign = 'center'
    ctx.textBaseline = 'alphabetic'
    fitFontSizePx(ctx, style.title, rect.w * 0.9, rect.h * 0.1, '700', TITLE_FONT_STACK)
    drawOutlinedText(ctx, style.title, cx, titleY, style.labelColor, outlineWidth, style.textOutlineColor)
  }

  // Oldest-to-newest, left-to-right -- reads as a progression through the session, same convention
  // as the Speed/Distance graph's own lap ordering.
  const shownLaps = lapState ? lapState.history.slice(0, style.maxLapsShown).slice().reverse() : []

  if (shownLaps.length === 0) {
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    fitFontSizePx(ctx, 'NO COMPLETED LAPS YET', rect.w * 0.85, rect.h * 0.06, '600', VALUE_FONT_STACK)
    drawOutlinedText(ctx, 'NO COMPLETED LAPS YET', cx, rect.y + rect.h * 0.55, style.labelColor, outlineWidth, style.textOutlineColor)
    return
  }

  const times = shownLaps.map((l) => l.timeMs)
  const minTime = Math.min(...times)
  const maxTime = Math.max(...times)
  const timeSpan = maxTime - minTime || 1

  const chartTop = rect.y + rect.h * (style.title ? 0.24 : 0.1)
  const chartBottom = rect.y + rect.h * (style.showLapTimes ? 0.72 : 0.82)
  const chartHeight = chartBottom - chartTop
  const labelY = rect.y + rect.h * 0.92

  const gap = rect.w * 0.02
  const totalGap = gap * (shownLaps.length + 1)
  const barWidth = (rect.w - totalGap) / shownLaps.length

  const valueFontPx = fitFontSizePx(ctx, '00:00.00', barWidth * 1.4, chartHeight * 0.16, '600', VALUE_FONT_STACK)
  const labelFontPx = fitFontSizePx(ctx, '00', barWidth * 1.2, rect.h * 0.05, '600', VALUE_FONT_STACK)

  shownLaps.forEach((lap, i) => {
    // Inverted: the fastest lap gets the TALLEST bar -- reads as "how good", not "how slow".
    const performanceFrac = 1 - (lap.timeMs - minTime) / timeSpan
    const barHeight = Math.max(chartHeight * 0.08, chartHeight * (0.25 + performanceFrac * 0.75))
    const barX = rect.x + gap + i * (barWidth + gap)
    const barY = chartBottom - barHeight

    ctx.save()
    ctx.fillStyle = lap.isBest ? style.bestLapColor : style.barColor
    fillRoundedRect(ctx, barX, barY, barWidth, barHeight, Math.min(barWidth * 0.25, scaleToRect(6, rect)))
    ctx.restore()

    if (style.showLapTimes) {
      ctx.save()
      ctx.textAlign = 'center'
      ctx.textBaseline = 'alphabetic'
      ctx.font = `600 ${valueFontPx}px ${VALUE_FONT_STACK}`
      drawOutlinedText(
        ctx,
        formatTime(lap.timeMs, true),
        barX + barWidth / 2,
        barY - chartHeight * 0.04,
        lap.isBest ? style.bestLapColor : style.labelColor,
        outlineWidth,
        style.textOutlineColor
      )
      ctx.restore()
    }

    ctx.save()
    ctx.textAlign = 'center'
    ctx.textBaseline = 'alphabetic'
    ctx.font = `600 ${labelFontPx}px ${VALUE_FONT_STACK}`
    drawOutlinedText(ctx, String(lap.lapNumber), barX + barWidth / 2, labelY, style.labelColor, outlineWidth, style.textOutlineColor)
    ctx.restore()
  })
}
