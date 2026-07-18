import { useEffect, useRef, useState } from 'react'
import Editor from './components/Editor'
import { useProjectStore } from './store/projectStore'
import { useWidgetStore } from './store/widgetStore'
import type { ImportProgress, ProjectPayload } from '@shared/types'

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
  const undo = useWidgetStore((s) => s.undo)
  const redo = useWidgetStore((s) => s.redo)
  const canUndo = useWidgetStore((s) => s.canUndo)
  const canRedo = useWidgetStore((s) => s.canRedo)
  const [status, setStatus] = useState<'idle' | 'loading' | 'error'>('idle')
  const [error, setError] = useState<string | null>(null)
  const [savedPath, setSavedPath] = useState<string | null>(null)
  const [importProgress, setImportProgress] = useState<ImportProgress | null>(null)
  const [exportState, setExportState] = useState<
    { phase: 'idle' } | { phase: 'exporting'; done: number; total: number } | { phase: 'done'; path: string } | { phase: 'error'; message: string }
  >({ phase: 'idle' })
  const [exportEncoderLabel, setExportEncoderLabel] = useState<string | null>(null)
  const [autosaveAvailable, setAutosaveAvailable] = useState(false)

  useEffect(() => {
    return window.api.onExportProgress(({ done, total }) => {
      setExportState({ phase: 'exporting', done, total })
    })
  }, [])

  // Checked once at launch, not continuously -- an autosave only matters for recovering from a
  // crash/force-quit on the PREVIOUS run; once this session has its own imported project (or the
  // user dismisses it), it's no longer relevant until the next relaunch.
  useEffect(() => {
    window.api.hasAutosave().then(setAutosaveAvailable)
  }, [])

  // Paired with the crash-diagnostics logging in main/index.ts: a renderer/GPU crash mid-session
  // shouldn't also silently lose whatever hasn't been manually saved to a real .gpo file. Runs on a
  // fixed wall-clock timer, not debounced off every edit -- the telemetry cache can be several MB
  // for a long session, so writing it on every widget tweak would be wasteful I/O for a
  // just-in-case safety net, not a feature the user is actively watching. Latest state is read via
  // a ref (updated every render) rather than closed over directly, so the interval itself is set up
  // ONCE and actually fires every 60s of wall-clock time -- putting these fast-changing values in
  // this effect's own deps would tear down and restart the timer on every single edit, and a user
  // who never pauses editing for a full 60s would never get an autosave at all.
  const latestAutosaveInputRef = useRef({ imported, widgets, startFinish, trimStartMs, trimEndMs })
  latestAutosaveInputRef.current = { imported, widgets, startFinish, trimStartMs, trimEndMs }
  useEffect(() => {
    const AUTOSAVE_INTERVAL_MS = 60_000
    const interval = setInterval(() => {
      const current = latestAutosaveInputRef.current
      if (!current.imported) return
      const payload: ProjectPayload = { ...current, imported: current.imported }
      window.api.saveAutosave(payload).catch((err) => {
        console.error('[autosave] failed:', err)
      })
    }, AUTOSAVE_INTERVAL_MS)
    return () => clearInterval(interval)
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

  async function handleRecoverAutosave(): Promise<void> {
    setError(null)
    setStatus('loading')
    try {
      const project = await window.api.loadAutosave()
      if (!project) {
        setAutosaveAvailable(false)
        setStatus('idle')
        return
      }
      setImported(project.imported)
      loadWidgets(project.widgets)
      setStartFinish(project.startFinish)
      setTrim(project.trimStartMs, project.trimEndMs)
      setAutosaveAvailable(false)
      setStatus('idle')
    } catch (err) {
      console.error('[autosave] recovery failed:', err)
      setError(err instanceof Error ? err.message : String(err))
      setStatus('error')
    }
  }

  function handleDismissAutosave(): void {
    setAutosaveAvailable(false)
    window.api.clearAutosave().catch((err) => console.error('[autosave] failed to clear:', err))
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
            <button
              className="import-button import-button--ghost"
              onClick={undo}
              disabled={!canUndo || isExporting}
              title="Undo (Ctrl+Z)"
            >
              Undo
            </button>
            <button
              className="import-button import-button--ghost"
              onClick={redo}
              disabled={!canRedo || isExporting}
              title="Redo (Ctrl+Shift+Z)"
            >
              Redo
            </button>
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

      {autosaveAvailable && status !== 'loading' && (
        <div className="export-banner export-banner--done">
          An autosaved session was found (likely from a crash or force-quit) — recover it?
          <button className="import-button import-button--ghost" onClick={handleRecoverAutosave}>
            Recover
          </button>
          <button className="export-banner__dismiss" onClick={handleDismissAutosave} title="Discard the autosave">
            ×
          </button>
        </div>
      )}

      {status === 'loading' && importProgress && <ImportProgressBanner progress={importProgress} />}
      {status === 'error' && <p className="app-shell__error">{error}</p>}
      {status !== 'loading' && status !== 'error' && (
        <p className="app-shell__hint">Import one or more GoPro clips (select all parts of a split recording at once) or open a saved project to get started.</p>
      )}
    </div>
  )
}

export default App
