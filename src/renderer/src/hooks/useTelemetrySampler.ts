import { useMemo } from 'react'
import { createTelemetrySampler, type TelemetrySampler } from '@shared/telemetry/sampleAt'
import type { ImportResult } from '@shared/types'

export function useTelemetrySampler(imported: ImportResult | null): TelemetrySampler | null {
  return useMemo(() => (imported ? createTelemetrySampler(imported.telemetry) : null), [imported])
}
