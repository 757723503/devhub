import { beforeEach, describe, expect, it } from 'vitest'
import {
  defaultSettings,
  resolveNotify,
  type DevhubEvent,
  type Run,
  type ScriptHookEventMap,
  type ScriptNotify
} from '@devhub/shared'
import type { HookCommandRequest as CommandRequest } from './hook-command'
import { createHookRunner } from './hook-runner'

const notify: ScriptNotify = resolveNotify({
  onReady: { sound: 'default', toast: true },
  onError: { sound: 'error', toast: true, run: 'yarn launch axe_king s1-1' },
  firstBuild: true,
  interval: 15
})

const scriptRun = (status: Run['status'], exitCode: number | null = null): Run => ({
  id: 'r1',
  projectId: 'p1',
  title: '全量dev',
  command: 'yarn dev',
  status,
  pid: 10,
  exitCode,
  stopped: false,
  startedAt: '2026-01-01T00:00:00.000Z',
  kind: 'script',
  scriptId: 'custom:dev'
})

describe('createHookRunner', () => {
  const listeners: ((event: DevhubEvent) => void)[] = []
  let emitted: DevhubEvent[]
  let commands: CommandRequest[]
  let now: number
  let scriptNotify: ScriptNotify | null
  let scriptHooks: ScriptHookEventMap = {}
  let hooks = defaultSettings.hooks

  beforeEach(() => {
    scriptNotify = null
    scriptHooks = {}
    hooks = defaultSettings.hooks
  })

  const publish = (event: DevhubEvent): void => listeners.forEach((listener) => listener(event))
  const flush = async (): Promise<void> => {
    for (let i = 0; i < 30; i++) await Promise.resolve()
  }

  const start = (): ReturnType<typeof createHookRunner> => {
    emitted = []
    commands = []
    listeners.length = 0
    now = 1_000_000
    return createHookRunner({
      subscribe: (listener) => {
        listeners.push(listener)
        return () => undefined
      },
      getSettings: async () => ({ ...defaultSettings, hooks }),
      resolveScript: async () => ({
        name: '全量dev',
        projectName: 'axe_king',
        projectPath: '/repo',
        ...(scriptNotify ? { notify: scriptNotify } : {}),
        ...(scriptHooks.onReady || scriptHooks.onError || scriptHooks.onExit || scriptHooks.onStart
          ? { hooks: scriptHooks }
          : {})
      }),
      loadProjectHooks: async () => ({}),
      runCommand: async (request) => {
        commands.push(request)
      },
      emit: (event) => emitted.push(event),
      now: () => now
    })
  }

  const transition = (
    to: 'ready' | 'error' | 'building',
    from: 'building' | 'error' = 'building'
  ): void => {
    publish({
      type: 'run-status-transition',
      runId: 'r1',
      projectId: 'p1',
      scriptId: 'custom:dev',
      from,
      to
    })
  }

  it('sounds on ready and runs the error command once per interval', async () => {
    scriptNotify = notify
    hooks = defaultSettings.hooks
    start()
    transition('building')
    transition('ready')
    await flush()
    expect(emitted).toEqual([
      {
        type: 'status-notify',
        scriptName: '全量dev',
        phase: 'ready',
        sound: 'default',
        toast: false,
        body: '全量dev 已就绪',
        projectPath: '/repo'
      },
      {
        type: 'status-notify',
        scriptName: '全量dev',
        phase: 'ready',
        toast: true,
        body: '全量dev 已就绪',
        projectPath: '/repo'
      }
    ])
    expect(commands).toEqual([])

    transition('error')
    now += 1000
    transition('error')
    await flush()
    expect(commands).toHaveLength(1)
    expect(commands[0]?.command).toBe('yarn launch axe_king s1-1')
    expect(commands[0]?.cwd).toBe('/repo')
    expect(JSON.parse(commands[0]?.stdin ?? '{}')).toMatchObject({
      event: 'onError',
      project: 'axe_king',
      script: '全量dev',
      status: 'error',
      exitCode: null
    })
    expect(commands[0]?.env.DEVHUB_EVENT).toBe('onError')
    expect(
      emitted.filter((event) => event.type === 'status-notify' && event.phase === 'error')
    ).toHaveLength(2)

    now += 15_000
    transition('error')
    await flush()
    expect(commands).toHaveLength(2)
  })

  it('does not treat error to ready as a build-ready hook', async () => {
    scriptNotify = notify
    start()
    transition('ready', 'error')
    await flush()
    expect(emitted).toEqual([])
  })

  it('skips the first ready when firstBuild is false', async () => {
    scriptNotify = resolveNotify({ onReady: { sound: 'default', toast: true }, firstBuild: false })
    start()
    transition('ready')
    await flush()
    expect(emitted).toEqual([])
    now += 20_000
    transition('ready')
    await flush()
    expect(emitted).toHaveLength(2)
  })

  it('stays quiet when nothing is configured', async () => {
    scriptNotify = null
    hooks = { hooks: {} }
    start()
    transition('ready')
    await flush()
    expect(emitted).toEqual([])
    expect(commands).toEqual([])
  })

  it('fires a matching global hook on start and exit, and a test ignores match', async () => {
    scriptNotify = null
    hooks = {
      hooks: {
        onStart: [
          {
            match: { project: 'axe_king', script: '全量dev' },
            actions: [{ type: 'toast' }],
            interval: 0
          }
        ],
        onExit: [
          { actions: [{ type: 'command', command: 'echo bye', cwd: 'project' }], interval: 0 }
        ]
      }
    }
    const runner = start()
    publish({ type: 'run-updated', run: scriptRun('running') })
    publish({ type: 'run-updated', run: scriptRun('running') })
    await flush()
    expect(emitted.filter((event) => event.type === 'status-notify')).toHaveLength(1)

    publish({ type: 'run-updated', run: scriptRun('exited', 2) })
    await flush()
    expect(commands[0]?.env.DEVHUB_EXIT_CODE).toBe('2')
    expect(commands[0]?.env.DEVHUB_STATUS).toBe('exited')

    const tested = await runner.test('onStart')
    expect(tested.fired).toBe(1)
    await expect(runner.test('nope')).rejects.toThrow('钩子事件无效')
  })

  it('fires a script hook on start, and a script test skips global hooks', async () => {
    scriptNotify = null
    scriptHooks = { onStart: [{ actions: [{ type: 'toast' }], interval: 15 }] }
    hooks = {
      hooks: {
        onStart: [{ actions: [{ type: 'sound', file: 'error' }], interval: 0 }]
      }
    }
    const runner = start()
    publish({ type: 'run-updated', run: scriptRun('running') })
    publish({ type: 'run-updated', run: scriptRun('running') })
    await flush()
    const notes = emitted.filter((event) => event.type === 'status-notify')
    expect(notes).toHaveLength(2)
    expect(notes[0]).toMatchObject({ sound: 'error', toast: false, phase: 'start' })
    expect(notes[1]).toMatchObject({ toast: true, phase: 'start' })

    emitted.length = 0
    const tested = await runner.testScript('p1', 'custom:dev', 'onStart')
    expect(tested.fired).toBe(1)
    expect(emitted.filter((event) => event.type === 'status-notify')).toEqual([
      expect.objectContaining({ toast: true, phase: 'start', body: '测试：全量dev 已启动' })
    ])
    await expect(runner.testScript('p1', 'custom:dev', 'nope')).rejects.toThrow('钩子事件无效')
  })
})
