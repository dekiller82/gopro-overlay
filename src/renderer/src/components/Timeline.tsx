import { RefObject, useCallback, useEffect, useRef, useState } from 'react'
import { formatTime } from '@shared/format'
import { clipIndexAtGlobalMs } from '@shared/timeline/clipTiming'
import { useProjectStore } from '../store/projectStore'
import { useWidgetStore } from '../store/widgetStore'
import type { PlayerApi } from './VideoPlayer'

interface Props {
  videoRef: RefObject<HTMLVideoElement | null>
  playerApiRef: RefObject<PlayerApi | null>
}

const EDITABLE_TAGS = new Set(['INPUT', 'TEXTAREA', 'SELECT'])
/** Trim handles can't be dragged closer together than this -- keeps a degenerate zero-length
 *  export range from being reachable by accident. */
const MIN_TRIM_GAP_MS = 200

type DragMode = 'playhead' | 'trimStart' | 'trimEnd' | null

function Timeline({ videoRef, playerApiRef }: Props): React.JSX.Element | null {
  const imported = useProjectStore((s) => s.imported)
  const currentTimeMs = useProjectStore((s) => s.currentTimeMs)
  const isPlaying = useProjectStore((s) => s.isPlaying)
  const trimStartMs = useProjectStore((s) => s.trimStartMs)
  const trimEndMs = useProjectStore((s) => s.trimEndMs)
  const setTrim = useProjectStore((s) => s.setTrim)
  const widgetSelectedIds = useWidgetStore((s) => s.selectedIds)

  const trackRef = useRef<HTMLDivElement>(null)
  const [dragging, setDragging] = useState<DragMode>(null)
  const dragRafRef = useRef<number | null>(null)

  const totalDurationMs = imported?.telemetry.videoDurationMs ?? 0

  const ratioFromClientX = useCallback((clientX: number) => {
    const rect = trackRef.current?.getBoundingClientRect()
    if (!rect || rect.width === 0) return 0
    return Math.min(1, Math.max(0, (clientX - rect.left) / rect.width))
  }, [])

  const seekToRatio = useCallback(
    (ratio: number) => {
      if (!imported) return
      playerApiRef.current?.seekToGlobalMs(ratio * totalDurationMs)
    },
    [imported, playerApiRef, totalDurationMs]
  )

  const handlePlayheadMouseDown = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (!imported) return
      e.preventDefault()
      setDragging('playhead')
      seekToRatio(ratioFromClientX(e.clientX))
    },
    [imported, ratioFromClientX, seekToRatio]
  )

  const handleTrimHandleMouseDown = useCallback((which: 'trimStart' | 'trimEnd') => {
    return (e: React.MouseEvent<HTMLDivElement>) => {
      e.preventDefault()
      e.stopPropagation()
      setDragging(which)
    }
  }, [])

  useEffect(() => {
    if (!dragging) return

    // rAF-throttled during the drag (cheap, keeps up with a fast mousemove burst); mouseup applies
    // the release position synchronously instead of relying on a queued rAF, which mouseup's own
    // cleanup (below) would cancel before it ever fires -- otherwise the final released position is
    // silently dropped.
    const applyDragAt = (clientX: number): void => {
      const ratio = ratioFromClientX(clientX)
      const ms = ratio * totalDurationMs
      if (dragging === 'playhead') {
        seekToRatio(ratio)
      } else if (dragging === 'trimStart') {
        setTrim(Math.min(ms, trimEndMs - MIN_TRIM_GAP_MS), trimEndMs)
      } else {
        setTrim(trimStartMs, Math.max(ms, trimStartMs + MIN_TRIM_GAP_MS))
      }
    }

    const onMouseMove = (e: MouseEvent): void => {
      if (dragRafRef.current !== null) cancelAnimationFrame(dragRafRef.current)
      dragRafRef.current = requestAnimationFrame(() => applyDragAt(e.clientX))
    }
    const onMouseUp = (e: MouseEvent): void => {
      if (dragRafRef.current !== null) {
        cancelAnimationFrame(dragRafRef.current)
        dragRafRef.current = null
      }
      applyDragAt(e.clientX)
      setDragging(null)
    }

    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseup', onMouseUp)
    return () => {
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('mouseup', onMouseUp)
      if (dragRafRef.current !== null) cancelAnimationFrame(dragRafRef.current)
    }
  }, [dragging, ratioFromClientX, seekToRatio, setTrim, totalDurationMs, trimStartMs, trimEndMs])

  const togglePlay = useCallback(() => {
    const video = videoRef.current
    if (!video) return
    if (video.paused) video.play()
    else video.pause()
  }, [videoRef])

  // Same-clip stepping keeps the fast direct-videoRef path (matches today's behavior exactly);
  // rolling over a clip boundary goes through the seekToGlobalMs controller, which owns clip
  // switching.
  const stepFrame = useCallback(
    (direction: 1 | -1) => {
      const video = videoRef.current
      if (!video || !imported) return
      if (!video.paused) video.pause()

      const activeClipIndex = clipIndexAtGlobalMs(imported.clips, currentTimeMs)
      const activeClip = imported.clips[activeClipIndex]
      if (!activeClip || !activeClip.video.fps) return

      const frameDurationSec = 1 / activeClip.video.fps
      const localDurationSec = activeClip.video.durationMs / 1000
      const targetLocalSec = video.currentTime + direction * frameDurationSec

      if (targetLocalSec < 0 && activeClipIndex > 0) {
        const prevClip = imported.clips[activeClipIndex - 1]
        const prevFrameDurationMs = prevClip.video.fps ? 1000 / prevClip.video.fps : 0
        const prevLastFrameGlobalMs = prevClip.startOffsetMs + Math.max(0, prevClip.video.durationMs - prevFrameDurationMs)
        playerApiRef.current?.seekToGlobalMs(prevLastFrameGlobalMs)
        return
      }

      if (targetLocalSec > localDurationSec && activeClipIndex < imported.clips.length - 1) {
        const nextClip = imported.clips[activeClipIndex + 1]
        playerApiRef.current?.seekToGlobalMs(nextClip.startOffsetMs)
        return
      }

      video.currentTime = Math.min(localDurationSec, Math.max(0, targetLocalSec))
    },
    [videoRef, imported, currentTimeMs, playerApiRef]
  )

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent): void => {
      const activeTag = document.activeElement?.tagName
      if (activeTag && EDITABLE_TAGS.has(activeTag)) return
      // While a widget is selected, ArrowLeft/ArrowRight nudge its position instead (see Editor.tsx)
      // -- defer to that handler entirely rather than also stepping the frame on the same keypress.
      if ((e.key === 'ArrowLeft' || e.key === 'ArrowRight') && widgetSelectedIds.length > 0) return
      if (e.key === 'ArrowLeft') {
        e.preventDefault()
        stepFrame(-1)
      } else if (e.key === 'ArrowRight') {
        e.preventDefault()
        stepFrame(1)
      } else if (e.key === ' ') {
        e.preventDefault()
        togglePlay()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [stepFrame, togglePlay, widgetSelectedIds])

  if (!imported) return null

  const pct = totalDurationMs ? Math.min(100, (currentTimeMs / totalDurationMs) * 100) : 0
  const trimStartPct = totalDurationMs ? Math.min(100, (trimStartMs / totalDurationMs) * 100) : 0
  const trimEndPct = totalDurationMs ? Math.min(100, (trimEndMs / totalDurationMs) * 100) : 100

  return (
    <div className="timeline">
      <button
        className="timeline__step"
        onClick={() => stepFrame(-1)}
        aria-label="Previous frame"
        title="Previous frame (Left arrow)"
      >
        ⏮
      </button>
      <button className="timeline__play" onClick={togglePlay} aria-label={isPlaying ? 'Pause' : 'Play'} title="Play/pause (Space)">
        {isPlaying ? '⏸' : '▶'}
      </button>
      <button
        className="timeline__step"
        onClick={() => stepFrame(1)}
        aria-label="Next frame"
        title="Next frame (Right arrow)"
      >
        ⏭
      </button>
      <span className="timeline__time">{formatTime(currentTimeMs, true)}</span>
      <div className="timeline__track" ref={trackRef} onMouseDown={handlePlayheadMouseDown}>
        <div className="timeline__fill" style={{ width: `${pct}%` }} />
        {trimStartPct > 0 && <div className="timeline__trim-mask timeline__trim-mask--start" style={{ width: `${trimStartPct}%` }} />}
        {trimEndPct < 100 && (
          <div className="timeline__trim-mask timeline__trim-mask--end" style={{ left: `${trimEndPct}%` }} />
        )}
        {imported.clips.slice(1).map((clip) => {
          const clipPct = totalDurationMs ? (clip.startOffsetMs / totalDurationMs) * 100 : 0
          return <div key={clip.startOffsetMs} className="timeline__clip-marker" style={{ left: `${clipPct}%` }} />
        })}
        <div className="timeline__handle" style={{ left: `${pct}%` }} />
        <div
          className="timeline__trim-handle timeline__trim-handle--start"
          style={{ left: `${trimStartPct}%` }}
          onMouseDown={handleTrimHandleMouseDown('trimStart')}
          title={`Trim start: ${formatTime(trimStartMs, true)}`}
        />
        <div
          className="timeline__trim-handle timeline__trim-handle--end"
          style={{ left: `${trimEndPct}%` }}
          onMouseDown={handleTrimHandleMouseDown('trimEnd')}
          title={`Trim end: ${formatTime(trimEndMs, true)}`}
        />
      </div>
      <span className="timeline__time timeline__time--dim">{formatTime(totalDurationMs, true)}</span>
    </div>
  )
}

export default Timeline
