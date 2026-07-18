import { useEffect, useState } from 'react'
import Editor from './components/Editor'
import { useProjectStore } from './store/projectStore'
import { useWidgetStore } from './store/widgetStore'
import type { ImportProgress } from '@shared/types'

const IMPORT_PHASE_LABELS: Record<ImportProgress['phase'], string> = {
  extracting: 'Reading video file',
  parsing: 'Parsing GPS telemetry'
}

function ImportProgressBanner({ progress }: { progress: ImportProgress }): React.JSX.Element {
  const label = IMPORT_PHASE_LABELS[progress.phase]
  const pct = Math.round(progress.fraction * 100)
  const clipLabel = progress.totalClips > 1 ? `Clip ${progress.clipIndex + 1} of ${progress.totalClips} — ` : ''
  return (
    <div className="export-banner">
      <div className="export-banner__bar">
        <div className="export-banner__fill" style={{ width: `${pct}%` }} />
      </div>
      <span>
        {clipLabel}
        {label}… {pct}%
      </span>
    </div>
  )
}

function App(): React.JSX.Element {
  const imported = useProjectStore((s) => s.imported)
  const setImported = useProjectStore((s) => s.setImported)
  const updateImportedClips = useProjectStore((s) => s.updateImportedClips)
  const startFinish = useProjectStore((s) => s.startFinish)
  const setStartFinish = useProjectStore((s) => s.setStartFinish)
  const trimStartMs = useProjectStore((s) => s.trimStartMs)
  const trimEndMs = useProjectStore((s) => s.trimEndMs)
  const setTrim = useProjectStore((s) => s.setTrim)
  const widgets = useWidgetStore((s) => s.widgets)
  const loadWidgets = useWidgetStore((s) => s.loadWidgets)
  const resetWidgets = useWidgetStore((s) => s.reset)
  const [status, setStatus] = useState<'idle' | 'loading' | 'error'>('idle')
  const [error, setError] = useState<string | null>(null)
  const [savedPath, setSavedPath] = useState<string | null>(null)
  const [importProgress, setImportProgress] = useState<ImportProgress | null>(null)
  const [exportState, setExportState] = useState<
    { phase: 'idle' } | { phase: 'exporting'; done: number; total: number } | { phase: 'done'; path: string } | { phase: 'error'; message: string }
  >({ phase: 'idle' })
  const [exportEncoderLabel, setExportEncoderLabel] = useState<string | null>(null)

  useEffect(() => {
    return window.api.onExportProgress(({ done, total }) => {
      setExportState({ phase: 'exporting', done, total })
    })
  }, [])

  useEffect(() => {
    return window.api.onExportEncoder(({ label }) => setExportEncoderLabel(label))
  }, [])

  useEffect(() => {
    return window.api.onImportProgress((progress) => {
      setImportProgress(progress)
    })
  }, [])

  async function handleImport(): Promise<void> {
    setError(null)
    setSavedPath(null)
    const filePaths = await window.api.pickVideoFiles()
    if (filePaths.length === 0) return

    setStatus('loading')
    setImportProgress({ phase: 'extracting', fraction: 0, clipIndex: 0, totalClips: filePaths.length })
    try {
      const result = await window.api.importVideo(filePaths)
      console.log('[telemetry] parsed import result:', result)
      setImported(result)
      resetWidgets()
      setStatus('idle')
    } catch (err) {
      console.error('[telemetry] import failed:', err)
      setError(err instanceof Error ? err.message : String(err))
      setStatus('error')
    } finally {
      setImportProgress(null)
    }
  }

  async function handleAddClips(): Promise<void> {
    if (!imported) return
    setError(null)
    const filePaths = await window.api.pickVideoFiles()
    if (filePaths.length === 0) return

    setStatus('loading')
    setImportProgress({ phase: 'extracting', fraction: 0, clipIndex: imported.clips.length, totalClips: imported.clips.length + filePaths.length })
    try {
      const result = await window.api.addClips(imported, filePaths)
      updateImportedClips(result)
      setStatus('idle')
    } catch (err) {
      console.error('[telemetry] add clips failed:', err)
      setError(err instanceof Error ? err.message : String(err))
      setStatus('error')
    } finally {
      setImportProgress(null)
    }
  }

  async function handleOpenProject(): Promise<void> {
    setError(null)
    setSavedPath(null)
    setStatus('loading')
    try {
      const project = await window.api.loadProject()
      if (!project) {
        setStatus('idle')
        return
      }
      setImported(project.imported)
      loadWidgets(project.widgets)
      setStartFinish(project.startFinish)
      setTrim(project.trimStartMs, project.trimEndMs)
      setStatus('idle')
    } catch (err) {
      console.error('[project] load failed:', err)
      setError(err instanceof Error ? err.message : String(err))
      setStatus('error')
    }
  }

  async function handleSaveProject(): Promise<void> {
    if (!imported) return
    setError(null)
    try {
      const path = await window.api.saveProject({ imported, widgets, startFinish, trimStartMs, trimEndMs })
      if (path) setSavedPath(path)
    } catch (err) {
      console.error('[project] save failed:', err)
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  async function handleExport(): Promise<void> {
    if (!imported || widgets.length === 0) return
    setExportEncoderLabel(null)
    setExportState({ phase: 'exporting', done: 0, total: 1 })
    try {
      const path = await window.api.exportVideo({ imported, widgets, startFinish, trimStartMs, trimEndMs })
      setExportState(path ? { phase: 'done', path } : { phase: 'idle' })
    } catch (err) {
      console.error('[export] failed:', err)
      setExportState({ phase: 'error', message: err instanceof Error ? err.message : String(err) })
    }
  }

  const isExporting = exportState.phase === 'exporting'

  if (imported) {
    return (
      <div className="app-root">
        <header className="toolbar">
          <div className="app-shell__brand app-shell__brand--compact">
            <span className="app-shell__dot" />
            GoPro Overlay
          </div>
          <div className="toolbar__actions">
            {savedPath && <span className="toolbar__saved-hint">Saved</span>}
            <button className="import-button import-button--ghost" onClick={handleSaveProject} disabled={isExporting}>
              Save Project
            </button>
            <button
              className="import-button import-button--ghost"
              onClick={handleOpenProject}
              disabled={status === 'loading' || isExporting}
            >
              Open Project
            </button>
            <button
              className="import-button import-button--ghost"
              onClick={handleAddClips}
              disabled={status === 'loading' || isExporting}
              title="Append more clips to the end of this timeline"
            >
              + Add Clip
            </button>
            <button
              className="import-button import-button--ghost"
              onClick={handleImport}
              disabled={status === 'loading' || isExporting}
            >
              {status === 'loading' ? 'Importing…' : 'Import different clip(s)'}
            </button>
            <button
              className="import-button"
              onClick={handleExport}
              disabled={isExporting || widgets.length === 0}
              title={widgets.length === 0 ? 'Add at least one widget before exporting' : undefined}
            >
              {isExporting ? 'Exporting…' : 'Export Video'}
            </button>
          </div>
        </header>
        {status === 'error' && <p className="app-shell__error toolbar__error">{error}</p>}
        {status === 'loading' && importProgress && <ImportProgressBanner progress={importProgress} />}
        {exportState.phase === 'exporting' && (
          <div className="export-banner">
            <div className="export-banner__bar">
              <div
                className="export-banner__fill"
                style={{ width: `${Math.round((exportState.done / Math.max(1, exportState.total)) * 100)}%` }}
              />
            </div>
            <span>
              Exporting frame {exportState.done} / {exportState.total}
              {exportEncoderLabel ? ` · ${exportEncoderLabel}` : ''}
            </span>
          </div>
        )}
        {exportState.phase === 'done' && (
          <div className="export-banner export-banner--done">
            Exported to {exportState.path}
            <button className="export-banner__dismiss" onClick={() => setExportState({ phase: 'idle' })}>
              ×
            </button>
          </div>
        )}
        {exportState.phase === 'error' && (
          <div className="export-banner export-banner--error">
            Export failed: {exportState.message}
            <button className="export-banner__dismiss" onClick={() => setExportState({ phase: 'idle' })}>
              ×
            </button>
          </div>
        )}
        <Editor />
      </div>
    )
  }

  return (
    <div className="app-shell">
      <div className="app-shell__brand">
        <span className="app-shell__dot" />
        GoPro Overlay
      </div>

      <div className="app-shell__actions">
        <button className="import-button" onClick={handleImport} disabled={status === 'loading'}>
          {status === 'loading' ? 'Importing…' : 'Import GoPro Clip(s)'}
        </button>
        <button className="import-button import-button--ghost" onClick={handleOpenProject} disabled={status === 'loading'}>
          Open Project
        </button>
      </div>

      {status === 'loading' && importProgress && <ImportProgressBanner progress={importProgress} />}
      {status === 'error' && <p className="app-shell__error">{error}</p>}
      {status !== 'loading' && status !== 'error' && (
        <p className="app-shell__hint">Import one or more GoPro clips (select all parts of a split recording at once) or open a saved project to get started.</p>
      )}
    </div>
  )
}

export default App
