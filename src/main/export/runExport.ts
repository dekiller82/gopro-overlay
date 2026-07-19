import { spawn } from 'child_process'
import ffmpegPathRaw from 'ffmpeg-static'
import type { ClipInfo, LatLon, WidgetInstance } from '../../shared/types'
import type { TelemetrySampler } from '../../shared/telemetry/sampleAt'
import { createFrameRenderer } from './frameRenderer'
import { selectVideoEncoder, CPU_ENCODER, type VideoEncoder } from './gpuEncoder'
import { resolveUnpackedBinaryPath } from '../app/binaryPath'

export interface ExportSettings {
  width: number
  height: number
  fps: number
  crf: number
  /** Use a hardware encoder (NVENC/QSV/AMF) if this machine actually has a working one; falls back to libx264 otherwise. Default true. */
  preferGpu?: boolean
}

export interface RunExportOptions {
  clips: ClipInfo[]
  outputPath: string
  widgets: WidgetInstance[]
  sampler: TelemetrySampler
  /** Shared by every widget that needs lap/sector detection. */
  startFinish: LatLon | null
  /** Whole-sequence trim, global ms spanning all clips. */
  trimStartMs: number
  trimEndMs: number
  settings: ExportSettings
  onProgress?: (framesWritten: number, totalFrames: number) => void
  onEncoderSelected?: (label: string) => void
}

/** This clip's own local seconds for a global-timeline ms position, clamped to [0, its own duration]
 *  -- a global position outside this clip's own range collapses to a safe no-op trim boundary
 *  (0 or the clip's full length) rather than a negative/out-of-range value. */
function clipLocalSeconds(clip: ClipInfo, globalMs: number): number {
  const localMs = globalMs - clip.startOffsetMs
  return Math.max(0, Math.min(clip.video.durationMs, localMs)) / 1000
}

/**
 * Builds the full ffmpeg args for one encoder attempt. Three shapes, matched 1:1 to real CLI
 * verification done before this was wired in (see project memory) -- particularly the `-frames:v`
 * cap, which is NOT optional: ffmpeg's trim/concat filters can land on a frame count one off from
 * our own authoritative count due to boundary rounding, and the overlay filter pads with a
 * duplicated last frame to match whichever stream is longer if left uncapped.
 */
