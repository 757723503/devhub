import { describe, expect, it } from 'vitest'
import { isScriptFavorite, type ScriptFavorite } from './favorites'

const pins: ScriptFavorite[] = [
  { projectId: 'axe', scriptId: 'custom:全量dev', favorite: false },
  { projectId: 'axe', scriptId: 'npm:lint', favorite: true }
]

describe('isScriptFavorite', () => {
  it('uses the yaml flag when this machine has no choice', () => {
    expect(isScriptFavorite({ id: 'custom:同步拉取', favorite: true }, pins, 'axe')).toBe(true)
    expect(isScriptFavorite({ id: 'npm:test' }, [], 'axe')).toBe(false)
  })

  it('lets a stored choice override the yaml flag, and ignores other projects', () => {
    expect(isScriptFavorite({ id: 'custom:全量dev', favorite: true }, pins, 'axe')).toBe(false)
    expect(isScriptFavorite({ id: 'npm:lint' }, pins, 'axe')).toBe(true)
    expect(isScriptFavorite({ id: 'npm:lint' }, pins, 'other')).toBe(false)
  })
})
