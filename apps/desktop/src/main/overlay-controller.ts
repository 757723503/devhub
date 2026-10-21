import { readFile, writeFile, mkdir } from 'fs/promises'
import { dirname, join } from 'path'
import { BrowserWindow, globalShortcut, screen } from 'electron'
import {
  defaultOverlayShortcut,
  shellChannel,
  type DevhubEvent,
  type OverlayResizeGesture,
  type Settings
} from '@devhub/shared'
import {
  clampOverlayFrame,
  clampOverlayPosition,
  clampOverlayWidth,
  defaultOverlayPosition,
  fitOverlayHeight,
  overlayMargin,
  overlayMaxWidth,
  overlayMinHeight,
  overlayMinWidth,
  overlayWidth,
  parseOverlayPlacement,
  resizeOverlayFrame,
  type OverlayPlacement,
  type OverlaySizeLimits,
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
  /** Reported by the renderer. The window shrinks or grows to match, under `maxHeight`. */
  setContentHeight(height: number): void
  resize(gesture: OverlayResizeGesture): void
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
  let userWidth: number | undefined
  let maxHeight: number | undefined
  let contentHeight = overlayMinHeight
  let resizing = false
  let resizeStart: Rect | null = null
  let nativeUserResize = false
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
    return {
      x: bounds?.x ?? 0,
      y: bounds?.y ?? 0,
      alwaysOnTop: pinned,
      ...(userWidth !== undefined ? { width: Math.round(userWidth) } : {}),
      ...(maxHeight !== undefined ? { maxHeight: Math.round(maxHeight) } : {})
    }
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

  const rememberSize = (saved: OverlayPlacement | null): void => {
    if (saved?.width !== undefined) userWidth = saved.width
    if (saved?.maxHeight !== undefined) maxHeight = saved.maxHeight
  }

  const applyFit = (target: BrowserWindow): void => {
    if (target.isDestroyed() || resizing) return
    const current = target.getBounds()
    const area = workAreaFor(current)
    const width = clampOverlayWidth(userWidth ?? overlayWidth, area.width)
    const height = fitOverlayHeight(contentHeight, maxHeight, area.height)
    const position = clampOverlayPosition(current, { width, height }, area)
    if (
      current.x === position.x &&
      current.y === position.y &&
      current.width === width &&
      current.height === height
    ) {
      return
    }
    target.setBounds({ ...position, width, height })
  }

  const limitsFor = (area: Rect): OverlaySizeLimits => ({
    minWidth: overlayMinWidth,
    maxWidth: overlayMaxWidth,
    minHeight: overlayMinHeight,
    maxHeight: Math.max(overlayMinHeight, area.height - overlayMargin * 2)
  })

  const applyPinned = (target: BrowserWindow, value: boolean): void => {
    pinned = value
    target.setAlwaysOnTop(value, 'floating')
    target.setVisibleOnAllWorkspaces(value, { visibleOnFullScreen: true })
  }

  const ensure = async (): Promise<BrowserWindow> => {
    if (window && !window.isDestroyed()) return window
    const saved = await read()
    if (saved) pinned = saved.alwaysOnTop
    rememberSize(saved)
    const area = saved ? workAreaFor(saved) : screen.getPrimaryDisplay().workArea
    const width = clampOverlayWidth(userWidth ?? overlayWidth, area.width)
    const height = fitOverlayHeight(contentHeight, maxHeight, area.height)
    const position = saved
      ? clampOverlayPosition(saved, { width, height }, area)
      : defaultOverlayPosition(area, { width, height })
    const created = createOverlayWindow({ ...position, width, height, alwaysOnTop: pinned })
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
    created.on('will-resize', () => {
      nativeUserResize = true
    })
    created.on('resized', () => {
      if (!nativeUserResize || resizing || created.isDestroyed()) {
        nativeUserResize = false
        return
      }
      nativeUserResize = false
      const bounds = created.getBounds()
      userWidth = bounds.width
      maxHeight = bounds.height
      save(placement())
      applyFit(created)
    })
    created.once('ready-to-show', () => {
      if (!pendingShow || created.isDestroyed()) return
      pendingShow = false
      applyFit(created)
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
      applyFit(target)
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
    if (window && !window.isDestroyed()) applyFit(window)
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
    setContentHeight(height) {
      contentHeight = height
      if (window && !window.isDestroyed()) applyFit(window)
    },
    resize(gesture) {
      const target = window
      if (!target || target.isDestroyed()) return
      if (gesture.phase === 'start') {
        resizing = true
        resizeStart = target.getBounds()
        return
      }
      if (!resizeStart) return
      const area = workAreaFor(resizeStart)
      const frame = clampOverlayFrame(
        resizeOverlayFrame(resizeStart, gesture.dx, gesture.dy, gesture.edge, limitsFor(area)),
        area
      )
      target.setBounds(frame)
      if (gesture.phase !== 'end') return
      userWidth = frame.width
      // A click on the edge must not freeze the height; only a real vertical drag sets the ceiling.
      if ((gesture.edge.includes('n') || gesture.edge.includes('s')) && gesture.dy !== 0) {
        maxHeight = frame.height
      }
      resizing = false
      resizeStart = null
      save(placement())
      applyFit(target)
    },
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
