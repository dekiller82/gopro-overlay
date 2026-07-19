import { describe, expect, it } from 'vitest'
import { checkForUpdate } from './updateCheck'

function fakeFetch(response: { ok: boolean; json?: () => Promise<unknown> }): typeof fetch {
  return (async () => response) as unknown as typeof fetch
}

describe('checkForUpdate', () => {
  it('reports an available update when the latest release tag is newer', async () => {
    const fetchImpl = fakeFetch({ ok: true, json: async () => ({ tag_name: 'v0.2.0', html_url: 'https://example.com/releases/v0.2.0' }) })
    const result = await checkForUpdate('0.1.3', fetchImpl)
    expect(result).toEqual({
      updateAvailable: true,
      currentVersion: '0.1.3',
      latestVersion: '0.2.0',
      releaseUrl: 'https://example.com/releases/v0.2.0'
    })
  })

  it('reports no update available when already on the latest version', async () => {
    const fetchImpl = fakeFetch({ ok: true, json: async () => ({ tag_name: 'v0.1.3', html_url: 'https://example.com/releases/v0.1.3' }) })
    const result = await checkForUpdate('0.1.3', fetchImpl)
    expect(result?.updateAvailable).toBe(false)
  })

  it('reports no update available when running a newer version than the latest release', async () => {
    const fetchImpl = fakeFetch({ ok: true, json: async () => ({ tag_name: 'v0.1.0' }) })
    const result = await checkForUpdate('0.2.0', fetchImpl)
    expect(result?.updateAvailable).toBe(false)
  })

  it('compares by full semver, not just the first differing digit', async () => {
    const fetchImpl = fakeFetch({ ok: true, json: async () => ({ tag_name: 'v1.2.10' }) })
    const result = await checkForUpdate('1.2.9', fetchImpl)
    expect(result?.updateAvailable).toBe(true)
  })

  it('returns null instead of throwing when the request fails', async () => {
    const fetchImpl = (async () => {
      throw new Error('network down')
    }) as unknown as typeof fetch
    expect(await checkForUpdate('0.1.3', fetchImpl)).toBeNull()
  })

  it('returns null when the response is not ok', async () => {
    const fetchImpl = fakeFetch({ ok: false })
    expect(await checkForUpdate('0.1.3', fetchImpl)).toBeNull()
  })

  it('returns null when the response has no tag_name', async () => {
    const fetchImpl = fakeFetch({ ok: true, json: async () => ({}) })
    expect(await checkForUpdate('0.1.3', fetchImpl)).toBeNull()
  })

  it('returns null when the current version string cannot be parsed', async () => {
    const fetchImpl = fakeFetch({ ok: true, json: async () => ({ tag_name: 'v0.1.3' }) })
    expect(await checkForUpdate('not-a-version', fetchImpl)).toBeNull()
  })
})
