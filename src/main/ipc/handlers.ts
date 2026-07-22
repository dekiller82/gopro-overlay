import { ipcMain, dialog, BrowserWindow, app, type OpenDialogOptions } from 'electron'
import { ensurePreviewProxy } from '../video/previewProxy'
import { probeAndParseClip, buildImportResult, sliceClipTelemetry, type ProbedClip } from '../video/clipImport'
import { loadProjectFromFile, saveProjectToFile } from '../project/persistence'
import { listLayoutPresets, saveLayoutPreset, deleteLayoutPreset, defaultLayoutPresetsFilePath } from '../project/layoutPresets'
import { autosaveProjectPath, hasAutosave, clearAutosave } from '../project/autosave'
import { listRecentProjects, addRecentProject, removeRecentProject, defaultRecentProjectsFilePath } from '../project/recentProjects'
import { defaultChangelogPath, readChangelog } from '../app/changelog'
import { checkForUpdate } from '../app/updateCheck'
import { listSystemFonts } from '../app/systemFonts'
import { runExport } from '../export/runExport'
import { createTelemetrySampler } from '../../shared/telemetry/sampleAt'
import { findDeliveryPreset, resolvePresetDimensions } from '../../shared/export/deliveryPresets'
import type { ImportResult, ProjectPayload, VideoMeta, WidgetInstance, WidgetLayoutPreset, RecentProject, UpdateCheckResult } from '../../shared/types'

const PROJECT_FILTERS = [{ name: 'Telemetry Studio Project', extensions: ['gpo'] }]
const VIDEO_FILTERS = [{ name: 'GoPro video', extensions: ['mp4', 'mov', 'MP4', 'MOV'] }]
const EXPORT_CRF = 18

