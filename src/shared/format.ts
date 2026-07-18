/** Formats milliseconds as `mm:ss` or `mm:ss.SS` when `withCentis` is true. */
export function formatTime(ms: number, withCentis = false): string {
  const totalMs = Math.max(0, Math.round(ms))
  const minutes = Math.floor(totalMs / 60000)
  const seconds = Math.floor((totalMs % 60000) / 1000)
  const centis = Math.floor((totalMs % 1000) / 10)

  const mm = String(minutes).padStart(2, '0')
  const ss = String(seconds).padStart(2, '0')
  if (!withCentis) return `${mm}:${ss}`
  return `${mm}:${ss}.${String(centis).padStart(2, '0')}`
}
