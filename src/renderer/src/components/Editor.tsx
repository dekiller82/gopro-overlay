import { useRef } from 'react'
import VideoPlayer, { type PlayerApi } from './VideoPlayer'
import WidgetLayer from './WidgetLayer'
import Timeline from './Timeline'
import PropertyPanel from './PropertyPanel'
import ErrorBoundary from './ErrorBoundary'
import { useProjectStore } from '../store/projectStore'
import { useContainedRect } from '../hooks/useContainedRect'
import { useTelemetrySampler } from '../hooks/useTelemetrySampler'

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
