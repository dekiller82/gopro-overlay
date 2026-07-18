import type { GpsWidgetStyle } from '../render/drawGpsWidget'
import type { SpeedometerStyle } from '../render/drawSpeedometer'
import type { TimerStyle } from '../render/drawTimer'

export interface StylePreset<T> {
  name: string
  /** Representative color shown on the preset's swatch button. */
  swatch: string
  style: Partial<T>
}

export const GPS_STYLE_PRESETS: StylePreset<GpsWidgetStyle>[] = [
  {
    name: 'Quik Red',
    swatch: '#ff3b30',
    style: { lineColor: '#ffffff', lineWidth: 3, lineOpacity: 0.85, dotColor: '#ff3b30', dotRadius: 7, dotGlow: true }
  },
  {
    name: 'Neon Cyan',
    swatch: '#32e6e0',
    style: { lineColor: '#32e6e0', lineWidth: 3, lineOpacity: 0.9, dotColor: '#32e6e0', dotRadius: 8, dotGlow: true }
  },
  {
    name: 'Racing Yellow',
    swatch: '#ffcc00',
    style: { lineColor: '#ffffff', lineWidth: 3, lineOpacity: 0.85, dotColor: '#ffcc00', dotRadius: 7, dotGlow: true }
  },
  {
    name: 'Minimal White',
    swatch: '#ffffff',
    style: { lineColor: '#ffffff', lineWidth: 2, lineOpacity: 0.65, dotColor: '#ffffff', dotRadius: 5, dotGlow: false }
  }
]

/** Only the look — unit/min/max/smoothing are functional settings and stay untouched when a preset is applied. */
export const SPEEDOMETER_STYLE_PRESETS: StylePreset<SpeedometerStyle>[] = [
  { name: 'Racing Red', swatch: '#ff3b30', style: { color: '#ffffff', accentColor: '#ff3b30', showUnit: true } },
  { name: 'Neon Cyan', swatch: '#32e6e0', style: { color: '#ffffff', accentColor: '#32e6e0', showUnit: true } },
  { name: 'Racing Yellow', swatch: '#ffcc00', style: { color: '#ffffff', accentColor: '#ffcc00', showUnit: true } },
  { name: 'Mono', swatch: '#c8c8c8', style: { color: '#ffffff', accentColor: '#c8c8c8', showUnit: true } }
]

export const TIMER_STYLE_PRESETS: StylePreset<TimerStyle>[] = [
  { name: 'Red Label', swatch: '#ff3b30', style: { color: '#ffffff', label: 'TIME', labelColor: '#ff3b30' } },
  { name: 'Cyan Label', swatch: '#32e6e0', style: { color: '#ffffff', label: 'TIME', labelColor: '#32e6e0' } },
  { name: 'No Label', swatch: '#ffffff', style: { color: '#ffffff', label: '', labelColor: '#ff3b30' } }
]
