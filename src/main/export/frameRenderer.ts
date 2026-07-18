import { createCanvas, type Image } from '@napi-rs/canvas'
import { drawWidget } from '../../shared/render/drawWidget'
import { buildColoredGpsTrackCache } from '../../shared/render/drawGpsWidget'
import type { Canvas2DLike, CanvasImageLike, Rect } from '../../shared/render/canvas2d'
import type { TelemetrySampler } from '../../shared/telemetry/sampleAt'
import { detectLapCrossings, getLapStateAt } from '../../shared/telemetry/laps'
import { computeLapSectors, getSectorStateAt } from '../../shared/telemetry/sectors'
import { computeLapDistanceCurves, getDeltaStateAt } from '../../shared/telemetry/deltaTime'
import { detectApexEvents, type ApexEvent } from '../../shared/telemetry/apex'
import { computeCurrentLapSpeedTrace, computeLapSpeedTraces } from '../../shared/telemetry/speedTrace'
import { buildManualCalibration, buildManualCalibrationForRoll } from '../../shared/telemetry/imuCalibration'
import type { LatLon, WidgetInstance } from '../../shared/types'
import { speedSmoothingMsFor } from '../../shared/widgets/helpers'
import { unpremultiplyRgbaInPlace } from './unpremultiply'
import { registerExportFonts } from './registerFonts'
import { loadHeaderImageFromDataUrl } from './loadHeaderImage'
import { loadFastestLapIcon } from './loadIcons'

