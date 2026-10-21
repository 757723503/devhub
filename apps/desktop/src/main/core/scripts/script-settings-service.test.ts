import { mkdtemp, readFile, rm, writeFile } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { emptyScriptHooksDocument, type DevhubEvent } from '@devhub/shared'
import { createDefaultDetectors } from '../detectors/detect-scripts'
import {
  createFavoriteService,
  emptyFavoritesFile,
  type FavoritesFile
} from '../favorites/favorite-service'
import {
  createOverlayScriptService,
  emptyOverlayScriptsFile,
  type OverlayScriptsFile
} from '../overlay-scripts/overlay-script-service'
import type { JsonStore } from '../storage/json-store'
import { createScriptService } from './script-service'
import { createScriptSettingsService } from './script-settings-service'

const memory = <T>(initial: T): JsonStore<T> => {
  let saved = structuredClone(initial)
  return {
    read: async () => structuredClone(saved),
    write: async (value) => {
      saved = structuredClone(value)
    }
  }
}

describe('createScriptSettingsService', () => {
  let dir: string

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'devhub-script-settings-'))
  })

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true })
  })

  const make = () => {
    const events: DevhubEvent[] = []
    const scripts = createScriptService({
      projects: {
        async get(id) {
          if (id !== 'p1') throw new Error('missing')
          return { id: 'p1', name: 'repo', path: dir, addedAt: '2026-10-21T00:00:00.000Z' }
        }
      },
      detectors: createDefaultDetectors('linux')
    })
    const favorites = createFavoriteService({
      store: memory<FavoritesFile>(emptyFavoritesFile()),
      emit: (event) => events.push(event)
    })
    const overlayScripts = createOverlayScriptService({
      store: memory<OverlayScriptsFile>(emptyOverlayScriptsFile()),
      emit: (event) => events.push(event)
    })
    return {
      events,
      scripts,
      service: createScriptSettingsService({ scripts, favorites, overlayScripts })
    }
  }

  it('writes an npm script annotation and does not invent a second script', async () => {
    await writeFile(join(dir, 'package.json'), JSON.stringify({ scripts: { dev: 'vite' } }))
    await writeFile(
      join(dir, '.devhub.yaml'),
      'scripts:\n  dev:\n    notify:\n      onReady:\n        toast: true\n'
    )
    const { service, scripts, events } = make()
    const saved = await service.update('p1', 'npm:dev', {
      favorite: true,
      overlay: true,
      confirm: true,
      status: 'tstl',
      hooks: { hooks: { onStart: [{ actions: [{ type: 'toast' }] }] } }
    })
    expect(saved).toMatchObject({
      name: 'dev',
      source: 'npm',
      favorite: true,
      overlay: true,
      confirm: true,
      hasNotify: true,
      status: 'tstl'
    })
    expect(saved.hooks.hooks.onStart).toHaveLength(1)
    const text = await readFile(join(dir, '.devhub.yaml'), 'utf8')
    expect(text).toContain('toast: true')
    expect(text).not.toContain('command:')
    const listed = await scripts.list('p1')
    expect(listed.scripts.map((script) => script.id)).toEqual(['npm:dev'])
    const dev = listed.scripts[0]
    expect(dev?.command).toBe('npm run dev')
    expect(dev?.confirm).toBe(true)
    expect(dev?.hooks?.onStart).toHaveLength(1)
    expect(events.some((event) => event.type === 'favorites-updated')).toBe(true)
  })

  it('rejects a patch and a script name that cannot be a yaml key', async () => {
    await writeFile(join(dir, 'package.json'), JSON.stringify({ scripts: { dev: 'vite' } }))
    const { service, scripts } = make()
    await expect(service.update('p1', 'npm:dev', { favorite: true })).rejects.toMatchObject({
      code: 'INVALID_INPUT'
    })
    const longName = 'n'.repeat(61)
    const original = scripts.find.bind(scripts)
    scripts.find = async (projectId, scriptId) => {
      const found = await original(projectId, scriptId)
      return { ...found, script: { ...found.script, name: longName } }
    }
    await expect(
      service.update('p1', 'npm:dev', {
        favorite: false,
        overlay: false,
        confirm: false,
        status: null,
        hooks: emptyScriptHooksDocument
      })
    ).rejects.toMatchObject({ code: 'INVALID_INPUT', message: '脚本名无法写入 .devhub.yaml' })
  })
})
