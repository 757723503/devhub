import { describe, expect, it } from 'vitest'
import type { DevhubEvent, ScriptNotify } from '@devhub/shared'
import { resolveNotify } from '@devhub/shared'
import { createStatusNotifier } from './status-notifier'

const notify: ScriptNotify = resolveNotify({
  onReady: { sound: 'default', toast: true },
  onError: { sound: 'error', toast: true, run: 'yarn launch axe_king s1-1' },
  firstBuild: true,
  interval: 15
})

describe('createStatusNotifier', () => {
  const listeners: ((event: DevhubEvent) => void)[] = []
  let emitted: DevhubEvent[]
  let commands: string[]
  let now: number

  const publish = (event: DevhubEvent): void => listeners.forEach((listener) => listener(event))
  const flush = async (): Promise<void> => {
    for (let i = 0; i < 8; i++) await Promise.resolve()
  }

  const start = (scriptNotify: ScriptNotify | null = notify): void => {
    emitted = []
    commands = []
    listeners.length = 0
    now = 1_000_000
    createStatusNotifier({
      subscribe: (listener) => {
        listeners.push(listener)
        return () => undefined
      },
      resolveScript: async () =>
        scriptNotify
          ? { name: '全量dev', projectPath: '/repo', notify: scriptNotify }
          : { name: '全量dev', projectPath: '/repo' },
      startCommand: async (_projectId, command) => {
        commands.push(command)
      },
      emit: (event) => emitted.push(event),
      now: () => now
    })
  }

  const transition = (to: 'ready' | 'error' | 'building', runId = 'r1'): void => {
    publish({
      type: 'run-status-transition',
      runId,
      projectId: 'p1',
      scriptId: 'custom:dev',
      from: 'building',
      to
    })
  }

  it('sounds and toasts on ready, and runs the error callback once per interval', async () => {
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
        toast: true,
        body: '全量dev 已就绪',
        projectPath: '/repo'
      }
    ])
    expect(commands).toEqual([])

    transition('error')
    now += 1000
    transition('error', 'r1')
    await flush()
    expect(commands).toEqual(['yarn launch axe_king s1-1'])
    expect(
      emitted.filter((event) => event.type === 'status-notify' && event.phase === 'error')
    ).toHaveLength(1)

    now += 15_000
    transition('error')
    await flush()
    expect(commands).toHaveLength(2)
  })

  it('skips the first ready when firstBuild is false, then notifies the next one', async () => {
    start(resolveNotify({ onReady: { sound: 'default', toast: true }, firstBuild: false }))
    transition('ready')
    await flush()
    expect(emitted).toEqual([])
    now += 20_000
    transition('ready')
    await flush()
    expect(emitted).toHaveLength(1)
  })

  it('stays quiet when the script declared no notify block', async () => {
    start(null)
    transition('ready')
    await flush()
    expect(emitted).toEqual([])
    expect(commands).toEqual([])
  })
})
