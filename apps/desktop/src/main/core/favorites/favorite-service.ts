import { z } from 'zod'
import {
  DevhubError,
  scriptFavoriteSchema,
  type DevhubEvent,
  type ScriptFavorite
} from '@devhub/shared'
import type { JsonStore } from '../storage/json-store'

export const favoritesFileSchema = z.object({
  version: z.literal(1),
  favorites: z.array(scriptFavoriteSchema).max(2000)
})
export type FavoritesFile = z.infer<typeof favoritesFileSchema>
export const emptyFavoritesFile = (): FavoritesFile => ({ version: 1, favorites: [] })

export interface FavoriteService {
  list(): Promise<ScriptFavorite[]>
  /** Remembers an explicit star or unstar. Returns the full list afterwards. */
  set(projectId: unknown, scriptId: unknown, favorite: unknown): Promise<ScriptFavorite[]>
}

export interface FavoriteServiceDeps {
  store: JsonStore<FavoritesFile>
  emit: (event: DevhubEvent) => void
}

const setInput = scriptFavoriteSchema

/**
 * Per-machine script stars (`favorites.json`). The project file's `favorite` flag is not stored
 * here; the UI treats a missing entry as that flag.
 */
export function createFavoriteService({ store, emit }: FavoriteServiceDeps): FavoriteService {
  let cache: ScriptFavorite[] | null = null
  let queue: Promise<unknown> = Promise.resolve()

  const load = async (): Promise<ScriptFavorite[]> => (cache ??= (await store.read()).favorites)

  const publish = async (favorites: ScriptFavorite[]): Promise<ScriptFavorite[]> => {
    await store.write({ version: 1, favorites })
    cache = favorites
    const snapshot = structuredClone(favorites)
    emit({ type: 'favorites-updated', favorites: snapshot })
    return snapshot
  }

  return {
    async list() {
      return structuredClone(await load())
    },

    set(projectId, scriptId, favorite) {
      const next = queue.then(async () => {
        const parsed = setInput.safeParse({ projectId, scriptId, favorite })
        if (!parsed.success) throw new DevhubError('INVALID_INPUT', '收藏参数无效')
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
