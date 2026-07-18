import { DEFAULT_SPEED_SMOOTHING_MS } from '../telemetry/sampleAt'
import type { WidgetInstance } from '../types'

/** The Gaussian smoothing window (ms) a widget wants applied to sampled speed, if it displays speed at all. */
export function speedSmoothingMsFor(widget: WidgetInstance): number {
  switch (widget.type) {
    case 'speedometerAnalog':
    case 'speedometerDigital':
      return widget.style.smoothingMs
    default:
      return DEFAULT_SPEED_SMOOTHING_MS
  }
}
