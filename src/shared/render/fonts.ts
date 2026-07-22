/**
 * Font-family names used by draw code, registered identically in two places that must stay in
 * sync: `global.css` (@font-face, for the live-preview DOM canvas) and `GlobalFonts.registerFromPath`
 * in the main process (for `@napi-rs/canvas` during export). A mismatch here silently falls back
 * to a default font in whichever context didn't register it, breaking WYSIWYG.
 */
export const FORMULA1_REGULAR = 'Formula1 Regular'
export const FORMULA1_BOLD = 'Formula1 Bold'

/** Sentinel meaning "use the bundled Formula1 pairing" -- stored in project/widget font fields
 *  instead of a real system font family name. Kept as a first-class option (not just a fallback)
 *  since it's this app's default look, alongside any real OS-installed font the user picks. */
export const FORMULA1_FONT_ID = 'formula1'

/** Generic system-font fallback, previously copy-pasted as `FONT_STACK` in every draw*.ts file. */
export const FALLBACK_FONT_STACK = 'ui-sans-serif, -apple-system, "Segoe UI", Roboto, sans-serif'

/**
 * Resolves a widget/project font-family choice to a full CSS/Canvas font-family stack. `fontFamily`
 * is either a real system font name (registered for export via `GlobalFonts.loadSystemFonts()`, see
 * `main/export/registerFonts.ts`) or falsy/`FORMULA1_FONT_ID`, meaning "use the bundled pairing" --
 * the only place that still needs a bold/regular distinction, since arbitrary system fonts are
 * referenced by one family name and rely on the renderer to synthesize bold from a numeric weight
 * (ordinary canvas/CSS font behavior, not something this app can guarantee per system font without
 * inspecting every font's own available weights).
 */
export function resolveFontStack(fontFamily: string | null | undefined, weight: 'bold' | 'regular'): string {
  if (!fontFamily || fontFamily === FORMULA1_FONT_ID) {
    return `"${weight === 'bold' ? FORMULA1_BOLD : FORMULA1_REGULAR}", ${FALLBACK_FONT_STACK}`
  }
  return `"${fontFamily}", ${FALLBACK_FONT_STACK}`
}