export function registerIpcHandlers(): void {
  ipcMain.handle('video:pick', async (): Promise<string[]> => {
    const win = BrowserWindow.getFocusedWindow()
    const options: OpenDialogOptions = { properties: ['openFile', 'multiSelections'], filters: VIDEO_FILTERS }
    const result = win ? await dialog.showOpenDialog(win, options) : await dialog.showOpenDialog(options)

    if (result.canceled || result.filePaths.length === 0) return []
    // GoPro's own chapter naming (GH010230.MP4, GH020230.MP4, GH030230.MP4 = one recording split
    // into parts) sorts correctly into chapter order alphabetically -- this is the clip order.
    return [...result.filePaths].sort()
  })

  // Preview is attempted natively (full-res, no transcode) first -- this only runs when the
  // renderer's <video> element actually fails to play the original file at runtime. `forceTranscode`
  // is set by the renderer on a SECOND call for the same clip, when the first (remuxed) proxy it
  // already tried also failed to play -- see ensurePreviewProxy's own doc comment for why a
  // successful remux isn't proof of playability.
  ipcMain.handle('video:ensure-preview-proxy', async (event, video: VideoMeta, forceTranscode?: boolean): Promise<string> => {
    return ensurePreviewProxy(
      video,
      (fraction) => {
        event.sender.send('video:preview-proxy-progress', { fraction })
      },
      forceTranscode
    )
  })

  ipcMain.handle('video:import', async (event, filePaths: string[]): Promise<ImportResult> => {
    const probed: ProbedClip[] = []
    for (let i = 0; i < filePaths.length; i++) {
      probed.push(
        await probeAndParseClip(filePaths[i], i, filePaths.length, (progress) => {
          event.sender.send('video:import-progress', progress)
        })
      )
    }
    return buildImportResult(probed)
  })

  // Appends more clips to an already-imported project without re-parsing GPMF for clips that are
  // already imported (the expensive part) -- reconstructs their raw per-clip telemetry by slicing
  // it back out of the already-stitched result instead.
  ipcMain.handle('video:add-clips', async (event, existing: ImportResult, newFilePaths: string[]): Promise<ImportResult> => {
    const existingProbed = existing.clips.map((clip) => ({
      video: clip.video,
      telemetry: sliceClipTelemetry(clip, existing.telemetry)
    }))

    const totalClips = existing.clips.length + newFilePaths.length
    const newProbed: ProbedClip[] = []
    for (let i = 0; i < newFilePaths.length; i++) {
      const clipIndex = existing.clips.length + i
      newProbed.push(
        await probeAndParseClip(newFilePaths[i], clipIndex, totalClips, (progress) => {
          event.sender.send('video:import-progress', progress)
        })
      )
    }
    return buildImportResult([...existingProbed, ...newProbed])
  })

  ipcMain.handle('project:save', async (_event, payload: ProjectPayload): Promise<string | null> => {
    const win = BrowserWindow.getFocusedWindow()
    const result = win
      ? await dialog.showSaveDialog(win, { filters: PROJECT_FILTERS, defaultPath: 'project.gpo' })
      : await dialog.showSaveDialog({ filters: PROJECT_FILTERS, defaultPath: 'project.gpo' })

    if (result.canceled || !result.filePath) return null
    await saveProjectToFile(result.filePath, payload)
    await addRecentProject(defaultRecentProjectsFilePath(), result.filePath)
    return result.filePath
  })

  ipcMain.handle('project:load', async (): Promise<ProjectPayload | null> => {
    const win = BrowserWindow.getFocusedWindow()
    const result = win
      ? await dialog.showOpenDialog(win, { properties: ['openFile'], filters: PROJECT_FILTERS })
      : await dialog.showOpenDialog({ properties: ['openFile'], filters: PROJECT_FILTERS })

    if (result.canceled || result.filePaths.length === 0) return null
    const payload = await loadProjectFromFile(result.filePaths[0])
    await addRecentProject(defaultRecentProjectsFilePath(), result.filePaths[0])
    return payload
  })

  // Opens a specific, already-known project path directly (no file picker) -- used by the Recent
  // Projects list on the start screen.
  ipcMain.handle('project:load-path', async (_event, projectPath: string): Promise<ProjectPayload> => {
    try {
      const payload = await loadProjectFromFile(projectPath)
      await addRecentProject(defaultRecentProjectsFilePath(), projectPath)
      return payload
    } catch (err) {
      // The file was likely moved/deleted since it was listed -- drop it so it doesn't keep
      // failing every time it's clicked, then let the real error surface to the UI.
      await removeRecentProject(defaultRecentProjectsFilePath(), projectPath)
      throw err
    }
  })

  ipcMain.handle('recent:list', async (): Promise<RecentProject[]> => listRecentProjects(defaultRecentProjectsFilePath()))

  ipcMain.handle('app:getVersion', (): string => app.getVersion())
  ipcMain.handle('app:getChangelog', async (): Promise<string> => readChangelog(defaultChangelogPath()))
  ipcMain.handle('app:checkForUpdate', async (): Promise<UpdateCheckResult | null> => checkForUpdate(app.getVersion()))
  ipcMain.handle('fonts:listSystem', async (): Promise<string[]> => listSystemFonts())

  ipcMain.handle('export:start', async (event, payload: ProjectPayload, deliveryPresetId?: string): Promise<string | null> => {
    const win = BrowserWindow.getFocusedWindow()
    const result = win
      ? await dialog.showSaveDialog(win, { filters: [{ name: 'MP4 Video', extensions: ['mp4'] }], defaultPath: 'export.mp4' })
      : await dialog.showSaveDialog({ filters: [{ name: 'MP4 Video', extensions: ['mp4'] }], defaultPath: 'export.mp4' })

    if (result.canceled || !result.filePath) return null

    const { clips } = payload.imported
    const referenceVideo = clips[0].video
    const sampler = createTelemetrySampler(payload.imported.telemetry)

    // No preset (or an unrecognized id) -- the default "source quality" export, byte-for-byte
    // the same settings this app has always used: native resolution, quality-based (CRF) encode.
    const preset = deliveryPresetId ? findDeliveryPreset(deliveryPresetId) : null
    const { width, height } = preset
      ? resolvePresetDimensions(preset, referenceVideo.width, referenceVideo.height)
      : { width: referenceVideo.width, height: referenceVideo.height }

    await runExport({
      clips,
      outputPath: result.filePath,
      widgets: payload.widgets,
      sampler,
      startFinish: payload.startFinish,
      crossingAdjustmentsMs: payload.crossingAdjustmentsMs,
      trimStartMs: payload.trimStartMs,
      trimEndMs: payload.trimEndMs,
      defaultFontFamily: payload.defaultFontFamily,
      settings: {
        width,
        height,
        fps: referenceVideo.fps || 30,
        crf: EXPORT_CRF,
        videoBitrateKbps: preset?.videoBitrateKbps,
        audioBitrateKbps: preset?.audioBitrateKbps
      },
      onProgress: (done, total) => {
        event.sender.send('export:progress', { done, total })
      },
      onEncoderSelected: (label) => {
        event.sender.send('export:encoder', { label })
      }
    })

    return result.filePath
  })

  ipcMain.handle('layouts:list', async (): Promise<WidgetLayoutPreset[]> => listLayoutPresets(defaultLayoutPresetsFilePath()))

  ipcMain.handle('layouts:save', async (_event, name: string, widgets: WidgetInstance[]): Promise<WidgetLayoutPreset[]> =>
    saveLayoutPreset(defaultLayoutPresetsFilePath(), name, widgets)
  )

  ipcMain.handle('layouts:delete', async (_event, id: string): Promise<WidgetLayoutPreset[]> =>
    deleteLayoutPreset(defaultLayoutPresetsFilePath(), id)
  )

  ipcMain.handle('autosave:has', async (): Promise<boolean> => hasAutosave(autosaveProjectPath()))

  ipcMain.handle('autosave:save', async (_event, payload: ProjectPayload): Promise<void> => {
    await saveProjectToFile(autosaveProjectPath(), payload)
  })

  ipcMain.handle('autosave:load', async (): Promise<ProjectPayload | null> => {
    const projectPath = autosaveProjectPath()
    return hasAutosave(projectPath) ? loadProjectFromFile(projectPath) : null
  })

  ipcMain.handle('autosave:clear', async (): Promise<void> => clearAutosave(autosaveProjectPath()))
}
