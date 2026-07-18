import { describe, expect, it } from 'vitest'
import type { ClipInfo, VideoMeta } from '../types'
import { clipIndexAtGlobalMs, localMsWithinClip } from './clipTiming'

function makeClip(startOffsetMs: number, durationMs: number): ClipInfo {
  const video: VideoMeta = {
    path: `clip-${startOffsetMs}.mp4`,
    fileName: `clip-${startOffsetMs}.mp4`,
    durationMs,
    fps: 30,
    width: 1920,
    height: 1080,
    codec: 'h264',
    pixFmt: 'yuv420p',
    hasAudio: true,
    lrvPath: null
  }
  return { video, startOffsetMs }
}

// Three clips: [0, 5000), [5000, 9000), [9000, 12000) -- durations 5000/4000/3000.
const clips: ClipInfo[] = [makeClip(0, 5000), makeClip(5000, 4000), makeClip(9000, 3000)]

describe('clipIndexAtGlobalMs', () => {
  it('resolves the first clip for times within its range, including exactly 0', () => {
    expect(clipIndexAtGlobalMs(clips, 0)).toBe(0)
    expect(clipIndexAtGlobalMs(clips, 2500)).toBe(0)
    expect(clipIndexAtGlobalMs(clips, 4999)).toBe(0)
  })

  it('resolves the second clip exactly at its own start offset (the boundary)', () => {
    expect(clipIndexAtGlobalMs(clips, 5000)).toBe(1)
    expect(clipIndexAtGlobalMs(clips, 7000)).toBe(1)
    expect(clipIndexAtGlobalMs(clips, 8999)).toBe(1)
  })

  it('resolves the third (last) clip at and after its own start offset', () => {
    expect(clipIndexAtGlobalMs(clips, 9000)).toBe(2)
    expect(clipIndexAtGlobalMs(clips, 11999)).toBe(2)
  })

  it('clamps to the last clip for a globalMs at or past the very end (not -1)', () => {
    expect(clipIndexAtGlobalMs(clips, 12000)).toBe(2)
    expect(clipIndexAtGlobalMs(clips, 999999)).toBe(2)
  })

  it('handles a single clip', () => {
    const single = [makeClip(0, 5000)]
    expect(clipIndexAtGlobalMs(single, 0)).toBe(0)
    expect(clipIndexAtGlobalMs(single, 4999)).toBe(0)
    expect(clipIndexAtGlobalMs(single, 999999)).toBe(0)
  })

  it('returns -1 for zero clips without throwing', () => {
    expect(clipIndexAtGlobalMs([], 1000)).toBe(-1)
  })
})

describe('localMsWithinClip', () => {
  it('subtracts the clip\'s own startOffsetMs', () => {
    expect(localMsWithinClip(clips[0], 2500)).toBe(2500)
    expect(localMsWithinClip(clips[1], 7000)).toBe(2000)
    expect(localMsWithinClip(clips[2], 11000)).toBe(2000)
  })

  it('gives exactly 0 at a clip\'s own start offset', () => {
    expect(localMsWithinClip(clips[1], 5000)).toBe(0)
  })
})
