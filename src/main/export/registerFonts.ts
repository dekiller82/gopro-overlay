import { app } from 'electron'
import path from 'path'
import { GlobalFonts } from '@napi-rs/canvas'
import { FORMULA1_BOLD, FORMULA1_REGULAR } from '../../shared/render/fonts'

// These .otf files live under the renderer's source tree (not bundled by the main-process build,
// since nothing there imports them). @napi-rs/canvas is a native addon and can't read files packed
// inside app.asar, so in a packaged build electron-builder copies this folder out to
// resources/fonts (see the "extraResources" entry in package.json's "build" config) and it's
// resolved via process.resourcesPath instead of the (asar-relative) app path.
const FONTS_DIR = app.isPackaged
  ? path.join(process.resourcesPath, 'fonts')
  : path.join(app.getAppPath(), 'src/renderer/src/fonts')

/** Idempotent -- safe to call multiple times (e.g. once per export) without re-registering. */
export function registerExportFonts(): void {
  if (!GlobalFonts.has(FORMULA1_REGULAR)) {
    GlobalFonts.registerFromPath(path.join(FONTS_DIR, 'Formula1-Regular.otf'), FORMULA1_REGULAR)
  }
  if (!GlobalFonts.has(FORMULA1_BOLD)) {
    GlobalFonts.registerFromPath(path.join(FONTS_DIR, 'Formula1-Bold.otf'), FORMULA1_BOLD)
  }
}
