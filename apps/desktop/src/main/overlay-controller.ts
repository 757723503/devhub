import { readFile, writeFile, mkdir } from 'fs/promises'
import { dirname, join } from 'path'
import { BrowserWindow, globalShortcut, screen } from 'electron'
import {
  defaultOverlayShortcut,
  shellChannel,
  type DevhubEvent,
  type Settings
} from '@devhub/shared'
import {
  clampOverlayPosition,
  defaultOverlayPosition,
  overlaySizeFor,
  parseOverlayPlacement,
  type OverlayPlacement,
  type Rect
} from './overlay-bounds'
import { overlayShortcutLabel, syncOverlayShortcut } from './overlay-shortcut'
import { createOverlayWindow } from './overlay-window'

export interface OverlayControllerDeps {
  /** Directory for the saved position (`overlay.json`). */
  dataDir: string
  getSettings: () => Promise<Pick<Settings, 'overlayShortcut'>>
  subscribe: (listener: (event: DevhubEvent) => void) => () => void
  showMainWindow: () => void
  getMainWindow: () => BrowserWindow | null
  isQuitting: () => boolean
}

export interface OverlayController {
  toggle(): void
  hide(): void
  /** Closes the panel for real so quitting is not blocked by a hidden window. */
  closeForQuit(): void
  showMain(): void
  focusRun(projectId: string, runId: string): void
  getState(): { alwaysOnTop: boolean }
  setPinned(pinned: boolean): void
  isVisible(): boolean
  shortcutLabel(): string
  /** Visibility or the shortcut label changed; the tray menu rebuilds from this. */
  onChange(listener: () => void): () => void
  dispose(): void
}

/**
 * The floating panel: a second renderer window, a global shortcut and a saved position.
 * Script state stays in the core; this file only owns the Electron window.
 */
export function createOverlayController(deps: OverlayControllerDeps): OverlayController {
  const filePath = join(deps.dataDir, 'overlay.json')
  const listeners = new Set<() => void>()
  let window: BrowserWindow | null = null
  let pinned = true
  let shortcut = defaultOverlayShortcut
  let activeShortcut: string | null = null
  let pendingShow = false
  let moveTimer: ReturnType<typeof setTimeout> | undefined
  let writing: Promise<void> = Promise.resolve()

  const notify = (): void => {
    for (const listener of listeners) listener()
  }

  const placement = (): OverlayPlacement => {
    const bounds = window?.getBounds()
    return { x: bounds?.x ?? 0, y: bounds?.y ?? 0, alwaysOnTop: pinned }
  }

  const save = (value: OverlayPlacement): void => {
    writing = writing
      .then(async () => {
        await mkdir(dirname(filePath), { recursive: true })
        await writeFile(filePath, JSON.stringify(value))
      })
      .catch((error: unknown) => console.warn('[overlay] could not save position', error))
  }

  const read = async (): Promise<OverlayPlacement | null> => {
    try {
      return parseOverlayPlacement(JSON.parse(await readFile(filePath, 'utf8')))
    } catch {
      return null
    }
  }

  const workAreaFor = (point: { x: number; y: number }): Rect =>
    screen.getDisplayMatching({ ...point, width: 1, height: 1 }).workArea

  const place = (target: BrowserWindow): void => {
    const area = workAreaFor(target.getBounds())
    const size = overlaySizeFor(area)
    const position = clampOverlayPosition(target.getBounds(), size, area)
    target.setBounds({ ...position, width: size.width, height: size.height })
  }

  const applyPinned = (target: BrowserWindow, value: boolean): void => {
    pinned = value
    target.setAlwaysOnTop(value, 'floating')
    target.setVisibleOnAllWorkspaces(value, { visibleOnFullScreen: true })
  }

  const ensure = async (): Promise<BrowserWindow> => {
    if (window && !window.isDestroyed()) return window
    const saved = await read()
    if (saved) pinned = saved.alwaysOnTop
    const area = saved ? workAreaFor(saved) : screen.getPrimaryDisplay().workArea
    const size = overlaySizeFor(area)
    const position = saved
      ? clampOverlayPosition(saved, size, area)
      : defaultOverlayPosition(area, size)
    const created = createOverlayWindow({ ...position, ...size, alwaysOnTop: pinned })
    window = created
    created.on('moved', () => {
      clearTimeout(moveTimer)
      moveTimer = setTimeout(() => save(placement()), 200)
    })
    created.on('close', (event) => {
      if (deps.isQuitting()) return
      event.preventDefault()
      created.hide()
      notify()
    })
    created.once('ready-to-show', () => {
      if (!pendingShow || created.isDestroyed()) return
      pendingShow = false
      place(created)
      created.show()
      created.focus()
      notify()
    })
    return created
  }

  const show = (): void => {
    void ensure().then((target) => {
      if (target.isDestroyed()) return
      if (target.webContents.isLoading()) {
        pendingShow = true
        return
      }
      place(target)
      target.show()
      target.focus()
      notify()
    })
  }

  const hide = (): void => {
    pendingShow = false
    if (window && !window.isDestroyed() && window.isVisible()) window.hide()
    notify()
  }

  const toggle = (): void => {
    if (window && !window.isDestroyed() && window.isVisible()) hide()
    else show()
  }

  const applyShortcut = (next: string): void => {
    shortcut = next
    const result = syncOverlayShortcut(
      activeShortcut,
      next,
      (accelerator) => globalShortcut.register(accelerator, toggle),
      (accelerator) => globalShortcut.unregister(accelerator)
    )
    activeShortcut = result.active
    if (result.failed) console.warn('[overlay] shortcut unavailable:', next)
    notify()
  }

  const deliverFocus = (projectId: string, runId: string): void => {
    deps.showMainWindow()
    const main = deps.getMainWindow()
    if (!main || main.isDestroyed()) return
    const send = (): void => {
      if (!main.webContents.isDestroyed()) {
        main.webContents.send(shellChannel.focusRunTarget, { projectId, runId })
      }
    }
    if (main.webContents.isLoading()) main.webContents.once('did-finish-load', send)
    else send()
  }

  const onDisplayChange = (): void => {
    if (window && !window.isDestroyed()) place(window)
  }

  deps.getSettings().then(
    (settings) => applyShortcut(settings.overlayShortcut),
    () => applyShortcut(defaultOverlayShortcut)
  )
  const unsubscribe = deps.subscribe((event) => {
    if (event.type === 'settings-updated') applyShortcut(event.settings.overlayShortcut)
  })
  screen.on('display-metrics-changed', onDisplayChange)

  return {
    toggle,
    hide,
    closeForQuit() {
      pendingShow = false
      if (window && !window.isDestroyed()) window.close()
    },
    showMain: () => deps.showMainWindow(),
    isVisible: () => Boolean(window && !window.isDestroyed() && window.isVisible()),
    focusRun: deliverFocus,
    getState: () => ({ alwaysOnTop: pinned }),
    setPinned(value) {
      pinned = value
      // The pin button lives in the panel, so the window exists; don't invent a 0,0 position.
      if (window && !window.isDestroyed()) {
        applyPinned(window, value)
        save(placement())
      }
      notify()
    },
    shortcutLabel: () => overlayShortcutLabel(shortcut, process.platform),
    onChange(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    dispose() {
      unsubscribe()
      clearTimeout(moveTimer)
      if (activeShortcut) {
        globalShortcut.unregister(activeShortcut)
        activeShortcut = null
      }
      screen.off('display-metrics-changed', onDisplayChange)
    }
  }
}
