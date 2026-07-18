import { useEffect, useMemo, useState } from 'react'
import type { SpeedUnit } from '@shared/units'
import type { WidgetInstance, WidgetLayoutPreset } from '@shared/types'
import { GPS_STYLE_PRESETS, SPEEDOMETER_STYLE_PRESETS, TIMER_STYLE_PRESETS, type StylePreset } from '@shared/widgets/presets'
import { DEFAULT_GPS_STYLE, type GpsWidgetStyle } from '@shared/render/drawGpsWidget'
import { DEFAULT_SPEEDOMETER_STYLE } from '@shared/render/drawSpeedometer'
import { DEFAULT_TIMER_STYLE, type TimerStyle } from '@shared/render/drawTimer'
import { DEFAULT_SECTOR_TIMER_STYLE } from '@shared/render/drawSectorTimer'
import { DEFAULT_DELTA_TIME_STYLE } from '@shared/render/drawDeltaTime'
import { DEFAULT_PREDICTIVE_LAP_TIMER_STYLE } from '@shared/render/drawPredictiveLapTimer'
import { DEFAULT_APEX_SPEED_CALLOUT_STYLE } from '@shared/render/drawApexSpeedCallout'
import { DEFAULT_SPEED_DISTANCE_GRAPH_STYLE, type SpeedDistanceGraphStyle } from '@shared/render/drawSpeedDistanceGraph'
import { DEFAULT_GFORCE_DIAGRAM_STYLE } from '@shared/render/drawGForceDiagram'
import { DEFAULT_ROLL_ANGLE_STYLE } from '@shared/render/drawRollAngle'
import { DEFAULT_SESSION_SUMMARY_STYLE } from '@shared/render/drawSessionSummary'
import { detectLapCrossings, nearestLatLon } from '@shared/telemetry/laps'
import { alignedX, alignedY, type HorizontalAlign, type VerticalAlign } from '@shared/widgets/alignment'
import { useWidgetStore } from '../store/widgetStore'
import { useProjectStore } from '../store/projectStore'
import { useAlignmentStore } from '../store/alignmentStore'

const MAX_TIMING_TOWER_ROWS = 20

/** Reads a user-picked image file entirely in the renderer (FileReader), no main-process IPC
 *  needed -- the resulting data URL is stored directly in the widget's style JSON so the project
 *  file stays fully self-contained (no external file path to keep valid across machines/moves). */
function readImageFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(file)
  })
}

function widgetLabel(type: WidgetInstance['type']): string {
  switch (type) {
    case 'gpsTrack':
      return 'GPS Track'
    case 'speedometerAnalog':
      return 'Speedometer (analog)'
    case 'speedometerDigital':
      return 'Speedometer (digital)'
    case 'timer':
      return 'Timer'
    case 'sectorTimer':
      return 'Sector Timer'
    case 'deltaTime':
      return 'Delta Time'
    case 'predictiveLapTimer':
      return 'Predictive Lap Timer'
    case 'apexSpeedCallout':
      return 'Apex Speed Callout'
    case 'speedDistanceGraph':
      return 'Speed/Distance Graph'
    case 'gForceDiagram':
      return 'G-Force Diagram'
    case 'rollAngle':
      return 'Roll/Lean Angle'
    case 'sessionSummary':
      return 'Session Summary'
  }
}

const AXIS_LABELS = ['Axis 1', 'Axis 2', 'Axis 3'] as const

function AxisOverrideFields({
  vertical,
  lateralOrLongitudinal,
  lateralOrLongitudinalLabel,
  verticalInverted,
  lateralOrLongitudinalInverted,
  onChangeVertical,
  onChangeLateralOrLongitudinal,
  onChangeVerticalInverted,
  onChangeLateralOrLongitudinalInverted
}: {
  vertical: 0 | 1 | 2
  lateralOrLongitudinal: 0 | 1 | 2
  lateralOrLongitudinalLabel: string
  verticalInverted: boolean
  lateralOrLongitudinalInverted: boolean
  onChangeVertical: (axis: 0 | 1 | 2) => void
  onChangeLateralOrLongitudinal: (axis: 0 | 1 | 2) => void
  onChangeVerticalInverted: (inverted: boolean) => void
  onChangeLateralOrLongitudinalInverted: (inverted: boolean) => void
}): React.JSX.Element {
  return (
    <>
      <label className="field">
        <span>Vertical axis</span>
        <select value={vertical} onChange={(e) => onChangeVertical(Number(e.target.value) as 0 | 1 | 2)}>
          {AXIS_LABELS.map((label, i) => (
            <option key={i} value={i}>
              {label}
            </option>
          ))}
        </select>
      </label>
      <label className="field field--checkbox">
        <input type="checkbox" checked={verticalInverted} onChange={(e) => onChangeVerticalInverted(e.target.checked)} />
        <span>Invert vertical</span>
      </label>
      <label className="field">
        <span>{lateralOrLongitudinalLabel} axis</span>
        <select value={lateralOrLongitudinal} onChange={(e) => onChangeLateralOrLongitudinal(Number(e.target.value) as 0 | 1 | 2)}>
          {AXIS_LABELS.map((label, i) => (
            <option key={i} value={i}>
              {label}
            </option>
          ))}
        </select>
      </label>
      <label className="field field--checkbox">
        <input
          type="checkbox"
          checked={lateralOrLongitudinalInverted}
          onChange={(e) => onChangeLateralOrLongitudinalInverted(e.target.checked)}
        />
        <span>Invert {lateralOrLongitudinalLabel.toLowerCase()}</span>
      </label>
    </>
  )
}

function PresetRow<T>({ presets, onPick }: { presets: StylePreset<T>[]; onPick: (style: Partial<T>) => void }): React.JSX.Element {
  return (
    <div className="preset-row">
      {presets.map((preset) => (
        <button
          key={preset.name}
          className="preset-swatch"
          style={{ background: preset.swatch }}
          title={preset.name}
          onClick={() => onPick(preset.style)}
        />
      ))}
    </div>
  )
}

