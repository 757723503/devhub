import { describe, expect, it } from 'vitest'
import { DevhubError, type DevhubEvent, type ScriptFavorite } from '@devhub/shared'
import type { JsonStore } from '../storage/json-store'
import { createFavoriteService, emptyFavoritesFile, type FavoritesFile } from './favorite-service'

const memoryStore = (initial: FavoritesFile = emptyFavoritesFile()) => {
  let saved = structuredClone(initial)
  const store: JsonStore<FavoritesFile> & { saved: () => FavoritesFile } = {
    read: async () => structuredClone(saved),
    write: async (value) => {
      saved = structuredClone(value)
    },
    saved: () => saved
  }
  return store
}

describe('createFavoriteService', () => {
  it('stores a star, replaces it, and announces the whole list', async () => {
    const store = memoryStore()
    const events: DevhubEvent[] = []
    const service = createFavoriteService({ store, emit: (event) => events.push(event) })

    await expect(service.list()).resolves.toEqual([])
    const starred = await service.set('axe', 'custom:全量dev', true)
    expect(starred).toEqual([{ projectId: 'axe', scriptId: 'custom:全量dev', favorite: true }])
    const unstarred = await service.set('axe', 'custom:全量dev', false)
    expect(unstarred).toEqual([{ projectId: 'axe', scriptId: 'custom:全量dev', favorite: false }])
    expect(store.saved().favorites).toEqual(unstarred)
    expect(events.at(-1)).toEqual({ type: 'favorites-updated', favorites: unstarred })
  })

  it('keeps other scripts and rejects a bad id', async () => {
    const existing: ScriptFavorite = { projectId: 'axe', scriptId: 'npm:lint', favorite: true }
    const service = createFavoriteService({
      store: memoryStore({ version: 1, favorites: [existing] }),
      emit: () => undefined
    })
    await expect(service.set('axe', 'npm:test', true)).resolves.toEqual([
      existing,
      { projectId: 'axe', scriptId: 'npm:test', favorite: true }
    ])
    await expect(service.set('', 'npm:test', true)).rejects.toBeInstanceOf(DevhubError)
  })
})
