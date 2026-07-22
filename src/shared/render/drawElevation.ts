import type { ElevationProfilePoint } from '../telemetry/sampleAt'
import { type SpeedUnit } from '../units'
import { FORMULA1_BOLD } from './fonts'
import { drawOutlinedText, fillRoundedRect, fitFontSizePx, scaleToRect, type Canvas2DLike, type Rect } from './canvas2d'

export interface ElevationStyle {
  /** 'readout' shows just the current altitude number, 'graph' just the profile, 'both' stacks a
   *  small readout above the graph. */
  mode: 'readout' | 'graph' | 'both'
  label: string
  /** Reuses the app's existing metric/imperial convention (SpeedUnit) -- 'mph' means imperial
   *  (feet), anything else means metric (meters), same convention Session Summary's DISTANCE stat
   *  already uses for km/mi. */
  unit: SpeedUnit
  color: string
  labelColor: string
  textOutlineWidth: number
  textOutlineColor: string
  backgroundColor: string
  backgroundOpacity: number
  /** Nominal corner radius (px at the scaleToRect reference size) of the background panel. 0 = square corners. */
  cornerRadius: number
  smoothingMs: number
  graphLineColor: string
  graphFillOpacity: number
  gridColor: string
  gridOpacity: number
}

export const DEFAULT_ELEVATION_STYLE: ElevationStyle = {
  mode: 'both',
  label: 'ELEVATION',
  unit: 'kmh',
  color: '#ffffff',
  labelColor: '#9a9aa4',
  textOutlineWidth: 2,
  textOutlineColor: '#000000',
  backgroundColor: '#0a0a10',
  backgroundOpacity: 0.72,
  cornerRadius: 12,
  smoothingMs: 500,
  graphLineColor: '#34c759',
  graphFillOpacity: 0.18,
  gridColor: '#ffffff',
  gridOpacity: 0.12
}

export interface DrawElevationOptions {
  rect: Rect
  style: ElevationStyle
  /** Gaussian-smoothed current altitude, meters -- resolved by the caller via sampler.elevationAt. */
  currentAltitudeM: number
  /** Static altitude-vs-distance profile for the whole session, from sampler.elevationProfile --
   *  precomputed once, not per frame (same split as trackPoints/dotPosition). */
  profile: ElevationProfilePoint[]
  /** Current cts -- used only to find where "now" falls along the static profile for the graph's marker. */
  cts: number
}

const FONT_STACK = 'ui-sans-serif, -apple-system, "Segoe UI", Roboto, sans-serif'
const ELEVATION_FONT_STACK = `"${FORMULA1_BOLD}", ${FONT_STACK}`
const GRID_LINE_COUNT = 3

function formatElevation(meters: number, unit: SpeedUnit): string {
  if (unit === 'mph') return `${Math.round(meters * 3.28084)} ft`
  return `${Math.round(meters)} m`
}

/** Nearest profile point at or before `cts` (profile is cts-ordered, 1:1 with the telemetry samples). */
function profilePointAt(profile: ElevationProfilePoint[], cts: number): ElevationProfilePoint | null {
  if (profile.length === 0) return null
  let idx = 0
  for (let i = 0; i < profile.length; i++) {
    if (profile[i].cts <= cts) idx = i
    else break
  }
  return profile[idx]
}

function drawReadout(ctx: Canvas2DLike, rect: Rect, style: ElevationStyle, currentAltitudeM: number, areaY: number, areaH: number): void {
  const cx = rect.x + rect.w / 2
  const outlineWidth = scaleToRect(style.textOutlineWidth, rect)
  const hasLabel = Boolean(style.label)
  const labelH = hasLabel ? areaH * 0.32 : 0

  if (hasLabel) {
    ctx.save()
    ctx.textAlign = 'center'
    ctx.textBaseline = 'alphabetic'
    fitFontSizePx(ctx, style.label, rect.w * 0.9, labelH * 0.75, '700', ELEVATION_FONT_STACK)
    drawOutlinedText(ctx, style.label.toUpperCase(), cx, areaY + labelH * 0.72, style.labelColor, outlineWidth, style.textOutlineColor)
    ctx.restore()
  }

  const valueText = formatElevation(currentAltitudeM, style.unit)
  ctx.save()
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  // Sized against a fixed reference (a realistic worst-case width), not the live text, so the size
  // doesn't jitter as the digit count/sign changes -- same reasoning as every other ticking value.
  fitFontSizePx(ctx, '-0000 ft', rect.w * 0.85, (areaH - labelH) * 0.7, '700', ELEVATION_FONT_STACK)
  drawOutlinedText(ctx, valueText, cx, areaY + labelH + (areaH - labelH) / 2, style.color, outlineWidth, style.textOutlineColor)
  ctx.restore()
}

