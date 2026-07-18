import { mkdtempSync, writeFileSync, existsSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { describe, expect, it } from 'vitest'
import { hasAutosave, clearAutosave } from './autosave'

function tempAutosavePath(): { dir: string; projectPath: string; telemetryPath: string } {
  const dir = mkdtempSync(join(tmpdir(), 'gpo-autosave-'))
  const projectPath = join(dir, 'autosave.gpo')
  const telemetryPath = join(dir, 'autosave.gpo.telemetry.json')
  return { dir, projectPath, telemetryPath }
}

describe('autosave', () => {
  it('reports no autosave when the file does not exist', () => {
    const { projectPath } = tempAutosavePath()
    expect(hasAutosave(projectPath)).toBe(false)
  })

  it('reports an autosave exists once the file is written', () => {
    const { projectPath } = tempAutosavePath()
    writeFileSync(projectPath, '{}')
    expect(hasAutosave(projectPath)).toBe(true)
  })

  it('clearAutosave removes both the project file and its telemetry sibling', async () => {
    const { projectPath, telemetryPath } = tempAutosavePath()
    writeFileSync(projectPath, '{}')
    writeFileSync(telemetryPath, '{}')

    await clearAutosave(projectPath)

    expect(existsSync(projectPath)).toBe(false)
    expect(existsSync(telemetryPath)).toBe(false)
  })

  it('clearAutosave is a safe no-op when nothing exists yet', async () => {
    const { projectPath } = tempAutosavePath()
    await expect(clearAutosave(projectPath)).resolves.toBeUndefined()
  })
})
