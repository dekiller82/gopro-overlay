import { ipcMain, dialog, BrowserWindow, type OpenDialogOptions } from 'electron'
import { ensurePreviewProxy } from '../video/previewProxy'
import { probeAndParseClip, buildImportResult, sliceClipTelemetry, type ProbedClip } from '../video/clipImport'
import { loadProjectFromFile, saveProjectToFile } from '../project/persistence'
import { runExport } from '../export/runExport'
import { createTelemetrySampler } from '../../shared/telemetry/sampleAt'
import type { ImportResult, ProjectPayload, VideoMeta } from '../../shared/types'

const PROJECT_FILTERS = [{ name: 'GoPro Overlay Project', extensions: ['gpo'] }]
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
  // renderer's <video> element actually fails to play the original file at runtime.
  ipcMain.handle('video:ensure-preview-proxy', async (event, video: VideoMeta): Promise<string> => {
    return ensurePreviewProxy(video, (fraction) => {
      event.sender.send('video:preview-proxy-progress', { fraction })
    })
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
    return result.filePath
  })

  ipcMain.handle('project:load', async (): Promise<ProjectPayload | null> => {
    const win = BrowserWindow.getFocusedWindow()
    const result = win
      ? await dialog.showOpenDialog(win, { properties: ['openFile'], filters: PROJECT_FILTERS })
      : await dialog.showOpenDialog({ properties: ['openFile'], filters: PROJECT_FILTERS })

    if (result.canceled || result.filePaths.length === 0) return null
    return loadProjectFromFile(result.filePaths[0])
  })

  ipcMain.handle('export:start', async (event, payload: ProjectPayload): Promise<string | null> => {
    const win = BrowserWindow.getFocusedWindow()
    const result = win
      ? await dialog.showSaveDialog(win, { filters: [{ name: 'MP4 Video', extensions: ['mp4'] }], defaultPath: 'export.mp4' })
      : await dialog.showSaveDialog({ filters: [{ name: 'MP4 Video', extensions: ['mp4'] }], defaultPath: 'export.mp4' })

    if (result.canceled || !result.filePath) return null

    const { clips } = payload.imported
    const referenceVideo = clips[0].video
    const sampler = createTelemetrySampler(payload.imported.telemetry)

    await runExport({
      clips,
      outputPath: result.filePath,
      widgets: payload.widgets,
      sampler,
      startFinish: payload.startFinish,
      trimStartMs: payload.trimStartMs,
      trimEndMs: payload.trimEndMs,
      settings: { width: referenceVideo.width, height: referenceVideo.height, fps: referenceVideo.fps || 30, crf: EXPORT_CRF },
      onProgress: (done, total) => {
        event.sender.send('export:progress', { done, total })
      },
      onEncoderSelected: (label) => {
        event.sender.send('export:encoder', { label })
      }
    })

    return result.filePath
  })
}
