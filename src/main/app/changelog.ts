import { readFile } from 'fs/promises'
import { app } from 'electron'
import { join } from 'path'

/** Real location used by the IPC handler; kept separate from readChangelog (which takes an
 *  explicit path) so that can be unit tested against a temp file instead of needing to mock
 *  Electron's `app` module -- same shape as every other main-process file reader in this app.
 *  `app.getAppPath()` resolves to the project root in dev and the packaged app's resources root in
 *  production, matching where CHANGELOG.md actually ships (see electron-builder's `files` list). */
export function defaultChangelogPath(): string {
  return join(app.getAppPath(), 'CHANGELOG.md')
}

/** Missing/unreadable file just means "no changelog to show" -- never a hard error, since this is a
 *  convenience feature, not core project data. */
export async function readChangelog(filePath: string): Promise<string> {
  try {
    return await readFile(filePath, 'utf-8')
  } catch {
    return ''
  }
}
