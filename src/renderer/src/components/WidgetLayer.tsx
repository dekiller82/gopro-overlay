import { CSSProperties, useMemo, useState } from 'react'
import type { TelemetrySampler } from '@shared/telemetry/sampleAt'
import { detectLapCrossings, getLapStateAt } from '@shared/telemetry/laps'
import { computeLapSectors, getSectorStateAt } from '@shared/telemetry/sectors'
import { computeLapDistanceCurves, getDeltaStateAt } from '@shared/telemetry/deltaTime'
import { computeCurrentLapSpeedTrace, computeLapSpeedTraces } from '@shared/telemetry/speedTrace'
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
  // Only one widget can be dragged at a time, so a single shared slot (rather than per-widget state)
  // is enough -- whichever WidgetBox is actively being dragged reports into it. Guide lines span the
  // whole frame, so they're rendered here rather than inside the dragging widget's own box.
  const [activeGuides, setActiveGuides] = useState<ActiveGuides | null>(null)

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
          lapSpeedTraces={lapSpeedTraces}
          currentLapSpeedTrace={currentLapSpeedTrace}
          onGuidesChange={setActiveGuides}
        />
      ))}
      {activeGuides?.xPx != null && <div className="alignment-guide alignment-guide--vertical" style={{ left: activeGuides.xPx }} />}
      {activeGuides?.yPx != null && <div className="alignment-guide alignment-guide--horizontal" style={{ top: activeGuides.yPx }} />}
    </div>
  )
}

export default WidgetLayer
