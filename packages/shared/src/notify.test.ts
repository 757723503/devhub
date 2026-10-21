import { describe, expect, it } from 'vitest'
import { notifyConfigSchema, planStatusNotification, resolveNotify } from './notify'

const base = resolveNotify({
  onReady: { sound: 'default', toast: true },
  onError: { sound: 'error', toast: true, run: 'yarn launch axe_king s1-1' }
})

describe('resolveNotify', () => {
  it('fills firstBuild and a 15 second gap', () => {
    expect(base).toEqual({
      onReady: { sound: 'default', toast: true },
      onError: { sound: 'error', toast: true, run: 'yarn launch axe_king s1-1' },
      firstBuild: true,
      intervalSeconds: 15
    })
  })

  it('rejects a notify block with nothing to do and a non-wav sound', () => {
    expect(notifyConfigSchema.safeParse({ firstBuild: false }).success).toBe(false)
    expect(notifyConfigSchema.safeParse({ onReady: { sound: 'beep.mp3' } }).success).toBe(false)
    expect(notifyConfigSchema.safeParse({ onReady: { sound: 'sounds/ok.wav' } }).success).toBe(true)
  })
})

describe('planStatusNotification', () => {
  it('notifies the first ready and then waits out the interval', () => {
    const first = planStatusNotification({
      notify: base,
      phase: 'ready',
      seenReady: false,
      lastAt: null,
      now: 1_000
    })
    expect(first.notify).toBe(true)
    expect(first.action).toEqual({ sound: 'default', toast: true })
    const again = planStatusNotification({
      notify: base,
      phase: 'ready',
      seenReady: true,
      lastAt: first.lastAt,
      now: 5_000
    })
    expect(again.notify).toBe(false)
    const later = planStatusNotification({
      notify: base,
      phase: 'ready',
      seenReady: true,
      lastAt: first.lastAt,
      now: 16_000
    })
    expect(later.notify).toBe(true)
  })

  it('does not let a recent ready swallow an error', () => {
    const error = planStatusNotification({
      notify: base,
      phase: 'error',
      seenReady: true,
      lastAt: null,
      now: 2_000
    })
    expect(error.notify).toBe(true)
    expect(error.action?.run).toBe('yarn launch axe_king s1-1')
  })

  it('skips only the first ready when firstBuild is false', () => {
    const notify = resolveNotify({
      onReady: { sound: 'default' },
      onError: { sound: 'error' },
      firstBuild: false
    })
    const first = planStatusNotification({
      notify,
      phase: 'ready',
      seenReady: false,
      lastAt: null,
      now: 0
    })
    expect(first).toMatchObject({ notify: false, seenReady: true })
    const second = planStatusNotification({
      notify,
      phase: 'ready',
      seenReady: true,
      lastAt: null,
      now: 20_000
    })
    expect(second.notify).toBe(true)
  })

  it('treats interval 0 as no wait', () => {
    const notify = resolveNotify({ onReady: { toast: true }, interval: 0 })
    const first = planStatusNotification({
      notify,
      phase: 'ready',
      seenReady: false,
      lastAt: null,
      now: 10
    })
    const next = planStatusNotification({
      notify,
      phase: 'ready',
      seenReady: true,
      lastAt: first.lastAt,
      now: 11
    })
    expect(next.notify).toBe(true)
  })
})
