import { BrowserWindow } from 'electron'
import { autoUpdater } from 'electron-updater'

/**
 * Squirrel.Mac (what Electron's auto-updater uses on macOS) requires the app be code-signed to
 * replace itself -- unlike Windows, there's no unsigned workaround (see
 * `verifyUpdateCodeSignature: false` in package.json's build config, which is what lets an unsigned
 * Windows NSIS build self-update at all). Since this project has no Apple Developer ID, in-app
 * updates are only wired up where they can actually work; macOS keeps the existing link-out-only
 * update banner (`main/app/updateCheck.ts`). Revisit if a Developer ID is ever added.
 */
export const SUPPORTS_IN_APP_UPDATE = process.platform === 'win32' || process.platform === 'linux'

// Collapses "check" and "download" into one user-initiated action (the renderer's Update button) --
// there's no separate "confirm available, then separately click to download" step, since the
// EXISTING lightweight GitHub-API check (updateCheck.ts) already told the user a newer version
// exists before this button was ever shown.
autoUpdater.autoDownload = true
autoUpdater.autoInstallOnAppQuit = false

function broadcast(channel: string, ...args: unknown[]): void {
  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send(channel, ...args)
  }
}

let listenersRegistered = false

/** Idempotent -- safe to call more than once (e.g. if this were ever invoked from more than one
 *  startup path). No-ops entirely on macOS, see SUPPORTS_IN_APP_UPDATE. */
export function registerUpdaterListeners(): void {
  if (listenersRegistered || !SUPPORTS_IN_APP_UPDATE) return
  listenersRegistered = true

  // Only reachable if the user clicked Update on a version the OTHER (GitHub API) check already
  // confirmed exists -- so "not available" here specifically means THIS release doesn't have
  // electron-updater's own metadata file yet (e.g. it predates this feature shipping), not that no
  // update exists at all. Surfaced as a soft error with a fallback, not a silent no-op.
  autoUpdater.on('update-not-available', () => {
    broadcast('updater:error', "This release isn't available for in-app update yet -- use the link above to download it manually.")
  })
  autoUpdater.on('download-progress', (progress) => {
    broadcast('updater:progress', Math.round(progress.percent))
  })
  autoUpdater.on('update-downloaded', () => {
    broadcast('updater:downloaded')
  })
  autoUpdater.on('error', (err) => {
    broadcast('updater:error', err.message)
  })
}

/** Kicks off the whole check-then-download flow; progress/completion/errors all arrive via the
 *  events registered above, not this function's own return value. */
export function startUpdate(): void {
  if (!SUPPORTS_IN_APP_UPDATE) return
  autoUpdater.checkForUpdates().catch((err) => {
    broadcast('updater:error', err instanceof Error ? err.message : String(err))
  })
}

export function quitAndInstallUpdate(): void {
  if (!SUPPORTS_IN_APP_UPDATE) return
  autoUpdater.quitAndInstall()
}
