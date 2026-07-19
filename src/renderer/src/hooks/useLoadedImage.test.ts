import { describe, expect, it } from 'vitest'
import { MAX_CACHED_IMAGES, cacheGet, cacheSet, imageCache } from './useLoadedImage'

// Regression test for a real, confirmed memory leak: this cache used to have no size limit at all,
// so every distinct image ever loaded as a widget's header logo over a whole editing session (each
// potentially several MB, since uploads aren't resized/compressed) stayed resident forever. A real
// crash.log OOM report plus a saved project carrying a large embedded logo pointed here.
function fakeImage(): HTMLImageElement {
  return {} as unknown as HTMLImageElement
}

describe('useLoadedImage cache eviction', () => {
  it('never grows past MAX_CACHED_IMAGES entries', () => {
    imageCache.clear()
    for (let i = 0; i < MAX_CACHED_IMAGES + 20; i++) {
      cacheSet(`src-${i}`, fakeImage())
    }
    expect(imageCache.size).toBe(MAX_CACHED_IMAGES)
  })

  it('evicts the least-recently-used entry first, not the least-recently-inserted', () => {
    imageCache.clear()
    for (let i = 0; i < MAX_CACHED_IMAGES; i++) {
      cacheSet(`src-${i}`, fakeImage())
    }
    // Touch the oldest entry so it becomes the MOST recently used -- it should now survive
    // whatever gets evicted next, even though it was inserted first.
    cacheGet('src-0')

    cacheSet('src-new', fakeImage())

    expect(imageCache.has('src-0')).toBe(true) // recently touched -- must survive
    expect(imageCache.has('src-1')).toBe(false) // untouched and oldest -- must be the one evicted
    expect(imageCache.has('src-new')).toBe(true)
    expect(imageCache.size).toBe(MAX_CACHED_IMAGES)
  })

  it('a cache hit returns the same image instance without evicting anything', () => {
    imageCache.clear()
    const first = fakeImage()
    cacheSet('src-a', first)
    for (let i = 0; i < MAX_CACHED_IMAGES - 1; i++) cacheSet(`src-b-${i}`, fakeImage())

    expect(cacheGet('src-a')).toBe(first)
    expect(imageCache.size).toBe(MAX_CACHED_IMAGES)
  })
})
