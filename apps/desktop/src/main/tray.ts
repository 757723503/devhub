import { Menu, Tray, nativeImage } from 'electron'
// The @2x variants beside these files are picked up automatically on HiDPI displays.
import trayIcon from '../../resources/tray.png?asset'
// macOS recolours "Template" images to match a light or dark menu bar.
import trayTemplateIcon from '../../resources/trayTemplate.png?asset'

export interface TrayHandlers {
  show: () => void
  toggleOverlay: () => void
  quit: () => void
}

export interface TrayState {
  overlayVisible: boolean
  /** Already formatted for the menu, e.g. `Ctrl+Alt+D`. */
  shortcut: string
}

export function createTray(handlers: TrayHandlers): {
  tray: Tray
  update: (state: TrayState) => void
} {
  const tray = new Tray(
    nativeImage.createFromPath(process.platform === 'darwin' ? trayTemplateIcon : trayIcon)
  )
  tray.setToolTip('DevHub')
  const update = (state: TrayState): void => {
    const overlayLabel = state.overlayVisible ? '隐藏悬浮面板' : '显示悬浮面板'
    tray.setContextMenu(
      Menu.buildFromTemplate([
        { label: '显示窗口', click: handlers.show },
        { label: `${overlayLabel}（${state.shortcut}）`, click: handlers.toggleOverlay },
        { type: 'separator' },
        { label: '退出 DevHub', click: handlers.quit }
      ])
    )
  }
  update({ overlayVisible: false, shortcut: 'Ctrl+Alt+D' })
  tray.on('click', handlers.show)
  return { tray, update }
}
