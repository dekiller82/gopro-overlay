import { ElectronAPI } from '@electron-toolkit/preload'
import type { ImportResult, ProjectPayload, ImportProgress, VideoMeta, WidgetInstance, WidgetLayoutPreset } from '../shared/types'

interface ExportProgress {
  done: number
  total: number
}

interface Api {
  pickVideoFiles: () => Promise<string[]>
  importVideo: (filePaths: string[]) => Promise<ImportResult>
  addClips: (existing: ImportResult, filePaths: string[]) => Promise<ImportResult>
  ensurePreviewProxy: (video: VideoMeta) => Promise<string>
  saveProject: (payload: ProjectPayload) => Promise<string | null>
  loadProject: () => Promise<ProjectPayload | null>
  exportVideo: (payload: ProjectPayload) => Promise<string | null>
  listLayoutPresets: () => Promise<WidgetLayoutPreset[]>
  saveLayoutPreset: (name: string, widgets: WidgetInstance[]) => Promise<WidgetLayoutPreset[]>
  deleteLayoutPreset: (id: string) => Promise<WidgetLayoutPreset[]>
  hasAutosave: () => Promise<boolean>
  saveAutosave: (payload: ProjectPayload) => Promise<void>
  loadAutosave: () => Promise<ProjectPayload | null>
  clearAutosave: () => Promise<void>
  onExportProgress: (callback: (progress: ExportProgress) => void) => () => void
  onImportProgress: (callback: (progress: ImportProgress) => void) => () => void
  onPreviewProxyProgress: (callback: (progress: { fraction: number }) => void) => () => void
  onExportEncoder: (callback: (info: { label: string }) => void) => () => void
}

declare global {
  interface Window {
    electron: ElectronAPI
    api: Api
  }
}
