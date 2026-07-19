import { mkdtempSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { describe, expect, it } from 'vitest'
import { readChangelog } from './changelog'

describe('readChangelog', () => {
  it('returns the file contents when it exists', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'gpo-changelog-'))
    const filePath = join(dir, 'CHANGELOG.md')
    writeFileSync(filePath, '# Changelog\n\n## [1.0.0]\n- did a thing\n')
    expect(await readChangelog(filePath)).toBe('# Changelog\n\n## [1.0.0]\n- did a thing\n')
  })

  it('returns an empty string instead of throwing when the file is missing', async () => {
    expect(await readChangelog('C:/definitely/does/not/exist/CHANGELOG.md')).toBe('')
  })
})
