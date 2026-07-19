import { spawn } from 'child_process'
import { existsSync } from 'fs'
import { mkdir, rename, rm, stat, unlink } from 'fs/promises'
import { createHash } from 'crypto'
import { join } from 'path'
import { app } from 'electron'
import ffmpegPathRaw from 'ffmpeg-static'
import type { VideoMeta } from '../../shared/types'
import { resolveUnpackedBinaryPath } from '../app/binaryPath'

function getPreviewCacheDir(): string {
  return join(app.getPath('temp'), 'gopro-overlay-previews')
}

/** Proxies are cheap to regenerate (the common case is a near-instant remux), so rather than
 * tracking retention/age, just wipe the whole cache on each app start -- called from main/index.ts. */
export async function clearPreviewCache(): Promise<void> {
  await rm(getPreviewCacheDir(), { recursive: true, force: true }).catch(() => {})
}

async function getProxyPath(sourcePath: string, tag: string, extension: string): Promise<string> {
  const { size, mtimeMs } = await stat(sourcePath)
  const hash = createHash('md5').update(`${sourcePath}:${size}:${mtimeMs}`).digest('hex')
  const dir = getPreviewCacheDir()
  await mkdir(dir, { recursive: true })
  return join(dir, `${hash}.${tag}.${extension}`)
}

/** Runs ffmpeg with `args` (source/output paths excluded), writing to a temp file that's only renamed into place on verified success. `-f <format>` is forced explicitly so output-format detection never depends on the (temp) filename's extension. */
async function runFfmpeg(
  resolvedFfmpegPath: string,
  sourcePath: string,
  outputPath: string,
  format: 'mp4' | 'webm',
  extraArgs: string[],
  video: VideoMeta,
  onProgress?: (fraction: number) => void
): Promise<void> {
  const tempOutputPath = `${outputPath}.tmp-${process.pid}-${Date.now()}.${format}`
  const args = ['-y', '-i', sourcePath, ...extraArgs, '-f', format, '-progress', 'pipe:1', '-nostats', tempOutputPath]

  try {
    await new Promise<void>((resolve, reject) => {
      const ff = spawn(resolvedFfmpegPath, args, { stdio: ['ignore', 'pipe', 'pipe'] })
      let stderrTail = ''
      let stdoutBuffer = ''

      ff.stderr.on('data', (chunk: Buffer) => {
        stderrTail = (stderrTail + chunk.toString()).slice(-4000)
      })

      ff.stdout.on('data', (chunk: Buffer) => {
        stdoutBuffer += chunk.toString()
        const lines = stdoutBuffer.split('\n')
        stdoutBuffer = lines.pop() ?? ''
        for (const line of lines) {
          const match = /^out_time_ms=(\d+)/.exec(line)
          if (match && video.durationMs > 0) {
            const outTimeMs = Number(match[1]) / 1000
            onProgress?.(Math.min(1, outTimeMs / video.durationMs))
          }
        }
      })

      ff.on('error', reject)
      ff.on('close', (code) => {
        if (code === 0) resolve()
        else reject(new Error(`ffmpeg exited with code ${code}\n${stderrTail}`))
      })
    })

    const { size } = await stat(tempOutputPath).catch(() => ({ size: 0 }))
    if (size === 0) throw new Error('ffmpeg produced an empty file')

    await rename(tempOutputPath, outputPath)
  } catch (err) {
    await unlink(tempOutputPath).catch(() => {})
    throw err
  }
}

async function cachedOrGenerate(
  outputPath: string,
  generate: () => Promise<void>
): Promise<string> {
  if (existsSync(outputPath)) {
    const { size } = await stat(outputPath)
    // Guard against a poisoned cache from a previous failed/interrupted run leaving a truncated
    // file behind -- without this, every future import would silently reuse it forever.
    if (size > 0) return outputPath
    await unlink(outputPath)
  }
  await generate()
  return outputPath
}

/**
 * Produces a preview-friendly copy of the source video, used as a fallback only when the
 * renderer's <video> element actually fails to play the original file natively -- not called
 * preemptively, so most clips preview at full resolution with zero cost. Export always uses the
 * original source file, never this.
 *
 * Two-tier strategy:
 *  1. Fast remux: stream-copy video+audio into a clean MP4 (no re-encode, near-instant, keeps full
 *     original resolution/quality). Fixes files that only fail because of extra GoPro metadata
 *     tracks (gpmd/tmcd/fdsc) confusing the <video> demuxer -- but does NOT change the video codec,
 *     so it can't help if the codec itself isn't decodable in this Chromium build.
 *  2. VP9/WebM transcode: if the remux still doesn't play, the codec itself is the problem (this
 *     covers the case where the Electron build's Chromium lacks H.264 decode support entirely --
 *     a real, documented limitation of some Electron builds, unrelated to HEVC). VP9+Opus in WebM
 *     is royalty-free and always supported by Chromium regardless of proprietary-codec licensing.
 */
export async function ensurePreviewProxy(
  video: VideoMeta,
  onProgress?: (fraction: number) => void
): Promise<string> {
  const ffmpegPath = resolveUnpackedBinaryPath(ffmpegPathRaw)
  if (!ffmpegPath) throw new Error('Bundled ffmpeg binary not found for this platform')
  const resolvedFfmpegPath: string = ffmpegPath

  const remuxPath = await getProxyPath(video.path, 'remux', 'mp4')
  try {
    return await cachedOrGenerate(remuxPath, () =>
      runFfmpeg(
        resolvedFfmpegPath,
        video.path,
        remuxPath,
        'mp4',
        ['-map', '0:v:0', '-map', '0:a:0?', '-c', 'copy', '-movflags', '+faststart'],
        video,
        onProgress
      )
    )
  } catch (remuxErr) {
    console.warn('[preview-proxy] fast remux failed, falling back to VP9/WebM transcode:', remuxErr)
  }

  const webmPath = await getProxyPath(video.path, 'vp9', 'webm')
  return cachedOrGenerate(webmPath, () =>
    runFfmpeg(
      resolvedFfmpegPath,
      video.path,
      webmPath,
      'webm',
      [
        '-vf',
        "scale='min(1280,iw)':-2",
        '-c:v',
        'libvpx-vp9',
        '-deadline',
        'realtime',
        '-cpu-used',
        '8',
        '-crf',
        '34',
        '-b:v',
        '0',
        '-c:a',
        'libopus',
        '-b:a',
        '128k'
      ],
      video,
      onProgress
    )
  )
}
