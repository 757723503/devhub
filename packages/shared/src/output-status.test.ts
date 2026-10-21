import { describe, expect, it } from 'vitest'
import {
  formatActivityAge,
  lastOutputLine,
  lastOutputPhase,
  outputStatusConfigSchema,
  outputStatusPresets,
  resolveOutputStatus,
  statusLightFor
} from './output-status'

describe('resolveOutputStatus', () => {
  it('copies a named preset', () => {
    expect(resolveOutputStatus('webpack')).toEqual(outputStatusPresets.webpack)
    expect(outputStatusConfigSchema.parse('tstl')).toBe('tstl')
  })

  it('ORs several presets and lets an explicit pattern replace one phase', () => {
    const merged = resolveOutputStatus(['webpack', 'tstl'])
    expect(merged.busy).toContain(outputStatusPresets.webpack.busy)
    expect(merged.ready).toContain(outputStatusPresets.tstl.ready)
    expect(resolveOutputStatus({ presets: ['webpack'], error: 'BUILD FAILED' }).error).toBe(
      'BUILD FAILED'
    )
  })

  it('rejects an unknown preset, an empty status and a broken regex', () => {
    expect(outputStatusConfigSchema.safeParse('vite').success).toBe(false)
    expect(outputStatusConfigSchema.safeParse({}).success).toBe(false)
    expect(outputStatusConfigSchema.safeParse({ busy: '(' }).success).toBe(false)
    expect(outputStatusConfigSchema.safeParse({ busy: 'Compiling' }).success).toBe(true)
  })
})

describe('lastOutputPhase', () => {
  const rules = outputStatusPresets.webpack

  it('follows the latest webpack line, including back to building', () => {
    expect(lastOutputPhase('Compiling...\n', rules)).toBe('busy')
    expect(lastOutputPhase('Compiling...\nwebpack compiled successfully in 20 ms\n', rules)).toBe(
      'ready'
    )
    const failed = 'webpack compiled successfully\nERROR in ./a.ts\nwebpack compiled with 1 error'
    expect(lastOutputPhase(failed, rules)).toBe('error')
    expect(lastOutputPhase(`${failed}\nCompiling...\nwebpack compiled successfully\n`, rules)).toBe(
      'ready'
    )
  })

  it('treats warnings as ready and ignores ANSI around the line', () => {
    expect(lastOutputPhase('webpack compiled with 2 warnings in 10 ms', rules)).toBe('ready')
    expect(lastOutputPhase('\u001b[32mwebpack compiled successfully\u001b[0m', rules)).toBe('ready')
  })

  it('matches tstl / tsc watch lines and a later error', () => {
    const tstl = outputStatusPresets.tstl
    const ready = '[tstl] Found 0 errors. Watching for file changes.'
    expect(lastOutputPhase('[tstl] Starting compilation in watch mode...\n' + ready, tstl)).toBe(
      'ready'
    )
    expect(
      lastOutputPhase(
        `${ready}\n[tstl] File change detected. Starting compilation...\n[tstl] Found 2 errors. Watching for file changes.`,
        tstl
      )
    ).toBe('error')
    expect(lastOutputPhase('src/a.ts(1,1): error TS2322: bad', tstl)).toBe('error')
  })

  it('uses the text after a carriage return when that part matches later', () => {
    expect(lastOutputPhase('Compiling...\rwebpack compiled successfully', rules)).toBe('ready')
  })

  it('skips a pattern that is not a regex instead of throwing', () => {
    expect(lastOutputPhase('anything', { busy: '(' })).toBeNull()
  })
})

describe('lastOutputLine', () => {
  it('keeps the last plain line and drops ANSI', () => {
    expect(lastOutputLine('\u001b[31mfail\u001b[0m\n\n  ready  \n')).toBe('ready')
    expect(lastOutputLine('first\rsecond')).toBe('second')
    expect(lastOutputLine('   \n')).toBe('')
  })
})

describe('statusLightFor', () => {
  const running = { status: 'running' as const, exitCode: null, stopped: false }

  it('is idle without a run, and building until output or health says otherwise', () => {
    expect(statusLightFor({})).toBe('idle')
    expect(statusLightFor({ run: running })).toBe('building')
    expect(statusLightFor({ run: running, output: 'ready' })).toBe('ready')
    expect(statusLightFor({ run: running, health: 'ready' })).toBe('ready')
    expect(statusLightFor({ run: running, output: 'error', health: 'ready' })).toBe('error')
  })

  it('distinguishes a clean exit from a failed one', () => {
    expect(statusLightFor({ run: { status: 'exited', exitCode: 0, stopped: false } })).toBe(
      'exited'
    )
    expect(statusLightFor({ run: { status: 'exited', exitCode: 1, stopped: true } })).toBe('exited')
    expect(statusLightFor({ run: { status: 'exited', exitCode: 1, stopped: false } })).toBe('error')
  })
})

describe('formatActivityAge', () => {
  const now = 60_000

  it('says just now, then seconds, minutes and hours', () => {
    expect(formatActivityAge(now, now)).toBe('刚刚')
    expect(formatActivityAge(now - 4_000, now)).toBe('刚刚')
    expect(formatActivityAge(now - 12_000, now)).toBe('12s 前')
    expect(formatActivityAge(now - 125_000, now)).toBe('2m 前')
    expect(formatActivityAge(now - 3_700_000, now)).toBe('1h 前')
  })
})
