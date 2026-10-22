import type { ProjectConfig, Script } from './domain'
import { scriptHooksAreEmpty } from './hooks'
import { resolveNotify } from './notify'
import { resolveOutputStatus } from './output-status'

/**
 * Copies per-script fields from `.devhub.yaml` onto every detected script of the same name.
 * An entry without `command` is only an annotation, so an npm script keeps its own command.
 */
export function applyScriptFileSettings(
  scripts: readonly Script[],
  config: ProjectConfig | null
): Script[] {
  if (!config) return [...scripts]
  return scripts.map((script) => {
    const entry = config.scripts[script.name]
    if (!entry) return script
    const outputStatus = entry.status ? resolveOutputStatus(entry.status) : undefined
    const notify = entry.notify ? resolveNotify(entry.notify) : undefined
    const hooks =
      entry.hooks && !scriptHooksAreEmpty({ hooks: entry.hooks }) ? entry.hooks : undefined
    return {
      ...script,
      ...(entry.confirm !== undefined ? { confirm: entry.confirm } : {}),
      ...(entry.favorite !== undefined ? { favorite: entry.favorite } : {}),
      ...(entry.overlay !== undefined ? { overlay: entry.overlay } : {}),
      ...(outputStatus ? { outputStatus } : {}),
      ...(notify ? { notify } : {}),
      ...(hooks ? { hooks } : {})
    }
  })
}
