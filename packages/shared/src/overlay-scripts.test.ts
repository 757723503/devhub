import { describe, expect, it } from 'vitest'
import { isScriptOnOverlay, type ScriptOverlay } from './overlay-scripts'

const pins: ScriptOverlay[] = [
  { projectId: 'axe', scriptId: 'custom:全量dev', overlay: false },
  { projectId: 'axe', scriptId: 'npm:lint', overlay: true }
]

describe('isScriptOnOverlay', () => {
  it('uses the yaml flag when this machine has no choice', () => {
    expect(isScriptOnOverlay({ id: 'custom:服务端watch', overlay: true }, pins, 'axe')).toBe(true)
    expect(isScriptOnOverlay({ id: 'custom:同步拉取' }, pins, 'axe')).toBe(false)
  })

  it('lets a stored choice hide a yaml entry or show a script the file did not list', () => {
    expect(isScriptOnOverlay({ id: 'custom:全量dev', overlay: true }, pins, 'axe')).toBe(false)
    expect(isScriptOnOverlay({ id: 'npm:lint' }, pins, 'axe')).toBe(true)
  })

  it('does not reuse another project’s choice', () => {
    expect(isScriptOnOverlay({ id: 'npm:lint', overlay: false }, pins, 'other')).toBe(false)
  })
})
