import { readFile, writeFile } from 'fs/promises'
import { app } from 'electron'
import { join } from 'path'
import { v4 as uuidv4 } from 'uuid'
import { z } from 'zod'
import { widgetSchema } from '../../shared/project/schema'
import type { WidgetInstance, WidgetLayoutPreset } from '../../shared/types'

const layoutPresetSchema = z.object({
  id: z.string(),
  name: z.string(),
  createdAt: z.string(),
  widgets: z.array(widgetSchema)
})
const layoutPresetsFileSchema = z.array(layoutPresetSchema)

/** Real location used by the IPC handlers; kept separate from the functions below (which all take
 *  an explicit path) so those can be unit tested against a temp file instead of needing to mock
 *  Electron's `app` module -- same dependency-injection shape as project/persistence.ts already uses. */
export function defaultLayoutPresetsFilePath(): string {
  return join(app.getPath('userData'), 'layout-presets.json')
}

/** Missing/corrupt file both just mean "no saved layouts yet" -- never a hard error, since this is
 *  a convenience feature, not core project data. */
async function readLayoutPresets(filePath: string): Promise<WidgetLayoutPreset[]> {
  try {
    const raw = await readFile(filePath, 'utf-8')
    const parsed = layoutPresetsFileSchema.safeParse(JSON.parse(raw))
    return parsed.success ? (parsed.data as WidgetLayoutPreset[]) : []
  } catch {
    // Missing file, unreadable file, or unparseable/invalid JSON content -- all just mean "no
    // saved layouts yet" for this convenience feature, never a hard error.
    return []
  }
}

async function writeLayoutPresets(filePath: string, presets: WidgetLayoutPreset[]): Promise<void> {
  await writeFile(filePath, JSON.stringify(presets, null, 2))
}

export async function listLayoutPresets(filePath: string): Promise<WidgetLayoutPreset[]> {
  return readLayoutPresets(filePath)
}

export async function saveLayoutPreset(filePath: string, name: string, widgets: WidgetInstance[]): Promise<WidgetLayoutPreset[]> {
  const presets = await readLayoutPresets(filePath)
  presets.push({ id: uuidv4(), name, createdAt: new Date().toISOString(), widgets })
  await writeLayoutPresets(filePath, presets)
  return presets
}

export async function deleteLayoutPreset(filePath: string, id: string): Promise<WidgetLayoutPreset[]> {
  const presets = (await readLayoutPresets(filePath)).filter((p) => p.id !== id)
  await writeLayoutPresets(filePath, presets)
  return presets
}
