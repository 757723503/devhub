import { describe, expect, it } from 'vitest'
import { projectConfigSchema } from './domain'
import {
  hooksDocumentSchema,
  planHookActions,
  collectHookRules,
  hookEventInfo,
  hookProcessEnv,
  hookStdin,
  notifyRules
} from './hooks'
import { resolveNotify } from './notify'

const sample = {
  hooks: {
    onReady: [
      {
        match: { project: 'axe_king', script: '全量dev' },
        actions: [
          { type: 'sound', file: 'default' },
          { type: 'toast' },
          { type: 'command', command: 'yarn launch axe_king s1-1', cwd: 'project' }
        ]
      }
    ]
  }
}

describe('hooksDocumentSchema', () => {
  it('accepts the settings document and rejects a bad sound', () => {
    expect(hooksDocumentSchema.parse(sample)).toEqual(sample)
    expect(hooksDocumentSchema.parse({ hooks: {} })).toEqual({ hooks: {} })
    expect(
      hooksDocumentSchema.safeParse({
        hooks: { onReady: [{ actions: [{ type: 'sound', file: 'beep.mp3' }] }] }
      }).success
    ).toBe(false)
    expect(hooksDocumentSchema.safeParse({ hooks: { onReady: [{ actions: [] }] } }).success).toBe(
      false
    )
  })

  it('accepts the same hooks object in a project file', () => {
    const parsed = projectConfigSchema.parse({
      hooks: sample.hooks,
      scripts: { dev: { command: 'yarn dev' } }
    })
    expect(parsed.hooks?.onReady?.[0]?.actions).toHaveLength(3)
  })
})

describe('notify shorthand', () => {
  it('becomes ready and error rules for that script', () => {
    const notify = resolveNotify({
      onReady: { sound: 'default', toast: true },
      onError: { sound: 'error', run: 'yarn launch axe_king s1-1' },
      firstBuild: false,
      interval: 0
    })
    expect(notifyRules(notify, '全量dev')).toEqual([
      {
        id: 'notify:onReady',
        rule: {
          match: { script: '全量dev' },
          actions: [{ type: 'sound', file: 'default' }, { type: 'toast' }],
          interval: 0,
          firstBuild: false
        }
      },
      {
        id: 'notify:onError',
        rule: {
          match: { script: '全量dev' },
          actions: [
            { type: 'sound', file: 'error' },
            { type: 'command', command: 'yarn launch axe_king s1-1', cwd: 'project' }
          ],
          interval: 0
        }
      }
    ])
  })
})

describe('planHookActions', () => {
  const rules = collectHookRules({
    event: 'onReady',
    globalHooks: hooksDocumentSchema.parse(sample),
    projectHooks: {},
    notify: null,
    scriptName: '全量dev'
  })

  const plan = (over: Partial<Parameters<typeof planHookActions>[1]> = {}) =>
    planHookActions(rules, {
      event: 'onReady',
      projectName: 'axe_king',
      scriptName: '全量dev',
      seenReady: false,
      now: 10_000,
      lastAt: new Map(),
      ...over
    })

  it('fires a matching rule and then waits out the default interval', () => {
    const first = plan()
    expect(first.planned.map((entry) => entry.action.type)).toEqual(['sound', 'toast', 'command'])
    const lastAt = new Map(first.clocks.map((clock) => [clock.id, clock.at]))
    const again = plan({ seenReady: true, now: 11_000, lastAt })
    expect(again.planned).toEqual([])
    const later = plan({ seenReady: true, now: 25_000, lastAt })
    expect(later.planned).toHaveLength(3)
  })

  it('skips a different project, and a test fire does not', () => {
    expect(plan({ projectName: 'other' }).planned).toEqual([])
    expect(plan({ projectName: 'other', test: true }).planned).toHaveLength(3)
  })

  it('skips the first ready when firstBuild is false', () => {
    const notify = resolveNotify({ onReady: { toast: true }, firstBuild: false, interval: 0 })
    const ready = collectHookRules({
      event: 'onReady',
      globalHooks: { hooks: {} },
      projectHooks: {},
      notify,
      scriptName: '全量dev'
    })
    const first = planHookActions(ready, {
      event: 'onReady',
      projectName: 'axe_king',
      scriptName: '全量dev',
      seenReady: false,
      now: 1,
      lastAt: new Map()
    })
    expect(first.planned).toEqual([])
    expect(first.seenReady).toBe(true)
    const second = planHookActions(ready, {
      event: 'onReady',
      projectName: 'axe_king',
      scriptName: '全量dev',
      seenReady: true,
      now: 2,
      lastAt: new Map()
    })
    expect(second.planned.map((entry) => entry.action.type)).toEqual(['toast'])
  })
})

describe('hook event payload', () => {
  it('puts the exit code on stdin and in the env', () => {
    const info = hookEventInfo({
      event: 'onExit',
      project: 'axe_king',
      script: '全量dev',
      exitCode: 3,
      test: false
    })
    expect(JSON.parse(hookStdin(info))).toEqual({
      event: 'onExit',
      project: 'axe_king',
      script: '全量dev',
      status: 'exited',
      exitCode: 3,
      test: false
    })
    expect(hookProcessEnv(info)).toEqual({
      DEVHUB_EVENT: 'onExit',
      DEVHUB_PROJECT: 'axe_king',
      DEVHUB_SCRIPT: '全量dev',
      DEVHUB_STATUS: 'exited',
      DEVHUB_EXIT_CODE: '3'
    })
    const ready = hookEventInfo({
      event: 'onReady',
      project: 'axe_king',
      script: '全量dev',
      exitCode: 3,
      test: false
    })
    expect(ready.exitCode).toBeNull()
    expect(hookProcessEnv(ready).DEVHUB_EXIT_CODE).toBe('')
    expect(ready.status).toBe('ready')
  })
})
