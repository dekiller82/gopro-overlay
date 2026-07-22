import type { AccelRunState } from '../telemetry/accelRuns'
import { convertSpeed, type SpeedUnit } from '../units'
import { FORMULA1_BOLD, FORMULA1_REGULAR } from './fonts'
import { drawFixedWidthText, drawOutlinedText, fillRoundedRect, fitFontSizePx, scaleToRect, type Canvas2DLike, type Rect } from './canvas2d'

export interface AccelTimerStyle {
  /** '' hides the header row entirely. */
  label: string
  unit: SpeedUnit
  /** Target speeds to time a launch to, m/s (canonical, like ApexSpeedCallout's minDropMps) --
   *  displayed converted via `unit`. Karts don't reach highway speeds, so these are configurable
   *  rather than Dragy's fixed highway-oriented splits (0-60mph, 1/4 mile, ...). */
  targetSpeedsMps: number[]
  /** At/under this speed (m/s) counts as "stopped" -- both what ends a run for the "PB" bookkeeping
   *  and, after holding for minStationaryMs, what arms detection of the next launch. */
  stationaryThresholdMps: number
  minStationaryMs: number
  showBest: boolean
  color: string
  labelColor: string
  bestColor: string
  textOutlineWidth: number
  textOutlineColor: string
  backgroundColor: string
  backgroundOpacity: number
  cornerRadius: number
}

export const DEFAULT_ACCEL_TIMER_STYLE: AccelTimerStyle = {
  label: 'LAUNCH',
  unit: 'kmh',
  targetSpeedsMps: [11.111, 16.667, 22.222], // 40 / 60 / 80 km/h
  stationaryThresholdMps: 1.4,
  minStationaryMs: 500,
  showBest: true,
  color: '#ffffff',
  labelColor: '#9a9aa4',
  bestColor: '#b026ff',
  textOutlineWidth: 2,
  textOutlineColor: '#000000',
  backgroundColor: '#0a0a10',
  backgroundOpacity: 0.72,
  cornerRadius: 12
}

export interface DrawAccelTimerOptions {
  rect: Rect
  style: AccelTimerStyle
  /** Precomputed once per widget instance (its target speeds/thresholds are per-widget style, same
   *  as Apex Speed Callout's detection thresholds), resolved for the current cts by the caller via
   *  getAccelRunStateAt. */
  state: AccelRunState
}

const FONT_STACK = 'ui-sans-serif, -apple-system, "Segoe UI", Roboto, sans-serif'
const HEADER_FONT_STACK = `"${FORMULA1_BOLD}", ${FONT_STACK}`
const VALUE_FONT_STACK = `"${FORMULA1_REGULAR}", ${FONT_STACK}`
const TIME_SIZING_REFERENCE = '00.00s'

function formatElapsed(ms: number): string {
  return `${(ms / 1000).toFixed(2)}s`
}

function formatTargetLabel(targetMps: number, unit: SpeedUnit): string {
  return `0-${Math.round(convertSpeed(targetMps, unit))}`
}

function formatSplitTime(ms: number | null): string {
  return ms === null ? '--' : formatElapsed(ms)
}

/**
 * A Dragy-style launch timer: auto-detects a genuine stop-then-accelerate ("launch", see
 * shared/telemetry/accelRuns.ts) and times how long it takes to reach each configured target speed,
 * plus keeps a session-best time per target. Unlike Dragy's fixed highway splits (0-60mph, 1/4 mile),
 * target speeds here are configurable since karts run a much lower, track-specific speed range.
 */
export function drawAccelTimer(ctx: Canvas2DLike, options: DrawAccelTimerOptions): void {
  const { rect, style, state } = options

  if (style.backgroundOpacity > 0) {
    ctx.save()
    ctx.globalAlpha = style.backgroundOpacity
    ctx.fillStyle = style.backgroundColor
    fillRoundedRect(ctx, rect.x, rect.y, rect.w, rect.h, scaleToRect(style.cornerRadius, rect))
    ctx.restore()
  }

  const outlineWidth = scaleToRect(style.textOutlineWidth, rect)
  const hasLabel = Boolean(style.label)
  const headerH = hasLabel ? rect.h * 0.22 : 0
  const leftX = rect.x + rect.w * 0.05

  // drawFixedWidthText CENTERS its text on the given cx -- so every right-anchored column below
  // picks a (cx, maxWidth) pair keeping cx + maxWidth/2 safely under 1.0 (in rect-fraction terms),
  // not just cx itself close to the edge, or a wide value (e.g. "79.77s") overflows the widget's
  // own canvas and gets clipped -- caught by rendering a real long-running session against real
  // telemetry, not visible in a quick static check.
  if (hasLabel) {
    ctx.save()
    ctx.textAlign = 'left'
    ctx.textBaseline = 'middle'
    fitFontSizePx(ctx, style.label, rect.w * 0.42, headerH * 0.55, '700', HEADER_FONT_STACK)
    drawOutlinedText(ctx, style.label.toUpperCase(), leftX, rect.y + headerH / 2, style.labelColor, outlineWidth, style.textOutlineColor)
    ctx.restore()

    ctx.save()
    ctx.textAlign = 'right'
    ctx.textBaseline = 'middle'
    fitFontSizePx(ctx, TIME_SIZING_REFERENCE, rect.w * 0.36, headerH * 0.55, '700', VALUE_FONT_STACK)
    const elapsedText = state.elapsedMs !== null ? formatElapsed(Math.max(0, state.elapsedMs)) : '--'
    drawFixedWidthText(ctx, elapsedText, rect.x + rect.w * 0.75, rect.y + headerH / 2, style.color, outlineWidth, style.textOutlineColor)
    ctx.restore()
  }

  const targets = state.currentSplits
  if (targets.length === 0) return

  const rowsAreaY = rect.y + headerH
  const rowsAreaH = rect.h - headerH
  const rowH = rowsAreaH / targets.length
  const currentX = rect.x + rect.w * (style.showBest ? 0.62 : 0.74)
  const bestX = rect.x + rect.w * 0.88

  for (let i = 0; i < targets.length; i++) {
    const rowCy = rowsAreaY + rowH * (i + 0.5)
    const target = targets[i]
    const best = state.bestSplits[i]

    ctx.save()
    ctx.textAlign = 'left'
    ctx.textBaseline = 'middle'
    fitFontSizePx(ctx, formatTargetLabel(target.targetMps, style.unit), rect.w * 0.36, rowH * 0.45, '600', VALUE_FONT_STACK)
    drawOutlinedText(ctx, formatTargetLabel(target.targetMps, style.unit), leftX, rowCy, style.labelColor, outlineWidth, style.textOutlineColor)
    ctx.restore()

    ctx.save()
    ctx.textAlign = 'right'
    ctx.textBaseline = 'middle'
    fitFontSizePx(ctx, TIME_SIZING_REFERENCE, rect.w * (style.showBest ? 0.28 : 0.46), rowH * 0.5, '700', VALUE_FONT_STACK)
    drawFixedWidthText(ctx, formatSplitTime(target.timeMs), currentX, rowCy, style.color, outlineWidth, style.textOutlineColor)
    ctx.restore()

    if (style.showBest && best) {
      ctx.save()
      ctx.textAlign = 'right'
      ctx.textBaseline = 'middle'
      fitFontSizePx(ctx, TIME_SIZING_REFERENCE, rect.w * 0.2, rowH * 0.32, '700', VALUE_FONT_STACK)
      drawFixedWidthText(ctx, formatSplitTime(best.timeMs), bestX, rowCy, style.bestColor, outlineWidth, style.textOutlineColor)
      ctx.restore()
    }
  }
}
