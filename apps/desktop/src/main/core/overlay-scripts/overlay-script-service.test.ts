import { describe, expect, it } from 'vitest'
import { DevhubError, type DevhubEvent, type ScriptOverlay } from '@devhub/shared'
import type { JsonStore } from '../storage/json-store'
import {
  createOverlayScriptService,
  emptyOverlayScriptsFile,
  type OverlayScriptsFile
} from './overlay-script-service'

const memoryStore = (initial: OverlayScriptsFile = emptyOverlayScriptsFile()) => {
  let saved = structuredClone(initial)
  const store: JsonStore<OverlayScriptsFile> & { saved: () => OverlayScriptsFile } = {
    read: async () => structuredClone(saved),
    write: async (value) => {
      saved = structuredClone(value)
    },
    saved: () => saved
  }
  return store
}

describe('createOverlayScriptService', () => {
  it('stores a choice, replaces it, and announces the whole list', async () => {
    const store = memoryStore()
    const events: DevhubEvent[] = []
    const service = createOverlayScriptService({ store, emit: (event) => events.push(event) })

    await expect(service.list()).resolves.toEqual([])
    const shown = await service.set('axe', 'custom:全量dev', true)
    expect(shown).toEqual([{ projectId: 'axe', scriptId: 'custom:全量dev', overlay: true }])
    const hidden = await service.set('axe', 'custom:全量dev', false)
    expect(hidden).toEqual([{ projectId: 'axe', scriptId: 'custom:全量dev', overlay: false }])
    expect(store.saved().scripts).toEqual(hidden)
    expect(events.at(-1)).toEqual({ type: 'overlay-scripts-updated', scripts: hidden })
  })

  it('keeps other scripts and rejects a bad id', async () => {
    const existing: ScriptOverlay = { projectId: 'axe', scriptId: 'npm:lint', overlay: true }
    const service = createOverlayScriptService({
      store: memoryStore({ version: 1, scripts: [existing] }),
      emit: () => undefined
    })
    await expect(service.set('axe', 'npm:test', true)).resolves.toEqual([
      existing,
      { projectId: 'axe', scriptId: 'npm:test', overlay: true }
    ])
    await expect(service.set('axe', '', true)).rejects.toBeInstanceOf(DevhubError)
  })
})
