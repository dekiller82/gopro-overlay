import { existsSync } from 'fs'
import { unlink } from 'fs/promises'
import { app } from 'electron'
import { join, dirname, basename } from 'path'

const AUTOSAVE_FILE_NAME = 'autosave.gpo'

/** Real location used by the IPC handlers; kept separate from the functions below (which all take
 *  an explicit path) so those can be unit tested against a temp file instead of needing to mock
 *  Electron's `app` module -- same shape as project/layoutPresets.ts's defaultLayoutPresetsFilePath.
 *  Paired with the crash-diagnostics logging in main/index.ts -- a renderer/GPU crash mid-session
 *  shouldn't also silently lose whatever hasn't been manually saved to a real .gpo file yet. */
export function autosaveProjectPath(): string {
  return join(app.getPath('userData'), AUTOSAVE_FILE_NAME)
}

export function hasAutosave(filePath: string): boolean {
  return existsSync(filePath)
}

export async function clearAutosave(filePath: string): Promise<void> {
  // Matches saveProjectToFile's own `${basename(projectPath)}.telemetry.json` sibling-file
  // convention, written to the same directory as the project file itself.
  const telemetryPath = join(dirname(filePath), `${basename(filePath)}.telemetry.json`)
  await Promise.all([unlink(filePath).catch(() => {}), unlink(telemetryPath).catch(() => {})])
}
