import { describe, expect, it } from 'vitest'
import { projectConfigSchema, type Script } from './domain'
import { applyScriptFileSettings } from './script-file'

const npmDev: Script = {
  id: 'npm:dev',
  name: 'dev',
  source: 'npm',
  command: 'npm run dev'
}

describe('applyScriptFileSettings', () => {
  it('copies hooks and flags onto a detected script without replacing its command', () => {
    const config = projectConfigSchema.parse({
      scripts: {
        dev: {
          favorite: true,
          confirm: true,
          overlay: false,
          status: 'webpack',
          hooks: { onStart: [{ actions: [{ type: 'toast' }], interval: 0 }] }
        }
      }
    })
    const [script] = applyScriptFileSettings([npmDev], config)
    expect(script?.command).toBe('npm run dev')
    expect(script?.favorite).toBe(true)
    expect(script?.confirm).toBe(true)
    expect(script?.overlay).toBe(false)
    expect(script?.outputStatus?.busy).toContain('Compiling')
    expect(script?.hooks?.onStart).toHaveLength(1)
  })

  it('leaves scripts that have no yaml entry untouched', () => {
    expect(applyScriptFileSettings([npmDev], projectConfigSchema.parse({}))).toEqual([npmDev])
    expect(applyScriptFileSettings([npmDev], null)).toEqual([npmDev])
  })
})
