import { app, shell, BrowserWindow } from 'electron'
import { join } from 'path'
import { appendFileSync } from 'fs'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import { registerIpcHandlers } from './ipc/handlers'
import { clearPreviewCache } from './video/previewProxy'
import { registerVideoProtocolPrivilege, registerVideoProtocolHandler } from './video/videoProtocol'
import { chromiumFeaturesFor } from './app/chromiumFeatures'

// Must be set before app.whenReady() -- see chromiumFeatures.ts for why these exist.
app.commandLine.appendSwitch('enable-features', chromiumFeaturesFor(process.platform).join(','))

registerVideoProtocolPrivilege()

// A renderer or GPU-process crash (e.g. a driver-level TDR from sustained heavy canvas/video load)
// shows up to the user as a plain black window with zero explanation -- React's own ErrorBoundary
// can't catch it, since the whole process is gone, not just a component throwing. Logged to a file
// (not just console, which is invisible in a packaged build with no attached terminal) so a report
// of "it went black" comes with an actual reason next time.
function logCrash(line: string): void {
  const logPath = join(app.getPath('userData'), 'crash.log')
  try {
    appendFileSync(logPath, `[${new Date().toISOString()}] ${line}\n`)
  } catch {
    // best-effort -- never let crash logging itself throw
  }
  console.error(line)
}

app.on('render-process-gone', (_event, _webContents, details) => {
  logCrash(`Renderer process gone: reason=${details.reason} exitCode=${details.exitCode}`)
})

app.on('child-process-gone', (_event, details) => {
  logCrash(`Child process gone: type=${details.type} reason=${details.reason} exitCode=${details.exitCode} name=${details.name ?? ''}`)
})

function createWindow(): void {
  const mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    show: false,
    autoHideMenuBar: true,
    backgroundColor: '#0b0b0d',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow.show()
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(() => {
  electronApp.setAppUserModelId('com.gopro-overlay.app')

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  registerVideoProtocolHandler()
  registerIpcHandlers()
  clearPreviewCache()
  createWindow()

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
