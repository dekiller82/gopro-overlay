import type { ProjectedPoint } from '../telemetry/interpolate'
import type { TrackBounds } from '../telemetry/sampleAt'
import { lerpColor, scaleToRect, type Canvas2DLike, type Rect } from './canvas2d'
import { createRectFitTransform } from './layout'

/** Traces a smooth curve through every point (quadratic segments via midpoints, each raw point as
 * the control point) instead of straight lineTo segments between them, which looks faceted at
 * turns when GPS sample spacing is coarse relative to the curve. Must be called between
 * ctx.beginPath() and ctx.stroke(). */
function tracePath(ctx: Canvas2DLike, points: ProjectedPoint[]): void {
  ctx.moveTo(points[0].x, points[0].y)
  if (points.length === 2) {
    ctx.lineTo(points[1].x, points[1].y)
    return
  }
  for (let i = 1; i < points.length - 1; i++) {
    const midX = (points[i].x + points[i + 1].x) / 2
    const midY = (points[i].y + points[i + 1].y) / 2
    ctx.quadraticCurveTo(points[i].x, points[i].y, midX, midY)
  }
  const last = points[points.length - 1]
  ctx.lineTo(last.x, last.y)
}

export interface GpsWidgetStyle {
  lineColor: string
  lineWidth: number
  lineOpacity: number
  dotColor: string
  dotRadius: number
  dotGlow: boolean
  /** 'solid' = the original single-color line (default, zero behavior change). 'speed' colors each
   *  segment by how fast it was driven; 'braking' colors it by whether that segment was under heavy
   *  braking, accelerating, or neither. */
  colorMode: 'solid' | 'speed' | 'braking'
  /** speed mode gradient endpoints -- scaled against this session's own min/max speed. */
  slowColor: string
  fastColor: string
  /** braking mode bucket colors. */
  brakingColor: string
  acceleratingColor: string
  neutralColor: string
  /** braking mode: |acceleration| below this (m/s^2) counts as neutral, not braking/accelerating. */
  brakingThresholdMps2: number
}

export const DEFAULT_GPS_STYLE: GpsWidgetStyle = {
  lineColor: '#ffffff',
  lineWidth: 3,
  lineOpacity: 0.85,
  dotColor: '#ff3b30',
  dotRadius: 7,
  dotGlow: true,
  colorMode: 'solid',
  slowColor: '#2979ff',
  fastColor: '#ff3b30',
  brakingColor: '#ff3b30',
  acceleratingColor: '#3ddc71',
  neutralColor: '#ffffff',
  brakingThresholdMps2: 1.5
}

/** Per-segment color for 'speed' mode: lerps between slowColor/fastColor by this session's own
 *  min/max speed (confirmed default: relative to the session, not a fixed configured range). */
function speedSegmentColor(style: GpsWidgetStyle, speedBounds: { min: number; max: number }, speedMps: number): string {
  const span = speedBounds.max - speedBounds.min || 1
  return lerpColor(style.slowColor, style.fastColor, (speedMps - speedBounds.min) / span)
}

/** Per-segment color for 'braking' mode: buckets signed acceleration between two consecutive
 *  samples against brakingThresholdMps2 -- braking (decelerating), accelerating, or neutral. */
function brakingSegmentColor(style: GpsWidgetStyle, speedA: number, speedB: number, ctsA: number, ctsB: number): string {
  const dtSeconds = (ctsB - ctsA) / 1000
  const accel = dtSeconds > 0 ? (speedB - speedA) / dtSeconds : 0
  if (accel <= -style.brakingThresholdMps2) return style.brakingColor
  if (accel >= style.brakingThresholdMps2) return style.acceleratingColor
  return style.neutralColor
}

/** Draws the track as individually-colored straight segments (not the smooth quadratic curve --
 *  per-segment coloring and curve smoothing don't compose, a deliberate trade-off) for the 'speed'
 *  and 'braking' color modes. */
function drawColoredTrackSegments(
  ctx: Canvas2DLike,
  screenPoints: ProjectedPoint[],
  style: GpsWidgetStyle,
  lineWidth: number,
  trackSpeeds: number[],
  trackCts: number[],
  speedBounds: { min: number; max: number }
): void {
  ctx.save()
  ctx.globalAlpha = style.lineOpacity
  ctx.lineWidth = lineWidth
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'

  for (let i = 0; i < screenPoints.length - 1; i++) {
    const color =
      style.colorMode === 'speed'
        ? speedSegmentColor(style, speedBounds, (trackSpeeds[i] + trackSpeeds[i + 1]) / 2)
        : brakingSegmentColor(style, trackSpeeds[i], trackSpeeds[i + 1], trackCts[i], trackCts[i + 1])
    ctx.strokeStyle = color
    ctx.beginPath()
    ctx.moveTo(screenPoints[i].x, screenPoints[i].y)
    ctx.lineTo(screenPoints[i + 1].x, screenPoints[i + 1].y)
    ctx.stroke()
  }
  ctx.restore()
}

export interface DrawGpsWidgetOptions {
  rect: Rect
  trackPoints: ProjectedPoint[]
  dotPosition: ProjectedPoint
  bounds: TrackBounds
  style: GpsWidgetStyle
  /** Raw speed2D + cts, 1:1 index-aligned with trackPoints -- only needed for colorMode 'speed'/'braking'
   *  (speed for the color lerp, cts to compute per-segment acceleration for braking mode). */
  trackSpeeds?: number[]
  trackCts?: number[]
  speedBounds?: { min: number; max: number }
}

/** Draws the Quik-style GPS track: a line for the full lap/session shape plus a dot for current position. */
export function drawGpsWidget(ctx: Canvas2DLike, options: DrawGpsWidgetOptions): void {
  const { rect, trackPoints, dotPosition, bounds, style, trackSpeeds, trackCts, speedBounds } = options
  if (trackPoints.length === 0) return

  const project = createRectFitTransform(bounds, rect)
  const screenPoints = trackPoints.map(project)
  const screenDot = project(dotPosition)

  // lineWidth/dotRadius are nominal pixel values tuned at a reference box size -- scaled here so
  // the line/dot render at a consistent visual proportion whether `rect` is a small on-screen
  // preview canvas or a full native-resolution export frame (the track shape itself already
  // scales correctly via createRectFitTransform's uniform projection; this was the piece that didn't).
  const lineWidth = scaleToRect(style.lineWidth, rect)
  const dotRadius = scaleToRect(style.dotRadius, rect)

  const canColor = style.colorMode !== 'solid' && trackSpeeds && trackCts && speedBounds && screenPoints.length > 1
  if (canColor) {
    drawColoredTrackSegments(ctx, screenPoints, style, lineWidth, trackSpeeds!, trackCts!, speedBounds!)
  } else {
    ctx.save()
    ctx.globalAlpha = style.lineOpacity
    ctx.strokeStyle = style.lineColor
    ctx.lineWidth = lineWidth
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    ctx.beginPath()
    tracePath(ctx, screenPoints)
    ctx.stroke()
    ctx.restore()
  }

  ctx.save()
  ctx.globalAlpha = 1
  if (style.dotGlow) {
    ctx.shadowBlur = dotRadius * 2.5
    ctx.shadowColor = style.dotColor
  }
  ctx.fillStyle = style.dotColor
  ctx.beginPath()
  ctx.arc(screenDot.x, screenDot.y, dotRadius, 0, Math.PI * 2)
  ctx.fill()
  ctx.restore()
}
