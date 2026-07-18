import { app } from 'electron'
import path from 'path'
import { loadImage, type Image } from '@napi-rs/canvas'

// Bundled asset, not user-provided -- lives under the renderer's source tree same as the fonts
// (see registerFonts.ts for why packaged builds resolve this via process.resourcesPath instead).
const ICONS_DIR = app.isPackaged
  ? path.join(process.resourcesPath, 'icons')
  : path.join(app.getAppPath(), 'src/renderer/src/icons')

let fastestLapIconPromise: Promise<Image> | null = null

/** Loaded once and cached for the life of the process -- it's a fixed bundled asset, not per-widget. */
export function loadFastestLapIcon(): Promise<Image> {
  if (!fastestLapIconPromise) {
    fastestLapIconPromise = loadImage(path.join(ICONS_DIR, 'fl.png'))
  }
  return fastestLapIconPromise
}
