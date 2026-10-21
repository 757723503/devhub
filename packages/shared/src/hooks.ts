import { z } from 'zod'
import { notifySoundSchema, type NotifyAction, type ScriptNotify } from './notify'

/** Seconds between firings of the same rule for the same script. 0 waits nothing. */
export const defaultHookIntervalSeconds = 15
/** A command hook is killed after this many seconds when it sets no timeout of its own. */
export const defaultHookTimeoutSeconds = 30

export const hookEventSchema = z.enum(['onReady', 'onError', 'onExit', 'onStart'])
export type HookEventName = z.infer<typeof hookEventSchema>

const hookMatchSchema = z
  .object({
    /** Project directory name. Omitted matches every project. */
    project: z.string().trim().min(1).max(200).optional(),
    /** Script name. Omitted matches every script. */
    script: z.string().trim().min(1).max(200).optional()
  })
  .strict()

const hookActionSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('sound'), file: notifySoundSchema }).strict(),
  z
    .object({
      type: z.literal('toast'),
      message: z.string().trim().min(1).max(200).optional()
    })
    .strict(),
  z
    .object({
      type: z.literal('command'),
      command: z.string().trim().min(1).max(500),
      /** `project` is the project directory. A relative path must stay inside it. */
      cwd: z.string().trim().min(1).max(500).optional(),
      /** Seconds before the process tree is killed. */
      timeout: z.number().int().min(1).max(120).optional()
    })
    .strict()
])
export type HookAction = z.infer<typeof hookActionSchema>

export const hookRuleSchema = z
  .object({
    match: hookMatchSchema.optional(),
    actions: z.array(hookActionSchema).min(1).max(20),
    /** Seconds. Omitted means {@link defaultHookIntervalSeconds}. */
    interval: z.number().int().min(0).max(3600).optional(),
    /** When false, the first ready after a process starts does not fire. Default true. */
    firstBuild: z.boolean().optional()
  })
  .strict()
export type HookRule = z.infer<typeof hookRuleSchema>

/** A rule stored on one script. `match` is filled in when the rule runs. */
export const scriptHookRuleSchema = hookRuleSchema.omit({ match: true }).strict()
export type ScriptHookRule = z.infer<typeof scriptHookRuleSchema>

export const scriptHookEventMapSchema = z
  .object({
    onReady: z.array(scriptHookRuleSchema).max(40).optional(),
    onError: z.array(scriptHookRuleSchema).max(40).optional(),
    onExit: z.array(scriptHookRuleSchema).max(40).optional(),
    onStart: z.array(scriptHookRuleSchema).max(40).optional()
  })
  .strict()
export type ScriptHookEventMap = z.infer<typeof scriptHookEventMapSchema>

/** JSON edited from a script's gear. The `hooks` key matches the settings document. */
export const scriptHooksDocumentSchema = z
  .object({
    hooks: scriptHookEventMapSchema
  })
  .strict()
export type ScriptHooksDocument = z.infer<typeof scriptHooksDocumentSchema>

export const emptyScriptHooksDocument: ScriptHooksDocument = { hooks: {} }

export function scriptHooksAreEmpty(doc: ScriptHooksDocument): boolean {
  const hooks = doc.hooks
  return (
    (hooks.onReady?.length ?? 0) === 0 &&
    (hooks.onError?.length ?? 0) === 0 &&
    (hooks.onExit?.length ?? 0) === 0 &&
    (hooks.onStart?.length ?? 0) === 0
  )
}

const hookEventNames = [
  'onReady',
  'onError',
  'onExit',
  'onStart'
] as const satisfies readonly HookEventName[]

/** Script rules have no match of their own; they always name this script. */
function scopeScriptHooks(map: ScriptHookEventMap | undefined, scriptName: string): HookEventMap {
  if (!map) return {}
  const scoped: HookEventMap = {}
  for (const event of hookEventNames) {
    const rules = map[event]
    if (!rules || rules.length === 0) continue
    scoped[event] = rules.map((rule) => ({ ...rule, match: { script: scriptName } }))
  }
  return scoped
}

export const hookEventMapSchema = z
  .object({
    onReady: z.array(hookRuleSchema).max(40).optional(),
    onError: z.array(hookRuleSchema).max(40).optional(),
    onExit: z.array(hookRuleSchema).max(40).optional(),
    onStart: z.array(hookRuleSchema).max(40).optional()
  })
  .strict()
export type HookEventMap = z.infer<typeof hookEventMapSchema>

/** The document edited in Settings and stored in settings.json. */
export const hooksDocumentSchema = z
  .object({
    hooks: hookEventMapSchema
  })
  .strict()
export type HooksDocument = z.infer<typeof hooksDocumentSchema>

export const emptyHooksDocument: HooksDocument = { hooks: {} }

export interface HookEventInfo {
  event: HookEventName
  project: string
  script: string
  status: string
  exitCode: number | null
  test: boolean
}

/** What a command hook reads on stdin, and the env vars that mirror it. */
export function hookEventInfo(input: {
  event: HookEventName
  project: string
  script: string
  exitCode: number | null
  test: boolean
}): HookEventInfo {
  const status =
    input.event === 'onReady'
      ? 'ready'
      : input.event === 'onError'
        ? 'error'
        : input.event === 'onStart'
          ? 'running'
          : 'exited'
  return {
    event: input.event,
    project: input.project,
    script: input.script,
    status,
    exitCode: input.event === 'onExit' ? input.exitCode : null,
    test: input.test
  }
}

