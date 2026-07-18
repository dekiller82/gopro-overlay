import type { ProjectedPoint } from '../telemetry/interpolate'
import type { TrackBounds } from '../telemetry/sampleAt'
import type { LapState } from '../telemetry/laps'
import type { SectorState } from '../telemetry/sectors'
import type { DeltaState } from '../telemetry/deltaTime'
import type { ApexEvent } from '../telemetry/apex'
import type { LapSpeedTrace } from '../telemetry/speedTrace'
import type { GForceHistoryPoint, GForceReading, RollAngleReading } from '../telemetry/sampleAt'
import type { WidgetInstance } from '../types'
import type { Canvas2DLike, CanvasImageLike, Rect } from './canvas2d'
import { drawGpsWidget } from './drawGpsWidget'
import { drawSpeedometerAnalog, drawSpeedometerDigital } from './drawSpeedometer'
import { drawTimer } from './drawTimer'
import { drawSectorTimer } from './drawSectorTimer'
import { drawDeltaTime } from './drawDeltaTime'
import { drawPredictiveLapTimer } from './drawPredictiveLapTimer'
import { drawApexSpeedCallout } from './drawApexSpeedCallout'
import { drawSpeedDistanceGraph } from './drawSpeedDistanceGraph'
import { drawGForceDiagram } from './drawGForceDiagram'
import { drawRollAngle } from './drawRollAngle'

export interface WidgetDrawContext {
  trackPoints: ProjectedPoint[]
  bounds: TrackBounds
  dotPosition: ProjectedPoint
  speedMps: number
  elapsedMs: number
  /** cts at which this frame is being drawn -- used by 'apexSpeedCallout' to resolve its flash window. */
  cts: number
  /** Only relevant for a 'timer' widget in mode 'laps'. */
  lapState?: LapState | null
  /** Only relevant for a 'sectorTimer' widget. */
  sectorState?: SectorState | null
  /** Only relevant for 'deltaTime'/'predictiveLapTimer' widgets. */
  deltaState?: DeltaState | null
  /** Only relevant for an 'apexSpeedCallout' widget -- precomputed once per widget instance (its
   *  detection thresholds are per-widget style, not shared like lap/sector/delta state). */
  apexEvents?: ApexEvent[]
  /** Only relevant for a 'timer' widget in mode 'laps' with a custom header logo set. Loaded ahead of time by the caller. */
  headerImage?: CanvasImageLike | null
  /** Bundled fl.png, loaded once by the caller and shared across every timing-tower widget/frame. */
  fastestLapIcon?: CanvasImageLike | null
  /** Only relevant for a 'gpsTrack' widget with colorMode 'speed'/'braking'. 1:1 index-aligned with trackPoints. */
  trackSpeeds?: number[]
  trackCts?: number[]
  speedBounds?: { min: number; max: number }
  /** Only relevant for a 'gpsTrack' widget with colorMode 'speed'/'braking' -- see
   *  buildColoredGpsTrackCache. Pre-rendered by the caller once and reused across frames instead of
   *  re-stroking every track segment on every single frame. */
  coloredTrackImage?: CanvasImageLike | null
  /** Only relevant for a 'speedDistanceGraph' widget -- completed-lap traces are shared/precomputed
   *  once (don't depend on cts); the current-lap trace is resolved fresh every frame. */
  lapSpeedTraces?: LapSpeedTrace[]
  currentLapSpeedTrace?: LapSpeedTrace | null
  /** Only relevant for 'gForceDiagram'/'rollAngle' widgets -- resolved per widget instance (each has
   *  its own smoothing/manual-axis-override style), not shared globally. */
  gForceReading?: GForceReading
  gForceHistory?: GForceHistoryPoint[]
  rollAngleReading?: RollAngleReading
  hasImuData?: boolean
}

function renderWidgetContent(ctx: Canvas2DLike, widget: WidgetInstance, rect: Rect, data: WidgetDrawContext): void {
  switch (widget.type) {
    case 'gpsTrack':
      drawGpsWidget(ctx, {
        rect,
        style: widget.style,
        trackPoints: data.trackPoints,
        bounds: data.bounds,
        dotPosition: data.dotPosition,
        trackSpeeds: data.trackSpeeds,
        trackCts: data.trackCts,
        speedBounds: data.speedBounds,
        coloredTrackImage: data.coloredTrackImage
      })
      return
    case 'speedometerAnalog':
      drawSpeedometerAnalog(ctx, { rect, style: widget.style, speedMps: data.speedMps })
      return
    case 'speedometerDigital':
      drawSpeedometerDigital(ctx, { rect, style: widget.style, speedMps: data.speedMps })
      return
    case 'timer':
      drawTimer(ctx, {
        rect,
        style: widget.style,
        elapsedMs: data.elapsedMs,
        lapState: data.lapState,
        headerImage: data.headerImage,
        fastestLapIcon: data.fastestLapIcon
      })
      return
    case 'sectorTimer':
      drawSectorTimer(ctx, { rect, style: widget.style, sectorState: data.sectorState ?? null })
      return
    case 'deltaTime':
      drawDeltaTime(ctx, { rect, style: widget.style, deltaState: data.deltaState ?? null })
      return
    case 'predictiveLapTimer':
      drawPredictiveLapTimer(ctx, { rect, style: widget.style, deltaState: data.deltaState ?? null })
      return
    case 'apexSpeedCallout':
      drawApexSpeedCallout(ctx, { rect, style: widget.style, events: data.apexEvents ?? [], cts: data.cts })
      return
    case 'speedDistanceGraph':
      drawSpeedDistanceGraph(ctx, {
        rect,
        style: widget.style,
        lapTraces: data.lapSpeedTraces ?? [],
        currentLapTrace: data.currentLapSpeedTrace ?? null
      })
      return
    case 'gForceDiagram':
      drawGForceDiagram(ctx, {
        rect,
        style: widget.style,
        reading: data.gForceReading ?? { lateralG: 0, longitudinalG: 0 },
        history: data.gForceHistory ?? [],
        cts: data.cts,
        hasImuData: data.hasImuData ?? false
      })
      return
    case 'rollAngle':
      drawRollAngle(ctx, {
        rect,
        style: widget.style,
        reading: data.rollAngleReading ?? { degrees: 0, source: 'accelFallback' },
        hasImuData: data.hasImuData ?? false
      })
      return
  }
}

/**
 * Dispatches a widget instance to its type-specific render function at the given pixel `rect`,
 * rotated around the rect's own center. This runs identically in the live-preview canvas and
 * the headless export renderer, so rotation (and everything else) stays WYSIWYG between them.
 */
export function drawWidget(ctx: Canvas2DLike, widget: WidgetInstance, rect: Rect, data: WidgetDrawContext): void {
  const cx = rect.x + rect.w / 2
  const cy = rect.y + rect.h / 2

  ctx.save()
  ctx.translate(cx, cy)
  ctx.rotate((widget.rotation * Math.PI) / 180)
  ctx.translate(-cx, -cy)
  renderWidgetContent(ctx, widget, rect, data)
  ctx.restore()
}
