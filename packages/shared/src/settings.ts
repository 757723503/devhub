import { z } from 'zod'
import { customShellIdSchema, shellIdSchema } from './domain'

/**
 * Electron accelerator. `CommandOrControl` is Ctrl on Windows and Linux.
 * Empty is rejected: clearing the field in settings would leave the panel without a shortcut.
 */
const acceleratorModifier =
  'CommandOrControl|Command|Control|Ctrl|Alt|Option|AltGr|Shift|Super|Meta'
const acceleratorKey =
  '[A-Z0-9]|F(?:1[0-9]|2[0-4]|[1-9])|Plus|Space|Tab|Backspace|Delete|Insert|Return|Enter|Up|Down|Left|Right|Home|End|PageUp|PageDown|Escape|Esc'
export const overlayShortcutSchema = z
  .string()
  .trim()
  .min(1)
  .max(60)
  .regex(
    new RegExp(`^(?:(?:${acceleratorModifier})\\+)*(?:${acceleratorKey})$`),
    '快捷键格式无效，例如 CommandOrControl+Alt+D'
  )

export const defaultOverlayShortcut = 'CommandOrControl+Alt+D'

/** Floating panel opacity. 0.3 is still readable; 1 is the solid card. */
export const overlayOpacityMin = 0.3
export const overlayOpacityMax = 1
export const defaultOverlayOpacity = 1
export const overlayOpacitySchema = z.number().min(overlayOpacityMin).max(overlayOpacityMax)

/** A shell the user added: any program run interactively in the project directory. */
export const customShellSchema = z.object({
  id: customShellIdSchema,
  name: z.string().trim().min(1).max(30),
  path: z.string().min(1),
  args: z.array(z.string().max(500)).max(20)
})
export type CustomShell = z.infer<typeof customShellSchema>

/**
 * Settings that change what the core does on this machine; stored by the core in
 * `userData/settings.json`. Display preferences (theme, font size…) stay in the UI, per device.
 */
export const settingsSchema = z.object({
  /** Shell opened by "+"; null means the first one detected (Git Bash / bash). */
  defaultShell: shellIdSchema.nullable(),
  /** Executables chosen by the user; null means auto-detect. */
  editorPaths: z.object({
    vscode: z.string().nullable(),
    idea: z.string().nullable()
  }),
  /** Seconds a stopped script gets to exit after Ctrl+C before its tree is force-killed. */
  stopGraceSeconds: z.number().int().min(1).max(60),
  /** Closing the window: keep running in the tray, or quit (stopping every run). */
  closeAction: z.enum(['tray', 'quit']),
  /** Defaults to none, so settings files written before this field existed still load. */
  customShells: z.array(customShellSchema).max(10).default([]),
  /**
   * Global shortcut that shows or hides the floating panel. Default matches files written
   * before this field existed.
   */
  overlayShortcut: overlayShortcutSchema.default(defaultOverlayShortcut),
  /** Whole-panel opacity, from 30% to 100%. Default matches files written before this field. */
  overlayOpacity: overlayOpacitySchema.default(defaultOverlayOpacity)
})
export type Settings = z.infer<typeof settingsSchema>

export const defaultSettings: Settings = {
  defaultShell: null,
  editorPaths: { vscode: null, idea: null },
  stopGraceSeconds: 5,
  closeAction: 'tray',
  customShells: [],
  overlayShortcut: defaultOverlayShortcut,
  overlayOpacity: defaultOverlayOpacity
}

/**
 * A partial update; `editorPaths` may set either editor alone. `customShells` is redeclared
 * without its default: under `.partial()` the default would still fill in `[]` and every
 * unrelated update would erase the user's shells.
 */
export const settingsPatchSchema = settingsSchema
  .extend({
    editorPaths: settingsSchema.shape.editorPaths.partial(),
    // Redeclared without defaults: under `.partial()` a default still applies, and an unrelated
    // update would reset the shortcut or wipe custom shells.
    customShells: z.array(customShellSchema).max(10),
    overlayShortcut: overlayShortcutSchema,
    overlayOpacity: overlayOpacitySchema
  })
  .partial()
export type SettingsPatch = z.infer<typeof settingsPatchSchema>
