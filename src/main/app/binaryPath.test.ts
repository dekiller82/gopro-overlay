import { describe, expect, it } from 'vitest'
import { resolveUnpackedBinaryPath } from './binaryPath'

describe('resolveUnpackedBinaryPath', () => {
  it('rewrites an asar-internal path to the unpacked one', () => {
    expect(resolveUnpackedBinaryPath('/opt/App/resources/app.asar/node_modules/ffmpeg-static/ffmpeg')).toBe(
      '/opt/App/resources/app.asar.unpacked/node_modules/ffmpeg-static/ffmpeg'
    )
  })

  it('handles a Windows-style path the same way', () => {
    expect(resolveUnpackedBinaryPath('C:\\Program Files\\App\\resources\\app.asar\\node_modules\\ffmpeg-static\\ffmpeg.exe')).toBe(
      'C:\\Program Files\\App\\resources\\app.asar.unpacked\\node_modules\\ffmpeg-static\\ffmpeg.exe'
    )
  })

  it('is a no-op for a dev/unpackaged path with no app.asar segment', () => {
    const devPath = '/home/user/project/node_modules/ffmpeg-static/ffmpeg'
    expect(resolveUnpackedBinaryPath(devPath)).toBe(devPath)
  })

  it('passes through null unchanged', () => {
    expect(resolveUnpackedBinaryPath(null)).toBeNull()
  })
})
