import { v4 as uuidv4 } from 'uuid'
import { DEFAULT_GPS_STYLE } from '../render/drawGpsWidget'
import { DEFAULT_SPEEDOMETER_STYLE } from '../render/drawSpeedometer'
import { DEFAULT_TIMER_STYLE } from '../render/drawTimer'
import { DEFAULT_SECTOR_TIMER_STYLE } from '../render/drawSectorTimer'
import { DEFAULT_DELTA_TIME_STYLE } from '../render/drawDeltaTime'
import { DEFAULT_PREDICTIVE_LAP_TIMER_STYLE } from '../render/drawPredictiveLapTimer'
import { DEFAULT_APEX_SPEED_CALLOUT_STYLE } from '../render/drawApexSpeedCallout'
import { DEFAULT_SPEED_DISTANCE_GRAPH_STYLE } from '../render/drawSpeedDistanceGraph'
import { DEFAULT_GFORCE_DIAGRAM_STYLE } from '../render/drawGForceDiagram'
import { DEFAULT_ROLL_ANGLE_STYLE } from '../render/drawRollAngle'
import { DEFAULT_SESSION_SUMMARY_STYLE } from '../render/drawSessionSummary'
import type {
  GpsTrackWidgetInstance,
  SpeedometerAnalogWidgetInstance,
  SpeedometerDigitalWidgetInstance,
  TimerWidgetInstance,
  SectorTimerWidgetInstance,
  DeltaTimeWidgetInstance,
  PredictiveLapTimerWidgetInstance,
  ApexSpeedCalloutWidgetInstance,
  SpeedDistanceGraphWidgetInstance,
  GForceDiagramWidgetInstance,
  RollAngleWidgetInstance,
  SessionSummaryWidgetInstance,
  WidgetInstance
} from '../types'

export function createGpsTrackWidget(): GpsTrackWidgetInstance {
  return {
    id: uuidv4(),
    type: 'gpsTrack',
    x: 0.04,
    y: 0.58,
    w: 0.26,
    h: 0.34,
    rotation: 0,
    zIndex: 1,
    style: { ...DEFAULT_GPS_STYLE }
  }
}

export function createSpeedometerAnalogWidget(): SpeedometerAnalogWidgetInstance {
  return {
    id: uuidv4(),
    type: 'speedometerAnalog',
    x: 0.72,
    y: 0.56,
    w: 0.22,
    h: 0.22,
    rotation: 0,
    zIndex: 1,
    style: { ...DEFAULT_SPEEDOMETER_STYLE }
  }
}

export function createSpeedometerDigitalWidget(): SpeedometerDigitalWidgetInstance {
  return {
    id: uuidv4(),
    type: 'speedometerDigital',
    x: 0.74,
    y: 0.06,
    w: 0.18,
    h: 0.1,
    rotation: 0,
    zIndex: 1,
    style: { ...DEFAULT_SPEEDOMETER_STYLE }
  }
}

export function createTimerWidget(): TimerWidgetInstance {
  return {
    id: uuidv4(),
    type: 'timer',
    x: 0.04,
    y: 0.06,
    // Sized for the F1-style timing tower (the default mode) rather than the compact plain-elapsed
    // look -- matches the auto-resize PropertyPanel already applies when switching an existing
    // elapsed-mode widget into laps mode.
    w: 0.24,
    h: 0.4,
    rotation: 0,
    zIndex: 1,
    style: { ...DEFAULT_TIMER_STYLE }
  }
}

export function createSectorTimerWidget(): SectorTimerWidgetInstance {
  return {
    id: uuidv4(),
    type: 'sectorTimer',
    x: 0.04,
    y: 0.2,
    w: 0.3,
    h: 0.1,
    rotation: 0,
    zIndex: 1,
    style: { ...DEFAULT_SECTOR_TIMER_STYLE }
  }
}

export function createDeltaTimeWidget(): DeltaTimeWidgetInstance {
  return {
    id: uuidv4(),
    type: 'deltaTime',
    x: 0.38,
    y: 0.06,
    w: 0.16,
    h: 0.11,
    rotation: 0,
    zIndex: 1,
    style: { ...DEFAULT_DELTA_TIME_STYLE }
  }
}

export function createPredictiveLapTimerWidget(): PredictiveLapTimerWidgetInstance {
  return {
    id: uuidv4(),
    type: 'predictiveLapTimer',
    x: 0.38,
    y: 0.2,
    w: 0.2,
    h: 0.14,
    rotation: 0,
    zIndex: 1,
    style: { ...DEFAULT_PREDICTIVE_LAP_TIMER_STYLE }
  }
}

export function createApexSpeedCalloutWidget(): ApexSpeedCalloutWidgetInstance {
  return {
    id: uuidv4(),
    type: 'apexSpeedCallout',
    x: 0.4,
    y: 0.4,
    w: 0.2,
    h: 0.14,
    rotation: 0,
    zIndex: 1,
    style: { ...DEFAULT_APEX_SPEED_CALLOUT_STYLE }
  }
}

export function createSpeedDistanceGraphWidget(): SpeedDistanceGraphWidgetInstance {
  return {
    id: uuidv4(),
    type: 'speedDistanceGraph',
    x: 0.36,
    y: 0.58,
    w: 0.34,
    h: 0.26,
    rotation: 0,
    zIndex: 1,
    style: { ...DEFAULT_SPEED_DISTANCE_GRAPH_STYLE }
  }
}

export function createGForceDiagramWidget(): GForceDiagramWidgetInstance {
  return {
    id: uuidv4(),
    type: 'gForceDiagram',
    x: 0.74,
    y: 0.32,
    w: 0.22,
    h: 0.3,
    rotation: 0,
    zIndex: 1,
    style: { ...DEFAULT_GFORCE_DIAGRAM_STYLE }
  }
}

export function createRollAngleWidget(): RollAngleWidgetInstance {
  return {
    id: uuidv4(),
    type: 'rollAngle',
    x: 0.74,
    y: 0.06,
    w: 0.22,
    h: 0.18,
    rotation: 0,
    zIndex: 1,
    style: { ...DEFAULT_ROLL_ANGLE_STYLE }
  }
}

export function createSessionSummaryWidget(): SessionSummaryWidgetInstance {
  return {
    id: uuidv4(),
    type: 'sessionSummary',
    // Sized as a real end-card, not a small corner widget -- centered, covering a large share of
    // the frame, matching how it's meant to be used (a full-screen-ish reveal near the very end).
    x: 0.2,
    y: 0.15,
    w: 0.6,
    h: 0.7,
    rotation: 0,
    zIndex: 10,
    style: { ...DEFAULT_SESSION_SUMMARY_STYLE }
  }
}

export function createWidget(type: WidgetInstance['type']): WidgetInstance {
  switch (type) {
    case 'gpsTrack':
      return createGpsTrackWidget()
    case 'speedometerAnalog':
      return createSpeedometerAnalogWidget()
    case 'speedometerDigital':
      return createSpeedometerDigitalWidget()
    case 'timer':
      return createTimerWidget()
    case 'sectorTimer':
      return createSectorTimerWidget()
    case 'deltaTime':
      return createDeltaTimeWidget()
    case 'predictiveLapTimer':
      return createPredictiveLapTimerWidget()
    case 'apexSpeedCallout':
      return createApexSpeedCalloutWidget()
    case 'speedDistanceGraph':
      return createSpeedDistanceGraphWidget()
    case 'gForceDiagram':
      return createGForceDiagramWidget()
    case 'rollAngle':
      return createRollAngleWidget()
    case 'sessionSummary':
      return createSessionSummaryWidget()
  }
}
