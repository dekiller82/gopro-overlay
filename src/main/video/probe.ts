import { execFile } from 'child_process'
import { promisify } from 'util'
import { basename } from 'path'
import ffprobeStatic from 'ffprobe-static'
import type { VideoMeta } from '../../shared/types'
import { findLrvSibling } from './lrv'
import { resolveUnpackedBinaryPath } from '../app/binaryPath'

const ffprobePath = resolveUnpackedBinaryPath(ffprobeStatic.path)

const execFileAsync = promisify(execFile)

interface FfprobeStream {
  codec_type: string
  codec_name?: string
  pix_fmt?: string
  width?: number
  height?: number
  r_frame_rate?: string
  avg_frame_rate?: string
}

interface FfprobeOutput {
  format: { duration?: string }
  streams: FfprobeStream[]
}

function parseFrameRate(rate: string | undefined): number {
  if (!rate) return 0
  const [num, den] = rate.split('/').map(Number)
  if (!den) return num
  return num / den
}

export async function probeVideo(filePath: string): Promise<VideoMeta> {
  const { stdout } = await execFileAsync(ffprobePath, [
    '-v',
    'quiet',
    '-print_format',
    'json',
    '-show_format',
    '-show_streams',
    filePath
  ])

  const data = JSON.parse(stdout) as FfprobeOutput
  const videoStream = data.streams.find((s) => s.codec_type === 'video')
  if (!videoStream) throw new Error('No video stream found in file')
  const hasAudio = data.streams.some((s) => s.codec_type === 'audio')

  const fps = parseFrameRate(videoStream.avg_frame_rate) || parseFrameRate(videoStream.r_frame_rate)

  return {
    path: filePath,
    fileName: basename(filePath),
    durationMs: Math.round(parseFloat(data.format.duration ?? '0') * 1000),
    fps,
    width: videoStream.width ?? 0,
    height: videoStream.height ?? 0,
    codec: videoStream.codec_name ?? '',
    pixFmt: videoStream.pix_fmt ?? '',
    hasAudio,
    lrvPath: findLrvSibling(filePath)
  }
}
