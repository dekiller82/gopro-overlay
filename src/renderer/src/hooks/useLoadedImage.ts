import { useEffect, useState } from 'react'

// Module-level so switching between widgets (or re-rendering the same one) doesn't reload/redecode
// an already-seen image -- keyed by the URL/data-URL string itself, works uniformly for a bundled
// Vite asset URL (e.g. the fastest-lap icon) and a user-uploaded data URL (e.g. a custom header logo).
const imageCache = new Map<string, HTMLImageElement>()

/** Loads (and caches) an image for use with Canvas2D's `drawImage`. Returns null until loaded --
 *  callers should skip drawing the image rather than block, since decode is inherently async while
 *  the rest of this app's rendering is synchronous per frame. */
export function useLoadedImage(src: string | null | undefined): HTMLImageElement | null {
  const [image, setImage] = useState<HTMLImageElement | null>(() => (src ? (imageCache.get(src) ?? null) : null))

  useEffect(() => {
    if (!src) {
      setImage(null)
      return
    }
    const cached = imageCache.get(src)
    if (cached) {
      setImage(cached)
      return
    }

    let cancelled = false
    const img = new window.Image()
    img.onload = (): void => {
      if (cancelled) return
      imageCache.set(src, img)
      setImage(img)
    }
    img.src = src

    return () => {
      cancelled = true
    }
  }, [src])

  return image
}
