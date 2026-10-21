import { z } from 'zod'
import { BrowserWindow, dialog, ipcMain, shell } from 'electron'
import {
  DevhubError,
  devhubApiMethods,
  devhubEventChannel,
  ipcChannel,
  overlayFocusSchema,
  overlayMoveSchema,
  overlayResizeSchema,
  shellChannel,
  type DevhubApi,
  type DevhubEvents
} from '@devhub/shared'
import type { OverlayController } from './overlay-controller'
import { toIpcResult } from './core/api-result'
import { isDirectory } from './core/fs/is-directory'
import { parseExternalUrl } from './core/shell/external-url'
import { resolveProjectFolder } from './core/shell/project-folder'

type AnyApiMethod = (...args: unknown[]) => Promise<unknown>

/**
 * Exposes every DevhubApi method over IPC, wrapping results in an IpcResult envelope,
 * and forwards core events to every window (hidden ones too, so state stays current).
 */
export function registerIpcHandlers(core: DevhubApi & DevhubEvents): void {
  core.subscribe((event) => {
    for (const window of BrowserWindow.getAllWindows()) {
      if (!window.webContents.isDestroyed()) window.webContents.send(devhubEventChannel, event)
    }
  })

  for (const method of devhubApiMethods) {
    const handler = core[method] as AnyApiMethod
    ipcMain.handle(ipcChannel(method), (_event, ...args: unknown[]) =>
      toIpcResult(method, () => handler(...args))
    )
  }

  ipcMain.handle(shellChannel.pickDirectory, (event) =>
    toIpcResult('pickDirectory', async () => {
      const window = BrowserWindow.fromWebContents(event.sender)
      const options = { properties: ['openDirectory' as const] }
      const result = window
        ? await dialog.showOpenDialog(window, options)
        : await dialog.showOpenDialog(options)
      return result.canceled ? null : (result.filePaths[0] ?? null)
    })
  )

  ipcMain.handle(shellChannel.pickFile, (event, title: unknown) =>
    toIpcResult('pickFile', async () => {
      const window = BrowserWindow.fromWebContents(event.sender)
      const options = {
        title: typeof title === 'string' ? title.slice(0, 100) : undefined,
        properties: ['openFile' as const]
      }
      const result = window
        ? await dialog.showOpenDialog(window, options)
        : await dialog.showOpenDialog(options)
      return result.canceled ? null : (result.filePaths[0] ?? null)
    })
  )

  ipcMain.handle(shellChannel.openExternal, (_event, url: unknown) =>
    toIpcResult('openExternal', () => shell.openExternal(parseExternalUrl(url)))
  )

  ipcMain.handle(shellChannel.openProjectFolder, (_event, projectId: unknown) =>
    toIpcResult('openProjectFolder', async () => {
      const folder = await resolveProjectFolder(projectId, {
        listProjects: () => core.listProjects(),
        isDirectory
      })
      // Resolves to an error message rather than rejecting.
      const failure = await shell.openPath(folder)
      if (failure) throw new DevhubError('OPEN_FOLDER_FAILED', `无法打开目录：${failure}`)
    })
  )
}

/** Panel window controls. Not part of DevhubApi: a remote client has no desktop window. */
export function registerOverlayIpc(overlay: OverlayController): void {
  ipcMain.handle(shellChannel.getOverlayState, () =>
    toIpcResult(shellChannel.getOverlayState, async () => overlay.getState())
  )
  ipcMain.handle(shellChannel.setOverlayPinned, (_event, pinned: unknown) =>
    toIpcResult(shellChannel.setOverlayPinned, async () => {
      const parsed = z.boolean().safeParse(pinned)
      if (!parsed.success) throw new DevhubError('INVALID_INPUT', '置顶参数无效')
      overlay.setPinned(parsed.data)
    })
  )
  ipcMain.handle(shellChannel.hideOverlay, () =>
    toIpcResult(shellChannel.hideOverlay, async () => overlay.hide())
  )
  ipcMain.handle(shellChannel.toggleOverlay, () =>
    toIpcResult(shellChannel.toggleOverlay, async () => overlay.toggle())
  )
  ipcMain.handle(shellChannel.showMainWindow, () =>
    toIpcResult(shellChannel.showMainWindow, async () => overlay.showMain())
  )
  ipcMain.handle(shellChannel.focusRun, (_event, projectId: unknown, runId: unknown) =>
    toIpcResult(shellChannel.focusRun, async () => {
      const parsed = overlayFocusSchema.safeParse({ projectId, runId })
      if (!parsed.success) throw new DevhubError('INVALID_INPUT', '无法打开这次运行')
      overlay.focusRun(parsed.data.projectId, parsed.data.runId)
    })
  )
  ipcMain.handle(shellChannel.setOverlayContentHeight, (_event, height: unknown) =>
    toIpcResult(shellChannel.setOverlayContentHeight, async () => {
      const parsed = z.number().finite().min(1).max(4000).safeParse(height)
      if (!parsed.success) throw new DevhubError('INVALID_INPUT', '悬浮面板高度无效')
      overlay.setContentHeight(parsed.data)
    })
  )
  ipcMain.handle(shellChannel.resizeOverlay, (_event, gesture: unknown) =>
    toIpcResult(shellChannel.resizeOverlay, async () => {
      const parsed = overlayResizeSchema.safeParse(gesture)
      if (!parsed.success) throw new DevhubError('INVALID_INPUT', '悬浮面板尺寸无效')
      overlay.resize(parsed.data)
    })
  )
  ipcMain.handle(shellChannel.moveOverlay, (_event, gesture: unknown) =>
    toIpcResult(shellChannel.moveOverlay, async () => {
      const parsed = overlayMoveSchema.safeParse(gesture)
      if (!parsed.success) throw new DevhubError('INVALID_INPUT', '悬浮面板位置无效')
      overlay.move(parsed.data)
    })
  )
}
