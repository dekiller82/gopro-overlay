import { useEffect, useState } from 'react'

// Module-level so switching between widgets (or re-rendering the same one) doesn't reload/redecode
// an already-seen image -- keyed by the URL/data-URL string itself, works uniformly for a bundled
// Vite asset URL (e.g. the fastest-lap icon) and a user-uploaded data URL (e.g. a custom header logo).
//
// Bounded LRU, NOT an unbounded cache -- a user-uploaded header logo is stored as a raw, uncompressed
// data URL (see PropertyPanel.tsx's readImageFileAsDataUrl -- no resizing happens before storage), so
// a single phone-camera logo photo can easily be several MB, and each decoded HTMLImageElement holds
// real (non-V8-heap) decoded pixel memory in the renderer process for as long as it's cached. Without
// a cap, every DISTINCT image ever tried as a header logo in the whole session -- including ones
// since replaced, reverted via undo, or left behind in a switched-away-from layout preset -- stayed
// resident forever, a real unbounded leak confirmed via a genuine crash.log OOM report plus a saved
// project carrying a large embedded logo. Map iteration order is insertion order in JS, so the first
// key is always the least-recently-touched one -- re-inserting on every hit/set is enough for real LRU.
// Exported (only) for the LRU-eviction unit test -- this project's vitest setup runs in a plain
// Node environment (no jsdom), so the useLoadedImage hook itself can't be exercised directly, but
// the eviction logic that actually matters here is plain data-structure code with no DOM
// dependency, and is worth covering on its own.
export const MAX_CACHED_IMAGES = 12
export const imageCache = new Map<string, HTMLImageElement>()

export function cacheGet(src: string): HTMLImageElement | undefined {
  const img = imageCache.get(src)
  if (img) {
    // Re-insert to mark as most-recently-used.
    imageCache.delete(src)
    imageCache.set(src, img)
  }
  return img
}

export function cacheSet(src: string, img: HTMLImageElement): void {
  imageCache.delete(src)
  imageCache.set(src, img)
  while (imageCache.size > MAX_CACHED_IMAGES) {
    const oldestKey = imageCache.keys().next().value
    if (oldestKey === undefined) break
    imageCache.delete(oldestKey)
  }
}

/** Loads (and caches) an image for use with Canvas2D's `drawImage`. Returns null until loaded --
 *  callers should skip drawing the image rather than block, since decode is inherently async while
 *  the rest of this app's rendering is synchronous per frame. */
export function useLoadedImage(src: string | null | undefined): HTMLImageElement | null {
  const [image, setImage] = useState<HTMLImageElement | null>(() => (src ? (cacheGet(src) ?? null) : null))

  useEffect(() => {
    if (!src) {
      setImage(null)
      return
    }
    const cached = cacheGet(src)
    if (cached) {
      setImage(cached)
      return
    }

    let cancelled = false
    const img = new window.Image()
    img.onload = (): void => {
      if (cancelled) return
      cacheSet(src, img)
      setImage(img)
    }
    img.src = src

    return () => {
      cancelled = true
    }
  }, [src])

  return image
}
