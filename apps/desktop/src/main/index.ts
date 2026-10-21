import { join } from 'path'
import { app, BrowserWindow, type Tray } from 'electron'
import { electronApp, is, optimizer } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'
import { createDevhubCore, type DevhubCore } from './core/devhub-core'
import { registerIpcHandlers, registerOverlayIpc } from './ipc'
import { registerUpdater } from './updater'
import { createMainWindow } from './window'
import { registerWindowControls } from './window-controls'
import { createOverlayController, type OverlayController } from './overlay-controller'
import { createTray } from './tray'

// Transparent frameless windows on Linux need this before the app is ready.
if (process.platform === 'linux') app.commandLine.appendSwitch('enable-transparent-visuals')

let mainWindow: BrowserWindow | null = null
// Module-level reference keeps the tray icon from being garbage-collected.
let tray: Tray | null = null
let overlay: OverlayController | null = null
let isQuitting = false
let core: DevhubCore | null = null
// From settings; read synchronously when the window closes.
let closeAction: 'tray' | 'quit' = 'tray'
let disposed = false

// Upper bound for stopping managed processes on quit; a stuck process must not block exit.
const disposeTimeoutMs = 10_000

function showMainWindow(): void {
  if (!mainWindow || mainWindow.isDestroyed()) {
    mainWindow = createMainWindow(() => !isQuitting && closeAction === 'tray')
    // A hidden panel would otherwise keep the process up after "quit on close".
    mainWindow.on('closed', () => {
      mainWindow = null
      if (closeAction === 'quit') {
        isQuitting = true
        overlay?.closeForQuit()
      }
    })
    return
  }
  if (mainWindow.isMinimized()) mainWindow.restore()
  mainWindow.show()
  mainWindow.focus()
}

// `pnpm dev` would otherwise share userData (and the single-instance lock) with an installed
// DevHub, so the dev build quits immediately and Chromium fails to open its locked caches.
// An explicit --user-data-dir (e.g. from E2E) still wins.
if (is.dev && !app.commandLine.hasSwitch('user-data-dir')) {
  app.setPath('userData', `${app.getPath('userData')}-dev`)
}

// Only one DevHub may own the managed processes at a time.
if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  app.on('second-instance', showMainWindow)

  app.whenReady().then(() => {
    electronApp.setAppUserModelId('com.devhub.desktop')
    // Packaged builds use build/icon.icns; in dev the Dock would otherwise show Electron's icon.
    if (is.dev) app.dock?.setIcon(icon)
    app.on('browser-window-created', (_, window) => optimizer.watchWindowShortcuts(window))

    const appCore = createDevhubCore({
      version: app.getVersion(),
      platform: process.platform,
      dataDir: app.getPath('userData'),
      // Built next to the main bundle by `build:web` (out/web; inside app.asar when packaged).
      webRoot: join(__dirname, '../web')
    })
    core = appCore
    registerIpcHandlers(appCore)
    registerUpdater(() => appCore.dispose())
    registerWindowControls()
    appCore.getSettings().then(
      (settings) => (closeAction = settings.closeAction),
      () => undefined
    )
    appCore.subscribe((event) => {
      if (event.type === 'settings-updated') closeAction = event.settings.closeAction
    })

    overlay = createOverlayController({
      dataDir: app.getPath('userData'),
      getSettings: () => appCore.getSettings(),
      subscribe: (listener) => appCore.subscribe(listener),
      showMainWindow,
      getMainWindow: () => mainWindow,
      isQuitting: () => isQuitting
    })
    registerOverlayIpc(overlay)
    const createdTray = createTray({
      show: showMainWindow,
      toggleOverlay: () => overlay?.toggle(),
      quit: () => app.quit()
    })
    tray = createdTray.tray
    const refreshTray = (): void => {
      createdTray.update({
        overlayVisible: overlay?.isVisible() ?? false,
        shortcut: overlay?.shortcutLabel() ?? 'Ctrl+Alt+D'
      })
    }
    overlay.onChange(refreshTray)
    refreshTray()
    showMainWindow()
  })

  app.on('before-quit', (event) => {
    isQuitting = true
    overlay?.dispose()
    if (!core || disposed) {
      tray?.destroy()
      return
    }
    // Stop managed process trees first, then quit for real.
    event.preventDefault()
    disposed = true
    const timeout = new Promise((resolve) => setTimeout(resolve, disposeTimeoutMs))
    void Promise.race([core.dispose(), timeout])
      .catch((error: unknown) => console.error('[quit] failed to stop runs', error))
      // Not directly: with nothing to stop, dispose settles in the microtasks Node drains as
      // this handler returns. On SIGTERM Electron calls Quit() with no JS on the stack, so a
      // nested quit would run inside it and be overwritten by this prevented one, leaving
      // DevHub running with every window closed (#39).
      .finally(() => setImmediate(() => app.quit()))
  })

  // With "keep in tray" the window only hides, so this fires only for "quit on close".
  app.on('window-all-closed', () => {
    if (closeAction === 'quit') app.quit()
  })
}
