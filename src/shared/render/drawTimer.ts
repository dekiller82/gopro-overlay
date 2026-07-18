import { formatTime } from '../format'
import type { LapHistoryEntry, LapState } from '../telemetry/laps'
import { FORMULA1_REGULAR } from './fonts'
import { DEFAULT_HEADER_LOGO_DATA_URL } from './defaultLogo'
import { drawOutlinedText, fitFontSizePx, scaleToRect, type Canvas2DLike, type CanvasImageLike, type Rect } from './canvas2d'

export type TimingTowerOrder = 'ranked' | 'chronological'
export type TimingTowerChronoDirection = 'newestOnTop' | 'newestOnBottom'

export interface TimerStyle {
  color: string
  showCentiseconds: boolean
  /** Empty string hides the label row (mode: 'elapsed' only). */
  label: string
  labelColor: string
  mode: 'elapsed' | 'laps'
  /** 0 disables the outline. */
  textOutlineWidth: number
  textOutlineColor: string
  /** F1-style timing tower header (mode: 'laps' only). Data URL of a user-uploaded logo; null = no image. */
  headerImageDataUrl: string | null
  /** Multiplier applied to the header logo's natural fit size (still capped to the header area). */
  headerImageScale: number
  /** Freeform header text (e.g. a session name), autofit to the header area. Empty hides it. */
  headerText: string
  headerTextColor: string
  /** 'ranked' = fastest-to-slowest classification style; 'chronological' = lap order. */
  rowOrder: TimingTowerOrder
  /** Only relevant when rowOrder is 'chronological'. */
  chronoDirection: TimingTowerChronoDirection
  /** Fixed row count -- row height derives from this, not from how many laps have happened, so the table never resizes/rescales as laps are added. */
  maxVisibleRows: number
  /** Panel background behind the whole tower (mode: 'laps' only). backgroundOpacity 0 hides it entirely. */
  backgroundColor: string
  backgroundOpacity: number
}

export const DEFAULT_TIMER_STYLE: TimerStyle = {
  color: '#ffffff',
  showCentiseconds: true,
  label: 'TIME',
  labelColor: '#ff3b30',
  mode: 'laps',
  textOutlineWidth: 2,
  textOutlineColor: '#000000',
  headerImageDataUrl: DEFAULT_HEADER_LOGO_DATA_URL,
  headerImageScale: 5,
  headerText: 'TIMING',
  headerTextColor: '#ffffff',
  rowOrder: 'ranked',
  chronoDirection: 'newestOnTop',
  maxVisibleRows: 10,
  backgroundColor: '#0a0a10',
  backgroundOpacity: 0.72
}

export interface DrawTimerOptions {
  rect: Rect
  elapsedMs: number
  style: TimerStyle
  /** Required for mode: 'laps'; ignored otherwise. Null/undefined (e.g. no start/finish line set yet) draws an empty tower, not a fallback to the elapsed-mode look. */
  lapState?: LapState | null
  /** Loaded ahead of time by the caller (image decode is async; drawing is not) -- null/undefined draws no logo. */
  headerImage?: CanvasImageLike | null
  /** Bundled fl.png, loaded once by the caller and shared across every timing-tower widget/frame. */
  fastestLapIcon?: CanvasImageLike | null
}

const FONT_STACK = 'ui-sans-serif, -apple-system, "Segoe UI", Roboto, sans-serif'
const TIMING_TOWER_FONT_STACK = `"${FORMULA1_REGULAR}", ${FONT_STACK}`
/** Conventional "fastest lap" color (iRacing/F1-game style), used for the fastest row's badge and the fastest-lap glow. */
const LAP_PURPLE = '#b026ff'
/** How long the "new fastest lap" glow plays after the crossing that set it. */
const NEW_BEST_FLASH_MS = 2500
/** Fraction of rect.w that text is allowed to occupy before fitFontSizePx scales it down. */
const SAFE_WIDTH_FRACTION = 0.92
/** A row this many times wider than tall is considered "comfortably wide" -- badge/icon/text size
 *  is capped to whichever is smaller of the row's actual height or (width / this ratio), so widening
 *  a narrow widget doesn't leave the time text growing alone while the badge/icon stay fixed-size. */
const ROW_ASPECT_REFERENCE = 6
/** Longest realistic lap-time string ("mm:ss.SS") -- used only to size the font ONCE per row,
 *  never the row's own (constant) text, so nothing here changes size frame to frame. */
const TIME_SIZING_REFERENCE = '00:00.00'

