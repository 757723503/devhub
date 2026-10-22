import type { HookEventMap } from '@devhub/shared'
import { loadProjectConfig } from '../detectors/config-detector'

/** Hooks from the project file. A missing or unreadable file contributes nothing. */
export async function readProjectHooks(dir: string): Promise<HookEventMap> {
  try {
    const loaded = await loadProjectConfig(dir)
    return loaded?.config.hooks ?? {}
  } catch (error) {
    console.warn('[hooks] could not read project hooks', error)
    return {}
  }
}
