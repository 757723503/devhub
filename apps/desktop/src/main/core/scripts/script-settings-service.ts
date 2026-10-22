import { writeFile } from 'fs/promises'
import { join } from 'path'
import { z } from 'zod'
import {
  DevhubError,
  emptyScriptHooksDocument,
  isScriptFavorite,
  isScriptOnOverlay,
  scriptSettingsPatchSchema,
  scriptSettingsViewSchema,
  type ScriptSettingsView
} from '@devhub/shared'
import { configFileNames, loadProjectConfig } from '../detectors/config-detector'
import { readOptionalFile } from '../detectors/fs-utils'
import type { FavoriteService } from '../favorites/favorite-service'
import type { OverlayScriptService } from '../overlay-scripts/overlay-script-service'
import type { ScriptService } from './script-service'
import { updateScriptYaml } from './script-yaml'

export interface ScriptSettingsService {
  get(projectId: unknown, scriptId: unknown): Promise<ScriptSettingsView>
  update(projectId: unknown, scriptId: unknown, patch: unknown): Promise<ScriptSettingsView>
}

export interface ScriptSettingsServiceDeps {
  scripts: Pick<ScriptService, 'find'>
  favorites: Pick<FavoriteService, 'list' | 'set'>
  overlayScripts: Pick<OverlayScriptService, 'list' | 'set'>
}

const scriptNameSchema = z.string().trim().min(1).max(60)

/**
 * Reads and writes one script's settings in that project's `.devhub.yaml`.
 * Favorite and overlay are also stored on this machine, which is what the icons show.
 */
export function createScriptSettingsService({
  scripts,
  favorites,
  overlayScripts
}: ScriptSettingsServiceDeps): ScriptSettingsService {
  const viewOf = async (projectId: unknown, scriptId: unknown): Promise<ScriptSettingsView> => {
    const { project, script } = await scripts.find(projectId, scriptId)
    const loaded = await loadProjectConfig(project.path).catch(() => null)
    const entry = loaded?.config.scripts[script.name]
    const [starred, listed] = await Promise.all([favorites.list(), overlayScripts.list()])
    return scriptSettingsViewSchema.parse({
      name: script.name,
      source: script.source,
      hasNotify: Boolean(entry?.notify ?? script.notify),
      favorite: isScriptFavorite(script, starred, project.id),
      overlay: isScriptOnOverlay(script, listed, project.id),
      confirm: script.confirm === true,
      status: entry?.status ?? null,
      hooks: entry?.hooks ? { hooks: entry.hooks } : emptyScriptHooksDocument
    })
  }

  const readConfigText = async (dir: string): Promise<{ fileName: string; text: string }> => {
    for (const name of configFileNames) {
      const text = await readOptionalFile(join(dir, name))
      if (text !== null) return { fileName: name, text }
    }
    return { fileName: '.devhub.yaml', text: '' }
  }

  return {
    get: viewOf,

    async update(projectId, scriptId, patch) {
      const parsed = scriptSettingsPatchSchema.safeParse(patch)
      if (!parsed.success) throw new DevhubError('INVALID_INPUT', '脚本设置无效')
      const { project, script } = await scripts.find(projectId, scriptId)
      const name = scriptNameSchema.safeParse(script.name)
      if (!name.success || name.data !== script.name) {
        throw new DevhubError('INVALID_INPUT', '脚本名无法写入 .devhub.yaml')
      }
      const { fileName, text } = await readConfigText(project.path)
      let next: string
      try {
        next = updateScriptYaml(text, name.data, parsed.data)
      } catch (error) {
        const message = error instanceof Error ? error.message : '脚本设置无效'
        throw new DevhubError('INVALID_INPUT', message)
      }
      await writeFile(join(project.path, fileName), next, 'utf8')
      await favorites.set(project.id, script.id, parsed.data.favorite)
      await overlayScripts.set(project.id, script.id, parsed.data.overlay)
      return viewOf(project.id, script.id)
    }
  }
}
