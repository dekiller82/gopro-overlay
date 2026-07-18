import { useState } from 'react'
import { Rnd, type RndDragCallback, type RndResizeCallback } from 'react-rnd'
import type { WidgetInstance } from '@shared/types'
import type { TelemetrySampler } from '@shared/telemetry/sampleAt'
import type { LapState } from '@shared/telemetry/laps'
import type { SectorState } from '@shared/telemetry/sectors'
import type { DeltaState } from '@shared/telemetry/deltaTime'
import type { LapSpeedTrace } from '@shared/telemetry/speedTrace'
import { computeSnap } from '@shared/widgets/alignment'
import WidgetCanvas from './WidgetCanvas'
import { useWidgetStore } from '../store/widgetStore'
import { useAlignmentStore } from '../store/alignmentStore'

export interface ActiveGuides {
  xPx: number | null
  yPx: number | null
}

interface Props {
  widget: WidgetInstance
  frameWidth: number
  frameHeight: number
  sampler: TelemetrySampler
  currentTimeMs: number
  lapState: LapState | null
  sectorState: SectorState | null
  deltaState: DeltaState | null
  lapSpeedTraces: LapSpeedTrace[]
  currentLapSpeedTrace: LapSpeedTrace | null
  /** Reports which guide lines (if any) should be drawn while this widget is being dragged -- lifted
   *  up to WidgetLayer since guide lines span the whole frame, not just this one widget's box. */
  onGuidesChange: (guides: ActiveGuides | null) => void
}

function WidgetBox({
  widget,
  frameWidth,
  frameHeight,
  sampler,
  currentTimeMs,
  lapState,
  sectorState,
  deltaState,
  lapSpeedTraces,
  currentLapSpeedTrace,
  onGuidesChange
}: Props): React.JSX.Element {
  const selectedId = useWidgetStore((s) => s.selectedId)
  const selectWidget = useWidgetStore((s) => s.selectWidget)
  const updateWidget = useWidgetStore((s) => s.updateWidget)
  const bringToFront = useWidgetStore((s) => s.bringToFront)
  const paddingFraction = useAlignmentStore((s) => s.paddingFraction)
  const snapEnabled = useAlignmentStore((s) => s.snapEnabled)

  const isSelected = selectedId === widget.id
  const pixelW = widget.w * frameWidth
  const pixelH = widget.h * frameHeight
  const pixelX = widget.x * frameWidth
  const pixelY = widget.y * frameHeight

  // Local override during an active drag -- react-rnd is used as a controlled component (via
  // `position`) so snapping can visually override the pointer's raw position without writing to the
  // store on every mousemove. Cleared (falls back to the store's own pixelX/pixelY) once the drag ends.
  const [dragPreview, setDragPreview] = useState<{ x: number; y: number } | null>(null)

  const focus = (): void => {
    selectWidget(widget.id)
    bringToFront(widget.id)
  }

  const handleDrag: RndDragCallback = (_e, d) => {
    if (!snapEnabled) {
      setDragPreview({ x: d.x, y: d.y })
      return
    }
    const snap = computeSnap(d.x, d.y, pixelW, pixelH, frameWidth, frameHeight, paddingFraction)
    setDragPreview({ x: snap.x, y: snap.y })
    onGuidesChange({ xPx: snap.guideXPx, yPx: snap.guideYPx })
  }

  const handleDragStop: RndDragCallback = (_e, d) => {
    const snap = snapEnabled
      ? computeSnap(d.x, d.y, pixelW, pixelH, frameWidth, frameHeight, paddingFraction)
      : { x: d.x, y: d.y }
    updateWidget(widget.id, { x: snap.x / frameWidth, y: snap.y / frameHeight })
    setDragPreview(null)
    onGuidesChange(null)
  }

  const handleResizeStop: RndResizeCallback = (_e, _direction, ref, _delta, position) => {
    updateWidget(widget.id, {
      w: ref.offsetWidth / frameWidth,
      h: ref.offsetHeight / frameHeight,
      x: position.x / frameWidth,
      y: position.y / frameHeight
    })
  }

  return (
    <Rnd
      size={{ width: pixelW, height: pixelH }}
      position={dragPreview ?? { x: pixelX, y: pixelY }}
      // No bounds constraint -- widgets (e.g. a GPS map made deliberately larger than the frame so
      // it reads more clearly, then tucked into a corner) need to be draggable/resizable partly or
      // mostly off-frame. The video-stage's own edges no longer apply here; .widget-layer clips the
      // actual visible rendering to the frame's exact bounds (see global.css), same as export
      // (Canvas2D naturally clips anything drawn outside the canvas's own pixel bounds).
      style={{ zIndex: widget.zIndex }}
      className={`widget-box${isSelected ? ' widget-box--selected' : ''}`}
      onDragStart={focus}
      onDrag={handleDrag}
      onDragStop={handleDragStop}
      onResizeStart={focus}
      onResizeStop={handleResizeStop}
    >
      <div className="widget-box__inner" onMouseDown={focus}>
        <WidgetCanvas
          widget={widget}
          sampler={sampler}
          currentTimeMs={currentTimeMs}
          pixelWidth={pixelW}
          pixelHeight={pixelH}
          lapState={lapState}
          sectorState={sectorState}
          deltaState={deltaState}
          lapSpeedTraces={lapSpeedTraces}
          currentLapSpeedTrace={currentLapSpeedTrace}
        />
      </div>
    </Rnd>
  )
}

export default WidgetBox
