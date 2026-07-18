import { spawn } from 'child_process'
import { mkdtemp, rm } from 'fs/promises'
import os from 'os'
import path from 'path'

export interface VideoEncoder {
  codec: string
  /** Quality/rate-control flags for this encoder; CRF isn't universal across GPU encoders. */
  qualityArgs: (crf: number) => string[]
  label: string
  /** ffmpeg -hwaccel value to pair with this encoder for GPU-accelerated decode too, if this
   *  machine was smoke-tested to actually support it. Undefined means decode stays on CPU while
   *  only the encode step runs on the GPU -- still a real speedup, just a smaller one. */
  decodeHwaccel?: string
}

// Tried in order; the bundled ffmpeg-static build has NVENC/QSV/AMF compiled in, but whether
// each actually works depends on the machine's GPU/drivers, so each candidate is smoke-tested
// with a throwaway 2-frame encode before being trusted for the real (long) export.
const GPU_ENCODER_CANDIDATES: VideoEncoder[] = [
  {
    codec: 'h264_nvenc',
    label: 'NVIDIA NVENC',
    qualityArgs: (crf) => ['-preset', 'p5', '-rc', 'vbr', '-cq', String(crf), '-b:v', '0'],
    // NVDEC pairs reliably with NVENC across driver versions and was verified via real CLI runs
    // during this app's initial export work -- trusted unconditionally, unlike QSV below.
    decodeHwaccel: 'cuda'
  },
  {
    codec: 'h264_qsv',
    label: 'Intel Quick Sync',
    qualityArgs: (crf) => ['-preset', 'medium', '-global_quality', String(crf)]
  },
  {
    codec: 'h264_amf',
    label: 'AMD AMF',
    qualityArgs: (crf) => ['-quality', 'balanced', '-rc', 'cqp', '-qp_i', String(crf), '-qp_p', String(crf)]
    // No decodeHwaccel probe here: AMD's decode hwaccel pairing is platform-dependent (d3d11va on
    // Windows, vaapi on Linux) and untested on any real AMD machine. Encode-only GPU acceleration
    // is still a real win; guessing the wrong decode flag would risk breaking the export outright.
  }
]

export const CPU_ENCODER: VideoEncoder = {
  codec: 'libx264',
  label: 'CPU (libx264)',
  qualityArgs: (crf) => ['-preset', 'medium', '-crf', String(crf)]
}

/** Runs one throwaway ffmpeg invocation to completion, ignoring its output; resolves true iff it exits 0. */
function runFfmpeg(ffmpegBin: string, args: string[], timeoutMs = 5000): Promise<boolean> {
  return new Promise((resolve) => {
    let settled = false
    const proc = spawn(ffmpegBin, args, { stdio: 'ignore' })
    const finish = (ok: boolean): void => {
      if (settled) return
      settled = true
      resolve(ok)
    }
    proc.on('error', () => finish(false))
    proc.on('close', (code) => finish(code === 0))
    // Guard against a hung probe (e.g. a driver popping a blocking dialog) stalling export startup.
    setTimeout(() => {
      if (!settled) {
        proc.kill()
        finish(false)
      }
    }, timeoutMs)
  })
}

function testEncoder(ffmpegBin: string, encoder: VideoEncoder): Promise<boolean> {
  return runFfmpeg(ffmpegBin, [
    '-y',
    '-f',
    'lavfi',
    '-i',
    // NVENC in particular rejects anything much smaller than this ("Frame Dimension less than
    // the minimum supported value") -- 64x64 looked like a safe tiny probe but produced a false
    // negative, silently falling back to CPU on machines with a perfectly working GPU encoder.
    'color=black:size=256x256:rate=5:duration=0.4',
    '-c:v',
    encoder.codec,
    ...encoder.qualityArgs(23),
    '-frames:v',
    '2',
    '-f',
    'null',
    '-'
  ])
}

/**
 * Real decode+encode roundtrip probe for a candidate `-hwaccel` value, mirroring testEncoder's
 * "trust nothing without a real throwaway run" discipline. Unlike the encoder smoke test, decode
 * acceleration needs an actual encoded source to decode -- a synthetic lavfi source bypasses the
 * decoder entirely -- so this first encodes a tiny real file with CPU libx264, then attempts to
 * decode+re-encode it using the GPU hwaccel + encoder together.
 */
async function testDecodeHwaccel(ffmpegBin: string, hwaccel: string, encoder: VideoEncoder): Promise<boolean> {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'gpo-hwaccel-'))
  const sourcePath = path.join(dir, 'probe.mp4')
  try {
    const encoded = await runFfmpeg(ffmpegBin, [
      '-y',
      '-f',
      'lavfi',
      '-i',
      'color=black:size=256x256:rate=5:duration=0.4',
      '-c:v',
      'libx264',
      '-frames:v',
      '2',
      sourcePath
    ])
    if (!encoded) return false

    return await runFfmpeg(ffmpegBin, [
      '-y',
      '-hwaccel',
      hwaccel,
      '-i',
      sourcePath,
      '-c:v',
      encoder.codec,
      ...encoder.qualityArgs(23),
      '-frames:v',
      '2',
      '-f',
      'null',
      '-'
    ])
  } catch {
    return false
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => {})
  }
}

/** Picks the fastest working encoder: GPU-accelerated if this machine actually supports one, CPU libx264 otherwise. */
export async function selectVideoEncoder(ffmpegBin: string, preferGpu = true): Promise<VideoEncoder> {
  if (!preferGpu) return CPU_ENCODER

  for (const candidate of GPU_ENCODER_CANDIDATES) {
    try {
      if (!(await testEncoder(ffmpegBin, candidate))) continue

      // Intel Quick Sync's decode hwaccel isn't verified on any real Intel machine (unlike NVENC's
      // cuda pairing above), so it's only trusted after its own real roundtrip probe passes.
      if (candidate.codec === 'h264_qsv') {
        const decodeOk = await testDecodeHwaccel(ffmpegBin, 'qsv', candidate).catch(() => false)
        return decodeOk ? { ...candidate, decodeHwaccel: 'qsv' } : candidate
      }

      return candidate
    } catch {
      // fall through to the next candidate
    }
  }
  return CPU_ENCODER
}
