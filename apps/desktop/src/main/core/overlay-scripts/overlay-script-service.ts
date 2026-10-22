import { z } from 'zod'
import {
  DevhubError,
  scriptOverlaySchema,
  type DevhubEvent,
  type ScriptOverlay
} from '@devhub/shared'
import type { JsonStore } from '../storage/json-store'

export const overlayScriptsFileSchema = z.object({
  version: z.literal(1),
  scripts: z.array(scriptOverlaySchema).max(2000)
})
export type OverlayScriptsFile = z.infer<typeof overlayScriptsFileSchema>
export const emptyOverlayScriptsFile = (): OverlayScriptsFile => ({ version: 1, scripts: [] })

export interface OverlayScriptService {
  list(): Promise<ScriptOverlay[]>
  /** Remembers whether this script is listed on the floating panel. Returns the full list. */
  set(projectId: unknown, scriptId: unknown, overlay: unknown): Promise<ScriptOverlay[]>
}

export interface OverlayScriptServiceDeps {
  store: JsonStore<OverlayScriptsFile>
  emit: (event: DevhubEvent) => void
}

/**
 * Per-machine choices for the panel's long-running list (`overlay-scripts.json`).
 * The project file's `overlay` flag is not stored here; a missing entry means that flag.
 */
export function createOverlayScriptService({
  store,
  emit
}: OverlayScriptServiceDeps): OverlayScriptService {
  let cache: ScriptOverlay[] | null = null
  let queue: Promise<unknown> = Promise.resolve()

  const load = async (): Promise<ScriptOverlay[]> => (cache ??= (await store.read()).scripts)

  const publish = async (scripts: ScriptOverlay[]): Promise<ScriptOverlay[]> => {
    await store.write({ version: 1, scripts })
    cache = scripts
    const snapshot = structuredClone(scripts)
    emit({ type: 'overlay-scripts-updated', scripts: snapshot })
    return snapshot
  }

  return {
    async list() {
      return structuredClone(await load())
    },

    set(projectId, scriptId, overlay) {
      const next = queue.then(async () => {
        const parsed = scriptOverlaySchema.safeParse({ projectId, scriptId, overlay })
        if (!parsed.success) throw new DevhubError('INVALID_INPUT', '悬浮面板参数无效')
        const current = await load()
        const others = current.filter(
          (item) =>
            item.projectId !== parsed.data.projectId || item.scriptId !== parsed.data.scriptId
        )
        return publish([...others, parsed.data])
      })
      queue = next.then(
        () => undefined,
        () => undefined
      )
      return next
    }
  }
}
