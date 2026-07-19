import { formatTime } from '../format'
import { convertSpeed, speedUnitLabel, type SpeedUnit } from '../units'
import { FORMULA1_BOLD, FORMULA1_REGULAR } from './fonts'
import { drawOutlinedText, fillRoundedRect, fitFontSizePx, scaleToRect, type Canvas2DLike, type Rect } from './canvas2d'

export interface SessionSummaryStyle {
  title: string
  /** The widget is only visible in the final N seconds of the (trimmed) session -- an outro/end
   *  card, not something shown the whole time. */
  showLastSeconds: number
  /** Fade + slide-up duration when the card appears, ms. 0 disables the animation (shows instantly). */
  animationDurationMs: number
  unit: SpeedUnit
  color: string
  labelColor: string
  accentColor: string
  textOutlineWidth: number
  textOutlineColor: string
  backgroundColor: string
  backgroundOpacity: number
  cornerRadius: number
}

export const DEFAULT_SESSION_SUMMARY_STYLE: SessionSummaryStyle = {
  title: 'SESSION SUMMARY',
  showLastSeconds: 8,
  animationDurationMs: 600,
  unit: 'kmh',
  color: '#ffffff',
  labelColor: '#9a9aa4',
  accentColor: '#b026ff',
  textOutlineWidth: 2,
  textOutlineColor: '#000000',
  backgroundColor: '#0a0a10',
  backgroundOpacity: 0.85,
  cornerRadius: 16
}

/** Everything the summary card shows, resolved ONCE against the (trimmed) session's true final
 *  totals -- NOT "as of the live playback position" like every other lap/sector widget. This is an
 *  outro recap, not a live readout: the numbers should hold still through the whole reveal window
 *  instead of visibly ticking (distance/duration climbing, top speed jumping) as the video plays
 *  through its own final seconds. Only the reveal *animation* (fade/slide-in) is still driven by the
 *  live `cts` in DrawSessionSummaryOptions -- the data itself is a session-level constant. */
export interface SessionSummaryData {
  totalLaps: number
  bestLapMs: number | null
  bestS1Ms: number | null
  bestS2Ms: number | null
  bestS3Ms: number | null
  topSpeedMps: number
  totalDistanceM: number
  /** Total duration of the (trimmed) session, start to end -- not "up to the live cts". */
  elapsedMs: number
}

export interface DrawSessionSummaryOptions {
  rect: Rect
  style: SessionSummaryStyle
  data: SessionSummaryData
  cts: number
  /** Absolute cts (same space as `cts`) at which the trimmed session ends -- showLastSeconds counts
   *  back from here, not from the untrimmed source file's own end. */
  sessionEndMs: number
}

const FONT_STACK = 'ui-sans-serif, -apple-system, "Segoe UI", Roboto, sans-serif'
const TITLE_FONT_STACK = `"${FORMULA1_BOLD}", ${FONT_STACK}`
const VALUE_FONT_STACK = `"${FORMULA1_REGULAR}", ${FONT_STACK}`

function formatDistance(meters: number, unit: SpeedUnit): string {
  if (unit === 'mph') {
    const miles = meters / 1609.344
    return `${miles.toFixed(miles < 10 ? 2 : 1)} mi`
  }
  const km = meters / 1000
  return `${km.toFixed(km < 10 ? 2 : 1)} km`
}

interface StatCell {
  label: string
  value: string
}

/** `maxWidth` is the ACTUAL available width for this one cell (a fraction of the real widget rect,
 *  computed by the caller) -- both label and value are fitted against it, not an arbitrary
 *  rowH-relative constant. A summary card packs two (or three, for the sector row) columns side by
 *  side, so without a real width constraint here, a narrower widget (or the 3-column sector row)
 *  overlaps its neighbor instead of shrinking to fit -- confirmed via a real render at a deliberately
 *  narrow width before this fix, where every row's left/right text collided illegibly. */
function drawStatCell(
  ctx: Canvas2DLike,
  cell: StatCell,
  cx: number,
  labelY: number,
  valueY: number,
  rowH: number,
  maxWidth: number,
  style: SessionSummaryStyle,
  outlineWidth: number
): void {
  ctx.save()
  ctx.textAlign = 'center'
  ctx.textBaseline = 'alphabetic'
  fitFontSizePx(ctx, cell.label, maxWidth, rowH * 0.24, '600', VALUE_FONT_STACK)
  drawOutlinedText(ctx, cell.label, cx, labelY, style.labelColor, outlineWidth, style.textOutlineColor)

  fitFontSizePx(ctx, cell.value, maxWidth, rowH * 0.4, '700', VALUE_FONT_STACK)
  drawOutlinedText(ctx, cell.value, cx, valueY, style.color, outlineWidth, style.textOutlineColor)
  ctx.restore()
}

/**
 * An end-of-session "outro" stat card: only draws anything once `cts` enters the final
 * `showLastSeconds` of the (trimmed) session, fading + sliding into place over
 * `animationDurationMs` -- a pure function of "how far into its own visible window is this frame",
 * same technique as the lap timer's new-best-lap flash, so it's frame-accurate and automatically
 * correct whether played back live or scrubbed directly to in the editor.
 */
