import { parse } from 'yaml'
import { describe, expect, it } from 'vitest'
import { emptyScriptHooksDocument, type ScriptSettingsPatch } from '@devhub/shared'
import { updateScriptYaml } from './script-yaml'

const base = `# keep me
scripts:
  全量dev:
    command: yarn dev # the command
    notify:
      onReady:
        sound: default
        toast: true
`

const patch = (over: Partial<ScriptSettingsPatch> = {}): ScriptSettingsPatch => ({
  favorite: true,
  overlay: true,
  confirm: false,
  status: 'webpack',
  hooks: {
    hooks: {
      onStart: [{ actions: [{ type: 'toast' }], interval: 0 }]
    }
  },
  ...over
})

describe('updateScriptYaml', () => {
  it('writes flags and hooks under the script and keeps command, notify, and comments', () => {
    const next = updateScriptYaml(base, '全量dev', patch())
    expect(next).toContain('# keep me')
    expect(next).toContain('command: yarn dev')
    expect(next).toContain('sound: default')
    const raw = parse(next) as {
      scripts: { 全量dev: { favorite: boolean; hooks: { onStart: unknown[] }; notify: unknown } }
    }
    expect(raw.scripts.全量dev.favorite).toBe(true)
    expect(raw.scripts.全量dev.hooks.onStart).toHaveLength(1)
    expect(raw.scripts.全量dev.notify).toBeTruthy()
  })

  it('drops empty hooks and a cleared status, and can create a file', () => {
    const next = updateScriptYaml(
      '',
      'dev',
      patch({
        favorite: false,
        overlay: false,
        confirm: true,
        status: null,
        hooks: emptyScriptHooksDocument
      })
    )
    const raw = parse(next) as { scripts: { dev: Record<string, unknown> } }
    expect(raw.scripts.dev).toEqual({ favorite: false, overlay: false, confirm: true })
    expect(next).not.toContain('hooks:')
    expect(next).not.toContain('status:')
  })

  it('refuses a document that is not valid YAML', () => {
    expect(() => updateScriptYaml('scripts: [\n', 'dev', patch())).toThrow(/不是有效的 YAML/)
  })
})
