import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'
import type { ImportResult, ProjectPayload, ImportProgress, VideoMeta, WidgetInstance, WidgetLayoutPreset } from '../shared/types'

export interface ExportProgress {
  done: number
  total: number
}

const api = {
  pickVideoFiles: (): Promise<string[]> => ipcRenderer.invoke('video:pick'),
  importVideo: (filePaths: string[]): Promise<ImportResult> => ipcRenderer.invoke('video:import', filePaths),
  addClips: (existing: ImportResult, filePaths: string[]): Promise<ImportResult> =>
    ipcRenderer.invoke('video:add-clips', existing, filePaths),
  ensurePreviewProxy: (video: VideoMeta): Promise<string> => ipcRenderer.invoke('video:ensure-preview-proxy', video),
  saveProject: (payload: ProjectPayload): Promise<string | null> => ipcRenderer.invoke('project:save', payload),
  loadProject: (): Promise<ProjectPayload | null> => ipcRenderer.invoke('project:load'),
  exportVideo: (payload: ProjectPayload): Promise<string | null> => ipcRenderer.invoke('export:start', payload),
  listLayoutPresets: (): Promise<WidgetLayoutPreset[]> => ipcRenderer.invoke('layouts:list'),
  saveLayoutPreset: (name: string, widgets: WidgetInstance[]): Promise<WidgetLayoutPreset[]> =>
    ipcRenderer.invoke('layouts:save', name, widgets),
  deleteLayoutPreset: (id: string): Promise<WidgetLayoutPreset[]> => ipcRenderer.invoke('layouts:delete', id),
  hasAutosave: (): Promise<boolean> => ipcRenderer.invoke('autosave:has'),
  saveAutosave: (payload: ProjectPayload): Promise<void> => ipcRenderer.invoke('autosave:save', payload),
  loadAutosave: (): Promise<ProjectPayload | null> => ipcRenderer.invoke('autosave:load'),
  clearAutosave: (): Promise<void> => ipcRenderer.invoke('autosave:clear'),
  onExportProgress: (callback: (progress: ExportProgress) => void): (() => void) => {
    const listener = (_event: unknown, progress: ExportProgress): void => callback(progress)
    ipcRenderer.on('export:progress', listener)
    return () => ipcRenderer.removeListener('export:progress', listener)
  },
  onImportProgress: (callback: (progress: ImportProgress) => void): (() => void) => {
    const listener = (_event: unknown, progress: ImportProgress): void => callback(progress)
    ipcRenderer.on('video:import-progress', listener)
    return () => ipcRenderer.removeListener('video:import-progress', listener)
  },
  onPreviewProxyProgress: (callback: (progress: { fraction: number }) => void): (() => void) => {
    const listener = (_event: unknown, progress: { fraction: number }): void => callback(progress)
    ipcRenderer.on('video:preview-proxy-progress', listener)
    return () => ipcRenderer.removeListener('video:preview-proxy-progress', listener)
  },
  onExportEncoder: (callback: (info: { label: string }) => void): (() => void) => {
    const listener = (_event: unknown, info: { label: string }): void => callback(info)
    ipcRenderer.on('export:encoder', listener)
    return () => ipcRenderer.removeListener('export:encoder', listener)
  }
}

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI)
    contextBridge.exposeInMainWorld('api', api)
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-ignore (define in dts)
  window.electron = electronAPI
  // @ts-ignore (define in dts)
  window.api = api
}
