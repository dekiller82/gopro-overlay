import { describe, expect, it } from 'vitest'
import { createWidget } from './defaults'
import { applyThemeToWidget, LAYOUT_THEMES } from './themes'

const theme = {
  name: 'Test Theme',
  primary: '#111111',
  accent: '#222222',
  label: '#333333',
  backgroundColor: '#444444',
  backgroundOpacity: 0.5
}

describe('applyThemeToWidget', () => {
  it('maps theme slots onto gpsTrack (which has no plain "color"/background fields)', () => {
    const widget = applyThemeToWidget(createWidget('gpsTrack'), theme)
    expect(widget.type).toBe('gpsTrack')
    if (widget.type !== 'gpsTrack') throw new Error('unreachable')
    expect(widget.style.lineColor).toBe('#111111')
    expect(widget.style.dotColor).toBe('#222222')
    expect(widget.style.ghostColor).toBe('#222222')
    expect(widget.style.apexMarkerColor).toBe('#222222')
  })

  it('maps theme slots onto timer, including background', () => {
    const widget = applyThemeToWidget(createWidget('timer'), theme)
    if (widget.type !== 'timer') throw new Error('unreachable')
    expect(widget.style.color).toBe('#111111')
    expect(widget.style.labelColor).toBe('#222222')
    expect(widget.style.backgroundColor).toBe('#444444')
    expect(widget.style.backgroundOpacity).toBe(0.5)
  })

  it("leaves deltaTime's semantic faster/slower colors untouched", () => {
    const original = createWidget('deltaTime')
    if (original.type !== 'deltaTime') throw new Error('unreachable')
    const widget = applyThemeToWidget(original, theme)
    if (widget.type !== 'deltaTime') throw new Error('unreachable')
    expect(widget.style.fasterColor).toBe(original.style.fasterColor)
    expect(widget.style.slowerColor).toBe(original.style.slowerColor)
    expect(widget.style.neutralColor).toBe('#111111')
  })

  it('never touches position/size/rotation/locked/id/zIndex', () => {
    const original = createWidget('sessionSummary')
    const widget = applyThemeToWidget(original, theme)
    expect(widget.x).toBe(original.x)
    expect(widget.y).toBe(original.y)
    expect(widget.w).toBe(original.w)
    expect(widget.h).toBe(original.h)
    expect(widget.rotation).toBe(original.rotation)
    expect(widget.zIndex).toBe(original.zIndex)
    expect(widget.locked).toBe(original.locked)
    expect(widget.id).toBe(original.id)
  })

  it('applies cleanly to every widget type without throwing', () => {
    const types: Array<Parameters<typeof createWidget>[0]> = [
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
      'lapConsistency'
    ]
    for (const type of types) {
      for (const t of LAYOUT_THEMES) {
        expect(() => applyThemeToWidget(createWidget(type), t)).not.toThrow()
      }
    }
  })
})
