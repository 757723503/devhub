import { describe, expect, it } from 'vitest'
import { overlayShortcutLabel, syncOverlayShortcut } from './overlay-shortcut'

describe('syncOverlayShortcut', () => {
  it('registers the new accelerator and releases the previous one', () => {
    const registered: string[] = []
    const result = syncOverlayShortcut(
      'CommandOrControl+Alt+D',
      'Ctrl+Alt+F',
      (accelerator) => {
        registered.push(accelerator)
        return true
      },
      (accelerator) => {
        const index = registered.indexOf(accelerator)
        if (index >= 0) registered.splice(index, 1)
      }
    )
    expect(result).toEqual({ active: 'Ctrl+Alt+F', failed: false })
    expect(registered).toEqual(['Ctrl+Alt+F'])
  })

  it('keeps the previous shortcut when registration fails or throws', () => {
    const kept = syncOverlayShortcut(
      'Ctrl+Alt+D',
      'Ctrl+Alt+X',
      () => false,
      () => undefined
    )
    expect(kept).toEqual({ active: 'Ctrl+Alt+D', failed: true })
    const thrown = syncOverlayShortcut(
      null,
      'Ctrl+Alt+X',
      () => {
        throw new Error('no display')
      },
      () => undefined
    )
    expect(thrown).toEqual({ active: null, failed: true })
  })

  it('does nothing when the accelerator is unchanged', () => {
    let calls = 0
    const result = syncOverlayShortcut(
      'Ctrl+Alt+D',
      'Ctrl+Alt+D',
      () => {
        calls += 1
        return true
      },
      () => {
        calls += 1
      }
    )
    expect(result).toEqual({ active: 'Ctrl+Alt+D', failed: false })
    expect(calls).toBe(0)
  })
})

describe('overlayShortcutLabel', () => {
  it('spells the default as Ctrl+Alt+D on Windows and Linux', () => {
    expect(overlayShortcutLabel('CommandOrControl+Alt+D', 'win32')).toBe('Ctrl+Alt+D')
    expect(overlayShortcutLabel('CommandOrControl+Alt+D', 'linux')).toBe('Ctrl+Alt+D')
    expect(overlayShortcutLabel('Control+Alt+F', 'win32')).toBe('Ctrl+Alt+F')
  })
})