function PropertyPanel(): React.JSX.Element {
  const widgets = useWidgetStore((s) => s.widgets)
  const selectedId = useWidgetStore((s) => s.selectedId)
  const selectedIds = useWidgetStore((s) => s.selectedIds)
  const selectWidget = useWidgetStore((s) => s.selectWidget)
  const updateWidget = useWidgetStore((s) => s.updateWidget)
  const removeWidget = useWidgetStore((s) => s.removeWidget)
  const removeWidgets = useWidgetStore((s) => s.removeWidgets)
  const addWidget = useWidgetStore((s) => s.addWidget)
  const applyWidgets = useWidgetStore((s) => s.applyWidgets)
  const imported = useProjectStore((s) => s.imported)
  const currentTimeMs = useProjectStore((s) => s.currentTimeMs)
  const startFinish = useProjectStore((s) => s.startFinish)
  const setStartFinish = useProjectStore((s) => s.setStartFinish)
  const paddingFraction = useAlignmentStore((s) => s.paddingFraction)
  const setPaddingFraction = useAlignmentStore((s) => s.setPaddingFraction)
  const snapEnabled = useAlignmentStore((s) => s.snapEnabled)
  const setSnapEnabled = useAlignmentStore((s) => s.setSnapEnabled)

  const selected = widgets.find((w) => w.id === selectedId) ?? null

  // Live feedback for the GPS Track "ghost" marker -- it depends on two silent preconditions (a
  // start/finish line, and at least one lap actually completed by the current scrub position)
  // that have no visual effect of their own when unmet, which reads as "the feature doesn't work"
  // rather than "not available yet." Recomputes lap crossings the same way WidgetLayer.tsx does for
  // the real ghost/deltaTime logic, just for this one status line.
  const ghostStatus = useMemo((): 'no-start-finish' | 'no-completed-lap' | 'active' | null => {
    if (!selected || selected.type !== 'gpsTrack' || !selected.style.showGhost) return null
    if (!startFinish) return 'no-start-finish'
    if (!imported) return 'no-completed-lap'
    const crossings = detectLapCrossings(imported.telemetry.samples, startFinish)
    const hasCompletedLap = crossings.some((c, i) => i > 0 && c <= currentTimeMs)
    return hasCompletedLap ? 'active' : 'no-completed-lap'
  }, [selected, startFinish, imported, currentTimeMs])

  const [layoutPresets, setLayoutPresets] = useState<WidgetLayoutPreset[]>([])
  useEffect(() => {
    window.api.listLayoutPresets().then(setLayoutPresets)
  }, [])

  // Electron's renderer does not support window.prompt() (it throws "prompt() is not supported."),
  // so naming a new layout uses an inline text field instead of a native prompt dialog.
  const [isSavingLayout, setIsSavingLayout] = useState(false)
  const [newLayoutName, setNewLayoutName] = useState('')

  function startSaveLayout(): void {
    setNewLayoutName('')
    setIsSavingLayout(true)
  }

  function confirmSaveLayout(): void {
    const name = newLayoutName.trim()
    if (!name) return
    window.api.saveLayoutPreset(name, widgets).then(setLayoutPresets)
    setIsSavingLayout(false)
  }

  function cancelSaveLayout(): void {
    setIsSavingLayout(false)
  }

  function applyLayout(preset: WidgetLayoutPreset): void {
    applyWidgets(preset.widgets)
  }

  function deleteLayout(id: string): void {
    window.api.deleteLayoutPreset(id).then(setLayoutPresets)
  }

  // Align/center apply to the WHOLE current selection when more than one widget is selected, each
  // widget aligned independently against the frame (not against each other) -- selectedIds always
  // includes selected.id when non-empty, so this covers both the single- and multi-select case.
  const targetWidgets = selectedIds.length > 0 ? widgets.filter((w) => selectedIds.includes(w.id)) : selected ? [selected] : []

  function alignHorizontal(align: HorizontalAlign): void {
    for (const w of targetWidgets) updateWidget(w.id, { x: alignedX(w.w, align, paddingFraction) })
  }

  function alignVertical(align: VerticalAlign): void {
    for (const w of targetWidgets) updateWidget(w.id, { y: alignedY(w.h, align, paddingFraction) })
  }

  function centerBoth(): void {
    for (const w of targetWidgets) {
      updateWidget(w.id, {
        x: alignedX(w.w, 'centerH', paddingFraction),
        y: alignedY(w.h, 'centerV', paddingFraction)
      })
    }
  }

  function setGlobalStartFinishHere(): void {
    const latLon = imported ? nearestLatLon(imported.telemetry.samples, currentTimeMs) : null
    if (latLon) setStartFinish(latLon)
  }

  return (
    <aside className="property-panel">
      <div className="property-panel__section">
        <div className="property-panel__header">
          <span>Start/finish line</span>
        </div>
        <div className="property-panel__add-row">
          <button
            className="property-panel__add"
            onClick={setGlobalStartFinishHere}
            disabled={!imported}
            title="Scrub the video to the exact frame where you cross the line, then click this"
          >
            Set at current position
          </button>
          {startFinish && (
            <button className="property-panel__delete" onClick={() => setStartFinish(null)}>
              Clear
            </button>
          )}
        </div>
        <span className="field__hint">
          {startFinish
            ? `Set at ${startFinish.lat.toFixed(5)}, ${startFinish.lon.toFixed(5)}`
            : 'Not set — used by any Timer (lap mode) or Sector Timer widget. Scrub to the lap line, then click "Set at current position".'}
        </span>
      </div>

      <div className="property-panel__section">
        <div className="property-panel__header">
          <span>Widgets</span>
        </div>
        <div className="property-panel__add-row">
          <button className="property-panel__add" onClick={() => addWidget('gpsTrack')}>
            + GPS Track
          </button>
          <button className="property-panel__add" onClick={() => addWidget('speedometerAnalog')}>
            + Speedo (analog)
          </button>
          <button className="property-panel__add" onClick={() => addWidget('speedometerDigital')}>
            + Speedo (digital)
          </button>
          <button className="property-panel__add" onClick={() => addWidget('timer')}>
            + Timer
          </button>
          <button className="property-panel__add" onClick={() => addWidget('sectorTimer')}>
            + Sector Timer
          </button>
          <button className="property-panel__add" onClick={() => addWidget('deltaTime')}>
            + Delta Time
          </button>
          <button className="property-panel__add" onClick={() => addWidget('predictiveLapTimer')}>
            + Predictive Lap Timer
          </button>
          <button className="property-panel__add" onClick={() => addWidget('apexSpeedCallout')}>
            + Apex Speed Callout
          </button>
          <button className="property-panel__add" onClick={() => addWidget('speedDistanceGraph')}>
            + Speed/Distance Graph
          </button>
          <button className="property-panel__add" onClick={() => addWidget('gForceDiagram')}>
            + G-Force Diagram
          </button>
          <button className="property-panel__add" onClick={() => addWidget('rollAngle')}>
            + Roll/Lean Angle
          </button>
          <button className="property-panel__add" onClick={() => addWidget('sessionSummary')}>
            + Session Summary
          </button>
        </div>
        <ul className="widget-list">
          {widgets.length === 0 && <li className="widget-list__empty">No widgets yet</li>}
          {widgets.map((w) => (
            <li
              key={w.id}
              className={`widget-list__item${selectedIds.includes(w.id) ? ' widget-list__item--active' : ''}`}
              title="Click to select, shift-click to add/remove from selection"
              onClick={(e) => selectWidget(w.id, e.shiftKey)}
            >
              {widgetLabel(w.type)}
            </li>
          ))}
        </ul>
      </div>

      <div className="property-panel__section">
        <div className="property-panel__header">
          <span>Layouts</span>
        </div>
        <div className="property-panel__add-row">
          {isSavingLayout ? (
            <>
              <input
                type="text"
                className="layout-save-input"
                autoFocus
                placeholder="Layout name"
                value={newLayoutName}
                onChange={(e) => setNewLayoutName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') confirmSaveLayout()
                  else if (e.key === 'Escape') cancelSaveLayout()
                }}
              />
              <button className="property-panel__add" onClick={confirmSaveLayout} disabled={!newLayoutName.trim()}>
                Save
              </button>
              <button className="property-panel__delete" onClick={cancelSaveLayout}>
                Cancel
              </button>
            </>
          ) : (
            <button className="property-panel__add" onClick={startSaveLayout} disabled={widgets.length === 0}>
              Save current layout…
            </button>
          )}
        </div>
        <ul className="widget-list">
          {layoutPresets.length === 0 && <li className="widget-list__empty">No saved layouts yet</li>}
          {layoutPresets.map((preset) => (
            <li key={preset.id} className="widget-list__item layout-preset-row">
              <span className="layout-preset-row__name" title={preset.name}>
                {preset.name}
              </span>
              <div className="layout-preset-row__actions">
                <button className="property-panel__add" onClick={() => applyLayout(preset)} title="Load this saved layout">
                  Load
                </button>
                <button
                  className="property-panel__delete"
                  onClick={() => deleteLayout(preset.id)}
                  title="Delete this saved layout"
                >
                  ×
                </button>
              </div>
            </li>
          ))}
        </ul>
      </div>

      {selected && (
        <div className="property-panel__section">
          <div className="property-panel__header">
            <span>Alignment{selectedIds.length > 1 ? ` (${selectedIds.length} selected)` : ''}</span>
            {selectedIds.length > 1 && (
              <button
                className="property-panel__delete"
                title="Delete all selected widgets"
                onClick={() => removeWidgets(selectedIds)}
              >
                Delete all
              </button>
            )}
          </div>
          {selectedIds.length > 1 && (
            <span className="field__hint">
              Shift-click widgets (in the list above or on the video) to add/remove them. Dragging, aligning, deleting, or
              nudging with the arrow keys applies to the whole selection.
            </span>
          )}

          <div className="property-panel__add-row">
            <button className="property-panel__add" title="Align left" onClick={() => alignHorizontal('left')}>
              Left
            </button>
            <button className="property-panel__add" title="Center horizontally" onClick={() => alignHorizontal('centerH')}>
              Center
            </button>
            <button className="property-panel__add" title="Align right" onClick={() => alignHorizontal('right')}>
              Right
            </button>
          </div>
          <div className="property-panel__add-row">
            <button className="property-panel__add" title="Align top" onClick={() => alignVertical('top')}>
              Top
            </button>
            <button className="property-panel__add" title="Center vertically" onClick={() => alignVertical('centerV')}>
              Middle
            </button>
            <button className="property-panel__add" title="Align bottom" onClick={() => alignVertical('bottom')}>
              Bottom
            </button>
          </div>
          <div className="property-panel__add-row">
            <button className="property-panel__add" title="Center both horizontally and vertically" onClick={centerBoth}>
              Center both
            </button>
          </div>

          <label className="field">
            <span>Padding ({(paddingFraction * 100).toFixed(1)}%)</span>
            <input
              type="range"
              min={0}
              max={0.1}
              step={0.005}
              value={paddingFraction}
              onChange={(e) => setPaddingFraction(Number(e.target.value))}
            />
          </label>
          <span className="field__hint">Used by the buttons above and by live snapping while dragging, so both match exactly.</span>

          <label className="field field--checkbox">
            <input type="checkbox" checked={snapEnabled} onChange={(e) => setSnapEnabled(e.target.checked)} />
            <span>Snap to center/edges while dragging</span>
          </label>
        </div>
      )}

      {selected && selected.type === 'gpsTrack' && (() => {
        // Defensive merge: guards against incomplete style data (e.g. an older/foreign project
        // file) crashing this panel instead of just rendering with sane fallbacks.
        const style = { ...DEFAULT_GPS_STYLE, ...selected.style }
        return (
        <div className="property-panel__section">
          <div className="property-panel__header">
            <span>GPS Track style</span>
            <button className="property-panel__delete" onClick={() => removeWidget(selected.id)}>
              Delete
            </button>
          </div>

          <PresetRow
            presets={GPS_STYLE_PRESETS}
            onPick={(patch) => updateWidget(selected.id, { style: { ...style, ...patch } })}
          />

          <label className="field">
            <span>Line color</span>
            <input
              type="color"
              value={style.lineColor}
              onChange={(e) => updateWidget(selected.id, { style: { ...style, lineColor: e.target.value } })}
            />
          </label>

          <label className="field">
            <span>Line width ({style.lineWidth}px)</span>
            <input
              type="range"
              min={1}
              max={10}
              step={1}
              value={style.lineWidth}
              onChange={(e) => updateWidget(selected.id, { style: { ...style, lineWidth: Number(e.target.value) } })}
            />
          </label>

          <label className="field">
            <span>Line opacity ({style.lineOpacity.toFixed(2)})</span>
            <input
              type="range"
              min={0.1}
              max={1}
              step={0.05}
              value={style.lineOpacity}
              onChange={(e) => updateWidget(selected.id, { style: { ...style, lineOpacity: Number(e.target.value) } })}
            />
          </label>

          <label className="field">
            <span>Dot color</span>
            <input
              type="color"
              value={style.dotColor}
              onChange={(e) => updateWidget(selected.id, { style: { ...style, dotColor: e.target.value } })}
            />
          </label>

          <label className="field">
            <span>Dot radius ({style.dotRadius}px)</span>
            <input
              type="range"
              min={2}
              max={20}
              step={1}
              value={style.dotRadius}
              onChange={(e) => updateWidget(selected.id, { style: { ...style, dotRadius: Number(e.target.value) } })}
            />
          </label>

          <label className="field field--checkbox">
            <input
              type="checkbox"
              checked={style.dotGlow}
              onChange={(e) => updateWidget(selected.id, { style: { ...style, dotGlow: e.target.checked } })}
            />
            <span>Dot glow</span>
          </label>

          <label className="field">
            <span>Track coloring</span>
            <select
              value={style.colorMode}
              onChange={(e) => updateWidget(selected.id, { style: { ...style, colorMode: e.target.value as GpsWidgetStyle['colorMode'] } })}
            >
              <option value="solid">Solid color</option>
              <option value="speed">By speed</option>
              <option value="braking">By braking/accelerating</option>
            </select>
          </label>

          {style.colorMode === 'speed' && (
            <>
              <label className="field">
                <span>Slow color</span>
                <input
                  type="color"
                  value={style.slowColor}
                  onChange={(e) => updateWidget(selected.id, { style: { ...style, slowColor: e.target.value } })}
                />
              </label>
              <label className="field">
                <span>Fast color</span>
                <input
                  type="color"
                  value={style.fastColor}
                  onChange={(e) => updateWidget(selected.id, { style: { ...style, fastColor: e.target.value } })}
                />
              </label>
              <span className="field__hint">Scaled to this session's own min/max speed.</span>
            </>
          )}

          {style.colorMode === 'braking' && (
            <>
              <label className="field">
                <span>Braking color</span>
                <input
                  type="color"
                  value={style.brakingColor}
                  onChange={(e) => updateWidget(selected.id, { style: { ...style, brakingColor: e.target.value } })}
                />
              </label>
              <label className="field">
                <span>Accelerating color</span>
                <input
                  type="color"
                  value={style.acceleratingColor}
                  onChange={(e) => updateWidget(selected.id, { style: { ...style, acceleratingColor: e.target.value } })}
                />
              </label>
              <label className="field">
                <span>Neutral color</span>
                <input
                  type="color"
                  value={style.neutralColor}
                  onChange={(e) => updateWidget(selected.id, { style: { ...style, neutralColor: e.target.value } })}
                />
              </label>
              <label className="field">
                <span>Sensitivity ({style.brakingThresholdMps2.toFixed(1)} m/s²)</span>
                <input
                  type="range"
                  min={0.2}
                  max={5}
                  step={0.1}
                  value={style.brakingThresholdMps2}
                  onChange={(e) => updateWidget(selected.id, { style: { ...style, brakingThresholdMps2: Number(e.target.value) } })}
                />
              </label>
            </>
          )}

          <label className="field field--checkbox">
            <input
              type="checkbox"
              checked={style.showGhost}
              onChange={(e) => updateWidget(selected.id, { style: { ...style, showGhost: e.target.checked } })}
            />
            <span>Show ghost (best lap's position)</span>
          </label>
          {style.showGhost && (
            <>
              <label className="field">
                <span>Ghost color</span>
                <input
                  type="color"
                  value={style.ghostColor}
                  onChange={(e) => updateWidget(selected.id, { style: { ...style, ghostColor: e.target.value } })}
                />
              </label>
              <span className="field__hint">
                A second marker at your fastest completed lap's own position at this same elapsed time into its
                lap -- shows ahead/behind spatially on the track, not just as a number.
              </span>
              {ghostStatus === 'no-start-finish' && (
                <span className="field__hint field__hint--warning">
                  ⚠ Not shown yet -- set a start/finish line first (see the Start/finish line section at the top).
                </span>
              )}
              {ghostStatus === 'no-completed-lap' && (
                <span className="field__hint field__hint--warning">
                  ⚠ Not shown yet at the current scrub position -- it appears once your fastest completed lap
                  exists to compare against, i.e. partway through lap 2 or later.
                </span>
              )}
              {ghostStatus === 'active' && (
                <span className="field__hint field__hint--ok">✓ Showing, comparing against your fastest completed lap so far.</span>
              )}
            </>
          )}

          <label className="field">
            <span>Rotation ({selected.rotation}°)</span>
            <input
              type="range"
              min={-180}
              max={180}
              step={1}
              value={selected.rotation}
              onChange={(e) => updateWidget(selected.id, { rotation: Number(e.target.value) })}
            />
          </label>
        </div>
        )
      })()}

      {selected && (selected.type === 'speedometerAnalog' || selected.type === 'speedometerDigital') && (() => {
        const style = { ...DEFAULT_SPEEDOMETER_STYLE, ...selected.style }
        return (
        <div className="property-panel__section">
          <div className="property-panel__header">
            <span>{widgetLabel(selected.type)} style</span>
            <button className="property-panel__delete" onClick={() => removeWidget(selected.id)}>
              Delete
            </button>
          </div>

          <PresetRow
            presets={SPEEDOMETER_STYLE_PRESETS}
            onPick={(patch) => updateWidget(selected.id, { style: { ...style, ...patch } })}
          />

          <label className="field">
            <span>Unit</span>
            <select
              value={style.unit}
              onChange={(e) => updateWidget(selected.id, { style: { ...style, unit: e.target.value as SpeedUnit } })}
            >
              <option value="kmh">km/h</option>
              <option value="mph">mph</option>
              <option value="kn">knots</option>
            </select>
          </label>

          <label className="field">
            <span>Smoothing ({style.smoothingMs}ms)</span>
            <input
              type="range"
              min={60}
              max={1500}
              step={20}
              value={style.smoothingMs}
              onChange={(e) => updateWidget(selected.id, { style: { ...style, smoothingMs: Number(e.target.value) } })}
            />
          </label>

          {selected.type === 'speedometerAnalog' && (
            <>
              <label className="field">
                <span>Gauge min</span>
                <input
                  type="number"
                  value={style.min}
                  onChange={(e) => updateWidget(selected.id, { style: { ...style, min: Number(e.target.value) } })}
                />
              </label>
              <label className="field">
                <span>Gauge max</span>
                <input
                  type="number"
                  value={style.max}
                  onChange={(e) => updateWidget(selected.id, { style: { ...style, max: Number(e.target.value) } })}
                />
              </label>
            </>
          )}

          <label className="field">
            <span>Text color</span>
            <input
              type="color"
              value={style.color}
              onChange={(e) => updateWidget(selected.id, { style: { ...style, color: e.target.value } })}
            />
          </label>

          <label className="field">
            <span>Accent color</span>
            <input
              type="color"
              value={style.accentColor}
              onChange={(e) => updateWidget(selected.id, { style: { ...style, accentColor: e.target.value } })}
            />
          </label>

          <label className="field field--checkbox">
            <input
              type="checkbox"
              checked={style.showUnit}
              onChange={(e) => updateWidget(selected.id, { style: { ...style, showUnit: e.target.checked } })}
            />
            <span>Show unit label</span>
          </label>

          <label className="field">
            <span>Text outline ({style.textOutlineWidth}px)</span>
            <input
              type="range"
              min={0}
              max={6}
              step={1}
              value={style.textOutlineWidth}
              onChange={(e) => updateWidget(selected.id, { style: { ...style, textOutlineWidth: Number(e.target.value) } })}
            />
          </label>

          {selected.type === 'speedometerDigital' && (
            <>
              <label className="field">
                <span>Background color</span>
                <input
                  type="color"
                  value={style.backgroundColor}
                  onChange={(e) => updateWidget(selected.id, { style: { ...style, backgroundColor: e.target.value } })}
                />
              </label>
              <label className="field">
                <span>Background opacity ({style.backgroundOpacity.toFixed(2)})</span>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.05}
                  value={style.backgroundOpacity}
                  onChange={(e) => updateWidget(selected.id, { style: { ...style, backgroundOpacity: Number(e.target.value) } })}
                />
              </label>
              <label className="field">
                <span>Corner radius ({style.cornerRadius}px)</span>
                <input
                  type="range"
                  min={0}
                  max={40}
                  step={1}
                  value={style.cornerRadius}
                  onChange={(e) => updateWidget(selected.id, { style: { ...style, cornerRadius: Number(e.target.value) } })}
                />
              </label>
            </>
          )}

          {style.textOutlineWidth > 0 && (
            <label className="field">
              <span>Outline color</span>
              <input
                type="color"
                value={style.textOutlineColor}
                onChange={(e) => updateWidget(selected.id, { style: { ...style, textOutlineColor: e.target.value } })}
              />
            </label>
          )}

          <label className="field">
            <span>Rotation ({selected.rotation}°)</span>
            <input
              type="range"
              min={-180}
              max={180}
              step={1}
              value={selected.rotation}
              onChange={(e) => updateWidget(selected.id, { rotation: Number(e.target.value) })}
            />
          </label>
        </div>
        )
      })()}

      {selected && selected.type === 'timer' && (() => {
        const style = { ...DEFAULT_TIMER_STYLE, ...selected.style }
        return (
        <div className="property-panel__section">
          <div className="property-panel__header">
            <span>Timer style</span>
            <button className="property-panel__delete" onClick={() => removeWidget(selected.id)}>
              Delete
            </button>
          </div>

          <PresetRow
            presets={TIMER_STYLE_PRESETS}
            onPick={(patch) => updateWidget(selected.id, { style: { ...style, ...patch } })}
          />

          <label className="field">
            <span>Mode</span>
            <select
              value={style.mode}
              onChange={(e) => {
                const mode = e.target.value as TimerStyle['mode']
                // Laps mode shows a history list and needs much more vertical room than the
                // default elapsed-mode size -- bump it up automatically the first time, but only
                // if the user hasn't already resized it themselves.
                const needsMoreRoom = mode === 'laps' && selected.h <= 0.12
                updateWidget(selected.id, {
                  style: { ...style, mode },
                  ...(needsMoreRoom ? { h: 0.4, w: 0.24 } : {})
                })
              }}
            >
              <option value="elapsed">Elapsed (from video start)</option>
              <option value="laps">Lap timer</option>
            </select>
          </label>

          {style.mode === 'elapsed' && (
            <>
              <label className="field">
                <span>Label</span>
                <input
                  type="text"
                  value={style.label}
                  onChange={(e) => updateWidget(selected.id, { style: { ...style, label: e.target.value } })}
                />
              </label>

              <label className="field">
                <span>Label color</span>
                <input
                  type="color"
                  value={style.labelColor}
                  onChange={(e) => updateWidget(selected.id, { style: { ...style, labelColor: e.target.value } })}
                />
              </label>
            </>
          )}

          {style.mode === 'laps' && (
            <>
              <label className="field">
                <span>Header logo</span>
                <input
                  type="file"
                  accept="image/*"
                  onChange={async (e) => {
                    const file = e.target.files?.[0]
                    if (!file) return
                    const dataUrl = await readImageFileAsDataUrl(file)
                    updateWidget(selected.id, { style: { ...style, headerImageDataUrl: dataUrl } })
                    e.target.value = ''
                  }}
                />
              </label>
              {style.headerImageDataUrl && (
                <>
                  <button
                    className="property-panel__delete"
                    onClick={() => updateWidget(selected.id, { style: { ...style, headerImageDataUrl: null } })}
                  >
                    Remove logo
                  </button>

                  <label className="field">
                    <span>Logo scale ({style.headerImageScale.toFixed(2)}x)</span>
                    <input
                      type="range"
                      min={0.3}
                      max={5}
                      step={0.05}
                      value={style.headerImageScale}
                      onChange={(e) => updateWidget(selected.id, { style: { ...style, headerImageScale: Number(e.target.value) } })}
                    />
                  </label>
                </>
              )}

              <label className="field">
                <span>Header text</span>
                <input
                  type="text"
                  value={style.headerText}
                  onChange={(e) => updateWidget(selected.id, { style: { ...style, headerText: e.target.value } })}
                />
              </label>

              <label className="field">
                <span>Header text color</span>
                <input
                  type="color"
                  value={style.headerTextColor}
                  onChange={(e) => updateWidget(selected.id, { style: { ...style, headerTextColor: e.target.value } })}
                />
              </label>

              <label className="field">
                <span>Row order</span>
                <select
                  value={style.rowOrder}
                  onChange={(e) => updateWidget(selected.id, { style: { ...style, rowOrder: e.target.value as TimerStyle['rowOrder'] } })}
                >
                  <option value="ranked">Ranked (fastest first)</option>
                  <option value="chronological">Chronological (lap order)</option>
                </select>
              </label>

              {style.rowOrder === 'chronological' && (
                <label className="field">
                  <span>New laps added to</span>
                  <select
                    value={style.chronoDirection}
                    onChange={(e) =>
                      updateWidget(selected.id, { style: { ...style, chronoDirection: e.target.value as TimerStyle['chronoDirection'] } })
                    }
                  >
                    <option value="newestOnTop">Top</option>
                    <option value="newestOnBottom">Bottom</option>
                  </select>
                </label>
              )}

              <label className="field">
                <span>Visible rows ({style.maxVisibleRows})</span>
                <input
                  type="range"
                  min={1}
                  max={MAX_TIMING_TOWER_ROWS}
                  step={1}
                  value={style.maxVisibleRows}
                  onChange={(e) => updateWidget(selected.id, { style: { ...style, maxVisibleRows: Number(e.target.value) } })}
                />
              </label>

              <label className="field">
                <span>Background color</span>
                <input
                  type="color"
                  value={style.backgroundColor}
                  onChange={(e) => updateWidget(selected.id, { style: { ...style, backgroundColor: e.target.value } })}
                />
              </label>

              <label className="field">
                <span>Background opacity ({style.backgroundOpacity.toFixed(2)})</span>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.05}
                  value={style.backgroundOpacity}
                  onChange={(e) => updateWidget(selected.id, { style: { ...style, backgroundOpacity: Number(e.target.value) } })}
                />
              </label>

              <label className="field">
                <span>Corner radius ({style.cornerRadius}px)</span>
                <input
                  type="range"
                  min={0}
                  max={40}
                  step={1}
                  value={style.cornerRadius}
                  onChange={(e) => updateWidget(selected.id, { style: { ...style, cornerRadius: Number(e.target.value) } })}
                />
              </label>
            </>
          )}

          <label className="field">
            <span>Time color</span>
            <input
              type="color"
              value={style.color}
              onChange={(e) => updateWidget(selected.id, { style: { ...style, color: e.target.value } })}
            />
          </label>

          <label className="field field--checkbox">
            <input
              type="checkbox"
              checked={style.showCentiseconds}
              onChange={(e) => updateWidget(selected.id, { style: { ...style, showCentiseconds: e.target.checked } })}
            />
            <span>Show centiseconds</span>
          </label>

          <label className="field">
            <span>Text outline ({style.textOutlineWidth}px)</span>
            <input
              type="range"
              min={0}
              max={6}
              step={1}
              value={style.textOutlineWidth}
              onChange={(e) => updateWidget(selected.id, { style: { ...style, textOutlineWidth: Number(e.target.value) } })}
            />
          </label>

          {style.textOutlineWidth > 0 && (
            <label className="field">
              <span>Outline color</span>
              <input
                type="color"
                value={style.textOutlineColor}
                onChange={(e) => updateWidget(selected.id, { style: { ...style, textOutlineColor: e.target.value } })}
              />
            </label>
          )}

          <label className="field">
            <span>Rotation ({selected.rotation}°)</span>
            <input
              type="range"
              min={-180}
              max={180}
              step={1}
              value={selected.rotation}
              onChange={(e) => updateWidget(selected.id, { rotation: Number(e.target.value) })}
            />
          </label>
        </div>
        )
      })()}

      {selected && selected.type === 'sectorTimer' && (() => {
        const style = { ...DEFAULT_SECTOR_TIMER_STYLE, ...selected.style }
        return (
        <div className="property-panel__section">
          <div className="property-panel__header">
            <span>Sector Timer style</span>
            <button className="property-panel__delete" onClick={() => removeWidget(selected.id)}>
              Delete
            </button>
          </div>

          <span className="field__hint">
            Uses the global start/finish line above. The lap is auto-split into 3 equal-distance sectors from GPS.
          </span>

          <label className="field field--checkbox">
            <input
              type="checkbox"
              checked={style.showLastLapRow}
              onChange={(e) => updateWidget(selected.id, { style: { ...style, showLastLapRow: e.target.checked } })}
            />
            <span>Show last lap's sectors</span>
          </label>

          <label className="field">
            <span>Time color</span>
            <input
              type="color"
              value={style.color}
              onChange={(e) => updateWidget(selected.id, { style: { ...style, color: e.target.value } })}
            />
          </label>

          <label className="field">
            <span>Label color</span>
            <input
              type="color"
              value={style.labelColor}
              onChange={(e) => updateWidget(selected.id, { style: { ...style, labelColor: e.target.value } })}
            />
          </label>

          <label className="field">
            <span>Text outline ({style.textOutlineWidth}px)</span>
            <input
              type="range"
              min={0}
              max={6}
              step={1}
              value={style.textOutlineWidth}
              onChange={(e) => updateWidget(selected.id, { style: { ...style, textOutlineWidth: Number(e.target.value) } })}
            />
          </label>

          {style.textOutlineWidth > 0 && (
            <label className="field">
              <span>Outline color</span>
              <input
                type="color"
                value={style.textOutlineColor}
                onChange={(e) => updateWidget(selected.id, { style: { ...style, textOutlineColor: e.target.value } })}
              />
            </label>
          )}

          <label className="field">
            <span>Background color</span>
            <input
              type="color"
              value={style.backgroundColor}
              onChange={(e) => updateWidget(selected.id, { style: { ...style, backgroundColor: e.target.value } })}
            />
          </label>

          <label className="field">
            <span>Background opacity ({style.backgroundOpacity.toFixed(2)})</span>
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={style.backgroundOpacity}
              onChange={(e) => updateWidget(selected.id, { style: { ...style, backgroundOpacity: Number(e.target.value) } })}
            />
          </label>

          <label className="field">
            <span>Corner radius ({style.cornerRadius}px)</span>
            <input
              type="range"
              min={0}
              max={40}
              step={1}
              value={style.cornerRadius}
              onChange={(e) => updateWidget(selected.id, { style: { ...style, cornerRadius: Number(e.target.value) } })}
            />
          </label>

          <label className="field">
            <span>Rotation ({selected.rotation}°)</span>
            <input
              type="range"
              min={-180}
              max={180}
              step={1}
              value={selected.rotation}
              onChange={(e) => updateWidget(selected.id, { rotation: Number(e.target.value) })}
            />
          </label>
        </div>
        )
      })()}

      {selected && selected.type === 'deltaTime' && (() => {
        const style = { ...DEFAULT_DELTA_TIME_STYLE, ...selected.style }
        return (
        <div className="property-panel__section">
          <div className="property-panel__header">
            <span>Delta Time style</span>
            <button className="property-panel__delete" onClick={() => removeWidget(selected.id)}>
              Delete
            </button>
          </div>

          <span className="field__hint">
            Uses the global start/finish line above. Compares the live lap against your best completed lap so far.
          </span>

          <label className="field">
            <span>Label</span>
            <input
              type="text"
              value={style.label}
              onChange={(e) => updateWidget(selected.id, { style: { ...style, label: e.target.value } })}
            />
          </label>

          <label className="field">
            <span>Label color</span>
            <input
              type="color"
              value={style.labelColor}
              onChange={(e) => updateWidget(selected.id, { style: { ...style, labelColor: e.target.value } })}
            />
          </label>

          <label className="field">
            <span>Faster (ahead) color</span>
            <input
              type="color"
              value={style.fasterColor}
              onChange={(e) => updateWidget(selected.id, { style: { ...style, fasterColor: e.target.value } })}
            />
          </label>

          <label className="field">
            <span>Slower (behind) color</span>
            <input
              type="color"
              value={style.slowerColor}
              onChange={(e) => updateWidget(selected.id, { style: { ...style, slowerColor: e.target.value } })}
            />
          </label>

          <label className="field">
            <span>Neutral color (no baseline yet)</span>
            <input
              type="color"
              value={style.neutralColor}
              onChange={(e) => updateWidget(selected.id, { style: { ...style, neutralColor: e.target.value } })}
            />
          </label>

          <label className="field">
            <span>Text outline ({style.textOutlineWidth}px)</span>
            <input
              type="range"
              min={0}
              max={6}
              step={1}
              value={style.textOutlineWidth}
              onChange={(e) => updateWidget(selected.id, { style: { ...style, textOutlineWidth: Number(e.target.value) } })}
            />
          </label>

          {style.textOutlineWidth > 0 && (
            <label className="field">
              <span>Outline color</span>
              <input
                type="color"
                value={style.textOutlineColor}
                onChange={(e) => updateWidget(selected.id, { style: { ...style, textOutlineColor: e.target.value } })}
              />
            </label>
          )}

          <label className="field">
            <span>Background color</span>
            <input
              type="color"
              value={style.backgroundColor}
              onChange={(e) => updateWidget(selected.id, { style: { ...style, backgroundColor: e.target.value } })}
            />
          </label>

          <label className="field">
            <span>Background opacity ({style.backgroundOpacity.toFixed(2)})</span>
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={style.backgroundOpacity}
              onChange={(e) => updateWidget(selected.id, { style: { ...style, backgroundOpacity: Number(e.target.value) } })}
            />
          </label>

          <label className="field">
            <span>Corner radius ({style.cornerRadius}px)</span>
            <input
              type="range"
              min={0}
              max={40}
              step={1}
              value={style.cornerRadius}
              onChange={(e) => updateWidget(selected.id, { style: { ...style, cornerRadius: Number(e.target.value) } })}
            />
          </label>

          <label className="field">
            <span>Rotation ({selected.rotation}°)</span>
            <input
              type="range"
              min={-180}
              max={180}
              step={1}
              value={selected.rotation}
              onChange={(e) => updateWidget(selected.id, { rotation: Number(e.target.value) })}
            />
          </label>
        </div>
        )
      })()}

      {selected && selected.type === 'predictiveLapTimer' && (() => {
        const style = { ...DEFAULT_PREDICTIVE_LAP_TIMER_STYLE, ...selected.style }
        return (
        <div className="property-panel__section">
          <div className="property-panel__header">
            <span>Predictive Lap Timer style</span>
            <button className="property-panel__delete" onClick={() => removeWidget(selected.id)}>
              Delete
            </button>
          </div>

          <span className="field__hint">
            Uses the global start/finish line above. Projects the final lap time from the current pace vs. your best completed lap.
          </span>

          <label className="field">
            <span>Label</span>
            <input
              type="text"
              value={style.label}
              onChange={(e) => updateWidget(selected.id, { style: { ...style, label: e.target.value } })}
            />
          </label>

          <label className="field">
            <span>Label color</span>
            <input
              type="color"
              value={style.labelColor}
              onChange={(e) => updateWidget(selected.id, { style: { ...style, labelColor: e.target.value } })}
            />
          </label>

          <label className="field">
            <span>Time color</span>
            <input
              type="color"
              value={style.color}
              onChange={(e) => updateWidget(selected.id, { style: { ...style, color: e.target.value } })}
            />
          </label>

          <label className="field field--checkbox">
            <input
              type="checkbox"
              checked={style.showDelta}
              onChange={(e) => updateWidget(selected.id, { style: { ...style, showDelta: e.target.checked } })}
            />
            <span>Show delta sub-readout</span>
          </label>

          {style.showDelta && (
            <>
              <label className="field">
                <span>Faster (ahead) color</span>
                <input
                  type="color"
                  value={style.fasterColor}
                  onChange={(e) => updateWidget(selected.id, { style: { ...style, fasterColor: e.target.value } })}
                />
              </label>
              <label className="field">
                <span>Slower (behind) color</span>
                <input
                  type="color"
                  value={style.slowerColor}
                  onChange={(e) => updateWidget(selected.id, { style: { ...style, slowerColor: e.target.value } })}
                />
              </label>
            </>
          )}

          <label className="field">
            <span>Text outline ({style.textOutlineWidth}px)</span>
            <input
              type="range"
              min={0}
              max={6}
              step={1}
              value={style.textOutlineWidth}
              onChange={(e) => updateWidget(selected.id, { style: { ...style, textOutlineWidth: Number(e.target.value) } })}
            />
          </label>

          {style.textOutlineWidth > 0 && (
            <label className="field">
              <span>Outline color</span>
              <input
                type="color"
                value={style.textOutlineColor}
                onChange={(e) => updateWidget(selected.id, { style: { ...style, textOutlineColor: e.target.value } })}
              />
            </label>
          )}

          <label className="field">
            <span>Background color</span>
            <input
              type="color"
              value={style.backgroundColor}
              onChange={(e) => updateWidget(selected.id, { style: { ...style, backgroundColor: e.target.value } })}
            />
          </label>

          <label className="field">
            <span>Background opacity ({style.backgroundOpacity.toFixed(2)})</span>
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={style.backgroundOpacity}
              onChange={(e) => updateWidget(selected.id, { style: { ...style, backgroundOpacity: Number(e.target.value) } })}
            />
          </label>

          <label className="field">
            <span>Corner radius ({style.cornerRadius}px)</span>
            <input
              type="range"
              min={0}
              max={40}
              step={1}
              value={style.cornerRadius}
              onChange={(e) => updateWidget(selected.id, { style: { ...style, cornerRadius: Number(e.target.value) } })}
            />
          </label>

          <label className="field">
            <span>Rotation ({selected.rotation}°)</span>
            <input
              type="range"
              min={-180}
              max={180}
              step={1}
              value={selected.rotation}
              onChange={(e) => updateWidget(selected.id, { rotation: Number(e.target.value) })}
            />
          </label>
        </div>
        )
      })()}

      {selected && selected.type === 'apexSpeedCallout' && (() => {
        const style = { ...DEFAULT_APEX_SPEED_CALLOUT_STYLE, ...selected.style }
        return (
        <div className="property-panel__section">
          <div className="property-panel__header">
            <span>Apex Speed Callout style</span>
            <button className="property-panel__delete" onClick={() => removeWidget(selected.id)}>
              Delete
            </button>
          </div>

          <span className="field__hint">
            Independent of the start/finish line. Flashes the minimum speed reached each time heavy braking is immediately followed by acceleration.
          </span>

          <label className="field">
            <span>Unit</span>
            <select
              value={style.unit}
              onChange={(e) => updateWidget(selected.id, { style: { ...style, unit: e.target.value as SpeedUnit } })}
            >
              <option value="kmh">km/h</option>
              <option value="mph">mph</option>
              <option value="kn">knots</option>
            </select>
          </label>

          <label className="field">
            <span>Label</span>
            <input
              type="text"
              value={style.label}
              onChange={(e) => updateWidget(selected.id, { style: { ...style, label: e.target.value } })}
            />
          </label>

          <label className="field">
            <span>Text color</span>
            <input
              type="color"
              value={style.color}
              onChange={(e) => updateWidget(selected.id, { style: { ...style, color: e.target.value } })}
            />
          </label>

          <label className="field">
            <span>Flash duration ({(style.flashDurationMs / 1000).toFixed(1)}s)</span>
            <input
              type="range"
              min={1000}
              max={6000}
              step={250}
              value={style.flashDurationMs}
              onChange={(e) => updateWidget(selected.id, { style: { ...style, flashDurationMs: Number(e.target.value) } })}
            />
          </label>

          <label className="field">
            <span>Sensitivity ({style.minDropMps.toFixed(1)} m/s drop)</span>
            <input
              type="range"
              min={2}
              max={20}
              step={0.5}
              value={style.minDropMps}
              onChange={(e) => updateWidget(selected.id, { style: { ...style, minDropMps: Number(e.target.value) } })}
            />
          </label>

          <label className="field">
            <span>Minimum gap between apexes ({(style.minGapMs / 1000).toFixed(1)}s)</span>
            <input
              type="range"
              min={500}
              max={5000}
              step={250}
              value={style.minGapMs}
              onChange={(e) => updateWidget(selected.id, { style: { ...style, minGapMs: Number(e.target.value) } })}
            />
          </label>

          <label className="field">
            <span>Text outline ({style.textOutlineWidth}px)</span>
            <input
              type="range"
              min={0}
              max={6}
              step={1}
              value={style.textOutlineWidth}
              onChange={(e) => updateWidget(selected.id, { style: { ...style, textOutlineWidth: Number(e.target.value) } })}
            />
          </label>

          {style.textOutlineWidth > 0 && (
            <label className="field">
              <span>Outline color</span>
              <input
                type="color"
                value={style.textOutlineColor}
                onChange={(e) => updateWidget(selected.id, { style: { ...style, textOutlineColor: e.target.value } })}
              />
            </label>
          )}

          <label className="field">
            <span>Background color</span>
            <input
              type="color"
              value={style.backgroundColor}
              onChange={(e) => updateWidget(selected.id, { style: { ...style, backgroundColor: e.target.value } })}
            />
          </label>

          <label className="field">
            <span>Background opacity ({style.backgroundOpacity.toFixed(2)})</span>
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={style.backgroundOpacity}
              onChange={(e) => updateWidget(selected.id, { style: { ...style, backgroundOpacity: Number(e.target.value) } })}
            />
          </label>

          <label className="field">
            <span>Corner radius ({style.cornerRadius}px)</span>
            <input
              type="range"
              min={0}
              max={40}
              step={1}
              value={style.cornerRadius}
              onChange={(e) => updateWidget(selected.id, { style: { ...style, cornerRadius: Number(e.target.value) } })}
            />
          </label>

          <label className="field">
            <span>Rotation ({selected.rotation}°)</span>
            <input
              type="range"
              min={-180}
              max={180}
              step={1}
              value={selected.rotation}
              onChange={(e) => updateWidget(selected.id, { rotation: Number(e.target.value) })}
            />
          </label>
        </div>
        )
      })()}

      {selected && selected.type === 'speedDistanceGraph' && (() => {
        const style = { ...DEFAULT_SPEED_DISTANCE_GRAPH_STYLE, ...selected.style }
        return (
        <div className="property-panel__section">
          <div className="property-panel__header">
            <span>Speed/Distance Graph style</span>
            <button className="property-panel__delete" onClick={() => removeWidget(selected.id)}>
              Delete
            </button>
          </div>

          <span className="field__hint">
            Uses the global start/finish line above. Speed vs. distance-into-the-lap, resetting at the start of every lap.
          </span>

          <label className="field">
            <span>View mode</span>
            <select
              value={style.viewMode}
              onChange={(e) => updateWidget(selected.id, { style: { ...style, viewMode: e.target.value as SpeedDistanceGraphStyle['viewMode'] } })}
            >
              <option value="fullLap">Full lap (each lap its own color)</option>
              <option value="window">Local window (only current lap colored)</option>
            </select>
          </label>

          {style.viewMode === 'window' && (
            <>
              <span className="field__hint">
                Centers on your current position and shows a band of track around it -- only the current lap is colored, so you can see at a glance whether you're faster or slower than previous laps right here.
              </span>

              <label className="field">
                <span>Window size (±{style.windowMeters}m)</span>
                <input
                  type="range"
                  min={10}
                  max={300}
                  step={10}
                  value={style.windowMeters}
                  onChange={(e) => updateWidget(selected.id, { style: { ...style, windowMeters: Number(e.target.value) } })}
                />
              </label>

              <label className="field">
                <span>Reference lap color</span>
                <input
                  type="color"
                  value={style.referenceLapColor}
                  onChange={(e) => updateWidget(selected.id, { style: { ...style, referenceLapColor: e.target.value } })}
                />
              </label>

              <label className="field">
                <span>Reference lap opacity ({style.referenceLapOpacity.toFixed(2)})</span>
                <input
                  type="range"
                  min={0.1}
                  max={1}
                  step={0.05}
                  value={style.referenceLapOpacity}
                  onChange={(e) => updateWidget(selected.id, { style: { ...style, referenceLapOpacity: Number(e.target.value) } })}
                />
              </label>
            </>
          )}

          <label className="field">
            <span>Unit</span>
            <select
              value={style.unit}
              onChange={(e) => updateWidget(selected.id, { style: { ...style, unit: e.target.value as SpeedUnit } })}
            >
              <option value="kmh">km/h</option>
              <option value="mph">mph</option>
              <option value="kn">knots</option>
            </select>
          </label>

          <label className="field">
            <span>Laps shown ({style.maxLapsShown})</span>
            <input
              type="range"
              min={1}
              max={15}
              step={1}
              value={style.maxLapsShown}
              onChange={(e) => updateWidget(selected.id, { style: { ...style, maxLapsShown: Number(e.target.value) } })}
            />
          </label>

          <label className="field field--checkbox">
            <input
              type="checkbox"
              checked={style.showCurrentLap}
              onChange={(e) => updateWidget(selected.id, { style: { ...style, showCurrentLap: e.target.checked } })}
            />
            <span>Show current (in-progress) lap live</span>
          </label>

          {style.showCurrentLap && (
            <label className="field field--checkbox">
              <input
                type="checkbox"
                checked={style.highlightCurrentLap}
                onChange={(e) => updateWidget(selected.id, { style: { ...style, highlightCurrentLap: e.target.checked } })}
              />
              <span>Highlight current lap (thicker line)</span>
            </label>
          )}

          <label className="field">
            <span>Line width ({style.lineWidth.toFixed(1)}px)</span>
            <input
              type="range"
              min={1}
              max={6}
              step={0.5}
              value={style.lineWidth}
              onChange={(e) => updateWidget(selected.id, { style: { ...style, lineWidth: Number(e.target.value) } })}
            />
          </label>

          <label className="field">
            <span>Color palette ({style.colorSeed}°)</span>
            <input
              type="range"
              min={0}
              max={359}
              step={1}
              value={style.colorSeed}
              onChange={(e) => updateWidget(selected.id, { style: { ...style, colorSeed: Number(e.target.value) } })}
            />
          </label>
          <span className="field__hint">Each lap gets its own stable color automatically -- this shifts the whole palette if the defaults clash with your footage.</span>

          <label className="field">
            <span>Grid color</span>
            <input
              type="color"
              value={style.gridColor}
              onChange={(e) => updateWidget(selected.id, { style: { ...style, gridColor: e.target.value } })}
            />
          </label>

          <label className="field">
            <span>Axis label color</span>
            <input
              type="color"
              value={style.axisLabelColor}
              onChange={(e) => updateWidget(selected.id, { style: { ...style, axisLabelColor: e.target.value } })}
            />
          </label>

          <label className="field">
            <span>Background color</span>
            <input
              type="color"
              value={style.backgroundColor}
              onChange={(e) => updateWidget(selected.id, { style: { ...style, backgroundColor: e.target.value } })}
            />
          </label>

          <label className="field">
            <span>Background opacity ({style.backgroundOpacity.toFixed(2)})</span>
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={style.backgroundOpacity}
              onChange={(e) => updateWidget(selected.id, { style: { ...style, backgroundOpacity: Number(e.target.value) } })}
            />
          </label>

          <label className="field">
            <span>Corner radius ({style.cornerRadius}px)</span>
            <input
              type="range"
              min={0}
              max={40}
              step={1}
              value={style.cornerRadius}
              onChange={(e) => updateWidget(selected.id, { style: { ...style, cornerRadius: Number(e.target.value) } })}
            />
          </label>

          <label className="field">
            <span>Rotation ({selected.rotation}°)</span>
            <input
              type="range"
              min={-180}
              max={180}
              step={1}
              value={selected.rotation}
              onChange={(e) => updateWidget(selected.id, { rotation: Number(e.target.value) })}
            />
          </label>
        </div>
        )
      })()}

      {selected && selected.type === 'gForceDiagram' && (() => {
        const style = { ...DEFAULT_GFORCE_DIAGRAM_STYLE, ...selected.style }
        return (
        <div className="property-panel__section">
          <div className="property-panel__header">
            <span>G-Force Diagram style</span>
            <button className="property-panel__delete" onClick={() => removeWidget(selected.id)}>
              Delete
            </button>
          </div>

          <span className="field__hint">
            Lateral G (cornering) vs. longitudinal G (braking/accelerating), from the GoPro's own accelerometer. Axis mapping
            is auto-calibrated per session -- turn on manual mapping below if it looks wrong (e.g. too little braking in the
            footage to calibrate against).
          </span>

          <label className="field">
            <span>Max G (grid radius)</span>
            <input
              type="range"
              min={0.5}
              max={4}
              step={0.1}
              value={style.maxG}
              onChange={(e) => updateWidget(selected.id, { style: { ...style, maxG: Number(e.target.value) } })}
            />
          </label>

          <label className="field">
            <span>Trail duration ({(style.trailDurationMs / 1000).toFixed(1)}s)</span>
            <input
              type="range"
              min={0}
              max={8000}
              step={250}
              value={style.trailDurationMs}
              onChange={(e) => updateWidget(selected.id, { style: { ...style, trailDurationMs: Number(e.target.value) } })}
            />
          </label>

          <label className="field">
            <span>Smoothing ({style.smoothingMs}ms)</span>
            <input
              type="range"
              min={0}
              max={500}
              step={10}
              value={style.smoothingMs}
              onChange={(e) => updateWidget(selected.id, { style: { ...style, smoothingMs: Number(e.target.value) } })}
            />
          </label>

          <label className="field">
            <span>Dot color</span>
            <input type="color" value={style.dotColor} onChange={(e) => updateWidget(selected.id, { style: { ...style, dotColor: e.target.value } })} />
          </label>

          <label className="field">
            <span>Dot radius ({style.dotRadius}px)</span>
            <input
              type="range"
              min={2}
              max={16}
              step={1}
              value={style.dotRadius}
              onChange={(e) => updateWidget(selected.id, { style: { ...style, dotRadius: Number(e.target.value) } })}
            />
          </label>

          <label className="field">
            <span>Trail color</span>
            <input type="color" value={style.trailColor} onChange={(e) => updateWidget(selected.id, { style: { ...style, trailColor: e.target.value } })} />
          </label>

          <label className="field">
            <span>Ring color</span>
            <input type="color" value={style.ringColor} onChange={(e) => updateWidget(selected.id, { style: { ...style, ringColor: e.target.value } })} />
          </label>

          <label className="field">
            <span>Ring opacity ({style.ringOpacity.toFixed(2)})</span>
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={style.ringOpacity}
              onChange={(e) => updateWidget(selected.id, { style: { ...style, ringOpacity: Number(e.target.value) } })}
            />
          </label>

          <label className="field">
            <span>Axis label color</span>
            <input
              type="color"
              value={style.axisLabelColor}
              onChange={(e) => updateWidget(selected.id, { style: { ...style, axisLabelColor: e.target.value } })}
            />
          </label>

          <label className="field">
            <span>Background color</span>
            <input
              type="color"
              value={style.backgroundColor}
              onChange={(e) => updateWidget(selected.id, { style: { ...style, backgroundColor: e.target.value } })}
            />
          </label>

          <label className="field">
            <span>Background opacity ({style.backgroundOpacity.toFixed(2)})</span>
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={style.backgroundOpacity}
              onChange={(e) => updateWidget(selected.id, { style: { ...style, backgroundOpacity: Number(e.target.value) } })}
            />
          </label>

          <label className="field">
            <span>Corner radius ({style.cornerRadius}px)</span>
            <input
              type="range"
              min={0}
              max={40}
              step={1}
              value={style.cornerRadius}
              onChange={(e) => updateWidget(selected.id, { style: { ...style, cornerRadius: Number(e.target.value) } })}
            />
          </label>

          <label className="field field--checkbox">
            <input
              type="checkbox"
              checked={style.useManualAxes}
              onChange={(e) => updateWidget(selected.id, { style: { ...style, useManualAxes: e.target.checked } })}
            />
            <span>Use manual axis mapping</span>
          </label>

          {style.useManualAxes && (
            <AxisOverrideFields
              vertical={style.verticalAxis}
              lateralOrLongitudinal={style.longitudinalAxis}
              lateralOrLongitudinalLabel="Longitudinal"
              verticalInverted={style.verticalInverted}
              lateralOrLongitudinalInverted={style.longitudinalInverted}
              onChangeVertical={(axis) => updateWidget(selected.id, { style: { ...style, verticalAxis: axis } })}
              onChangeLateralOrLongitudinal={(axis) => updateWidget(selected.id, { style: { ...style, longitudinalAxis: axis } })}
              onChangeVerticalInverted={(inverted) => updateWidget(selected.id, { style: { ...style, verticalInverted: inverted } })}
              onChangeLateralOrLongitudinalInverted={(inverted) => updateWidget(selected.id, { style: { ...style, longitudinalInverted: inverted } })}
            />
          )}

          <label className="field">
            <span>Rotation ({selected.rotation}°)</span>
            <input
              type="range"
              min={-180}
              max={180}
              step={1}
              value={selected.rotation}
              onChange={(e) => updateWidget(selected.id, { rotation: Number(e.target.value) })}
            />
          </label>
        </div>
        )
      })()}

      {selected && selected.type === 'rollAngle' && (() => {
        const style = { ...DEFAULT_ROLL_ANGLE_STYLE, ...selected.style }
        return (
        <div className="property-panel__section">
          <div className="property-panel__header">
            <span>Roll/Lean Angle style</span>
            <button className="property-panel__delete" onClick={() => removeWidget(selected.id)}>
              Delete
            </button>
          </div>

          <span className="field__hint">
            Body roll (car) / lean angle (motorcycle) from the gravity-vector sensor when your camera/firmware records one,
            otherwise estimated from the raw accelerometer's own tilt (reads exaggerated during hard cornering -- a real
            limitation of accelerometer-only tilt sensing, not a bug).
          </span>

          <label className="field">
            <span>Label</span>
            <input type="text" value={style.label} onChange={(e) => updateWidget(selected.id, { style: { ...style, label: e.target.value } })} />
          </label>

          <label className="field">
            <span>Label color</span>
            <input type="color" value={style.labelColor} onChange={(e) => updateWidget(selected.id, { style: { ...style, labelColor: e.target.value } })} />
          </label>

          <label className="field">
            <span>Text color</span>
            <input type="color" value={style.color} onChange={(e) => updateWidget(selected.id, { style: { ...style, color: e.target.value } })} />
          </label>

          <label className="field">
            <span>Bar color</span>
            <input type="color" value={style.barColor} onChange={(e) => updateWidget(selected.id, { style: { ...style, barColor: e.target.value } })} />
          </label>

          <label className="field">
            <span>Bar scale (±{style.maxAngleScale}°)</span>
            <input
              type="range"
              min={10}
              max={90}
              step={5}
              value={style.maxAngleScale}
              onChange={(e) => updateWidget(selected.id, { style: { ...style, maxAngleScale: Number(e.target.value) } })}
            />
          </label>

          <label className="field">
            <span>Smoothing ({style.smoothingMs}ms)</span>
            <input
              type="range"
              min={0}
              max={500}
              step={10}
              value={style.smoothingMs}
              onChange={(e) => updateWidget(selected.id, { style: { ...style, smoothingMs: Number(e.target.value) } })}
            />
          </label>

          <label className="field field--checkbox">
            <input
              type="checkbox"
              checked={style.showAccuracyCaveat}
              onChange={(e) => updateWidget(selected.id, { style: { ...style, showAccuracyCaveat: e.target.checked } })}
            />
            <span>Show accuracy note when estimated (no gravity sensor)</span>
          </label>

          <label className="field">
            <span>Text outline ({style.textOutlineWidth}px)</span>
            <input
              type="range"
              min={0}
              max={6}
              step={1}
              value={style.textOutlineWidth}
              onChange={(e) => updateWidget(selected.id, { style: { ...style, textOutlineWidth: Number(e.target.value) } })}
            />
          </label>

          {style.textOutlineWidth > 0 && (
            <label className="field">
              <span>Outline color</span>
              <input
                type="color"
                value={style.textOutlineColor}
                onChange={(e) => updateWidget(selected.id, { style: { ...style, textOutlineColor: e.target.value } })}
              />
            </label>
          )}

          <label className="field">
            <span>Background color</span>
            <input
              type="color"
              value={style.backgroundColor}
              onChange={(e) => updateWidget(selected.id, { style: { ...style, backgroundColor: e.target.value } })}
            />
          </label>

          <label className="field">
            <span>Background opacity ({style.backgroundOpacity.toFixed(2)})</span>
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={style.backgroundOpacity}
              onChange={(e) => updateWidget(selected.id, { style: { ...style, backgroundOpacity: Number(e.target.value) } })}
            />
          </label>

          <label className="field">
            <span>Corner radius ({style.cornerRadius}px)</span>
            <input
              type="range"
              min={0}
              max={40}
              step={1}
              value={style.cornerRadius}
              onChange={(e) => updateWidget(selected.id, { style: { ...style, cornerRadius: Number(e.target.value) } })}
            />
          </label>

          <label className="field field--checkbox">
            <input
              type="checkbox"
              checked={style.useManualAxes}
              onChange={(e) => updateWidget(selected.id, { style: { ...style, useManualAxes: e.target.checked } })}
            />
            <span>Use manual axis mapping</span>
          </label>

          {style.useManualAxes && (
            <AxisOverrideFields
              vertical={style.verticalAxis}
              lateralOrLongitudinal={style.lateralAxis}
              lateralOrLongitudinalLabel="Lateral"
              verticalInverted={style.verticalInverted}
              lateralOrLongitudinalInverted={style.lateralInverted}
              onChangeVertical={(axis) => updateWidget(selected.id, { style: { ...style, verticalAxis: axis } })}
              onChangeLateralOrLongitudinal={(axis) => updateWidget(selected.id, { style: { ...style, lateralAxis: axis } })}
              onChangeVerticalInverted={(inverted) => updateWidget(selected.id, { style: { ...style, verticalInverted: inverted } })}
              onChangeLateralOrLongitudinalInverted={(inverted) => updateWidget(selected.id, { style: { ...style, lateralInverted: inverted } })}
            />
          )}

          <label className="field">
            <span>Rotation ({selected.rotation}°)</span>
            <input
              type="range"
              min={-180}
              max={180}
              step={1}
              value={selected.rotation}
              onChange={(e) => updateWidget(selected.id, { rotation: Number(e.target.value) })}
            />
          </label>
        </div>
        )
      })()}

      {selected && selected.type === 'sessionSummary' && (() => {
        const style = { ...DEFAULT_SESSION_SUMMARY_STYLE, ...selected.style }
        return (
        <div className="property-panel__section">
          <div className="property-panel__header">
            <span>Session Summary style</span>
            <button className="property-panel__delete" onClick={() => removeWidget(selected.id)}>
              Delete
            </button>
          </div>

          <span className="field__hint">
            An end-of-session recap card -- only visible in the final stretch of the (trimmed) video, fading + sliding
            into place. Best lap, best sectors, total laps, top/average speed, distance, and duration, all resolved as
            of wherever it's showing.
          </span>

          <label className="field">
            <span>Title</span>
            <input type="text" value={style.title} onChange={(e) => updateWidget(selected.id, { style: { ...style, title: e.target.value } })} />
          </label>

          <label className="field">
            <span>Show in last ({style.showLastSeconds}s)</span>
            <input
              type="range"
              min={2}
              max={30}
              step={1}
              value={style.showLastSeconds}
              onChange={(e) => updateWidget(selected.id, { style: { ...style, showLastSeconds: Number(e.target.value) } })}
            />
          </label>
          <span className="field__hint">Counts back from the end of your trim, not the source file's own end.</span>

          <label className="field">
            <span>Opening animation ({style.animationDurationMs}ms)</span>
            <input
              type="range"
              min={0}
              max={2000}
              step={50}
              value={style.animationDurationMs}
              onChange={(e) => updateWidget(selected.id, { style: { ...style, animationDurationMs: Number(e.target.value) } })}
            />
          </label>

          <label className="field">
            <span>Speed unit</span>
            <select value={style.unit} onChange={(e) => updateWidget(selected.id, { style: { ...style, unit: e.target.value as SpeedUnit } })}>
              <option value="kmh">km/h</option>
              <option value="mph">mph</option>
              <option value="kn">knots</option>
            </select>
          </label>

          <label className="field">
            <span>Text color</span>
            <input type="color" value={style.color} onChange={(e) => updateWidget(selected.id, { style: { ...style, color: e.target.value } })} />
          </label>

          <label className="field">
            <span>Label color</span>
            <input type="color" value={style.labelColor} onChange={(e) => updateWidget(selected.id, { style: { ...style, labelColor: e.target.value } })} />
          </label>

          <label className="field">
            <span>Accent color (title)</span>
            <input type="color" value={style.accentColor} onChange={(e) => updateWidget(selected.id, { style: { ...style, accentColor: e.target.value } })} />
          </label>

          <label className="field">
            <span>Text outline ({style.textOutlineWidth}px)</span>
            <input
              type="range"
              min={0}
              max={6}
              step={1}
              value={style.textOutlineWidth}
              onChange={(e) => updateWidget(selected.id, { style: { ...style, textOutlineWidth: Number(e.target.value) } })}
            />
          </label>

          {style.textOutlineWidth > 0 && (
            <label className="field">
              <span>Outline color</span>
              <input
                type="color"
                value={style.textOutlineColor}
                onChange={(e) => updateWidget(selected.id, { style: { ...style, textOutlineColor: e.target.value } })}
              />
            </label>
          )}

          <label className="field">
            <span>Background color</span>
            <input
              type="color"
              value={style.backgroundColor}
              onChange={(e) => updateWidget(selected.id, { style: { ...style, backgroundColor: e.target.value } })}
            />
          </label>

          <label className="field">
            <span>Background opacity ({style.backgroundOpacity.toFixed(2)})</span>
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={style.backgroundOpacity}
              onChange={(e) => updateWidget(selected.id, { style: { ...style, backgroundOpacity: Number(e.target.value) } })}
            />
          </label>

          <label className="field">
            <span>Corner radius ({style.cornerRadius}px)</span>
            <input
              type="range"
              min={0}
              max={40}
              step={1}
              value={style.cornerRadius}
              onChange={(e) => updateWidget(selected.id, { style: { ...style, cornerRadius: Number(e.target.value) } })}
            />
          </label>

          <label className="field">
            <span>Rotation ({selected.rotation}°)</span>
            <input
              type="range"
              min={-180}
              max={180}
              step={1}
              value={selected.rotation}
              onChange={(e) => updateWidget(selected.id, { rotation: Number(e.target.value) })}
            />
          </label>
        </div>
        )
      })()}
    </aside>
  )
}

export default PropertyPanel
