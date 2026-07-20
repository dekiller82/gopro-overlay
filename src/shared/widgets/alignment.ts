export type HorizontalAlign = 'left' | 'centerH' | 'right'
export type VerticalAlign = 'top' | 'centerV' | 'bottom'

/** Resolves the widget's `x` (fraction of frame width, 0-1) for a one-click alignment action. */
export function alignedX(w: number, align: HorizontalAlign, paddingFraction: number): number {
  switch (align) {
    case 'left':
      return paddingFraction
    case 'centerH':
      return (1 - w) / 2
    case 'right':
      return 1 - w - paddingFraction
  }
}

/** Resolves the widget's `y` (fraction of frame height, 0-1) for a one-click alignment action. */
export function alignedY(h: number, align: VerticalAlign, paddingFraction: number): number {
  switch (align) {
    case 'top':
      return paddingFraction
    case 'centerV':
      return (1 - h) / 2
    case 'bottom':
      return 1 - h - paddingFraction
  }
}

export interface SnapResult {
  x: number
  y: number
  /** Pixel position (in the frame's own coordinate space) where an active vertical/horizontal
   *  guide line should be drawn, or null if this axis didn't snap to anything. */
  guideXPx: number | null
  guideYPx: number | null
}

/** Another widget's pixel-space box, used as extra snap targets alongside the frame's own edges/center. */
export interface SnapRect {
  x: number
  y: number
  w: number
  h: number
}

interface AxisCandidate {
  /** Resulting pixel position for the widget's own edge (left or top) if this candidate snaps. */
  widgetPos: number
  /** Pixel position where the guide line itself is drawn -- differs from widgetPos for center
   *  alignment, where the guide sits at the frame's centerline, not the widget's (offset) edge. */
  guidePos: number
}

function axisCandidates(sizePx: number, framePx: number, paddingPx: number): AxisCandidate[] {
  return [
    { widgetPos: paddingPx, guidePos: paddingPx },
    { widgetPos: (framePx - sizePx) / 2, guidePos: framePx / 2 },
    { widgetPos: framePx - sizePx - paddingPx, guidePos: framePx - paddingPx }
  ]
}

/** Left/center/right (or top/center/bottom) edges of another widget's own box, as candidates the
 *  DRAGGED widget's matching edge/center can snap to -- same three-way shape as axisCandidates
 *  above, just sourced from a sibling widget's box instead of the frame's. */
function widgetAxisCandidates(rects: SnapRect[], sizePx: number, isX: boolean): AxisCandidate[] {
  const candidates: AxisCandidate[] = []
  for (const rect of rects) {
    const pos = isX ? rect.x : rect.y
    const size = isX ? rect.w : rect.h
    candidates.push({ widgetPos: pos, guidePos: pos })
    candidates.push({ widgetPos: pos + size - sizePx, guidePos: pos + size })
    candidates.push({ widgetPos: pos + size / 2 - sizePx / 2, guidePos: pos + size / 2 })
  }
  return candidates
}

/** Picks the CLOSEST candidate within thresholdPx (not just the first found) -- with widget-sourced
 *  candidates added on top of the frame's fixed 3, several can plausibly be in range at once. */
function snapAxis(
  pixelPos: number,
  sizePx: number,
  framePx: number,
  paddingPx: number,
  thresholdPx: number,
  otherRects: SnapRect[],
  isX: boolean
): { pos: number; guidePx: number | null } {
  const candidates = [...axisCandidates(sizePx, framePx, paddingPx), ...widgetAxisCandidates(otherRects, sizePx, isX)]
  let best: { pos: number; guidePx: number; dist: number } | null = null
  for (const candidate of candidates) {
    const dist = Math.abs(pixelPos - candidate.widgetPos)
    if (dist <= thresholdPx && (!best || dist < best.dist)) {
      best = { pos: candidate.widgetPos, guidePx: candidate.guidePos, dist }
    }
  }
  return best ? { pos: best.pos, guidePx: best.guidePx } : { pos: pixelPos, guidePx: null }
}

export const DEFAULT_SNAP_THRESHOLD_PX = 8

/**
 * Live drag-snapping: given a widget's current (unsnapped) pixel position/size and the frame's own
 * pixel size, snaps independently per axis to the frame's left/center/right (and top/middle/bottom)
 * whenever within `thresholdPx` -- the same three positions the one-click alignment buttons produce
 * (alignedX/alignedY), so dragging near one of those spots locks to the exact same place a button
 * click would. `paddingFraction` is scaled by the frame's SHORTER dimension for both axes, so the
 * visual padding looks equal on every side regardless of the frame's aspect ratio (unlike scaling
 * each axis by its own dimension, which would make horizontal padding wider than vertical on a
 * typical 16:9 frame).
 *
 * `otherRects` (other widgets' own pixel boxes, the dragged widget and any other actively-selected
 * group members already excluded by the caller) adds their left/center/right and top/middle/bottom
 * edges as further snap targets, on top of the frame-based ones -- e.g. lining up Delta Time with
 * Sector Timer without eyeballing pixels.
 */
export function computeSnap(
  pixelX: number,
  pixelY: number,
  pixelW: number,
  pixelH: number,
  frameWidth: number,
  frameHeight: number,
  paddingFraction: number,
  thresholdPx: number = DEFAULT_SNAP_THRESHOLD_PX,
  otherRects: SnapRect[] = []
): SnapResult {
  const paddingPx = paddingFraction * Math.min(frameWidth, frameHeight)
  const xSnap = snapAxis(pixelX, pixelW, frameWidth, paddingPx, thresholdPx, otherRects, true)
  const ySnap = snapAxis(pixelY, pixelH, frameHeight, paddingPx, thresholdPx, otherRects, false)
  return { x: xSnap.pos, y: ySnap.pos, guideXPx: xSnap.guidePx, guideYPx: ySnap.guidePx }
}