function buildFfmpegArgs(
  clips: ClipInfo[],
  settings: ExportSettings,
  trimStartMs: number,
  trimEndMs: number,
  totalFrames: number,
  encoder: VideoEncoder,
  outputPath: string
): string[] {
  const hasAudio = clips[0].video.hasAudio
  // When the selected encoder has a smoke-tested decodeHwaccel (see gpuEncoder.ts), every clip's
  // decode is offloaded to the GPU too -- otherwise only the final encode runs on the GPU while
  // software-decoding the source clip(s) on CPU becomes the real bottleneck. Must be repeated
  // before EACH input, not once globally.
  const inputArgs: string[] = []
  for (const clip of clips) {
    if (encoder.decodeHwaccel) inputArgs.push('-hwaccel', encoder.decodeHwaccel)
    inputArgs.push('-i', clip.video.path)
  }
  const overlayInputIndex = clips.length // the rawvideo pipe is the input right after every clip input

  const lastClip = clips[clips.length - 1]
  const sequenceEndMs = lastClip.startOffsetMs + lastClip.video.durationMs
  const needsTrim = trimStartMs > 0 || trimEndMs < sequenceEndMs

  let filterComplex: string
  let videoMapLabel: string
  let audioMapLabel: string | null
  let audioCodecArgs: string[]

  if (clips.length === 1 && !needsTrim) {
    // Case A: exactly the ORIGINAL single-clip path, byte-for-byte unchanged -- zero risk to any
    // existing single-clip project. `0:a?` (bare stream specifier, not a filter-graph label) lets
    // ffmpeg's own `?` skip audio gracefully if the clip happens to have none.
    filterComplex = `[${overlayInputIndex}:v]format=rgba[ov];[0:v][ov]overlay=0:0:format=auto[v]`
    videoMapLabel = '[v]'
    audioMapLabel = '0:a?'
    audioCodecArgs = ['-c:a', 'copy']
  } else if (clips.length === 1) {
    // Case B: single clip, trimmed. Trim forces a decode, so audio can't stay stream-copied.
    const startSec = clipLocalSeconds(clips[0], trimStartMs)
    const endSec = clipLocalSeconds(clips[0], trimEndMs)
    const parts = [`[0:v]trim=start=${startSec}:end=${endSec},setpts=PTS-STARTPTS[vtrim]`]
    if (hasAudio) parts.push(`[0:a]atrim=start=${startSec}:end=${endSec},asetpts=PTS-STARTPTS[atrim]`)
    parts.push(`[${overlayInputIndex}:v]format=rgba[ov]`, '[vtrim][ov]overlay=0:0:format=auto[v]')
    filterComplex = parts.join(';')
    videoMapLabel = '[v]'
    audioMapLabel = hasAudio ? '[atrim]' : null
    audioCodecArgs = hasAudio ? ['-c:a', 'aac'] : ['-an']
  } else {
    // Case C: N>1 clips, concatenated. Start-trim only applies to the first clip, end-trim only
    // to the last (both are safe no-ops when not actually needed, via clipLocalSeconds' clamping,
    // so the same graph shape covers "no trim at all" too). Concat's pins are interleaved PER
    // SEGMENT ([v0][a0][v1][a1]...), not grouped by kind.
    const segmentParts: string[] = []
    const concatPins: string[] = []
    clips.forEach((clip, i) => {
      const isFirst = i === 0
      const isLast = i === clips.length - 1
      const vLabel = `v${i}`
      const aLabel = `a${i}`

      if (isFirst && isLast) {
        const startSec = clipLocalSeconds(clip, trimStartMs)
        const endSec = clipLocalSeconds(clip, trimEndMs)
        segmentParts.push(`[${i}:v]trim=start=${startSec}:end=${endSec},setpts=PTS-STARTPTS[${vLabel}]`)
        if (hasAudio) segmentParts.push(`[${i}:a]atrim=start=${startSec}:end=${endSec},asetpts=PTS-STARTPTS[${aLabel}]`)
      } else if (isFirst) {
        const startSec = clipLocalSeconds(clip, trimStartMs)
        segmentParts.push(`[${i}:v]trim=start=${startSec},setpts=PTS-STARTPTS[${vLabel}]`)
        if (hasAudio) segmentParts.push(`[${i}:a]atrim=start=${startSec},asetpts=PTS-STARTPTS[${aLabel}]`)
      } else if (isLast) {
        const endSec = clipLocalSeconds(clip, trimEndMs)
        segmentParts.push(`[${i}:v]trim=end=${endSec},setpts=PTS-STARTPTS[${vLabel}]`)
        if (hasAudio) segmentParts.push(`[${i}:a]atrim=end=${endSec},asetpts=PTS-STARTPTS[${aLabel}]`)
      } else {
        segmentParts.push(`[${i}:v]setpts=PTS-STARTPTS[${vLabel}]`)
        if (hasAudio) segmentParts.push(`[${i}:a]asetpts=PTS-STARTPTS[${aLabel}]`)
      }

      concatPins.push(`[${vLabel}]`)
      if (hasAudio) concatPins.push(`[${aLabel}]`)
    })

    const concatOutputs = hasAudio ? '[vconcat][aconcat]' : '[vconcat]'
    segmentParts.push(`${concatPins.join('')}concat=n=${clips.length}:v=1:a=${hasAudio ? 1 : 0}${concatOutputs}`)
    segmentParts.push(`[${overlayInputIndex}:v]format=rgba[ov]`, '[vconcat][ov]overlay=0:0:format=auto[vout]')

    filterComplex = segmentParts.join(';')
    videoMapLabel = '[vout]'
    audioMapLabel = hasAudio ? '[aconcat]' : null
    audioCodecArgs = hasAudio ? ['-c:a', 'aac'] : ['-an']
  }

  const args = [
    '-y',
    ...inputArgs,
    '-f',
    'rawvideo',
    '-pix_fmt',
    'rgba',
    '-s',
    `${settings.width}x${settings.height}`,
    '-r',
    String(settings.fps),
    '-i',
    'pipe:0',
    '-filter_complex',
    filterComplex,
    '-map',
    videoMapLabel
  ]
  if (audioMapLabel) args.push('-map', audioMapLabel)
  args.push('-frames:v', String(totalFrames))
  args.push('-c:v', encoder.codec, ...encoder.qualityArgs(settings.crf), '-pix_fmt', 'yuv420p', ...audioCodecArgs, outputPath)
  return args
}

