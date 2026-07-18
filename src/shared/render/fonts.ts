/**
 * Font-family names used by draw code, registered identically in two places that must stay in
 * sync: `global.css` (@font-face, for the live-preview DOM canvas) and `GlobalFonts.registerFromPath`
 * in the main process (for `@napi-rs/canvas` during export). A mismatch here silently falls back
 * to a default font in whichever context didn't register it, breaking WYSIWYG.
 */
export const FORMULA1_REGULAR = 'Formula1 Regular'
export const FORMULA1_BOLD = 'Formula1 Bold'
