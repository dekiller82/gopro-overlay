/**
 * Font-family names used by draw code, registered identically in two places that must stay in
 * sync: `global.css` (@font-face, for the live-preview DOM canvas) and `GlobalFonts.registerFromPath`
 * in the main process (for `@napi-rs/canvas` during export). A mismatch here silently falls back
 * to a default font in whichever context didn't register it, breaking WYSIWYG.
 */
export const FORMULA1_REGULAR = 'Formula1 Regular'
export const FORMULA1_BOLD = 'Formula1 Bold'

/** Sentinel meaning "auto -- let each widget mix Formula1 Bold/Regular the way it always has"
 *  (e.g. a label in Bold next to a value in Regular). This is the out-of-the-box default, and stays
 *  available as its own explicit choice for anyone who wants that original mixed look back after
 *  picking something else -- but picking `FORMULA1_BOLD` or `FORMULA1_REGULAR` directly (both real,
 *  separately-selectable options in the UI, not just this sentinel) forces EVERY element in that
 *  widget to that one exact bundled font, no auto-mixing, since those are ordinary literal family
 *  names as far as this function is concerned -- see the `else` branch below. */
export const FORMULA1_FONT_ID = 'formula1'

/** Generic system-font fallback, previously copy-pasted as `FONT_STACK` in every draw*.ts file. */
export const FALLBACK_FONT_STACK = 'ui-sans-serif, -apple-system, "Segoe UI", Roboto, sans-serif'

/**
 * Resolves a widget/project font-family choice to a full CSS/Canvas font-family stack. `fontFamily`
 * is a real system font name, one of the two literal bundled family names (`FORMULA1_BOLD`/
 * `FORMULA1_REGULAR`), or falsy/`FORMULA1_FONT_ID` meaning "auto" (see its own doc comment above) --
 * `weight` only matters for that last, auto case; an explicit literal family name (bundled or
 * system) is used as-is for every element regardless of `weight`, since the caller already made a
 * specific choice. Arbitrary system fonts are referenced by one family name and rely on the
 * renderer to synthesize/select bold from a numeric weight (ordinary canvas/CSS font behavior).
 */
export function resolveFontStack(fontFamily: string | null | undefined, weight: 'bold' | 'regular'): string {
  if (!fontFamily || fontFamily === FORMULA1_FONT_ID) {
    return `"${weight === 'bold' ? FORMULA1_BOLD : FORMULA1_REGULAR}", ${FALLBACK_FONT_STACK}`
  }
  return `"${fontFamily}", ${FALLBACK_FONT_STACK}`
}
