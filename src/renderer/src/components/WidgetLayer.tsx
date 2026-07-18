import { CSSProperties, useMemo, useState } from 'react'
import type { TelemetrySampler } from '@shared/telemetry/sampleAt'
import { detectLapCrossings, getLapStateAt } from '@shared/telemetry/laps'
import { computeLapSectors, getSectorStateAt } from '@shared/telemetry/sectors'
import { computeLapDistanceCurves, getDeltaStateAt } from '@shared/telemetry/deltaTime'
import { computeCurrentLapSpeedTrace, computeLapSpeedTraces } from '@shared/telemetry/speedTrace'
import type { SessionSummaryData } from '@shared/render/drawSessionSummary'
import WidgetBox, { type ActiveGuides } from './WidgetBox'
import { useWidgetStore } from '../store/widgetStore'
import { useProjectStore } from '../store/projectStore'

interface Props {
  style: CSSProperties
  frameWidth: number
  frameHeight: number
  sampler: TelemetrySampler | null
  currentTimeMs: number
}

function WidgetLayer({ style, frameWidth, frameHeight, sampler, currentTimeMs }: Props): React.JSX.Element | null {
  const widgets = useWidgetStore((s) => s.widgets)
  const selectWidget = useWidgetStore((s) => s.selectWidget)
  const startFinish = useProjectStore((s) => s.startFinish)
  const trimStartMs = useProjectStore((s) => s.trimStartMs)
  const trimEndMs = useProjectStore((s) => s.trimEndMs)
  // Only one widget can be dragged at a time, so a single shared slot (rather than per-widget state)
  // is enough -- whichever WidgetBox is actively being dragged reports into it. Guide lines span the
  // whole frame, so they're rendered here rather than inside the dragging widget's own box.
  const [activeGuides, setActiveGuides] = useState<ActiveGuides | null>(null)
  // Live delta of a group drag in progress -- the anchor WidgetBox (the one actually under the
  // pointer) reports its own delta here so every other selected WidgetBox can preview the same
  // delta applied to its own position while dragging, without each of them needing to know about
  // each other directly.
  const [groupDrag, setGroupDrag] = useState<{ anchorId: string; dxPx: number; dyPx: number } | null>(null)

  // One shared start/finish line for every widget that needs lap/sector detection -- computed
  // once here rather than duplicated per widget instance. Crossings/boundaries only depend on the
  // telemetry + chosen point, not on currentTimeMs, so this doesn't redo the O(n) scan every frame.
  const crossings = useMemo(
    () => (sampler && startFinish ? detectLapCrossings(sampler.samples, startFinish) : null),
    [sampler, startFinish]
  )
  const sectorBoundaries = useMemo(
    () => (sampler && crossings ? computeLapSectors(sampler.samples, crossings) : null),
    [sampler, crossings]
  )
  const lapState = useMemo(() => (crossings ? getLapStateAt(crossings, currentTimeMs) : null), [crossings, currentTimeMs])
  const sectorState = useMemo(
    () => (sectorBoundaries ? getSectorStateAt(sectorBoundaries, currentTimeMs) : null),
    [sectorBoundaries, currentTimeMs]
  )
  const lapDistanceCurves = useMemo(
    () => (sampler && crossings ? computeLapDistanceCurves(sampler.samples, crossings) : null),
    [sampler, crossings]
  )
  const deltaState = useMemo(
    () => (sampler && crossings && lapDistanceCurves ? getDeltaStateAt(lapDistanceCurves, crossings, sampler.samples, currentTimeMs) : null),
    [sampler, crossings, lapDistanceCurves, currentTimeMs]
  )
  // GPS Track's optional "ghost" marker (style.showGhost) -- shared across every gpsTrack widget
  // instance same as deltaState itself, computed once here rather than per-widget.
  const ghostPosition = useMemo(
    () => (sampler && deltaState?.ghostCts != null ? sampler.positionAt(deltaState.ghostCts) : null),
    [sampler, deltaState]
  )
  // The full per-lap trace list only depends on telemetry + crossings, not on currentTimeMs, so it's
  // precomputed once here (same reasoning as sectorBoundaries/lapDistanceCurves above). But it must
  // still be filtered down to laps actually completed BY currentTimeMs before it reaches the widget
  // -- otherwise scrubbing early in the video would show every lap in the whole session at once,
  // same "never leak a future lap in while scrubbing" discipline as getLapStateAt/getSectorStateAt.
  const allLapSpeedTraces = useMemo(
    () => (sampler && crossings ? computeLapSpeedTraces(sampler.samples, crossings) : []),
    [sampler, crossings]
  )
  const lapSpeedTraces = useMemo(
    () => (crossings ? allLapSpeedTraces.filter((t) => crossings[t.lapNumber] <= currentTimeMs) : []),
    [allLapSpeedTraces, crossings, currentTimeMs]
  )
  const currentLapSpeedTrace = useMemo(
    () => (sampler && crossings ? computeCurrentLapSpeedTrace(sampler.samples, crossings, currentTimeMs) : null),
    [sampler, crossings, currentTimeMs]
  )
  // Session Summary widget's data -- shared across every instance (unit/color choices are read from
  // each widget's own style at draw time, not baked in here), resolved "as of currentTimeMs" like
  // everything else on this screen rather than the session's true final totals, so scrubbing to
  // wherever the card happens to be visible never shows stats from later than that point.
  const sessionSummaryData: SessionSummaryData | null = useMemo(() => {
    if (!sampler) return null
    const stats = sampler.sessionStatsAt(currentTimeMs)
    return {
      totalLaps: lapState?.history.length ?? 0,
      bestLapMs: lapState?.bestLapMs ?? null,
      bestS1Ms: sectorState?.bestS1Ms ?? null,
      bestS2Ms: sectorState?.bestS2Ms ?? null,
      bestS3Ms: sectorState?.bestS3Ms ?? null,
      topSpeedMps: stats.maxSpeedMps,
      totalDistanceM: stats.totalDistanceM,
      elapsedMs: Math.max(0, currentTimeMs - trimStartMs)
    }
  }, [sampler, lapState, sectorState, currentTimeMs, trimStartMs])

  if (!sampler || frameWidth <= 0 || frameHeight <= 0) return null

  return (
    <div
      className="widget-layer"
      style={style}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) selectWidget(null)
      }}
    >
      {widgets.map((widget) => (
        <WidgetBox
          key={widget.id}
          widget={widget}
          frameWidth={frameWidth}
          frameHeight={frameHeight}
          sampler={sampler}
          currentTimeMs={currentTimeMs}
          lapState={lapState}
          sectorState={sectorState}
          deltaState={deltaState}
          ghostPosition={ghostPosition}
          sessionSummaryData={sessionSummaryData}
          sessionEndMs={trimEndMs}
          lapSpeedTraces={lapSpeedTraces}
          currentLapSpeedTrace={currentLapSpeedTrace}
          onGuidesChange={setActiveGuides}
          groupDrag={groupDrag}
          onGroupDragChange={setGroupDrag}
        />
      ))}
      {activeGuides?.xPx != null && <div className="alignment-guide alignment-guide--vertical" style={{ left: activeGuides.xPx }} />}
      {activeGuides?.yPx != null && <div className="alignment-guide alignment-guide--horizontal" style={{ top: activeGuides.yPx }} />}
    </div>
  )
}

export default WidgetLayer
