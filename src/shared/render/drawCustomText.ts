import { FORMULA1_BOLD } from './fonts'
import { drawOutlinedText, fillRoundedRect, fitFontSizePx, scaleToRect, type Canvas2DLike, type CanvasImageLike, type Rect } from './canvas2d'

export interface CustomTextStyle {
  /** Supports multiple lines (split on '\n') -- e.g. a driver name on one line, event name on another. */
  text: string
  textColor: string
  textAlign: 'left' | 'center' | 'right'
  /** 0 disables the outline. */
  textOutlineWidth: number
  textOutlineColor: string
  /** User-uploaded logo/watermark image, stored as a data URL (same convention as the Timer
   *  widget's header logo) -- null = no image. */
  imageDataUrl: string | null
  /** Multiplier applied to the image's natural fit size (still capped to the available area). */
  imageScale: number
  backgroundColor: string
  backgroundOpacity: number
  /** Nominal corner radius (px at the scaleToRect reference size) of the background panel. 0 = square corners. */
  cornerRadius: number
}

export const DEFAULT_CUSTOM_TEXT_STYLE: CustomTextStyle = {
  text: 'Your Text Here',
  textColor: '#ffffff',
  textAlign: 'center',
  textOutlineWidth: 2,
  textOutlineColor: '#000000',
  imageDataUrl: null,
  imageScale: 1,
  backgroundColor: '#0a0a10',
  backgroundOpacity: 0,
  cornerRadius: 12
}

export interface DrawCustomTextOptions {
  rect: Rect
  style: CustomTextStyle
  /** Loaded ahead of time by the caller (image decode is async; drawing is not) -- null/undefined draws no image. */
  image?: CanvasImageLike | null
}

const FONT_STACK = 'ui-sans-serif, -apple-system, "Segoe UI", Roboto, sans-serif'
const TEXT_FONT_STACK = `"${FORMULA1_BOLD}", ${FONT_STACK}`
const SAFE_WIDTH_FRACTION = 0.92

/**
 * A freeform text/logo widget -- unlike every other widget, its content isn't derived from
 * telemetry at all, so this just lays out a user-uploaded image and/or freeform text (driver name,
 * event title, sponsor watermark, etc.) within the widget's own box. Image-above-text when both are
 * present (matching the Timer widget's header layout convention), either alone gets the whole box.
 */
export function drawCustomText(ctx: Canvas2DLike, options: DrawCustomTextOptions): void {
  const { rect, style, image } = options

  if (style.backgroundOpacity > 0) {
    ctx.save()
    ctx.globalAlpha = style.backgroundOpacity
    ctx.fillStyle = style.backgroundColor
    fillRoundedRect(ctx, rect.x, rect.y, rect.w, rect.h, scaleToRect(style.cornerRadius, rect))
    ctx.restore()
  }

  const hasImage = Boolean(image) && image!.width > 0 && image!.height > 0
  const lines = style.text.split('\n')
  const hasText = lines.some((line) => line.trim() !== '')
  if (!hasImage && !hasText) return

  const padding = rect.h * 0.06
  const imageAreaH = hasImage ? (hasText ? rect.h * 0.55 : rect.h) : 0
  const textAreaY = rect.y + imageAreaH
  const textAreaH = rect.h - imageAreaH

  if (hasImage) {
    const availH = Math.max(1, imageAreaH - padding * 2)
    const aspect = image!.width / image!.height
    let imgH = availH * style.imageScale
    let imgW = imgH * aspect
    const maxImgW = rect.w * 0.9
    if (imgW > maxImgW) {
      imgW = maxImgW
      imgH = imgW / aspect
    }
    const imgX = rect.x + (rect.w - imgW) / 2
    const imgY = rect.y + (imageAreaH - imgH) / 2
    ctx.drawImage(image!, imgX, imgY, imgW, imgH)
  }

  if (!hasText) return

  const outlineWidth = scaleToRect(style.textOutlineWidth, rect)
  const maxWidth = rect.w * SAFE_WIDTH_FRACTION
  const maxLineHeight = (textAreaH * 0.85) / lines.length

  ctx.save()
  ctx.textBaseline = 'middle'
  ctx.textAlign = style.textAlign
  const textX = style.textAlign === 'left' ? rect.x + padding : style.textAlign === 'right' ? rect.x + rect.w - padding : rect.x + rect.w / 2

  // Sized once against the widest line so every line shares one consistent font size -- fitting
  // each line individually would make short and long lines in the same block look mismatched.
  const widestLine = lines.reduce((a, b) => (b.length > a.length ? b : a), '')
  const fontSize = fitFontSizePx(ctx, widestLine, maxWidth, maxLineHeight, '700', TEXT_FONT_STACK)
  const lineHeight = fontSize * 1.25
  const blockHeight = lineHeight * lines.length
  const firstLineY = textAreaY + textAreaH / 2 - blockHeight / 2 + lineHeight / 2

  lines.forEach((line, i) => {
    if (!line) return
    drawOutlinedText(ctx, line, textX, firstLineY + lineHeight * i, style.textColor, outlineWidth, style.textOutlineColor)
  })
  ctx.restore()
}