export function drawTimer(ctx: Canvas2DLike, options: DrawTimerOptions): void {
  const { rect, elapsedMs, style, lapState, headerImage, fastestLapIcon } = options

  if (style.mode === 'laps') {
    drawTimingTower(ctx, rect, style, lapState ?? null, headerImage ?? null, fastestLapIcon ?? null)
    return
  }

  const cx = rect.x + rect.w / 2
  const maxWidth = rect.w * SAFE_WIDTH_FRACTION
  const outlineWidth = scaleToRect(style.textOutlineWidth, rect)

  ctx.save()
  ctx.textAlign = 'center'
  ctx.textBaseline = 'alphabetic'

  let timeY = rect.y + rect.h * 0.72
  if (style.label) {
    fitFontSizePx(ctx, style.label, maxWidth, rect.h * 0.22, '700', TIMING_TOWER_FONT_STACK)
    drawOutlinedText(ctx, style.label.toUpperCase(), cx, rect.y + rect.h * 0.3, style.labelColor, outlineWidth, style.textOutlineColor)
    timeY = rect.y + rect.h * 0.82
  }

  // Sized once against a fixed reference string, not the live (per-frame-changing) text -- this
  // ticks every frame, and fitting to its own actual width would make the font size jitter as
  // different digits (which measure at slightly different widths) cycle through.
  fitFontSizePx(ctx, TIME_SIZING_REFERENCE, maxWidth, rect.h * 0.46, '700', TIMING_TOWER_FONT_STACK)
  drawOutlinedText(ctx, formatTime(elapsedMs, style.showCentiseconds), cx, timeY, style.color, outlineWidth, style.textOutlineColor)
  ctx.restore()
}

/** Picks which (up to `maxVisibleRows`) history entries to show and in what order. `history` is
 *  always newest-first (chronological descending), regardless of the display order requested. */
function selectTimingTowerRows(history: LapHistoryEntry[], style: TimerStyle): LapHistoryEntry[] {
  if (style.rowOrder === 'ranked') {
    return [...history].sort((a, b) => a.timeMs - b.timeMs).slice(0, style.maxVisibleRows)
  }
  const mostRecentFirst = history.slice(0, style.maxVisibleRows)
  return style.chronoDirection === 'newestOnTop' ? mostRecentFirst : [...mostRecentFirst].reverse()
}

function drawTimingTowerBackground(ctx: Canvas2DLike, rect: Rect, style: TimerStyle): void {
  if (style.backgroundOpacity <= 0) return
  ctx.save()
  ctx.globalAlpha = style.backgroundOpacity
  ctx.fillStyle = style.backgroundColor
  ctx.fillRect(rect.x, rect.y, rect.w, rect.h)
  ctx.restore()
}

/** Logo stacked above the header text (both centered), matching the reference F1 graphic's
 *  layout -- previously the logo sat to the left of the text, which didn't match. */
function drawTimingTowerHeader(ctx: Canvas2DLike, rect: Rect, headerH: number, style: TimerStyle, outlineWidth: number, headerImage: CanvasImageLike | null): void {
  const hasImage = Boolean(headerImage) && headerImage!.width > 0 && headerImage!.height > 0
  const hasText = Boolean(style.headerText)
  const padding = headerH * 0.08

  // Full headerH goes to whichever of image/text is actually present; split 60/40 if both are.
  const imageAreaH = hasImage ? (hasText ? headerH * 0.6 : headerH) : 0
  const textAreaY = rect.y + imageAreaH
  const textAreaH = headerH - imageAreaH

  if (hasImage) {
    const availH = Math.max(1, imageAreaH - padding * 2)
    const aspect = headerImage!.width / headerImage!.height
    let imgH = availH * style.headerImageScale
    let imgW = imgH * aspect
    const maxImgW = rect.w * 0.85
    if (imgW > maxImgW) {
      imgW = maxImgW
      imgH = imgW / aspect
    }
    const imgX = rect.x + (rect.w - imgW) / 2
    const imgY = rect.y + (imageAreaH - imgH) / 2
    ctx.drawImage(headerImage!, imgX, imgY, imgW, imgH)
  }

  if (!hasText) return

  ctx.save()
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  const cx = rect.x + rect.w / 2
  const cy = textAreaY + textAreaH / 2
  fitFontSizePx(ctx, style.headerText, rect.w * SAFE_WIDTH_FRACTION, textAreaH * 0.7, '700', TIMING_TOWER_FONT_STACK)
  drawOutlinedText(ctx, style.headerText, cx, cy, style.headerTextColor, outlineWidth, style.textOutlineColor)
  ctx.restore()
}