export function drawSessionSummary(ctx: Canvas2DLike, options: DrawSessionSummaryOptions): void {
  const { rect, style, data, cts, sessionEndMs } = options
  const showStartCts = sessionEndMs - style.showLastSeconds * 1000
  if (cts < showStartCts) return

  const visibleMs = cts - showStartCts
  const rawProgress = style.animationDurationMs > 0 ? Math.min(1, visibleMs / style.animationDurationMs) : 1
  // Ease-out cubic: fast start, settles gently -- reads as a deliberate reveal, not a linear snap.
  const eased = 1 - Math.pow(1 - rawProgress, 3)
  if (eased <= 0) return

  const slideOffset = (1 - eased) * rect.h * 0.12
  const outlineWidth = scaleToRect(style.textOutlineWidth, rect)

  if (style.backgroundOpacity > 0) {
    ctx.save()
    ctx.globalAlpha = style.backgroundOpacity * eased
    ctx.fillStyle = style.backgroundColor
    fillRoundedRect(ctx, rect.x, rect.y, rect.w, rect.h, scaleToRect(style.cornerRadius, rect))
    ctx.restore()
  }

  ctx.save()
  ctx.globalAlpha = eased

  const cx = rect.x + rect.w / 2
  const titleY = rect.y + rect.h * 0.14 - slideOffset
  if (style.title) {
    ctx.textAlign = 'center'
    ctx.textBaseline = 'alphabetic'
    fitFontSizePx(ctx, style.title, rect.w * 0.9, rect.h * 0.11, '700', TITLE_FONT_STACK)
    drawOutlinedText(ctx, style.title, cx, titleY, style.accentColor, outlineWidth, style.textOutlineColor)
  }

  const unitLabel = speedUnitLabel(style.unit)
  const leftCx = rect.x + rect.w * 0.27
  const rightCx = rect.x + rect.w * 0.73
  // Real available width per column (two columns, with a gap between them) -- not an arbitrary
  // rowH-relative constant, so text actually shrinks to fit a narrower widget instead of overlapping.
  const colMaxWidth = rect.w * 0.42
  const hasSectorRow = data.bestS1Ms != null || data.bestS2Ms != null || data.bestS3Ms != null

  const rows: [StatCell, StatCell][] = [
    [
      { label: 'BEST LAP', value: data.bestLapMs != null ? formatTime(data.bestLapMs, true) : '--:--' },
      { label: `TOP SPEED (${unitLabel})`, value: Math.round(convertSpeed(data.topSpeedMps, style.unit)).toString() }
    ],
    [
      { label: 'LAPS', value: String(data.totalLaps) },
      { label: 'DISTANCE', value: formatDistance(data.totalDistanceM, style.unit) }
    ],
    [
      { label: 'DURATION', value: formatTime(data.elapsedMs) },
      {
        label: `AVG SPEED (${unitLabel})`,
        value: Math.round(convertSpeed(data.elapsedMs > 0 ? data.totalDistanceM / (data.elapsedMs / 1000) : 0, style.unit)).toString()
      }
    ]
  ]

  // Row height is derived from the ACTUAL available vertical space divided by however many rows
  // will actually be drawn (3, or 4 when the optional sector row is shown) -- previously a fixed
  // rowH assumed exactly 3 rows always, so whenever the sector row was also shown the total content
  // needed more height than the card reserved for it, pushing that row below the card's own bottom
  // edge instead of shrinking to fit.
  const rowsTopBase = rect.y + rect.h * 0.3
  const rowsBottomBase = rect.y + rect.h * 0.95
  const totalRowSlots = rows.length + (hasSectorRow ? 1 : 0)
  const rowH = (rowsBottomBase - rowsTopBase) / totalRowSlots
  const rowsTop = rowsTopBase - slideOffset

  for (let i = 0; i < rows.length; i++) {
    const rowY = rowsTop + rowH * i
    drawStatCell(ctx, rows[i][0], leftCx, rowY + rowH * 0.28, rowY + rowH * 0.72, rowH, colMaxWidth, style, outlineWidth)
    drawStatCell(ctx, rows[i][1], rightCx, rowY + rowH * 0.28, rowY + rowH * 0.72, rowH, colMaxWidth, style, outlineWidth)
  }

  // Best sectors, three across, only if at least one is known -- mirrors the Sector Timer widget's
  // own S1/S2/S3 layout convention for visual consistency between the two widgets.
  if (hasSectorRow) {
    const sectorY = rowsTop + rowH * rows.length
    const sectorLabels = ['BEST S1', 'BEST S2', 'BEST S3']
    const sectorValues = [data.bestS1Ms, data.bestS2Ms, data.bestS3Ms]
    const colW = rect.w / 3
    for (let i = 0; i < 3; i++) {
      const colCx = rect.x + colW * i + colW / 2
      drawStatCell(
        ctx,
        { label: sectorLabels[i], value: sectorValues[i] != null ? formatTime(sectorValues[i]!, true) : '--.--' },
        colCx,
        sectorY + rowH * 0.28,
        sectorY + rowH * 0.72,
        rowH * 0.85,
        colW * 0.85,
        style,
        outlineWidth
      )
    }
  }

  ctx.restore()
}
