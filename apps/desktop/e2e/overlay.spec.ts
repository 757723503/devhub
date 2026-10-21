import type { ElectronApplication, Page } from '@playwright/test'
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

  await overlay.getByRole('button', { name: '运行 全量dev' }).click()
  await expect(overlay.getByLabel('就绪')).toBeVisible()
  await expect(overlay.getByText(/compiled successfully/)).toBeVisible()
  await overlay
    .locator('li')
    .filter({ hasText: '全量dev' })
    .getByText('全量dev', { exact: true })
    .click()
  await expect(overlay.locator('pre')).toContainText('compiled successfully')

  await overlay.getByRole('button', { name: '在主窗口打开 全量dev' }).click()
  await expect(page.locator('.xterm-rows')).toContainText('compiled successfully')

  await overlay.getByRole('button', { name: '运行收藏的脚本 云端部署' }).click()
  await expect(overlay.getByRole('heading', { name: '确认运行「云端部署」？' })).toBeVisible()
  await overlay.getByRole('button', { name: '取消' }).click()
  await expect(overlay.getByRole('heading', { name: '确认运行「云端部署」？' })).toBeHidden()

  await overlay.screenshot({ path: testInfo.outputPath('overlay.png') })

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
