import type { UpdateCheckResult } from '../../shared/types'

const REPO = 'dekiller82/telemetry-studio'
const REQUEST_TIMEOUT_MS = 5000

type Version = [number, number, number]

function parseVersion(raw: string): Version | null {
  const match = /^v?(\d+)\.(\d+)\.(\d+)/.exec(raw.trim())
  if (!match) return null
  return [Number(match[1]), Number(match[2]), Number(match[3])]
}

function isNewer(latest: Version, current: Version): boolean {
  for (let i = 0; i < 3; i++) {
    if (latest[i] !== current[i]) return latest[i] > current[i]
  }
  return false
}

/**
 * Compares the running app's version against the latest tagged GitHub release. Never throws and
 * never surfaces a network/parse error to the caller -- this is a best-effort convenience
 * notification, not core app data, so any failure (offline, GitHub unreachable, rate-limited,
 * malformed response) just means "no update info available right now," same as `readChangelog`.
 * Takes an injectable fetch so it can be unit tested without a real network call.
 */
export async function checkForUpdate(
  currentVersion: string,
  fetchImpl: typeof fetch = fetch
): Promise<UpdateCheckResult | null> {
  const current = parseVersion(currentVersion)
  if (!current) return null

  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
    let response: Response
    try {
      response = await fetchImpl(`https://api.github.com/repos/${REPO}/releases/latest`, {
        headers: { Accept: 'application/vnd.github+json' },
        signal: controller.signal
      })
    } finally {
      clearTimeout(timeout)
    }
    if (!response.ok) return null

    const data = (await response.json()) as { tag_name?: string; html_url?: string }
    if (!data.tag_name) return null
    const latest = parseVersion(data.tag_name)
    if (!latest) return null

    return {
      updateAvailable: isNewer(latest, current),
      currentVersion,
      latestVersion: `${latest[0]}.${latest[1]}.${latest[2]}`,
      releaseUrl: data.html_url ?? `https://github.com/${REPO}/releases/latest`
    }
  } catch {
    return null
  }
}
