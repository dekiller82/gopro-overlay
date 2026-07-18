import { mkdtempSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { describe, expect, it } from 'vitest'
import { findLrvSibling } from './lrv'

function tempDirWith(fileNames: string[]): string {
  const dir = mkdtempSync(join(tmpdir(), 'gpo-lrv-'))
  for (const name of fileNames) writeFileSync(join(dir, name), '')
  return dir
}

describe('findLrvSibling', () => {
  it('finds a matching LRV next to a GH-prefixed chapter file', () => {
    const dir = tempDirWith(['GH010230.MP4', 'GL010230.LRV'])
    expect(findLrvSibling(join(dir, 'GH010230.MP4'))).toBe(join(dir, 'GL010230.LRV'))
  })

  it('finds a matching LRV next to a GX-prefixed chapter file', () => {
    const dir = tempDirWith(['GX010230.MP4', 'GL010230.LRV'])
    expect(findLrvSibling(join(dir, 'GX010230.MP4'))).toBe(join(dir, 'GL010230.LRV'))
  })

  it('matches case-insensitively', () => {
    const dir = tempDirWith(['GH030151.MP4', 'gl030151.lrv'])
    expect(findLrvSibling(join(dir, 'GH030151.MP4'))).toBe(join(dir, 'gl030151.lrv'))
  })

  // Confirmed as the real, common case: copying only the .MP4 off a card and leaving the sidecar
  // behind, or a clip whose camera/settings never wrote one at all.
  it('returns null when no LRV sits next to the file', () => {
    const dir = tempDirWith(['GH030151.MP4'])
    expect(findLrvSibling(join(dir, 'GH030151.MP4'))).toBeNull()
  })

  it('returns null for a file that is not a GoPro chapter-named MP4', () => {
    const dir = tempDirWith(['random-video.mp4', 'GL010230.LRV'])
    expect(findLrvSibling(join(dir, 'random-video.mp4'))).toBeNull()
  })

  it("doesn't cross-match a different chapter/session's LRV", () => {
    const dir = tempDirWith(['GH010230.MP4', 'GL020230.LRV'])
    expect(findLrvSibling(join(dir, 'GH010230.MP4'))).toBeNull()
  })
})