function drawTimingTowerRow(
  ctx: Canvas2DLike,
  rect: Rect,
  rowY: number,
  rowH: number,
  entry: LapHistoryEntry,
  style: TimerStyle,
  outlineWidth: number,
  fastestLapIcon: CanvasImageLike | null,
  isFlashing: boolean,
  flashGlow: number
): void {
  // Content (badge/icon/font) sizes off whichever is smaller of the row's actual height or a
  // width-derived equivalent -- otherwise widening the widget only grows the time text (via its
  // own width-fitting) while the badge/icon stay fixed to rowH, visibly mismatching.
  const contentScale = Math.min(rowH, rect.w / ROW_ASPECT_REFERENCE)

  const padding = contentScale * 0.1
  const badgeSize = contentScale * 0.78
  const badgeX = rect.x + padding
  const badgeY = rowY + (rowH - badgeSize) / 2
  const iconSize = contentScale * 0.6
  const iconMargin = contentScale * 0.15

  ctx.save()
  if (isFlashing) {
    ctx.shadowBlur = scaleToRect(16, rect) * flashGlow
    ctx.shadowColor = LAP_PURPLE
  }
  ctx.fillStyle = entry.isBest ? LAP_PURPLE : 'rgba(255,255,255,0.12)'
  ctx.fillRect(badgeX, badgeY, badgeSize, badgeSize)
  ctx.restore()

  ctx.save()
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  const badgeText = String(entry.lapNumber)
  fitFontSizePx(ctx, badgeText, badgeSize * 0.8, badgeSize * 0.55, '700', TIMING_TOWER_FONT_STACK)
  ctx.fillStyle = '#ffffff'
  ctx.fillText(badgeText, badgeX + badgeSize / 2, badgeY + badgeSize / 2)
  ctx.restore()

  // Centered in the space to the right of the badge (nothing reserved on the right anymore -- the
  // fastest-lap icon now sits outside the panel entirely, not inside this row).
  const timeText = formatTime(entry.timeMs, style.showCentiseconds)
  const timeAreaX = badgeX + badgeSize + padding
  const timeAreaWidth = rect.x + rect.w - padding - timeAreaX
  const timeCx = timeAreaX + timeAreaWidth / 2

  ctx.save()
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  fitFontSizePx(ctx, TIME_SIZING_REFERENCE, Math.max(10, timeAreaWidth), contentScale * 0.5, '700', TIMING_TOWER_FONT_STACK)
  drawOutlinedText(ctx, timeText, timeCx, rowY + rowH / 2, style.color, outlineWidth, style.textOutlineColor)
  ctx.restore()

  // Thin divider so rows read as a table, matching the reference graphic's row separation.
  ctx.save()
  ctx.fillStyle = 'rgba(255,255,255,0.08)'
  ctx.fillRect(rect.x, rowY + rowH - Math.max(1, scaleToRect(1, rect)), rect.w, Math.max(1, scaleToRect(1, rect)))
  ctx.restore()

  // Drawn OUTSIDE the panel (past its right edge), beside it rather than inside the row --
  // Canvas2D doesn't clip to `rect` by default so this is safe as long as there's frame room there.
  if (entry.isBest && fastestLapIcon && fastestLapIcon.width > 0 && fastestLapIcon.height > 0) {
    const iconAspect = fastestLapIcon.width / fastestLapIcon.height
    const iconH = iconSize
    const iconW = iconH * iconAspect
    const iconX = rect.x + rect.w + iconMargin
    const iconY = rowY + (rowH - iconH) / 2
    ctx.drawImage(fastestLapIcon, iconX, iconY, iconW, iconH)
  }
}

/**
 * F1 broadcast-style fixed timing tower: a background panel, an optional header (custom logo
 * stacked above freeform text) and a table of completed laps at a FIXED row height
 * (rowsHeight / maxVisibleRows, a constant -- never derived from the current lap count), so the
 * layout never resizes or rescales its text as laps are added. Rows show the lap number (not a
 * driver name -- single-driver telemetry) and the full lap time (not a delta), with the
 * session-fastest lap's row highlighted purple and marked with the fastest-lap icon in place of a
 * pit/tag badge. Draws just the background+header (no rows) when `lapState` is null, e.g. before
 * a start/finish line has been set -- rather than silently falling back to the plain elapsed-mode look.
 */
function drawTimingTower(
  ctx: Canvas2DLike,
  rect: Rect,
  style: TimerStyle,
  lapState: LapState | null,
  headerImage: CanvasImageLike | null,
  fastestLapIcon: CanvasImageLike | null
): void {
  drawTimingTowerBackground(ctx, rect, style)

  const outlineWidth = scaleToRect(style.textOutlineWidth, rect)
  const hasHeader = Boolean(style.headerText) || Boolean(headerImage)
  const headerH = hasHeader ? rect.h * 0.18 : 0

  if (hasHeader) {
    drawTimingTowerHeader(ctx, rect, headerH, style, outlineWidth, headerImage)
  }

  if (!lapState) return

  const rowsTop = rect.y + headerH
  const rowsHeight = rect.h - headerH
  const rowH = rowsHeight / Math.max(1, style.maxVisibleRows)

  const isNewBestFlashing = lapState.isNewBest && lapState.currentLapElapsedMs < NEW_BEST_FLASH_MS
  const flashProgress = isNewBestFlashing ? lapState.currentLapElapsedMs / NEW_BEST_FLASH_MS : 1
  const flashFade = 1 - flashProgress
  const flashPulse = 0.6 + 0.4 * Math.sin(flashProgress * Math.PI * 6)
  const flashGlow = flashFade * flashPulse
  const mostRecentLapNumber = lapState.history.length > 0 ? lapState.history[0].lapNumber : -1

  const rows = selectTimingTowerRows(lapState.history, style)
  rows.forEach((entry, i) => {
    const rowIsFlashing = isNewBestFlashing && entry.isBest && entry.lapNumber === mostRecentLapNumber
    drawTimingTowerRow(ctx, rect, rowsTop + rowH * i, rowH, entry, style, outlineWidth, fastestLapIcon, rowIsFlashing, flashGlow)
  })
}
