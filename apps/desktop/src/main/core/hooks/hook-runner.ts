import { isAbsolute, relative, resolve } from 'path'
import {
  DevhubError,
  collectHookRules,
  defaultHookTimeoutSeconds,
  hookEventInfo,
  hookEventSchema,
  hookProcessEnv,
  hookStdin,
  planHookActions,
  type DevhubEvent,
  type HookAction,
  type HookEventInfo,
  type HookEventMap,
  type HookEventName,
  type HooksDocument,
  type ScriptHookEventMap,
  type ScriptNotify,
  type Settings
} from '@devhub/shared'
import type { HookCommandRequest } from './hook-command'

export interface HookScript {
  name: string
  projectName: string
  projectPath: string
  notify?: ScriptNotify
  hooks?: ScriptHookEventMap
}

export interface HookRunnerDeps {
  subscribe: (listener: (event: DevhubEvent) => void) => () => void
  getSettings: () => Promise<Settings>
  resolveScript: (projectId: string, scriptId: string) => Promise<HookScript | null>
  loadProjectHooks: (projectPath: string) => Promise<HookEventMap>
  runCommand: (request: HookCommandRequest) => Promise<void>
  emit: (event: DevhubEvent) => void
  now?: () => number
  warn?: (message: string, error?: unknown) => void
}

export interface HookRunner {
  test(event: unknown): Promise<{ fired: number }>
  /** This script's saved hooks and `notify` only. Global and project-root hooks are skipped. */
  testScript(projectId: unknown, scriptId: unknown, event: unknown): Promise<{ fired: number }>
  dispose(): void
}

interface FireTarget {
  event: HookEventName
  /** One process start. The first-ready skip is per run, not per script. */
  runId: string
  projectId: string
  projectName: string
  projectPath: string
  scriptId: string
  scriptName: string
  notify: ScriptNotify | null
  projectHooks: HookEventMap
  scriptHooks: ScriptHookEventMap
  globalHooks: HooksDocument
  exitCode: number | null
  test: boolean
}

/**
 * Turns build-status changes and process start / exit into hook actions.
 * `onReady` is only the building → ready transition. Sounds and toasts are emitted
 * for the main process; commands run in the background with the event on stdin.
 */
