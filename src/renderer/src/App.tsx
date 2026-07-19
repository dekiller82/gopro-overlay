import { useEffect, useMemo, useRef, useState } from 'react'
import Editor from './components/Editor'
import WhatsNewModal from './components/WhatsNewModal'
import { useProjectStore } from './store/projectStore'
import { useWidgetStore } from './store/widgetStore'
import { detectLapCrossings, fastestLapRange } from '@shared/telemetry/laps'
import { formatTime } from '@shared/format'
import type { ImportProgress, ProjectPayload, RecentProject, UpdateCheckResult } from '@shared/types'

const LAST_SEEN_VERSION_KEY = 'gpo-last-seen-version'
const DISMISSED_UPDATE_VERSION_KEY = 'gpo-dismissed-update-version'

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

function UpdateBanner({ info, onDismiss }: { info: UpdateCheckResult; onDismiss: () => void }): React.JSX.Element {
  return (
    <div className="export-banner export-banner--update">
      A new version ({info.latestVersion}) is available — you're on {info.currentVersion}.
      <a className="import-button import-button--ghost" href={info.releaseUrl} target="_blank" rel="noreferrer">
        View release
      </a>
      <button className="export-banner__dismiss" onClick={onDismiss} title="Dismiss until the next release">
        ×
      </button>
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
  const [recentProjects, setRecentProjects] = useState<RecentProject[]>([])
  const [changelog, setChangelog] = useState('')
  const [showWhatsNew, setShowWhatsNew] = useState(false)
  const [updateInfo, setUpdateInfo] = useState<UpdateCheckResult | null>(null)

  const refreshRecentProjects = (): void => {
    window.api.listRecentProjects().then(setRecentProjects)
  }

  useEffect(() => {
    refreshRecentProjects()
  }, [])

  // Auto-shows once per new version (tracked in localStorage, not anything server-side -- this is
  // a purely local, offline app) -- the changelog itself is only fetched once here and reused by
  // the manually-triggered "What's New" button too, rather than every open re-reading the file.
  useEffect(() => {
    Promise.all([window.api.getAppVersion(), window.api.getChangelog()]).then(([version, text]) => {
      setChangelog(text)
      const lastSeen = localStorage.getItem(LAST_SEEN_VERSION_KEY)
      if (lastSeen !== version) {
        setShowWhatsNew(true)
        localStorage.setItem(LAST_SEEN_VERSION_KEY, version)
      }
    })
  }, [])

  // The one deliberate network call in an otherwise fully offline/local app -- checked once per
  // launch against GitHub's latest-release API, never blocking anything and never surfacing an
  // error if it fails (no internet, GitHub unreachable, rate-limited); see checkForUpdate's own
  // "never throw" contract. Suppressed per-version (not just per-session) once dismissed, the same
  // way the What's New modal tracks LAST_SEEN_VERSION_KEY, so closing it doesn't nag again on every
  // relaunch until an actually newer release ships.
  useEffect(() => {
    window.api.checkForUpdate().then((result) => {
      if (!result || !result.updateAvailable) return
      if (localStorage.getItem(DISMISSED_UPDATE_VERSION_KEY) === result.latestVersion) return
      setUpdateInfo(result)
    })
  }, [])

  function dismissUpdateNotice(): void {
    if (updateInfo) localStorage.setItem(DISMISSED_UPDATE_VERSION_KEY, updateInfo.latestVersion)
    setUpdateInfo(null)
  }

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
      refreshRecentProjects()
    } catch (err) {
      console.error('[project] load failed:', err)
      setError(err instanceof Error ? err.message : String(err))
      setStatus('error')
    }
  }

  async function handleOpenRecentProject(projectPath: string): Promise<void> {
    setError(null)
    setSavedPath(null)
    setStatus('loading')
    try {
      const project = await window.api.loadProjectFromPath(projectPath)
      setImported(project.imported)
      loadWidgets(project.widgets)
      setStartFinish(project.startFinish)
      setTrim(project.trimStartMs, project.trimEndMs)
      setStatus('idle')
    } catch (err) {
      console.error('[project] recent-project load failed:', err)
      setError(err instanceof Error ? err.message : String(err))
      setStatus('error')
      refreshRecentProjects() // the stale entry was dropped on the main side -- reflect that here too
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
      if (path) {
        setSavedPath(path)
        refreshRecentProjects()
      }
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

  // The session's single fastest completed lap -- only needs the crossings array (not a full
  // TelemetrySampler), recomputed only when the telemetry/start-finish point actually change.
  const fastestLap = useMemo(() => {
    if (!imported || !startFinish) return null
    return fastestLapRange(detectLapCrossings(imported.telemetry.samples, startFinish))
  }, [imported, startFinish])

  const [showBestLapExportForm, setShowBestLapExportForm] = useState(false)
  const [bestLapPaddingBeforeSec, setBestLapPaddingBeforeSec] = useState(5)
  const [bestLapPaddingAfterSec, setBestLapPaddingAfterSec] = useState(5)

  // Exports just the fastest lap (plus configurable padding) as its own clip -- builds a ProjectPayload
  // with an OVERRIDDEN trim range for this one export only, never touching the user's actual saved
  // trim, same "one-shot payload, no mutation" approach as any other export.
  async function handleExportBestLap(): Promise<void> {
    if (!imported || widgets.length === 0 || !fastestLap) return
    const totalDurationMs = imported.telemetry.videoDurationMs
    const clipTrimStartMs = Math.max(0, fastestLap.startCts - bestLapPaddingBeforeSec * 1000)
    const clipTrimEndMs = Math.min(totalDurationMs, fastestLap.endCts + bestLapPaddingAfterSec * 1000)
    setShowBestLapExportForm(false)
    setExportEncoderLabel(null)
    setExportState({ phase: 'exporting', done: 0, total: 1 })
    try {
      const path = await window.api.exportVideo({
        imported,
        widgets,
        startFinish,
        trimStartMs: clipTrimStartMs,
        trimEndMs: clipTrimEndMs
      })
      setExportState(path ? { phase: 'done', path } : { phase: 'idle' })
    } catch (err) {
      console.error('[export best lap] failed:', err)
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
              className="import-button import-button--ghost"
              onClick={() => setShowBestLapExportForm((v) => !v)}
              disabled={isExporting || widgets.length === 0 || !fastestLap}
              title={
                !fastestLap
                  ? 'No completed lap yet -- set a start/finish line and complete at least one lap'
                  : `Export just your fastest lap (Lap ${fastestLap.lapNumber})`
              }
            >
              🏁 Export Best Lap…
            </button>
            <button
              className="import-button"
              onClick={handleExport}
              disabled={isExporting || widgets.length === 0}
              title={widgets.length === 0 ? 'Add at least one widget before exporting' : undefined}
            >
              {isExporting ? 'Exporting…' : 'Export Video'}
            </button>
            <button className="import-button import-button--ghost" onClick={() => setShowWhatsNew(true)} title="What's changed recently">
              What's New
            </button>
          </div>
        </header>
        {showBestLapExportForm && fastestLap && (
          <div className="best-lap-export-form">
            <span>
              Export Lap {fastestLap.lapNumber} ({formatTime(fastestLap.timeMs, true)}) with
            </span>
            <label className="best-lap-export-form__field">
              <input
                type="number"
                min={0}
                max={60}
                step={1}
                value={bestLapPaddingBeforeSec}
                onChange={(e) => setBestLapPaddingBeforeSec(Math.max(0, Number(e.target.value)))}
              />
              <span>s before</span>
            </label>
            <label className="best-lap-export-form__field">
              <input
                type="number"
                min={0}
                max={60}
                step={1}
                value={bestLapPaddingAfterSec}
                onChange={(e) => setBestLapPaddingAfterSec(Math.max(0, Number(e.target.value)))}
              />
              <span>s after</span>
            </label>
            <button className="import-button" onClick={handleExportBestLap}>
              Export
            </button>
            <button className="import-button import-button--ghost" onClick={() => setShowBestLapExportForm(false)}>
              Cancel
            </button>
          </div>
        )}
        {updateInfo && <UpdateBanner info={updateInfo} onDismiss={dismissUpdateNotice} />}
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
        <WhatsNewModal isOpen={showWhatsNew} changelog={changelog} onClose={() => setShowWhatsNew(false)} />
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
        <button className="import-button import-button--ghost" onClick={() => setShowWhatsNew(true)}>
          What's New
        </button>
      </div>

      {updateInfo && <UpdateBanner info={updateInfo} onDismiss={dismissUpdateNotice} />}

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

      {recentProjects.length > 0 && (
        <div className="recent-projects">
          <div className="recent-projects__header">Recent Projects</div>
          <ul className="recent-projects__list">
            {recentProjects.map((p) => (
              <li key={p.path} className="recent-projects__item">
                <button
                  className="recent-projects__open"
                  onClick={() => handleOpenRecentProject(p.path)}
                  disabled={status === 'loading'}
                  title={p.path}
                >
                  {p.name}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
      <WhatsNewModal isOpen={showWhatsNew} changelog={changelog} onClose={() => setShowWhatsNew(false)} />
    </div>
  )
}

export default App