export function hookStdin(info: HookEventInfo): string {
  return JSON.stringify(info)
}

export function hookProcessEnv(info: HookEventInfo): {
  DEVHUB_EVENT: string
  DEVHUB_PROJECT: string
  DEVHUB_SCRIPT: string
  DEVHUB_STATUS: string
  DEVHUB_EXIT_CODE: string
} {
  return {
    DEVHUB_EVENT: info.event,
    DEVHUB_PROJECT: info.project,
    DEVHUB_SCRIPT: info.script,
    DEVHUB_STATUS: info.status,
    DEVHUB_EXIT_CODE: info.exitCode === null ? '' : String(info.exitCode)
  }
}

export interface NamedHookRule {
  id: string
  rule: HookRule
}

function namedRules(
  map: HookEventMap | undefined,
  event: HookEventName,
  prefix: string
): NamedHookRule[] {
  return (map?.[event] ?? []).map((rule, index) => ({ id: `${prefix}:${event}:${index}`, rule }))
}

/**
 * Global settings, then the project file's root hooks, then this script's hooks,
 * then its `notify` shorthand.
 */
export function collectHookRules(input: {
  event: HookEventName
  globalHooks: HooksDocument
  projectHooks: HookEventMap
  scriptHooks?: ScriptHookEventMap
  notify: ScriptNotify | null
  scriptName: string
}): NamedHookRule[] {
  return [
    ...namedRules(input.globalHooks.hooks, input.event, 'global'),
    ...namedRules(input.projectHooks, input.event, 'project'),
    ...namedRules(scopeScriptHooks(input.scriptHooks, input.scriptName), input.event, 'script'),
    ...notifyRules(input.notify, input.scriptName).filter((entry) => entry.id.endsWith(input.event))
  ]
}

function notifyActionList(action: NotifyAction | undefined): HookAction[] {
  if (!action) return []
  const actions: HookAction[] = []
  if (
    action.sound === 'default' ||
    action.sound === 'error' ||
    action.sound?.toLowerCase().endsWith('.wav')
  ) {
    actions.push({ type: 'sound', file: action.sound })
  }
  if (action.toast) actions.push({ type: 'toast' })
  if (action.run) actions.push({ type: 'command', command: action.run, cwd: 'project' })
  return actions
}

/** `notify` in `.devhub.yaml` is the old shorthand for this script's ready and error hooks. */
export function notifyRules(notify: ScriptNotify | null, scriptName: string): NamedHookRule[] {
  if (!notify) return []
  const rules: NamedHookRule[] = []
  const ready = notifyActionList(notify.onReady)
  if (ready.length > 0) {
    rules.push({
      id: 'notify:onReady',
      rule: {
        match: { script: scriptName },
        actions: ready,
        interval: notify.intervalSeconds,
        firstBuild: notify.firstBuild
      }
    })
  }
  const error = notifyActionList(notify.onError)
  if (error.length > 0) {
    rules.push({
      id: 'notify:onError',
      rule: {
        match: { script: scriptName },
        actions: error,
        interval: notify.intervalSeconds
      }
    })
  }
  return rules
}

export interface PlannedHookAction {
  id: string
  action: HookAction
}

export interface HookPlan {
  planned: PlannedHookAction[]
  /** True once this process has reached ready, including a skipped first build. */
  seenReady: boolean
  clocks: { id: string; at: number }[]
}

function ruleMatches(rule: HookRule, projectName: string, scriptName: string): boolean {
  if (rule.match?.project !== undefined && rule.match.project !== projectName) return false
  if (rule.match?.script !== undefined && rule.match.script !== scriptName) return false
  return true
}

/**
 * Which actions run for one event. Ready and the other events keep separate clocks per rule.
 * A test fire ignores match, the first-build skip, and the interval.
 */
export function planHookActions(
  rules: readonly NamedHookRule[],
  input: {
    event: HookEventName
    projectName: string
    scriptName: string
    seenReady: boolean
    now: number
    lastAt: ReadonlyMap<string, number>
    test?: boolean
  }
): HookPlan {
  const planned: PlannedHookAction[] = []
  const clocks: { id: string; at: number }[] = []
  for (const entry of rules) {
    if (!input.test && !ruleMatches(entry.rule, input.projectName, input.scriptName)) continue
    const skipFirst =
      !input.test &&
      input.event === 'onReady' &&
      entry.rule.firstBuild === false &&
      !input.seenReady
    if (skipFirst) continue
    const wait = (entry.rule.interval ?? defaultHookIntervalSeconds) * 1000
    const previous = input.lastAt.get(entry.id) ?? null
    if (!input.test && wait > 0 && previous !== null && input.now - previous < wait) continue
    for (const action of entry.rule.actions) planned.push({ id: entry.id, action })
    if (!input.test) clocks.push({ id: entry.id, at: input.now })
  }
  return {
    planned,
    seenReady: input.seenReady || input.event === 'onReady',
    clocks
  }
}
