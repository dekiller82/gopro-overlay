import { readFile, writeFile } from 'fs/promises'
import { app } from 'electron'
import { join, basename } from 'path'
import { z } from 'zod'
import type { RecentProject } from '../../shared/types'

const MAX_RECENT_PROJECTS = 10

const recentProjectSchema = z.object({
  path: z.string(),
  name: z.string(),
  lastOpenedAt: z.string()
})
const recentProjectsFileSchema = z.array(recentProjectSchema)

/** Real location used by the IPC handlers; kept separate from the functions below (which all take
 *  an explicit path) so those can be unit tested against a temp file instead of needing to mock
 *  Electron's `app` module -- same shape as layoutPresets.ts/autosave.ts. */
export function defaultRecentProjectsFilePath(): string {
  return join(app.getPath('userData'), 'recent-projects.json')
}

/** Missing/corrupt file both just mean "no recent projects yet" -- never a hard error, since this
 *  is a convenience feature, not core project data. */
async function readRecentProjects(filePath: string): Promise<RecentProject[]> {
  try {
    const raw = await readFile(filePath, 'utf-8')
    const parsed = recentProjectsFileSchema.safeParse(JSON.parse(raw))
    return parsed.success ? parsed.data : []
  } catch {
    return []
  }
}

async function writeRecentProjects(filePath: string, projects: RecentProject[]): Promise<void> {
  await writeFile(filePath, JSON.stringify(projects, null, 2))
}

export async function listRecentProjects(filePath: string): Promise<RecentProject[]> {
  return readRecentProjects(filePath)
}

/** Adds/moves a project to the front of the list (most-recently-opened first), deduping by path --
 *  opening (or saving) an already-listed project just refreshes its position and timestamp rather
 *  than creating a duplicate entry. Capped at MAX_RECENT_PROJECTS, oldest dropped first. */
export async function addRecentProject(filePath: string, projectPath: string): Promise<RecentProject[]> {
  const existing = await readRecentProjects(filePath)
  const withoutThisOne = existing.filter((p) => p.path !== projectPath)
  const updated = [{ path: projectPath, name: basename(projectPath), lastOpenedAt: new Date().toISOString() }, ...withoutThisOne].slice(
    0,
    MAX_RECENT_PROJECTS
  )
  await writeRecentProjects(filePath, updated)
  return updated
}

/** Called when opening a listed project fails (e.g. the file was moved/deleted since) -- removes it
 *  so a stale entry doesn't keep failing every time it's clicked. */
export async function removeRecentProject(filePath: string, projectPath: string): Promise<RecentProject[]> {
  const updated = (await readRecentProjects(filePath)).filter((p) => p.path !== projectPath)
  await writeRecentProjects(filePath, updated)
  return updated
}
