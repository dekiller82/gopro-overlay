import { RefObject, useEffect, useState } from 'react'

export interface ContainedRect {
  left: number
  top: number
  width: number
  height: number
}

const EMPTY_RECT: ContainedRect = { left: 0, top: 0, width: 0, height: 0 }

/** Computes the letterboxed rect (like CSS `object-fit: contain`) of `aspectRatio` within `containerRef`, in CSS pixels. */
export function useContainedRect(containerRef: RefObject<HTMLElement | null>, aspectRatio: number): ContainedRect {
  const [rect, setRect] = useState<ContainedRect>(EMPTY_RECT)

  useEffect(() => {
    const el = containerRef.current
    if (!el || !aspectRatio) return

    const compute = (): void => {
      const cw = el.clientWidth
      const ch = el.clientHeight
      if (cw === 0 || ch === 0) return

      const containerRatio = cw / ch
      let width: number
      let height: number
      if (containerRatio > aspectRatio) {
        height = ch
        width = ch * aspectRatio
      } else {
        width = cw
        height = cw / aspectRatio
      }
      setRect({ left: (cw - width) / 2, top: (ch - height) / 2, width, height })
    }

    compute()
    const observer = new ResizeObserver(compute)
    observer.observe(el)
    return () => observer.disconnect()
  }, [containerRef, aspectRatio])

  return rect
}
