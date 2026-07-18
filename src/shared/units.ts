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