/** Runs one full ffmpeg pass with a specific encoder. Rejects (without partial output left behind by ffmpeg's own -y overwrite semantics) if that encoder fails partway through. */
function runWithEncoder(
  resolvedFfmpegPath: string,
  encoder: VideoEncoder,
  clips: ClipInfo[],
  outputPath: string,
  settings: ExportSettings,
  trimStartMs: number,
  trimEndMs: number,
  totalFrames: number,
  renderFrame: (sampleCts: number, elapsedMs: number) => Buffer,
  onProgress?: (framesWritten: number, totalFrames: number) => void
): Promise<void> {
  const args = buildFfmpegArgs(clips, settings, trimStartMs, trimEndMs, totalFrames, encoder, outputPath)

  return new Promise((resolveOuter, rejectOuter) => {
    void (async () => {
      const ff = spawn(resolvedFfmpegPath, args, { stdio: ['pipe', 'ignore', 'pipe'] })

      let stderrTail = ''
      ff.stderr.on('data', (chunk: Buffer) => {
        stderrTail = (stderrTail + chunk.toString()).slice(-4000)
      })

      let writeError: unknown = null
      ff.stdin.on('error', (err) => {
        writeError = err
      })

      const exitPromise = new Promise<void>((resolve, reject) => {
        ff.on('error', reject)
        ff.on('close', (code) => {
          if (code === 0) resolve()
          else reject(new Error(`ffmpeg (${encoder.label}) exited with code ${code}\n${stderrTail}`))
        })
      })

      for (let frameIndex = 0; frameIndex < totalFrames; frameIndex++) {
        if (writeError) break

        const elapsedMs = (frameIndex / settings.fps) * 1000
        const sampleCts = trimStartMs + elapsedMs
        const frameBuffer = renderFrame(sampleCts, elapsedMs)

        try {
          const canWriteMore = ff.stdin.write(frameBuffer)
          if (!canWriteMore) {
            await new Promise<void>((resolve) => ff.stdin.once('drain', resolve))
          }
        } catch (err) {
          writeError = err
          break
        }

        onProgress?.(frameIndex + 1, totalFrames)
      }

      try {
        ff.stdin.end()
      } catch {
        // stream may already be closed if ffmpeg exited early; the real error surfaces via exitPromise
      }

      try {
        await exitPromise
        resolveOuter()
      } catch (err) {
        rejectOuter(err)
      }
    })()
  })
}

export async function runExport(options: RunExportOptions): Promise<void> {
  const { clips, outputPath, widgets, sampler, startFinish, trimStartMs, trimEndMs, settings, onProgress, onEncoderSelected } = options

  const ffmpegPath = resolveUnpackedBinaryPath(ffmpegPathRaw)
  if (!ffmpegPath) throw new Error('Bundled ffmpeg binary not found for this platform')
  if (widgets.length === 0) throw new Error('No widgets to export')
  if (clips.length === 0) throw new Error('No clips to export')
  const resolvedFfmpegPath: string = ffmpegPath

  const totalFrames = Math.max(1, Math.round(((trimEndMs - trimStartMs) / 1000) * settings.fps))
  const renderFrame = await createFrameRenderer(settings.width, settings.height, widgets, sampler, startFinish, trimEndMs, trimStartMs)

  const encoder = await selectVideoEncoder(resolvedFfmpegPath, settings.preferGpu ?? true)
  console.log(`[export] using video encoder: ${encoder.label} (${encoder.codec})`)
  onEncoderSelected?.(encoder.label)

  try {
    await runWithEncoder(resolvedFfmpegPath, encoder, clips, outputPath, settings, trimStartMs, trimEndMs, totalFrames, renderFrame, onProgress)
  } catch (err) {
    // The quick smoke-test in selectVideoEncoder can pass while the real export (much larger
    // resolution/duration) still hits a GPU-specific limit -- fall back to CPU once rather than
    // failing the whole export outright.
    if (encoder.codec === CPU_ENCODER.codec) throw err
    console.warn(`[export] ${encoder.label} failed mid-export, retrying with CPU encoder:`, err)
    onEncoderSelected?.(`${CPU_ENCODER.label} (fallback after ${encoder.label} failed)`)
    await runWithEncoder(resolvedFfmpegPath, CPU_ENCODER, clips, outputPath, settings, trimStartMs, trimEndMs, totalFrames, renderFrame, onProgress)
  }
}
