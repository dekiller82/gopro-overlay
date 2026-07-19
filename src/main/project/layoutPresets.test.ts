import { mkdtempSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterEach, describe, expect, it } from 'vitest'
import { listLayoutPresets, saveLayoutPreset, deleteLayoutPreset } from './layoutPresets'
import { createTimerWidget, createWidget } from '../../shared/widgets/defaults'
import type { WidgetInstance } from '../../shared/types'

const dirs: string[] = []
afterEach(() => {
  dirs.length = 0
})

function tempPresetsPath(): string {
  const dir = mkdtempSync(join(tmpdir(), 'gpo-layouts-'))
  dirs.push(dir)
  return join(dir, 'layout-presets.json')
}

describe('layoutPresets', () => {
  it('returns an empty list when no file exists yet', async () => {
    expect(await listLayoutPresets(tempPresetsPath())).toEqual([])
  })

  it('saves a layout and lists it back', async () => {
    const filePath = tempPresetsPath()
    const widgets = [createTimerWidget()]
    const saved = await saveLayoutPreset(filePath, 'My Racing Setup', widgets)
    expect(saved).toHaveLength(1)
    expect(saved[0].name).toBe('My Racing Setup')
    expect(saved[0].widgets).toEqual(widgets)

    const listed = await listLayoutPresets(filePath)
    expect(listed).toEqual(saved)
  })

  it('accumulates multiple saved layouts', async () => {
    const filePath = tempPresetsPath()
    await saveLayoutPreset(filePath, 'Layout A', [createTimerWidget()])
    const afterSecond = await saveLayoutPreset(filePath, 'Layout B', [])
    expect(afterSecond.map((p) => p.name)).toEqual(['Layout A', 'Layout B'])
  })

  it('deletes a layout by id', async () => {
    const filePath = tempPresetsPath()
    const [a, b] = await saveLayoutPreset(filePath, 'Layout A', [])
      .then(() => saveLayoutPreset(filePath, 'Layout B', []))
      .then(() => listLayoutPresets(filePath))

    const afterDelete = await deleteLayoutPreset(filePath, a.id)
    expect(afterDelete).toEqual([b])
  })

  it('treats a corrupt/unparseable presets file as empty rather than throwing', async () => {
    const filePath = tempPresetsPath()
    const { writeFileSync } = await import('fs')
    writeFileSync(filePath, 'not valid json{{{')
    expect(await listLayoutPresets(filePath)).toEqual([])
  })

  it('treats a file with valid JSON that fails schema validation as empty', async () => {
    const filePath = tempPresetsPath()
    const { writeFileSync } = await import('fs')
    writeFileSync(filePath, JSON.stringify([{ notAValidLayoutPreset: true }]))
    expect(await listLayoutPresets(filePath)).toEqual([])
  })

  // Regression test: a layout preset saved with a widget type whose schema doesn't validate
  // round-trips back as an EMPTY list on the next read (readLayoutPresets treats a failed
  // safeParse the same as a missing/corrupt file) -- so any widget type missing from, or
  // mismatched with, layoutPresetSchema's widgetSchema would silently make every saved layout
  // (not just the broken widget's own layout) disappear from the list forever. Every widget type
  // must stay round-trippable through this exact schema.
  const ALL_WIDGET_TYPES: WidgetInstance['type'][] = [
    'gpsTrack',
    'speedometerAnalog',
    'speedometerDigital',
    'timer',
    'sectorTimer',
    'deltaTime',
    'predictiveLapTimer',
    'apexSpeedCallout',
    'speedDistanceGraph',
    'gForceDiagram',
    'rollAngle',
    'sessionSummary',
    'lapConsistency',
    'customText'
  ]

  it('round-trips a layout containing every widget type through save + list', async () => {
    const filePath = tempPresetsPath()
    const widgets = ALL_WIDGET_TYPES.map((type) => createWidget(type))
    await saveLayoutPreset(filePath, 'One of everything', widgets)

    const listed = await listLayoutPresets(filePath)
    expect(listed).toHaveLength(1)
    expect(listed[0].widgets).toHaveLength(ALL_WIDGET_TYPES.length)
    expect(listed[0].widgets.map((w) => w.type)).toEqual(ALL_WIDGET_TYPES)
  })
})
