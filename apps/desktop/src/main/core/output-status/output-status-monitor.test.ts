import { describe, expect, it } from 'vitest'
import type { DevhubEvent, OutputStatusRules, Run, RunOutputState } from '@devhub/shared'
import { outputStatusPresets } from '@devhub/shared'
import { createOutputStatusMonitor, type OutputStatusMonitor } from './output-status-monitor'

type ScriptRun = Extract<Run, { kind: 'script' }>

const scriptRun = (overrides: Partial<ScriptRun> = {}): ScriptRun => ({
  id: 'r1',
  projectId: 'p1',
  kind: 'script',
  scriptId: 'custom:dev',
  title: 'dev',
  command: 'yarn dev',
  status: 'running',
  pid: 1,
  exitCode: null,
  stopped: false,
  startedAt: '2026-10-21T00:00:00.000Z',
  ...overrides
})

describe('createOutputStatusMonitor', () => {
  const listeners: ((event: DevhubEvent) => void)[] = []
  let emitted: DevhubEvent[]
  let rules: OutputStatusRules | null
  let monitor: OutputStatusMonitor
  let resolveRules: (run: ScriptRun) => Promise<OutputStatusRules | null>

  const publish = (event: DevhubEvent): void => listeners.forEach((listener) => listener(event))
  // resolveRules is async, and the monitor awaits `.catch()`, so one microtask is not enough.
  const flush = async (): Promise<void> => {
    for (let i = 0; i < 5; i++) await Promise.resolve()
  }
  const states = (): (RunOutputState | null)[] =>
    emitted.flatMap((event) =>
      event.type === 'run-output-status' ? [event.status?.state ?? null] : []
    )
  const transitions = (): string[] =>
    emitted.flatMap((event) =>
      event.type === 'run-status-transition' ? [`${event.from}->${event.to}`] : []
    )

  const start = (): void => {
    emitted = []
    listeners.length = 0
    monitor = createOutputStatusMonitor({
      subscribe: (listener) => {
        listeners.push(listener)
        return () => {
          const index = listeners.indexOf(listener)
          if (index >= 0) listeners.splice(index, 1)
        }
      },
      resolveRules: (run) => resolveRules(run),
      emit: (event) => emitted.push(event),
      now: () => new Date('2026-10-21T00:00:01.000Z')
    })
  }

  it('stays quiet when the script has no status rules', async () => {
    rules = null
    resolveRules = async () => rules
    start()
    publish({ type: 'run-updated', run: scriptRun() })
    await flush()
    publish({ type: 'run-output', runId: 'r1', offset: 0, data: 'webpack compiled successfully' })
    expect(states()).toEqual([])
    expect(monitor.list()).toEqual([])
    monitor.dispose()
  })

  it('cycles building, ready and error as the watch reprints, then exited', async () => {
    rules = outputStatusPresets.webpack
    resolveRules = async () => rules
    start()
    publish({ type: 'run-updated', run: scriptRun() })
    await flush()
    expect(states()).toEqual(['building'])

    publish({ type: 'run-output', runId: 'r1', offset: 0, data: 'Compiling...\n' })
    publish({
      type: 'run-output',
      runId: 'r1',
      offset: 13,
      data: '\u001b[32mwebpack compiled successfully\u001b[0m\n'
    })
    expect(states()).toEqual(['building', 'ready'])

    publish({
      type: 'run-output',
      runId: 'r1',
      offset: 50,
      data: 'ERROR in ./a.ts\nwebpack compiled with 1 error\n'
    })
    expect(states()).toEqual(['building', 'ready', 'error'])

    publish({ type: 'run-output', runId: 'r1', offset: 90, data: 'Compiling...\n' })
    expect(states()).toEqual(['building', 'ready', 'error', 'building'])
    expect(transitions()).toEqual(['building->ready', 'ready->error', 'error->building'])

    publish({
      type: 'run-updated',
      run: scriptRun({ status: 'exited', exitCode: 0, endedAt: '2026-10-21T00:01:00.000Z' })
    })
    expect(states().at(-1)).toBe('exited')
    expect(monitor.list()).toMatchObject([
      { runId: 'r1', state: 'exited', lastLine: 'Compiling...' }
    ])

    publish({ type: 'run-removed', runId: 'r1' })
    expect(states().at(-1)).toBeNull()
    expect(monitor.list()).toEqual([])
    monitor.dispose()
  })

  it('counts output that arrived while the rules were still loading', async () => {
    let release: (value: OutputStatusRules) => void = () => undefined
    const pending = new Promise<OutputStatusRules>((resolve) => {
      release = resolve
    })
    resolveRules = () => pending
    start()
    publish({ type: 'run-updated', run: scriptRun() })
    publish({
      type: 'run-output',
      runId: 'r1',
      offset: 0,
      data: 'webpack compiled successfully\n'
    })
    expect(states()).toEqual([])
    release(outputStatusPresets.webpack)
    await pending
    await flush()
    expect(states()).toEqual(['ready'])
    expect(transitions()).toEqual(['building->ready'])
    monitor.dispose()
  })

  it('ignores shells and output for runs it does not track', async () => {
    resolveRules = async () => outputStatusPresets.tstl
    start()
    publish({
      type: 'run-updated',
      run: {
        id: 'sh',
        projectId: 'p1',
        kind: 'shell',
        shellId: 'bash',
        title: '终端 1',
        command: 'bash',
        status: 'running',
        pid: 2,
        exitCode: null,
        stopped: false,
        startedAt: '2026-10-21T00:00:00.000Z'
      }
    })
    publish({ type: 'run-output', runId: 'other', offset: 0, data: 'Found 0 errors' })
    await flush()
    expect(states()).toEqual([])
    monitor.dispose()
  })
})
