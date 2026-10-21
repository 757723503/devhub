import { BrowserWindow, shell } from 'electron'
import { join } from 'path'
import { is } from '@electron-toolkit/utils'
import { parseExternalUrl } from './core/shell/external-url'

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
    resizable: false,
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

function loadOverlayRenderer(window: BrowserWindow): void {
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    const url = new URL(process.env['ELECTRON_RENDERER_URL'])
    url.searchParams.set('view', 'overlay')
    void window.loadURL(url.toString())
    return
  }
  void window.loadFile(join(__dirname, '../renderer/index.html'), { query: { view: 'overlay' } })
}
