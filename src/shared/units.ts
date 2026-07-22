export type SpeedUnit = 'kmh' | 'mph' | 'kn'

const MPS_TO_KMH = 3.6
const MPS_TO_MPH = 2.2369362921
const MPS_TO_KN = 1.9438444924

export function convertSpeed(metersPerSecond: number, unit: SpeedUnit): number {
  switch (unit) {
    case 'kmh':
      return metersPerSecond * MPS_TO_KMH
    case 'mph':
      return metersPerSecond * MPS_TO_MPH
    case 'kn':
      return metersPerSecond * MPS_TO_KN
  }
}

/** Inverse of convertSpeed -- used where a user enters a speed in their display unit (e.g. the
 *  Acceleration Timer's editable target-speed list) but the canonical stored value needs to stay in
 *  m/s, matching every other speed threshold field in this app (ApexSpeedCallout's minDropMps, etc). */
export function convertToMps(value: number, unit: SpeedUnit): number {
  switch (unit) {
    case 'kmh':
      return value / MPS_TO_KMH
    case 'mph':
      return value / MPS_TO_MPH
    case 'kn':
      return value / MPS_TO_KN
  }
}

export function speedUnitLabel(unit: SpeedUnit): string {
  switch (unit) {
    case 'kmh':
      return 'km/h'
    case 'mph':
      return 'mph'
    case 'kn':
      return 'kn'
  }
}

/** 'mph' means imperial (miles), anything else metric (km) -- same convention every other
 *  distance-displaying field in this app already follows (SpeedUnit doubles as a metric/imperial
 *  switch, not just a literal speed unit). */
export function formatDistance(meters: number, unit: SpeedUnit): string {
  if (unit === 'mph') {
    const miles = meters / 1609.344
    return `${miles.toFixed(miles < 10 ? 2 : 1)} mi`
  }
  const km = meters / 1000
  return `${km.toFixed(km < 10 ? 2 : 1)} km`
}
