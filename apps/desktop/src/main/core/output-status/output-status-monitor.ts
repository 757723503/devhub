import type { DevhubEvent, OutputStatusRules, Run, RunOutputState } from '@devhub/shared'
import { lastOutputLine, lastOutputPhase, phaseToState, type RunOutputStatus } from '@devhub/shared'

type ScriptRun = Extract<Run, { kind: 'script' }>

export interface OutputStatusMonitorDeps {
  subscribe: (listener: (event: DevhubEvent) => void) => () => void
  /** Rules declared by the script; null when this run is not matched on output. */
  resolveRules: (run: ScriptRun) => Promise<OutputStatusRules | null>
  emit: (event: DevhubEvent) => void
  now?: () => Date
}

export interface OutputStatusMonitor {
  list(): RunOutputStatus[]
  dispose(): void
}

interface Tracker {
  rules: OutputStatusRules | null
  tail: string
  status: RunOutputStatus | null
  /** Set when the process exits while rules are still being read. */
  exited: boolean
}

// Enough recent output to see a rebuild cycle without keeping the whole log.
const tailLimit = 64 * 1024

/**
 * Watches script output for `.devhub.yaml` status rules and publishes building / ready / error.
 * It only listens to the event bus, so process launching stays in RunManager.
 * A run with no rules is ignored. Port readiness stays on the health monitor.
 */
export function createOutputStatusMonitor({
  subscribe,
  resolveRules,
  emit,
  now = () => new Date()
}: OutputStatusMonitorDeps): OutputStatusMonitor {
  const tracked = new Map<string, Tracker>()

  const emitStatus = (runId: string, status: RunOutputStatus | null): void => {
    emit({ type: 'run-output-status', runId, status })
  }

  const assign = (
    tracker: Tracker,
    runId: string,
    state: RunOutputState,
    activityAt: string,
    lastLine: string
  ): void => {
    const previous = tracker.status
    const changed = !previous || previous.state !== state
    tracker.status = {
      runId,
      state,
      since: changed ? now().toISOString() : previous.since,
      lastLine,
      activityAt
    }
    if (changed) emitStatus(runId, tracker.status)
  }

  const drop = (runId: string): void => {
    if (!tracked.delete(runId)) return
    emitStatus(runId, null)
  }

  const considerOutput = (tracker: Tracker, runId: string): void => {
    const line = lastOutputLine(tracker.tail)
    const activityAt = now().toISOString()
    if (!tracker.rules) return
    if (tracker.exited) {
      if (tracker.status) tracker.status = { ...tracker.status, lastLine: line, activityAt }
      return
    }
    assign(
      tracker,
      runId,
      phaseToState(lastOutputPhase(tracker.tail, tracker.rules)),
      activityAt,
      line
    )
  }

  const track = async (run: ScriptRun): Promise<void> => {
    const tracker: Tracker = { rules: null, tail: '', status: null, exited: false }
    tracked.set(run.id, tracker)
    const rules = await resolveRules(run).catch(() => null)
    if (tracked.get(run.id) !== tracker) return
    if (!rules || (!rules.busy && !rules.ready && !rules.error)) {
      tracked.delete(run.id)
      return
    }
    tracker.rules = rules
    const state: RunOutputState = tracker.exited
      ? 'exited'
      : phaseToState(lastOutputPhase(tracker.tail, rules))
    assign(tracker, run.id, state, run.startedAt, lastOutputLine(tracker.tail))
  }

  const unsubscribe = subscribe((event) => {
    if (event.type === 'run-updated') {
      const { run } = event
      if (run.kind !== 'script') return
      const tracker = tracked.get(run.id)
      if (run.status === 'exited') {
        if (!tracker) return
        tracker.exited = true
        if (tracker.status && tracker.status.state !== 'exited') {
          assign(tracker, run.id, 'exited', tracker.status.activityAt, tracker.status.lastLine)
        }
        return
      }
      if (run.status === 'running' && !tracker) void track(run)
      return
    }
    if (event.type === 'run-output') {
      const tracker = tracked.get(event.runId)
      if (!tracker) return
      tracker.tail = (tracker.tail + event.data).slice(-tailLimit)
      considerOutput(tracker, event.runId)
      return
    }
    if (event.type === 'run-removed') drop(event.runId)
  })

  return {
    list: () =>
      [...tracked.values()].flatMap((tracker) =>
        tracker.status ? [structuredClone(tracker.status)] : []
      ),
    dispose() {
      unsubscribe()
      tracked.clear()
    }
  }
}
