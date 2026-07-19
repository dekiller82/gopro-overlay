import type { WidgetInstance } from '../types'

/** A small semantic palette applied consistently across every currently-placed widget, regardless
 *  of type -- unlike a layout preset (which saves position/size), this only touches color fields,
 *  and unlike editing one widget at a time, it recolors the whole layout in one click. Deliberately
 *  small (5 slots): each widget type maps its OWN real style fields onto these slots below, since
 *  field names vary a lot between widget types (e.g. GPS Track's `lineColor` vs Timer's `color`). */
export interface LayoutTheme {
  name: string
  /** Main text/value color. */
  primary: string
  /** Highlight color -- best lap/sector, the live GPS dot, title text, etc. */
  accent: string
  /** Secondary/dim label color. */
  label: string
  backgroundColor: string
  backgroundOpacity: number
}

export const LAYOUT_THEMES: LayoutTheme[] = [
  { name: 'Racing Red', primary: '#ffffff', accent: '#ff3b30', label: '#9a9aa4', backgroundColor: '#0a0a10', backgroundOpacity: 0.72 },
  { name: 'Neon Purple', primary: '#ffffff', accent: '#b026ff', label: '#9a9aa4', backgroundColor: '#0a0a10', backgroundOpacity: 0.72 },
  { name: 'Carbon Yellow', primary: '#ffffff', accent: '#ffd60a', label: '#9a9aa4', backgroundColor: '#0a0a10', backgroundOpacity: 0.78 },
  { name: 'Ocean Blue', primary: '#ffffff', accent: '#2979ff', label: '#9a9aa4', backgroundColor: '#071019', backgroundOpacity: 0.72 },
  { name: 'Stealth Green', primary: '#ffffff', accent: '#3ddc71', label: '#9a9aa4', backgroundColor: '#0a0a10', backgroundOpacity: 0.72 },
  { name: 'Clean White', primary: '#111111', accent: '#111111', label: '#555555', backgroundColor: '#ffffff', backgroundOpacity: 0.85 }
]

/** Recolors a single widget instance to `theme`, leaving position/size/rotation and every non-color
 *  field (thresholds, units, semantic faster/slower colors, etc.) untouched -- only the specific
 *  color fields each widget type actually has are touched, mapped from theme.primary/accent/label. */
export function applyThemeToWidget(widget: WidgetInstance, theme: LayoutTheme): WidgetInstance {
  const { primary, accent, label, backgroundColor, backgroundOpacity } = theme
  switch (widget.type) {
    case 'gpsTrack':
      return { ...widget, style: { ...widget.style, lineColor: primary, dotColor: accent, ghostColor: accent, apexMarkerColor: accent } }
    case 'speedometerAnalog':
    case 'speedometerDigital':
      return { ...widget, style: { ...widget.style, color: primary, accentColor: accent, backgroundColor, backgroundOpacity } }
    case 'timer':
      return { ...widget, style: { ...widget.style, color: primary, labelColor: accent, backgroundColor, backgroundOpacity } }
    case 'sectorTimer':
      return { ...widget, style: { ...widget.style, color: primary, labelColor: label, backgroundColor, backgroundOpacity } }
    case 'deltaTime':
      return { ...widget, style: { ...widget.style, neutralColor: primary, labelColor: label, backgroundColor, backgroundOpacity } }
    case 'predictiveLapTimer':
      return { ...widget, style: { ...widget.style, color: primary, labelColor: label, backgroundColor, backgroundOpacity } }
    case 'apexSpeedCallout':
      return { ...widget, style: { ...widget.style, color: primary, backgroundColor, backgroundOpacity } }
    case 'speedDistanceGraph':
      // No plain "primary" text-color field on this widget (per-lap line colors are deterministic
      // from colorSeed, deliberately left untouched by a theme) -- only label/grid + background.
      return { ...widget, style: { ...widget.style, gridColor: label, axisLabelColor: label, backgroundColor, backgroundOpacity } }
    case 'gForceDiagram':
      return {
        ...widget,
        style: { ...widget.style, dotColor: accent, trailColor: accent, ringColor: label, axisLabelColor: label, backgroundColor, backgroundOpacity }
      }
    case 'rollAngle':
      return { ...widget, style: { ...widget.style, color: primary, barColor: accent, labelColor: label, backgroundColor, backgroundOpacity } }
    case 'sessionSummary':
      return { ...widget, style: { ...widget.style, color: primary, accentColor: accent, labelColor: label, backgroundColor, backgroundOpacity } }
    case 'lapConsistency':
      return { ...widget, style: { ...widget.style, barColor: label, bestLapColor: accent, labelColor: label, backgroundColor, backgroundOpacity } }
  }
}
