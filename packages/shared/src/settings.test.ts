import { describe, expect, it } from 'vitest'
import { defaultSettings, settingsPatchSchema, settingsSchema } from './settings'

describe('settingsSchema', () => {
  it('accepts the defaults', () => {
    expect(settingsSchema.parse(defaultSettings)).toEqual(defaultSettings)
  })

  it.each([
    [{ stopGraceSeconds: 0 }],
    [{ stopGraceSeconds: 61 }],
    [{ closeAction: 'minimize' }],
    [{ defaultShell: 'tcsh' }]
  ])('rejects %o', (patch) => {
    expect(settingsSchema.safeParse({ ...defaultSettings, ...patch }).success).toBe(false)
  })
})

describe('settingsPatchSchema', () => {
  it('allows updating one editor path alone', () => {
    const idea = 'D:\\IDEA\\bin\\idea64.exe'
    expect(settingsPatchSchema.parse({ editorPaths: { idea } })).toEqual({ editorPaths: { idea } })
  })

  it('allows an empty patch', () => {
    expect(settingsPatchSchema.parse({})).toEqual({})
  })
})

describe('custom shells in settings', () => {
  it('loads settings files written before custom shells existed', () => {
    const { customShells: _ignored, ...older } = defaultSettings
    void _ignored
    expect(settingsSchema.parse(older).customShells).toEqual([])
  })

  it('does not add customShells to a patch that does not mention them', () => {
    expect(settingsPatchSchema.parse({ stopGraceSeconds: 3 })).toEqual({ stopGraceSeconds: 3 })
  })

  it('loads the default overlay shortcut into settings written before it existed', () => {
    const { overlayShortcut: _ignored, ...older } = defaultSettings
    void _ignored
    expect(settingsSchema.parse(older).overlayShortcut).toBe('CommandOrControl+Alt+D')
  })

  it('accepts an accelerator and does not inject one into an unrelated patch', () => {
    expect(settingsPatchSchema.parse({ overlayShortcut: 'Ctrl+Alt+F' })).toEqual({
      overlayShortcut: 'Ctrl+Alt+F'
    })
    expect(settingsPatchSchema.parse({ stopGraceSeconds: 4 })).toEqual({ stopGraceSeconds: 4 })
    expect(settingsPatchSchema.safeParse({ overlayShortcut: 'ctrl+alt+d' }).success).toBe(false)
    expect(settingsPatchSchema.safeParse({ overlayShortcut: '' }).success).toBe(false)
  })

  it('loads the default panel opacity and does not inject it into an unrelated patch', () => {
    const { overlayOpacity: _ignored, ...older } = defaultSettings
    void _ignored
    expect(settingsSchema.parse(older).overlayOpacity).toBe(1)
    expect(settingsPatchSchema.parse({ overlayOpacity: 0.3 })).toEqual({ overlayOpacity: 0.3 })
    expect(settingsPatchSchema.parse({ overlayOpacity: 1 })).toEqual({ overlayOpacity: 1 })
    expect(settingsPatchSchema.parse({ stopGraceSeconds: 4 })).toEqual({ stopGraceSeconds: 4 })
    expect(settingsPatchSchema.safeParse({ overlayOpacity: 0.29 }).success).toBe(false)
    expect(settingsPatchSchema.safeParse({ overlayOpacity: 1.01 }).success).toBe(false)
  })

  it('loads notify muted as off and does not inject it into an unrelated patch', () => {
    const { notifyMuted: _ignored, ...older } = defaultSettings
    void _ignored
    expect(settingsSchema.parse(older).notifyMuted).toBe(false)
    expect(settingsPatchSchema.parse({ notifyMuted: true })).toEqual({ notifyMuted: true })
    expect(settingsPatchSchema.parse({ stopGraceSeconds: 4 })).toEqual({ stopGraceSeconds: 4 })
  })

  it('loads hook volume and an empty hook document into settings written before them', () => {
    const { hookVolume: _volume, hooks: _hooks, ...older } = defaultSettings
    void _volume
    void _hooks
    expect(settingsSchema.parse(older).hookVolume).toBe(1)
    expect(settingsSchema.parse(older).hooks).toEqual({ hooks: {} })
    expect(settingsPatchSchema.parse({ hookVolume: 0.5 })).toEqual({ hookVolume: 0.5 })
    expect(settingsPatchSchema.parse({ stopGraceSeconds: 4 })).toEqual({ stopGraceSeconds: 4 })
    expect(settingsPatchSchema.safeParse({ hookVolume: 1.2 }).success).toBe(false)
  })

  it('accepts a custom shell as the default shell, and rejects malformed ids', () => {
    expect(settingsPatchSchema.safeParse({ defaultShell: 'custom-wsl' }).success).toBe(true)
    expect(settingsPatchSchema.safeParse({ defaultShell: 'custom-../x' }).success).toBe(false)
  })
})
