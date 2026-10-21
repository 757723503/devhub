import { BrowserWindow, shell } from 'electron'
import { join } from 'path'
import { is } from '@electron-toolkit/utils'
import { parseExternalUrl } from './core/shell/external-url'
import { overlayMinHeight, overlayMinWidth } from './overlay-bounds'

export interface OverlayWindowOptions {
  x: number
  y: number
  width: number
  height: number
  alwaysOnTop: boolean
}

/** Frameless, transparent, skip-taskbar panel. Not shown until the caller asks. */
export function createOverlayWindow(options: OverlayWindowOptions): BrowserWindow {
  const window = new BrowserWindow({
    x: options.x,
    y: options.y,
    width: options.width,
    height: options.height,
    show: false,
    frame: false,
    transparent: true,
    // Windows treats the outer pixels of a resizable frameless window as a non-client
    // border. Those clicks never reach the page, and the controller cancels the native
    // resize, so the in-window grips would do nothing. Stay non-resizable there;
    // applyOverlayBounds unlocks only for a programmatic setBounds. thickFrame would
    // add an opaque border.
    resizable: process.platform !== 'win32',
    thickFrame: false,
    minWidth: overlayMinWidth,
    minHeight: overlayMinHeight,
    maximizable: false,
    minimizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    alwaysOnTop: options.alwaysOnTop,
    hasShadow: false,
    backgroundColor: '#00000000',
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: true,
      contextIsolation: true
    }
  })
  if (options.alwaysOnTop) window.setAlwaysOnTop(true, 'floating')
  // Same rule as the main window: process output must not open an Electron window.
  window.webContents.setWindowOpenHandler((details) => {
    try {
      void shell.openExternal(parseExternalUrl(details.url))
    } catch {
      console.warn('[overlay] blocked opening', details.url)
    }
    return { action: 'deny' }
  })
  loadOverlayRenderer(window)
  return window
}

/**
 * Applies a frame. On Windows the window is not OS-resizable, and setBounds
 * ignores size changes until it is. The unlock stays inside this call so the
 * non-client border is not up while the user is dragging a grip.
 */
export function applyOverlayBounds(
  target: BrowserWindow,
  frame: { x: number; y: number; width: number; height: number }
): void {
  const unlock = process.platform === 'win32' && !target.isResizable()
  if (unlock) target.setResizable(true)
  target.setBounds(frame)
  if (unlock) target.setResizable(false)
}

function loadOverlayRenderer(window: BrowserWindow): void {
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    const url = new URL(process.env['ELECTRON_RENDERER_URL'])
    url.searchParams.set('view', 'overlay')
    void window.loadURL(url.toString())
    return
  }
  void window.loadFile(join(__dirname, '../renderer/index.html'), { query: { view: 'overlay' } })
}