export function createHookRunner({
  subscribe,
  getSettings,
  resolveScript,
  loadProjectHooks,
  runCommand,
  emit,
  now = () => Date.now(),
  warn = (message, error) => console.warn(message, error)
}: HookRunnerDeps): HookRunner {
  const seenReady = new Set<string>()
  const started = new Set<string>()
  const exited = new Set<string>()
  const lastAt = new Map<string, number>()
  const chains = new Map<string, Promise<void>>()

  const enqueue = (key: string, job: () => Promise<void>): void => {
    const previous = chains.get(key) ?? Promise.resolve()
    const next = previous.then(job, job)
    chains.set(key, next)
  }

  const resolveCwd = (cwd: string | undefined, projectPath: string): string | null => {
    const root = projectPath || process.cwd()
    if (!cwd || cwd === 'project') return root
    if (isAbsolute(cwd)) return cwd
    const absolute = resolve(root, cwd)
    const inside = relative(root, absolute)
    if (inside.startsWith('..') || isAbsolute(inside)) return null
    return absolute
  }

  const perform = async (
    action: HookAction,
    info: HookEventInfo,
    projectPath: string,
    scriptName: string
  ): Promise<void> => {
    if (action.type === 'command') {
      const cwd = resolveCwd(action.cwd, projectPath)
      if (!cwd) {
        warn(`[hooks] cwd must stay inside the project: ${action.cwd ?? ''}`)
        return
      }
      await runCommand({
        command: action.command,
        cwd,
        timeoutMs: (action.timeout ?? defaultHookTimeoutSeconds) * 1000,
        env: hookProcessEnv(info),
        stdin: hookStdin(info)
      })
      return
    }
    const phase =
      info.event === 'onReady'
        ? 'ready'
        : info.event === 'onError'
          ? 'error'
          : info.event === 'onStart'
            ? 'start'
            : 'exit'
    const body =
      action.type === 'toast' && action.message
        ? action.message
        : info.event === 'onReady'
          ? `${scriptName} 已就绪`
          : info.event === 'onError'
            ? `${scriptName} 出错`
            : info.event === 'onStart'
              ? `${scriptName} 已启动`
              : info.exitCode === null
                ? `${scriptName} 已退出`
                : `${scriptName} 已退出（${info.exitCode}）`
    emit({
      type: 'status-notify',
      scriptName,
      phase,
      ...(action.type === 'sound' ? { sound: action.file } : {}),
      toast: action.type === 'toast',
      body: info.test ? `测试：${body}` : body,
      projectPath
    })
  }

  const fire = async (target: FireTarget): Promise<number> => {
    const rules = collectHookRules({
      event: target.event,
      globalHooks: target.globalHooks,
      projectHooks: target.projectHooks,
      scriptHooks: target.scriptHooks,
      notify: target.notify,
      scriptName: target.scriptName
    })
    const scoped = new Map<string, number>()
    for (const rule of rules) {
      const at = lastAt.get(clockKey(target, rule.id))
      if (at !== undefined) scoped.set(rule.id, at)
    }
    const plan = planHookActions(rules, {
      event: target.event,
      projectName: target.projectName,
      scriptName: target.scriptName,
      seenReady: seenReady.has(target.runId),
      now: now(),
      lastAt: scoped,
      ...(target.test ? { test: true } : {})
    })
    if (target.event === 'onReady' && plan.seenReady) seenReady.add(target.runId)
    for (const clock of plan.clocks) lastAt.set(clockKey(target, clock.id), clock.at)
    const info = hookEventInfo({
      event: target.event,
      project: target.projectName,
      script: target.scriptName,
      exitCode: target.exitCode,
      test: target.test
    })
    for (const planned of plan.planned) {
      await perform(planned.action, info, target.projectPath, target.scriptName).catch(
        (error: unknown) => warn('[hooks] action failed', error)
      )
    }
    return plan.planned.length
  }

  const loadTarget = async (
    runId: string,
    projectId: string,
    scriptId: string,
    event: HookEventName,
    exitCode: number | null
  ): Promise<FireTarget | null> => {
    if (scriptId.startsWith('notify:')) return null
    const script = await resolveScript(projectId, scriptId).catch(() => null)
    if (!script) return null
    const [settings, projectHooks] = await Promise.all([
      getSettings(),
      loadProjectHooks(script.projectPath)
    ])
    return {
      event,
      runId,
      projectId,
      projectName: script.projectName,
      projectPath: script.projectPath,
      scriptId,
      scriptName: script.name,
      notify: script.notify ?? null,
      projectHooks,
      scriptHooks: script.hooks ?? {},
      globalHooks: settings.hooks,
      exitCode,
      test: false
    }
  }

  const unsubscribe = subscribe((event) => {
    if (event.type === 'run-removed') {
      started.delete(event.runId)
      exited.delete(event.runId)
      seenReady.delete(event.runId)
      return
    }
    if (event.type === 'run-status-transition') {
      const name = transitionEvent(event.from, event.to)
      if (!name) return
      const key = `${event.projectId}\0${event.scriptId}`
      enqueue(key, async () => {
        const target = await loadTarget(event.runId, event.projectId, event.scriptId, name, null)
        if (target) await fire(target)
      })
      return
    }
    if (event.type !== 'run-updated' || event.run.kind !== 'script') return
    const run = event.run
    if (run.status === 'running' && !started.has(run.id)) {
      started.add(run.id)
      enqueue(`${run.projectId}\0${run.scriptId}`, async () => {
        const target = await loadTarget(run.id, run.projectId, run.scriptId, 'onStart', null)
        if (target) await fire(target)
      })
    }
    if (run.status === 'exited' && !exited.has(run.id)) {
      exited.add(run.id)
      enqueue(`${run.projectId}\0${run.scriptId}`, async () => {
        const target = await loadTarget(run.id, run.projectId, run.scriptId, 'onExit', run.exitCode)
        if (target) await fire(target)
      })
    }
  })

  return {
    async test(event) {
      const parsed = hookEventSchema.safeParse(event)
      if (!parsed.success) throw new DevhubError('INVALID_INPUT', '钩子事件无效')
      const settings = await getSettings()
      return {
        fired: await fire({
          event: parsed.data,
          runId: 'test',
          projectId: 'test',
          projectName: 'test',
          projectPath: '',
          scriptId: 'test',
          scriptName: 'test',
          notify: null,
          projectHooks: {},
          scriptHooks: {},
          globalHooks: settings.hooks,
          exitCode: parsed.data === 'onExit' ? 0 : null,
          test: true
        })
      }
    },
    async testScript(projectId, scriptId, event) {
      const parsed = hookEventSchema.safeParse(event)
      if (!parsed.success) throw new DevhubError('INVALID_INPUT', '钩子事件无效')
      if (typeof projectId !== 'string' || projectId.length === 0) {
        throw new DevhubError('INVALID_INPUT', '脚本设置无效')
      }
      if (typeof scriptId !== 'string' || scriptId.length === 0) {
        throw new DevhubError('INVALID_INPUT', '脚本设置无效')
      }
      const script = await resolveScript(projectId, scriptId).catch(() => null)
      if (!script) throw new DevhubError('SCRIPT_NOT_FOUND', '脚本不存在，可能已从项目中删除')
      return {
        fired: await fire({
          event: parsed.data,
          runId: 'test',
          projectId,
          projectName: script.projectName,
          projectPath: script.projectPath,
          scriptId,
          scriptName: script.name,
          notify: script.notify ?? null,
          projectHooks: {},
          scriptHooks: script.hooks ?? {},
          globalHooks: { hooks: {} },
          exitCode: parsed.data === 'onExit' ? 0 : null,
          test: true
        })
      }
    },
    dispose() {
      unsubscribe()
      seenReady.clear()
      started.clear()
      exited.clear()
      lastAt.clear()
      chains.clear()
    }
  }
}

function clockKey(target: FireTarget, ruleId: string): string {
  return `${ruleId}\0${target.projectId}\0${target.scriptId}`
}

/** Building is the yaml `busy` phase. Ready fires only on that edge; error fires from any phase. */
function transitionEvent(
  from: 'building' | 'ready' | 'error' | 'exited',
  to: 'building' | 'ready' | 'error'
): HookEventName | null {
  if (to === 'ready' && from === 'building') return 'onReady'
  if (to === 'error') return 'onError'
  return null
}
