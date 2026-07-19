import { useEffect, useRef } from 'react'
import VideoPlayer, { type PlayerApi } from './VideoPlayer'
import WidgetLayer from './WidgetLayer'
import Timeline from './Timeline'
import PropertyPanel from './PropertyPanel'
import ErrorBoundary from './ErrorBoundary'
import { useProjectStore } from '../store/projectStore'
import { useWidgetStore } from '../store/widgetStore'
import { useContainedRect } from '../hooks/useContainedRect'
import { useTelemetrySampler } from '../hooks/useTelemetrySampler'

const EDITABLE_TAGS = new Set(['INPUT', 'TEXTAREA', 'SELECT'])

function Editor(): React.JSX.Element {
  const videoRef = useRef<HTMLVideoElement>(null)
  const stageRef = useRef<HTMLDivElement>(null)
  // Imperative seek controller: VideoPlayer owns clip-switching, Timeline (and future callers)
  // just call playerApiRef.current.seekToGlobalMs(ms) -- a direct method call rather than a store
  // field, so there's no "who clears it / did the effect see it twice" state to go stale.
  const playerApiRef = useRef<PlayerApi | null>(null)
  const imported = useProjectStore((s) => s.imported)
  const currentTimeMs = useProjectStore((s) => s.currentTimeMs)
  const sampler = useTelemetrySampler(imported)
  const undo = useWidgetStore((s) => s.undo)
  const redo = useWidgetStore((s) => s.redo)
  const selectedIds = useWidgetStore((s) => s.selectedIds)
  const moveWidgetsBy = useWidgetStore((s) => s.moveWidgetsBy)
  const removeWidgets = useWidgetStore((s) => s.removeWidgets)

  // Ctrl/Cmd+Z / Ctrl/Cmd+Shift+Z (or +Y) for widget-edit undo/redo -- skipped while a text/select
  // input has focus so it doesn't fight a property panel text field's own native undo.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent): void => {
      const key = e.key.toLowerCase()
      if (!(e.ctrlKey || e.metaKey) || (key !== 'z' && key !== 'y')) return
      const target = e.target as HTMLElement | null
      if (target && EDITABLE_TAGS.has(target.tagName)) return

      e.preventDefault()
      if (key === 'y') redo()
      else if (e.shiftKey) redo()
      else undo()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [undo, redo])

  const referenceVideo = imported?.clips[0]?.video
  const aspectRatio = referenceVideo ? referenceVideo.width / referenceVideo.height : 16 / 9
  const rect = useContainedRect(stageRef, aspectRatio)
  const frameStyle = {
    position: 'absolute' as const,
    left: rect.left,
    top: rect.top,
    width: rect.width,
    height: rect.height
  }

  // Arrow-key nudge (1px, or 10px with shift) + Delete/Backspace, moving/removing every widget in
  // the current selection together -- only active while at least one widget is selected, so it
  // never fires while the user is just scrubbing the timeline with nothing selected. Timeline's own
  // ArrowLeft/ArrowRight frame-step handler defers to this one (bails out) whenever a widget is
  // selected, so the two can't both react to the same keypress.
  useEffect(() => {
    if (selectedIds.length === 0) return
    const onKeyDown = (e: KeyboardEvent): void => {
      const target = e.target as HTMLElement | null
      if (target && EDITABLE_TAGS.has(target.tagName)) return

      if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault()
        removeWidgets(selectedIds)
        return
      }

      const nudgePx = e.shiftKey ? 10 : 1
      if (e.key === 'ArrowLeft') {
        e.preventDefault()
        moveWidgetsBy(selectedIds, -nudgePx / rect.width, 0)
      } else if (e.key === 'ArrowRight') {
        e.preventDefault()
        moveWidgetsBy(selectedIds, nudgePx / rect.width, 0)
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        moveWidgetsBy(selectedIds, 0, -nudgePx / rect.height)
      } else if (e.key === 'ArrowDown') {
        e.preventDefault()
        moveWidgetsBy(selectedIds, 0, nudgePx / rect.height)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [selectedIds, moveWidgetsBy, removeWidgets, rect.width, rect.height])

  return (
    <div className="editor">
      <div className="editor__main">
        <div className="video-stage" ref={stageRef}>
          <VideoPlayer videoRef={videoRef} style={frameStyle} playerApiRef={playerApiRef} />
          <ErrorBoundary compactLabel="Widget layer error">
            <WidgetLayer
              style={frameStyle}
              frameWidth={rect.width}
              frameHeight={rect.height}
              sampler={sampler}
              currentTimeMs={currentTimeMs}
            />
          </ErrorBoundary>
        </div>
        <Timeline videoRef={videoRef} playerApiRef={playerApiRef} sampler={sampler} />
        {imported && (
          <div className="editor__meta">
            {imported.clips.length > 1 ? `${imported.clips.length} clips` : imported.clips[0].video.fileName} ·{' '}
            {imported.telemetry.samples.length} GPS samples ({imported.telemetry.gpsStream})
          </div>
        )}
      </div>
      <ErrorBoundary compactLabel="Property panel error">
        <PropertyPanel />
      </ErrorBoundary>
    </div>
  )
}

export default Editor
