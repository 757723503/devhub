import type { ElectronApplication, Locator, Page } from '@playwright/test'
import { addProjectViaApi, test, expect } from './fixtures'

const yaml = [
  'scripts:',
  '  全量dev:',
  '    command: node watch.js',
  '    favorite: true',
  '    overlay: true',
  '    status:',
  '      presets: [webpack]',
  '  后端watch:',
  '    command: node -e "setInterval(() => {}, 1000)"',
  '    status: tstl',
  '  同步拉取:',
  '    command: node -e "console.log(\'synced\')"',
  '    favorite: true',
  '  云端部署:',
  '    command: node -e "console.log(\'deployed\')"',
  '    favorite: true',
  '    confirm: true',
  '  扫描资源:',
  '    command: node -e "console.log(\'scan\')"'
].join('\n')

const watchJs = [
  "console.log('Compiling...')",
  'setTimeout(() => {',
  "  console.log('webpack compiled successfully')",
  '  setInterval(() => {}, 1000)',
  '}, 200)'
].join('\n')

async function overlayBounds(
  app: ElectronApplication
): Promise<{ width: number; height: number } | null> {
  return app.evaluate(({ BrowserWindow }) => {
    const panel = BrowserWindow.getAllWindows().find((window) =>
      window.webContents.getURL().includes('view=overlay')
    )
    if (!panel) return null
    const bounds = panel.getBounds()
    return { width: bounds.width, height: bounds.height }
  })
}

async function openOverlay(app: ElectronApplication, page: Page): Promise<Page> {
  await page.getByRole('button', { name: '显示或隐藏悬浮面板' }).click()
  await expect.poll(() => app.windows().length).toBeGreaterThan(1)
  const overlay = app.windows().find((window) => window.url().includes('view=overlay'))
  if (!overlay) throw new Error('overlay window did not load')
  await overlay.waitForLoadState('domcontentloaded')
  return overlay
}

