import { z } from 'zod'

const wavPathSchema = z
  .string()
  .trim()
  .min(1)
  .max(300)
  .regex(/\.wav$/i, '声音文件必须是 .wav')

/** `default` and `error` are built in. Anything else is a wav path. */
export const notifySoundSchema = z.union([z.enum(['default', 'error']), wavPathSchema])

const notifyActionConfigSchema = z
  .object({
    sound: notifySoundSchema.optional(),
    toast: z.boolean().optional(),
    /** Shell command, run in the project directory as its own terminal. */
    run: z.string().trim().min(1).max(500).optional()
  })
  .strict()

/**
 * What `.devhub.yaml` may write under `notify`. `interval` is seconds.
 * `firstBuild` decides whether the first ready after the process starts counts.
 */
export const notifyConfigSchema = z
  .object({
    onReady: notifyActionConfigSchema.optional(),
    onError: notifyActionConfigSchema.optional(),
    firstBuild: z.boolean().optional(),
    interval: z.number().int().min(0).max(3600).optional()
  })
  .strict()
  .refine((value) => Boolean(value.onReady || value.onError), '至少填写 onReady 或 onError')
export type NotifyConfig = z.infer<typeof notifyConfigSchema>

const notifyActionSchema = z
  .object({
    sound: z.string().min(1).max(300).optional(),
    toast: z.boolean(),
    run: z.string().min(1).max(500).optional()
  })
  .strict()
export type NotifyAction = z.infer<typeof notifyActionSchema>

/** Resolved form stored on a script. Interval is seconds; 0 disables the wait. */
export const scriptNotifySchema = z
  .object({
    onReady: notifyActionSchema.optional(),
    onError: notifyActionSchema.optional(),
    firstBuild: z.boolean(),
    intervalSeconds: z.number().int().min(0).max(3600)
  })
  .strict()
export type ScriptNotify = z.infer<typeof scriptNotifySchema>

const defaultIntervalSeconds = 15

function resolveAction(
  action: z.infer<typeof notifyActionConfigSchema> | undefined
): NotifyAction | undefined {
  if (!action || (!action.sound && !action.toast && !action.run)) return undefined
  return {
    ...(action.sound ? { sound: action.sound } : {}),
    toast: action.toast ?? false,
    ...(action.run ? { run: action.run } : {})
  }
}

export function resolveNotify(config: NotifyConfig): ScriptNotify {
  const onReady = resolveAction(config.onReady)
  const onError = resolveAction(config.onError)
  return {
    ...(onReady ? { onReady } : {}),
    ...(onError ? { onError } : {}),
    firstBuild: config.firstBuild ?? true,
    intervalSeconds: config.interval ?? defaultIntervalSeconds
  }
}

export interface NotifyPlanInput {
  notify: ScriptNotify
  phase: 'ready' | 'error'
  /** This run has already reached ready once. */
  seenReady: boolean
  /** When this script last notified for this same phase. */
  lastAt: number | null
  now: number
}

export interface NotifyPlan {
  notify: boolean
  seenReady: boolean
  lastAt: number | null
  action?: NotifyAction
}

/**
 * Decides whether a real status change should sound, toast, or run a command.
 * The first ready can be skipped. Ready and error keep separate clocks.
 */
export function planStatusNotification(input: NotifyPlanInput): NotifyPlan {
  const seenReady = input.seenReady || input.phase === 'ready'
  const skippedFirst = input.phase === 'ready' && !input.notify.firstBuild && !input.seenReady
  const action = input.phase === 'ready' ? input.notify.onReady : input.notify.onError
  const idle = !action || (!action.sound && !action.toast && !action.run)
  if (skippedFirst || idle) return { notify: false, seenReady, lastAt: input.lastAt }
  const wait = input.notify.intervalSeconds * 1000
  if (wait > 0 && input.lastAt !== null && input.now - input.lastAt < wait) {
    return { notify: false, seenReady, lastAt: input.lastAt }
  }
  return { notify: true, seenReady, lastAt: input.now, action }
}
