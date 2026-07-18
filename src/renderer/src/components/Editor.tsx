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
        <Timeline videoRef={videoRef} playerApiRef={playerApiRef} />
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