/** Renders overlay frames (transparent background) at a fixed pixel size, ready to pipe to ffmpeg as raw RGBA. */
export async function createFrameRenderer(
  width: number,
  height: number,
  widgets: WidgetInstance[],
  sampler: TelemetrySampler,
  startFinish: LatLon | null,
  /** Absolute cts (same space as sampleCts) at which the trimmed session ends -- only needed for
   *  the Session Summary widget's showLastSeconds countdown. */
  trimEndMs: number
): Promise<(sampleCts: number, elapsedMs: number) => Buffer> {
  registerExportFonts()

  const canvas = createCanvas(width, height)
  const ctx = canvas.getContext('2d')
  const sortedWidgets = [...widgets].sort((a, b) => a.zIndex - b.zIndex)

  // Precomputed once (O(n) over telemetry samples), not per-frame -- crossings/sectors/lap-distance
  // curves don't depend on cts. Every widget that needs lap detection shares the same global
  // start/finish line.
  const crossings = startFinish ? detectLapCrossings(sampler.samples, startFinish) : null
  const sectorBoundaries = crossings ? computeLapSectors(sampler.samples, crossings) : null
  const lapDistanceCurves = crossings ? computeLapDistanceCurves(sampler.samples, crossings) : null
  // Full per-lap trace list, precomputed once -- must still be filtered to laps completed BY each
  // frame's own sampleCts before drawing (below), or every frame (even ones during lap 1) would show
  // every lap in the whole session at once, same discipline as lapState/sectorState/deltaState.
  const allLapSpeedTraces = crossings ? computeLapSpeedTraces(sampler.samples, crossings) : []
  const headerImageByWidgetId = new Map<string, Image>()
  // Apex detection thresholds are per-widget style (not shared like lap/sector/delta state), so
  // precomputed once per widget instance here rather than once globally.
  const apexEventsByWidgetId = new Map<string, ApexEvent[]>()
  // colorMode 'speed'/'braking' segments are static for the whole export (only the dot moves), so
  // built once here rather than re-stroked from scratch on every one of potentially thousands of
  // exported frames -- same reasoning as WidgetCanvas.tsx's live-preview cache.
  const coloredTrackImageByWidgetId = new Map<string, CanvasImageLike>()
  let usesFastestLapIcon = false

  for (const widget of sortedWidgets) {
    if (widget.type === 'timer' && widget.style.mode === 'laps') {
      usesFastestLapIcon = true
      if (widget.style.headerImageDataUrl) {
        headerImageByWidgetId.set(widget.id, await loadHeaderImageFromDataUrl(widget.style.headerImageDataUrl))
      }
    }
    if (widget.type === 'apexSpeedCallout') {
      apexEventsByWidgetId.set(widget.id, detectApexEvents(sampler.samples, widget.style.minDropMps, widget.style.minGapMs))
    }
    if (widget.type === 'gpsTrack' && widget.style.colorMode !== 'solid') {
      const rect: Rect = { x: widget.x * width, y: widget.y * height, w: widget.w * width, h: widget.h * height }
      const cacheCanvas = createCanvas(Math.max(1, Math.round(rect.w)), Math.max(1, Math.round(rect.h)))
      const cacheCtx = cacheCanvas.getContext('2d')
      buildColoredGpsTrackCache(
        cacheCtx as unknown as Canvas2DLike,
        sampler.trackPoints,
        sampler.bounds,
        { x: 0, y: 0, w: rect.w, h: rect.h },
        widget.style,
        sampler.trackSpeeds,
        sampler.trackCts,
        sampler.speedBounds
      )
      coloredTrackImageByWidgetId.set(widget.id, cacheCanvas as unknown as CanvasImageLike)
    }
  }

  const fastestLapIcon = usesFastestLapIcon ? await loadFastestLapIcon() : null

  // `sampleCts` (absolute, untrimmed global timeline position) drives GPS/speed/lap/sector state --
  // trimming is a final edit/crop decision, it doesn't mean "lap 1 now starts elsewhere". `elapsedMs`
  // (separate, trim-relative) is only for the plain elapsed-mode timer widget's displayed value, so
  // it reads 00:00 at the trimmed-in point rather than starting mid-count in the exported video.
  return function renderFrame(sampleCts: number, elapsedMs: number): Buffer {
    ctx.clearRect(0, 0, width, height)
    const dotPosition = sampler.positionAt(sampleCts)
    // Shared by every widget (the same global start/finish line), so resolved once per frame rather than per widget.
    const lapState = crossings ? getLapStateAt(crossings, sampleCts) : null
    const sectorState = sectorBoundaries ? getSectorStateAt(sectorBoundaries, sampleCts) : null
    const deltaState =
      crossings && lapDistanceCurves ? getDeltaStateAt(lapDistanceCurves, crossings, sampler.samples, sampleCts) : null
    // GPS Track's optional "ghost" marker -- shared across every gpsTrack widget instance, same as
    // deltaState itself, resolved once per frame rather than per widget.
    const ghostPosition = deltaState?.ghostCts != null ? sampler.positionAt(deltaState.ghostCts) : null
    // Session Summary widget's data -- shared across every instance, same reasoning as
    // WidgetLayer.tsx's live-preview path. `elapsedMs` (trim-relative, see the comment above) is
    // exactly the "elapsed since trimmed session start" value this needs, already computed by the caller.
    const sessionStats = sampler.sessionStatsAt(sampleCts)
    const sessionSummaryData = {
      totalLaps: lapState?.history.length ?? 0,
      bestLapMs: lapState?.bestLapMs ?? null,
      bestS1Ms: sectorState?.bestS1Ms ?? null,
      bestS2Ms: sectorState?.bestS2Ms ?? null,
      bestS3Ms: sectorState?.bestS3Ms ?? null,
      topSpeedMps: sessionStats.maxSpeedMps,
      totalDistanceM: sessionStats.totalDistanceM,
      elapsedMs
    }
    const currentLapSpeedTrace = crossings ? computeCurrentLapSpeedTrace(sampler.samples, crossings, sampleCts) : null
    const lapSpeedTraces = crossings ? allLapSpeedTraces.filter((t) => crossings[t.lapNumber] <= sampleCts) : []

    for (const widget of sortedWidgets) {
      const rect: Rect = {
        x: widget.x * width,
        y: widget.y * height,
        w: widget.w * width,
        h: widget.h * height
      }

      // Resolved per widget instance (each can have its own smoothing/manual-axis-override style),
      // not shared globally like lapState/sectorState -- mirrors WidgetCanvas.tsx's live-preview path.
      let gForceReading
      let gForceHistory
      let rollAngleReading
      if (widget.type === 'gForceDiagram') {
        const cal = widget.style.useManualAxes
          ? buildManualCalibration(widget.style.verticalAxis, widget.style.longitudinalAxis, widget.style.verticalInverted, widget.style.longitudinalInverted, widget.style.lateralInverted)
          : undefined
        gForceReading = sampler.gForceAt(sampleCts, widget.style.smoothingMs, cal)
        gForceHistory = sampler.gForceHistoryAt(sampleCts, widget.style.trailDurationMs, cal)
      } else if (widget.type === 'rollAngle') {
        const cal = widget.style.useManualAxes
          ? buildManualCalibrationForRoll(widget.style.verticalAxis, widget.style.lateralAxis, widget.style.verticalInverted, widget.style.lateralInverted)
          : undefined
        rollAngleReading = sampler.rollAngleAt(sampleCts, widget.style.smoothingMs, cal)
      }

      drawWidget(ctx as unknown as Canvas2DLike, widget, rect, {
        trackPoints: sampler.trackPoints,
        bounds: sampler.bounds,
        dotPosition,
        speedMps: sampler.speedAt(sampleCts, speedSmoothingMsFor(widget)),
        elapsedMs,
        cts: sampleCts,
        lapState,
        sectorState,
        deltaState,
        ghostPosition,
        sessionSummaryData,
        sessionEndMs: trimEndMs,
        apexEvents: apexEventsByWidgetId.get(widget.id) ?? [],
        headerImage: headerImageByWidgetId.get(widget.id) ?? null,
        fastestLapIcon,
        trackSpeeds: sampler.trackSpeeds,
        trackCts: sampler.trackCts,
        speedBounds: sampler.speedBounds,
        coloredTrackImage: coloredTrackImageByWidgetId.get(widget.id) ?? null,
        lapSpeedTraces,
        currentLapSpeedTrace,
        gForceReading,
        gForceHistory,
        rollAngleReading,
        hasImuData: sampler.hasImuData
      })
    }

    const pixels = Buffer.from(canvas.data())
    unpremultiplyRgbaInPlace(pixels)
    return pixels
  }
}
