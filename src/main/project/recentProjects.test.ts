import { mkdtempSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { describe, expect, it } from 'vitest'
import { listRecentProjects, addRecentProject, removeRecentProject } from './recentProjects'

function tempRecentProjectsPath(): string {
  const dir = mkdtempSync(join(tmpdir(), 'gpo-recent-'))
  return join(dir, 'recent-projects.json')
}

describe('recentProjects', () => {
  it('returns an empty list when no file exists yet', async () => {
    expect(await listRecentProjects(tempRecentProjectsPath())).toEqual([])
  })

  it('adds a project to the front of the list', async () => {
    const filePath = tempRecentProjectsPath()
    const updated = await addRecentProject(filePath, '/projects/karting-session.gpo')
    expect(updated).toHaveLength(1)
    expect(updated[0].path).toBe('/projects/karting-session.gpo')
    expect(updated[0].name).toBe('karting-session.gpo')
  })

  it('moves an already-listed project back to the front instead of duplicating it', async () => {
    const filePath = tempRecentProjectsPath()
    await addRecentProject(filePath, '/projects/a.gpo')
    await addRecentProject(filePath, '/projects/b.gpo')
    const afterReopeningA = await addRecentProject(filePath, '/projects/a.gpo')

    expect(afterReopeningA).toHaveLength(2)
    expect(afterReopeningA[0].path).toBe('/projects/a.gpo')
    expect(afterReopeningA[1].path).toBe('/projects/b.gpo')
  })

  it('caps the list at 10 entries, dropping the oldest', async () => {
    const filePath = tempRecentProjectsPath()
    let latest = await listRecentProjects(filePath)
    for (let i = 0; i < 12; i++) {
      latest = await addRecentProject(filePath, `/projects/${i}.gpo`)
    }
    expect(latest).toHaveLength(10)
    expect(latest[0].path).toBe('/projects/11.gpo') // most recent
    expect(latest.find((p) => p.path === '/projects/0.gpo')).toBeUndefined() // oldest dropped
  })

  it('removes a project by path (e.g. when its file has gone missing)', async () => {
    const filePath = tempRecentProjectsPath()
    await addRecentProject(filePath, '/projects/a.gpo')
    await addRecentProject(filePath, '/projects/b.gpo')
    const afterRemove = await removeRecentProject(filePath, '/projects/a.gpo')
    expect(afterRemove.map((p) => p.path)).toEqual(['/projects/b.gpo'])
  })

  it('treats a corrupt file as empty rather than throwing', async () => {
    const filePath = tempRecentProjectsPath()
    const { writeFileSync } = await import('fs')
    writeFileSync(filePath, 'not valid json{{{')
    expect(await listRecentProjects(filePath)).toEqual([])
  })
})