function drawGraph(ctx: Canvas2DLike, rect: Rect, style: ElevationStyle, profile: ElevationProfilePoint[], cts: number, areaY: number, areaH: number): void {
  if (profile.length < 2) return

  let minAlt = profile[0].altitude
  let maxAlt = profile[0].altitude
  for (const p of profile) {
    if (p.altitude < minAlt) minAlt = p.altitude
    if (p.altitude > maxAlt) maxAlt = p.altitude
  }
  const altSpan = maxAlt - minAlt || 1
  const domainEnd = profile[profile.length - 1].distanceM || 1

  const plotX = rect.x + rect.w * 0.04
  const plotW = rect.w * 0.92
  const topPad = areaH * 0.1
  const bottomPad = areaH * 0.12
  const plotH = areaH - topPad - bottomPad
  const plotTop = areaY + topPad

  const xAt = (distanceM: number): number => plotX + (distanceM / domainEnd) * plotW
  const yAt = (altitude: number): number => plotTop + plotH - ((altitude - minAlt) / altSpan) * plotH

  if (style.gridOpacity > 0) {
    ctx.save()
    ctx.globalAlpha = style.gridOpacity
    ctx.strokeStyle = style.gridColor
    ctx.lineWidth = Math.max(1, scaleToRect(1, rect))
    for (let i = 0; i <= GRID_LINE_COUNT; i++) {
      const y = plotTop + (plotH * i) / GRID_LINE_COUNT
      ctx.beginPath()
      ctx.moveTo(plotX, y)
      ctx.lineTo(plotX + plotW, y)
      ctx.stroke()
    }
    ctx.restore()
  }

  if (style.graphFillOpacity > 0) {
    ctx.save()
    ctx.globalAlpha = style.graphFillOpacity
    ctx.fillStyle = style.graphLineColor
    ctx.beginPath()
    ctx.moveTo(xAt(profile[0].distanceM), plotTop + plotH)
    for (const p of profile) ctx.lineTo(xAt(p.distanceM), yAt(p.altitude))
    ctx.lineTo(xAt(profile[profile.length - 1].distanceM), plotTop + plotH)
    ctx.closePath()
    ctx.fill()
    ctx.restore()
  }

  ctx.save()
  ctx.strokeStyle = style.graphLineColor
  ctx.lineWidth = scaleToRect(2.5, rect)
  ctx.lineJoin = 'round'
  ctx.lineCap = 'round'
  ctx.beginPath()
  ctx.moveTo(xAt(profile[0].distanceM), yAt(profile[0].altitude))
  for (let i = 1; i < profile.length; i++) ctx.lineTo(xAt(profile[i].distanceM), yAt(profile[i].altitude))
  ctx.stroke()
  ctx.restore()

  const now = profilePointAt(profile, cts)
  if (now) {
    const nowX = xAt(now.distanceM)
    const nowY = yAt(now.altitude)
    ctx.save()
    ctx.globalAlpha = 0.5
    ctx.strokeStyle = style.color
    ctx.lineWidth = Math.max(1, scaleToRect(1, rect))
    ctx.beginPath()
    ctx.moveTo(nowX, plotTop)
    ctx.lineTo(nowX, plotTop + plotH)
    ctx.stroke()
    ctx.restore()

    ctx.save()
    ctx.fillStyle = style.graphLineColor
    ctx.shadowBlur = scaleToRect(6, rect)
    ctx.shadowColor = style.graphLineColor
    ctx.beginPath()
    ctx.arc(nowX, nowY, scaleToRect(4.5, rect), 0, Math.PI * 2)
    ctx.fill()
    ctx.restore()
  }
}

/**
 * Current elevation (a Gaussian-smoothed numeric readout) and/or a static altitude-vs-distance
 * profile for the whole session with a moving "now" marker -- altitude is already parsed from
 * every GoPro clip's GPS stream but wasn't visualized anywhere before this widget. Distance-based
 * x-axis (not time-based) so the graph's shape matches the real geography regardless of how fast
 * any particular section was driven -- most useful for hillclimbs/rally where elevation actually
 * changes; on a flat closed karting circuit it'll understandably look close to a flat line.
 */
export function drawElevation(ctx: Canvas2DLike, options: DrawElevationOptions): void {
  const { rect, style, currentAltitudeM, profile, cts } = options

  if (style.backgroundOpacity > 0) {
    ctx.save()
    ctx.globalAlpha = style.backgroundOpacity
    ctx.fillStyle = style.backgroundColor
    fillRoundedRect(ctx, rect.x, rect.y, rect.w, rect.h, scaleToRect(style.cornerRadius, rect))
    ctx.restore()
  }

  if (style.mode === 'readout') {
    drawReadout(ctx, rect, style, currentAltitudeM, rect.y, rect.h)
    return
  }
  if (style.mode === 'graph') {
    drawGraph(ctx, rect, style, profile, cts, rect.y, rect.h)
    return
  }

  const readoutH = rect.h * 0.34
  drawReadout(ctx, rect, style, currentAltitudeM, rect.y, readoutH)
  drawGraph(ctx, rect, style, profile, cts, rect.y + readoutH, rect.h - readoutH)
}
