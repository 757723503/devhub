import type { DevhubEvent, ScriptNotify } from '@devhub/shared'
import { planStatusNotification } from '@devhub/shared'

export interface StatusScript {
  name: string
  projectPath: string
  notify?: ScriptNotify
}

export interface StatusNotifierDeps {
  subscribe: (listener: (event: DevhubEvent) => void) => () => void
  resolveScript: (projectId: string, scriptId: string) => Promise<StatusScript | null>
  /** Runs the callback in the project directory. Failures are reported by the caller. */
  startCommand: (projectId: string, command: string, title: string) => Promise<unknown>
  emit: (event: DevhubEvent) => void
  now?: () => number
  warn?: (message: string, error?: unknown) => void
}

export interface StatusNotifier {
  dispose(): void
}

/**
 * Turns status transitions into sounds, toasts, and callback processes.
 * The event itself is not debounced; only these actions wait out `interval`.
 */
export function createStatusNotifier({
  subscribe,
  resolveScript,
  startCommand,
  emit,
  now = () => Date.now(),
  warn = (message, error) => console.warn(message, error)
}: StatusNotifierDeps): StatusNotifier {
  const seenReady = new Set<string>()
  const lastAt = new Map<string, number>()
  const chains = new Map<string, Promise<void>>()

  const enqueue = (key: string, job: () => Promise<void>): void => {
    const previous = chains.get(key) ?? Promise.resolve()
    const next = previous.then(job, job)
    chains.set(key, next)
  }

  const handle = async (
    event: Extract<DevhubEvent, { type: 'run-status-transition' }>
  ): Promise<void> => {
    if (event.to !== 'ready' && event.to !== 'error') return
    const script = await resolveScript(event.projectId, event.scriptId).catch(() => null)
    if (!script?.notify) return
    const phase = event.to
    const clock = `${event.projectId}\0${event.scriptId}\0${phase}`
    const plan = planStatusNotification({
      notify: script.notify,
      phase,
      seenReady: seenReady.has(event.runId),
      lastAt: lastAt.get(clock) ?? null,
      now: now()
    })
    if (plan.seenReady) seenReady.add(event.runId)
    if (!plan.notify || !plan.action) return
    if (plan.lastAt !== null) lastAt.set(clock, plan.lastAt)
    const { action } = plan
    if (action.run) {
      const title = `通知 ${action.run}`.slice(0, 80)
      void startCommand(event.projectId, action.run, title).catch((error: unknown) =>
        warn('[notify] callback failed', error)
      )
    }
    if (!action.sound && !action.toast) return
    emit({
      type: 'status-notify',
      scriptName: script.name,
      phase,
      ...(action.sound ? { sound: action.sound } : {}),
      toast: action.toast,
      body: phase === 'ready' ? `${script.name} 已就绪` : `${script.name} 出错`,
      projectPath: script.projectPath
    })
  }

  const unsubscribe = subscribe((event) => {
    if (event.type === 'run-removed') {
      seenReady.delete(event.runId)
      return
    }
    if (event.type !== 'run-status-transition') return
    const key = `${event.projectId}\0${event.scriptId}`
    enqueue(key, () => handle(event))
  })

  return {
    dispose() {
      unsubscribe()
      seenReady.clear()
      lastAt.clear()
      chains.clear()
    }
  }
}