test('overlay lists long-running scripts and favorites, and confirms before a flagged script', async ({
  launchDevhub,
  createProject
}, testInfo) => {
  const dir = await createProject('axe', { '.devhub.yaml': yaml, 'watch.js': watchJs })
  const { app, page } = await launchDevhub()
  await addProjectViaApi(page, dir)

  const main = page.locator('main')
  await expect(main.getByRole('button', { name: '取消收藏 全量dev' })).toBeVisible()
  await expect(main.getByRole('button', { name: '收藏 扫描资源' })).toBeVisible()
  await expect(main.getByRole('button', { name: '不在悬浮面板显示 全量dev' })).toBeVisible()
  await expect(main.getByRole('button', { name: '在悬浮面板显示 扫描资源' })).toBeVisible()
  await expect(
    page.getByRole('banner').getByRole('button', { name: '显示或隐藏悬浮面板' })
  ).toBeVisible()
  await page.screenshot({ path: testInfo.outputPath('main-toggles.png') })
  await main.getByRole('button', { name: '只看收藏' }).click()
  await expect(main.getByText('扫描资源', { exact: true })).toBeHidden()
  await expect(main.getByText('全量dev', { exact: true })).toBeVisible()

  const overlay = await openOverlay(app, page)
  await expect(overlay.getByRole('heading', { name: '长期运行' })).toBeVisible()
  await expect(overlay.getByRole('heading', { name: '收藏' })).toBeVisible()
  await expect(overlay.getByRole('button', { name: '运行 全量dev' })).toBeVisible()
  await expect(overlay.getByText('后端watch')).toHaveCount(0)
  await expect(overlay.getByRole('button', { name: '不透明度' })).toBeVisible()
  await expect(overlay.getByRole('button', { name: '运行收藏的脚本 同步拉取' })).toBeVisible()
  await expect(overlay.getByLabel('空闲')).toBeVisible()
  await expect.poll(async () => (await overlayBounds(app))?.height ?? 0).toBeLessThan(520)
  const hugged = await overlayBounds(app)

  await overlay.getByRole('button', { name: '运行 全量dev' }).click()
  await expect(overlay.getByLabel('就绪')).toBeVisible()
  await expect(overlay.getByText(/compiled successfully/)).toBeVisible()
  await overlay
    .locator('li')
    .filter({ hasText: '全量dev' })
    .getByText('全量dev', { exact: true })
    .click()
  await expect(overlay.locator('pre')).toContainText('compiled successfully')
  await expect
    .poll(async () => (await overlayBounds(app))?.height ?? 0)
    .toBeGreaterThan((hugged?.height ?? 0) + 24)

  await overlay.getByRole('button', { name: '在主窗口打开 全量dev' }).click()
  await expect(page.locator('.xterm-rows')).toContainText('compiled successfully')

  await overlay.getByRole('button', { name: '运行收藏的脚本 云端部署' }).click()
  await expect(overlay.getByRole('heading', { name: '确认运行「云端部署」？' })).toBeVisible()
  await overlay.getByRole('button', { name: '取消' }).click()
  await expect(overlay.getByRole('heading', { name: '确认运行「云端部署」？' })).toBeHidden()

  await page.screenshot({
    path: testInfo.outputPath('title-bar-mute.png'),
    clip: { x: 0, y: 0, width: 720, height: 48 }
  })
  await overlay.screenshot({ path: testInfo.outputPath('overlay.png') })

  await expect(overlay.getByRole('button', { name: '关闭状态提示音' })).toBeVisible()
  const regionOf = (locator: Locator): Promise<string> =>
    locator.evaluate((el) => {
      const read = (node: Element | null): string => {
        if (!node) return ''
        const value = getComputedStyle(node).getPropertyValue('-webkit-app-region').trim()
        if (value) return value
        return read(node.parentElement)
      }
      return read(el)
    })
  await expect.poll(() => regionOf(overlay.getByRole('heading', { name: '长期运行' }))).toBe('drag')
  await expect
    .poll(() => regionOf(overlay.getByRole('button', { name: '停止 全量dev' })))
    .toBe('no-drag')
  await expect
    .poll(() => overlay.locator('pre').evaluate((el) => getComputedStyle(el).userSelect))
    .toBe('text')

  const beforeResize = await overlayBounds(app)
  const edge = overlay.locator('[data-overlay-resize="e"]')
  const box = await edge.boundingBox()
  if (!box || !beforeResize) throw new Error('overlay resize handle is missing')
  const widths: number[] = []
  await overlay.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  await overlay.mouse.down()
  // Drag inward in steps and sample the width. A flicker would jump the width back up.
  for (let step = 1; step <= 8; step++) {
    await overlay.mouse.move(box.x + box.width / 2 - step * 9, box.y + box.height / 2)
    const bounds = await overlayBounds(app)
    if (bounds) widths.push(bounds.width)
  }
  await overlay.mouse.up()
  for (let i = 1; i < widths.length; i++) {
    expect(widths[i] ?? 0).toBeLessThanOrEqual((widths[i - 1] ?? 0) + 2)
  }
  await expect
    .poll(async () => (await overlayBounds(app))?.width ?? 999)
    .toBeLessThan(beforeResize.width - 40)

  await overlay.getByRole('button', { name: '隐藏悬浮面板' }).click()
  // A hidden Electron window can keep document.visibilityState as "visible".
  await expect
    .poll(() =>
      app.evaluate(({ BrowserWindow }) => {
        const panel = BrowserWindow.getAllWindows().find((window) =>
          window.webContents.getURL().includes('view=overlay')
        )
        return panel?.isVisible() ?? false
      })
    )
    .toBe(false)
})

test('overlay shrinks when nothing is listed', async ({
  launchDevhub,
  createProject
}, testInfo) => {
  const dir = await createProject('plain', {
    '.devhub.yaml': ['scripts:', '  扫描资源:', '    command: node -e "console.log(1)"'].join('\n')
  })
  const { app, page } = await launchDevhub()
  await addProjectViaApi(page, dir)
  const overlay = await openOverlay(app, page)
  await expect(overlay.getByText('没有要放在悬浮面板上的脚本')).toBeVisible()
  await expect(overlay.getByRole('heading', { name: '长期运行' })).toHaveCount(0)
  await expect(overlay.getByRole('heading', { name: '收藏' })).toHaveCount(0)
  await expect.poll(async () => (await overlayBounds(app))?.height ?? 999).toBeLessThan(180)
  await overlay.screenshot({ path: testInfo.outputPath('overlay-empty.png') })
})
