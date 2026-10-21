import { z } from 'zod'
import type { HealthState } from './health'
import { stripAnsi } from './text'

/**
 * Presets for watch tools whose readiness is a line of output, not an open port.
 * Patterns are guesses from each tool's usual watch text; a project can override them.
 */
export const outputStatusPresetSchema = z.enum(['webpack', 'tstl'])
export type OutputStatusPreset = z.infer<typeof outputStatusPresetSchema>

export const outputStatusPresets: Record<
  OutputStatusPreset,
  { busy: string; ready: string; error: string }
> = {
  // webpack 4 ("Compiled successfully." / "Compiling...") and webpack 5
  // ("webpack compiled successfully" / "compiled with N errors").
  webpack: {
    busy: 'Compiling\\.\\.\\.',
    ready: 'compiled successfully|Compiled successfully|compiled with \\d+ warnings?(?:\\s|$)',
    error: 'compiled with [1-9]\\d* errors?|Failed to compile|ERROR in '
  },
  // tsc --watch and typescript-to-lua, which prints the same watch host lines, often after [tstl].
  tstl: {
    busy: 'File change detected\\. Starting compilation|Starting compilation in watch mode',
    ready: 'Found 0 errors\\. Watching for file changes',
    error: 'Found [1-9]\\d* errors?\\. Watching for file changes|error TS\\d+'
  }
}

const statusPatternSchema = z
  .string()
  .trim()
  .min(1)
  .max(300)
  .refine((source) => {
    try {
      new RegExp(source)
      return true
    } catch {
      return false
    }
  }, '不是有效的正则表达式')

const statusObjectSchema = z
  .object({
    presets: z.array(outputStatusPresetSchema).min(1).max(4).optional(),
    busy: statusPatternSchema.optional(),
    ready: statusPatternSchema.optional(),
    error: statusPatternSchema.optional()
  })
  .strict()
  .refine(
    (value) => Boolean(value.presets || value.busy || value.ready || value.error),
    '至少填写 presets、busy、ready 或 error'
  )

/** What `.devhub.yaml` may write under `status`. */
export const outputStatusConfigSchema = z.union([
  outputStatusPresetSchema,
  z.array(outputStatusPresetSchema).min(1).max(4),
  statusObjectSchema
])
export type OutputStatusConfig = z.infer<typeof outputStatusConfigSchema>

/** Resolved patterns matched against stripped output. An explicit pattern replaces that preset phase. */
export interface OutputStatusRules {
  busy?: string
  ready?: string
  error?: string
}

const phases = ['busy', 'ready', 'error'] as const
export type OutputPhase = (typeof phases)[number]

function mergePresets(names: readonly OutputStatusPreset[]): OutputStatusRules {
  const unique = [...new Set(names)]
  const join = (phase: OutputPhase): string =>
    unique.map((name) => `(?:${outputStatusPresets[name][phase]})`).join('|')
  return { busy: join('busy'), ready: join('ready'), error: join('error') }
}

/** Turns a yaml `status` value into the patterns the matcher runs. */
export function resolveOutputStatus(config: OutputStatusConfig): OutputStatusRules {
  if (typeof config === 'string') return { ...outputStatusPresets[config] }
  if (Array.isArray(config)) return mergePresets(config)
  const base: OutputStatusRules = config.presets ? mergePresets(config.presets) : {}
  const rules: OutputStatusRules = {}
  for (const phase of phases) {
    const pattern = config[phase] ?? base[phase]
    if (pattern) rules[phase] = pattern
  }
  return rules
}

/**
 * The latest phase in `text`. A later line wins, so a watch can go
 * building → ready → error → building as it recompiles. ANSI is removed first;
 * carriage returns stay in the string (the terminal would overwrite, the log still contains both).
 */
export function lastOutputPhase(text: string, rules: OutputStatusRules): OutputPhase | null {
  const plain = stripAnsi(text)
  let best: { index: number; phase: OutputPhase } | null = null
  for (const phase of phases) {
    const source = rules[phase]
    if (!source) continue
    let pattern: RegExp
    try {
      pattern = new RegExp(source, 'g')
    } catch {
      continue
    }
    for (const match of plain.matchAll(pattern)) {
      if (match[0].length === 0) continue
      const index = match.index ?? 0
      if (!best || index >= best.index) best = { index, phase }
    }
  }
  return best?.phase ?? null
}

/** Last non-empty plain line, for the overlay's "is it still printing?" hint. */
export function lastOutputLine(text: string): string {
  const parts = stripAnsi(text).split(/[\r\n]/)
  for (let i = parts.length - 1; i >= 0; i--) {
    const line = (parts[i] ?? '').trim()
    if (line) return Array.from(line).slice(-160).join('')
  }
  return ''
}

export const runOutputStateSchema = z.enum(['building', 'ready', 'error', 'exited'])
export type RunOutputState = z.infer<typeof runOutputStateSchema>

/** Output-derived status of one run. Null over the event means the run is no longer tracked. */
export interface RunOutputStatus {
  runId: string
  state: RunOutputState
  since: string
  lastLine: string
  /** When output last arrived. The run's start time until the first chunk. */
  activityAt: string
}

export function phaseToState(phase: OutputPhase | null): Exclude<RunOutputState, 'exited'> {
  if (phase === 'ready') return 'ready'
  if (phase === 'error') return 'error'
  return 'building'
}

/** The five lights the overlay and the script list share. */
export type StatusLight = 'idle' | 'building' | 'ready' | 'error' | 'exited'

export const statusLightLabels: Record<StatusLight, string> = {
  idle: '空闲',
  building: '构建中',
  ready: '就绪',
  error: '出错',
  exited: '已退出'
}

export function statusLightFor(input: {
  run?: { status: 'running' | 'stopping' | 'exited'; exitCode: number | null; stopped: boolean }
  output?: RunOutputState
  health?: HealthState
}): StatusLight {
  const { run, output, health } = input
  if (!run) return 'idle'
  if (run.status === 'exited') {
    if (!run.stopped && run.exitCode !== 0) return 'error'
    return 'exited'
  }
  if (output === 'error') return 'error'
  if (output === 'ready') return 'ready'
  if (output === 'building') return 'building'
  if (health === 'unhealthy') return 'error'
  if (health === 'ready') return 'ready'
  return 'building'
}

/** Short age for a 280px row. Under five seconds counts as just now. */
export function formatActivityAge(activityAtMs: number, nowMs: number): string {
  const seconds = Math.max(0, Math.floor((nowMs - activityAtMs) / 1000))
  if (seconds < 5) return '刚刚'
  if (seconds < 60) return `${seconds}s 前`
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m 前`
  return `${Math.floor(minutes / 60)}h 前`
}
