import { useEffect, useMemo, useRef } from 'react'
import type { WidgetInstance } from '@shared/types'
import type { TelemetrySampler } from '@shared/telemetry/sampleAt'
import type { LapState } from '@shared/telemetry/laps'
import type { SectorState } from '@shared/telemetry/sectors'
import type { DeltaState } from '@shared/telemetry/deltaTime'
import type { LapSpeedTrace } from '@shared/telemetry/speedTrace'
import { detectApexEvents } from '@shared/telemetry/apex'
import { buildManualCalibration, buildManualCalibrationForRoll } from '@shared/telemetry/imuCalibration'
import { drawWidget } from '@shared/render/drawWidget'
import type { Canvas2DLike } from '@shared/render/canvas2d'
import { speedSmoothingMsFor } from '@shared/widgets/helpers'
import { useLoadedImage } from '../hooks/useLoadedImage'
import flIconUrl from '../icons/fl.png'

interface Props {
  widget: WidgetInstance
  sampler: TelemetrySampler
  currentTimeMs: number
  pixelWidth: number
  pixelHeight: number
  lapState: LapState | null
  sectorState: SectorState | null
  deltaState: DeltaState | null
  lapSpeedTraces: LapSpeedTrace[]
  currentLapSpeedTrace: LapSpeedTrace | null
}

function WidgetCanvas({
  widget,
  sampler,
  currentTimeMs,
  pixelWidth,
  pixelHeight,
  lapState,
  sectorState,
  deltaState,
  lapSpeedTraces,
  currentLapSpeedTrace
}: Props): React.JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  const headerImageDataUrl = widget.type === 'timer' && widget.style.mode === 'laps' ? widget.style.headerImageDataUrl : null
  const headerImage = useLoadedImage(headerImageDataUrl)
  const fastestLapIcon = useLoadedImage(flIconUrl)

  // Apex detection thresholds are per-widget style (unlike lap/sector/delta state, which share one
  // global start/finish line across every widget) -- memoized on the specific threshold values (not
  // the whole `widget` object) so dragging/resizing this widget doesn't re-run an O(n) detection
  // pass on every position update.
  const minDropMps = widget.type === 'apexSpeedCallout' ? widget.style.minDropMps : null
  const minGapMs = widget.type === 'apexSpeedCallout' ? widget.style.minGapMs : null
  const apexEvents = useMemo(
    () => (minDropMps !== null && minGapMs !== null ? detectApexEvents(sampler.samples, minDropMps, minGapMs) : []),
    [sampler, minDropMps, minGapMs]
  )

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || pixelWidth <= 0 || pixelHeight <= 0) return

    // Capped at 2x: every widget gets its own canvas, redrawn on every animation frame during
    // playback, so backing-store pixel count (and the GPU/CPU fill cost that scales with it) adds
    // up fast across several widgets at once. Uncapped 3x display scaling (common on some Windows
    // laptops) would nearly double that again for no visible benefit at typical widget sizes.
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    const targetW = Math.max(1, Math.round(pixelWidth * dpr))
    const targetH = Math.max(1, Math.round(pixelHeight * dpr))
    if (canvas.width !== targetW) canvas.width = targetW
    if (canvas.height !== targetH) canvas.height = targetH

    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.clearRect(0, 0, pixelWidth, pixelHeight)

    // Resolved fresh per draw call (cheap -- a single Gaussian window lookup), using each widget
    // instance's own smoothing/manual-axis-override style, same reasoning as speedMps/dotPosition
    // just above -- not shared globally like lapState/sectorState, since different gForceDiagram or
    // rollAngle instances can have different smoothing/calibration settings.
    let gForceReading
    let gForceHistory
    let rollAngleReading
    if (widget.type === 'gForceDiagram') {
      const cal = widget.style.useManualAxes
        ? buildManualCalibration(widget.style.verticalAxis, widget.style.longitudinalAxis, widget.style.verticalInverted, widget.style.longitudinalInverted, widget.style.lateralInverted)
        : undefined
      gForceReading = sampler.gForceAt(currentTimeMs, widget.style.smoothingMs, cal)
      gForceHistory = sampler.gForceHistoryAt(currentTimeMs, widget.style.trailDurationMs, cal)
    } else if (widget.type === 'rollAngle') {
      const cal = widget.style.useManualAxes
        ? buildManualCalibrationForRoll(widget.style.verticalAxis, widget.style.lateralAxis, widget.style.verticalInverted, widget.style.lateralInverted)
        : undefined
      rollAngleReading = sampler.rollAngleAt(currentTimeMs, widget.style.smoothingMs, cal)
    }

    const rect = { x: 0, y: 0, w: pixelWidth, h: pixelHeight }
    drawWidget(ctx as unknown as Canvas2DLike, widget, rect, {
      trackPoints: sampler.trackPoints,
      bounds: sampler.bounds,
      dotPosition: sampler.positionAt(currentTimeMs),
      speedMps: sampler.speedAt(currentTimeMs, speedSmoothingMsFor(widget)),
      elapsedMs: currentTimeMs,
      cts: currentTimeMs,
      lapState,
      sectorState,
      deltaState,
      apexEvents,
      headerImage,
      fastestLapIcon,
      trackSpeeds: sampler.trackSpeeds,
      trackCts: sampler.trackCts,
      speedBounds: sampler.speedBounds,
      lapSpeedTraces,
      currentLapSpeedTrace,
      gForceReading,
      gForceHistory,
      rollAngleReading,
      hasImuData: sampler.hasImuData
    })
  }, [
    widget,
    sampler,
    currentTimeMs,
    pixelWidth,
    pixelHeight,
    lapState,
    sectorState,
    deltaState,
    apexEvents,
    headerImage,
    fastestLapIcon,
    lapSpeedTraces,
    currentLapSpeedTrace
  ])

  return (
    <canvas ref={canvasRef} className="widget-box__canvas" style={{ width: pixelWidth, height: pixelHeight }} />
  )
}

export default WidgetCanvas
