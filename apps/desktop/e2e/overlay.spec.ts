import type { ElectronApplication, Locator, Page } from '@playwright/test'
import { addProjectViaApi, test, expect, type DevhubWindow } from './fixtures'

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

async function overlayBounds(app: ElectronApplication): Promise<{
  x: number
  y: number
  width: number
  height: number
} | null> {
  return app.evaluate(({ BrowserWindow }) => {
    const panel = BrowserWindow.getAllWindows().find((window) =>
      window.webContents.getURL().includes('view=overlay')
    )
    if (!panel) return null
    const bounds = panel.getBounds()
    return { x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height }
  })
}

async function dragOverlayEdge(
  overlay: Page,
  app: ElectronApplication,
  edge: 'e' | 'w',
  dx: number
): Promise<{ before: number; after: number }> {
  const handle = overlay.locator(`[data-overlay-resize="${edge}"]`)
  const box = await handle.boundingBox()
  const before = await overlayBounds(app)
  if (!box || !before) throw new Error(`overlay ${edge} handle is missing`)
  expect(box.width).toBeGreaterThanOrEqual(6)
  expect(box.height).toBeGreaterThanOrEqual(6)
  await expect.poll(() => handle.evaluate((el) => getComputedStyle(el).cursor)).toBe('ew-resize')
  const x = box.x + box.width / 2
  const y = box.y + Math.min(box.height / 2, 80)
  const hit = await overlay.evaluate(
    ({ px, py }) => {
      const el = document.elementFromPoint(px, py)
      const grip = el?.closest('[data-overlay-resize]')
      return grip?.getAttribute('data-overlay-resize') ?? ''
    },
    { px: x, py: y }
  )
  expect(hit).toBe(edge)
  await overlay.mouse.move(x, y)
  await overlay.mouse.down()
  await overlay.mouse.move(x + dx, y, { steps: 6 })
  await overlay.mouse.up()
  let after = before.width
  await expect
    .poll(async () => {
      after = (await overlayBounds(app))?.width ?? before.width
      return Math.abs(after - before.width)
    })
    .toBeGreaterThan(20)
  return { before: before.width, after }
}

async function popoverInsideOverlay(overlay: Page): Promise<boolean> {
  return overlay.locator('[data-slot="popover-content"]').evaluate((el) => {
    const rect = el.getBoundingClientRect()
    return (
      rect.top >= -1 &&
      rect.left >= -1 &&
      rect.bottom <= window.innerHeight + 1 &&
      rect.right <= window.innerWidth + 1
    )
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
  await expect(main.getByRole('button', { name: '全量dev 的设置' })).toBeVisible()
  await expect(
    page.getByRole('banner').getByRole('button', { name: '显示或隐藏悬浮面板' })
  ).toBeVisible()
  await page.getByRole('button', { name: '设置', exact: true }).click()
  await expect(page.getByRole('slider', { name: '悬浮面板不透明度' })).toBeVisible()
  await page.getByRole('button', { name: '返回' }).click()
  await page.screenshot({ path: testInfo.outputPath('main-toggles.png') })
  await main.getByRole('button', { name: '只看收藏' }).click()
  await expect(main.getByText('扫描资源', { exact: true })).toBeHidden()
  await expect(main.getByText('全量dev', { exact: true })).toBeVisible()

  const overlay = await openOverlay(app, page)
  await expect(overlay.getByRole('heading', { name: '长期运行' })).toBeVisible()
  await expect(overlay.getByRole('heading', { name: '收藏' })).toBeVisible()
  await expect(overlay.getByRole('button', { name: '运行 全量dev' })).toBeVisible()
  await expect(overlay.getByRole('button', { name: '全量dev 的设置' })).toHaveCount(2)
  await expect(overlay.getByText('后端watch')).toHaveCount(0)
  await expect(overlay.getByRole('button', { name: '不透明度' })).toHaveCount(0)
  await expect(overlay.getByRole('button', { name: '提示音' })).toHaveCount(1)
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

  await overlay.getByRole('button', { name: '提示音' }).click()
  const volume = overlay.getByRole('slider', { name: '提示音音量' })
  const mute = overlay.getByRole('switch', { name: '静音' })
  await expect(volume).toBeVisible()
  await expect(overlay.getByText('100%')).toBeVisible()
  await expect(mute).toHaveAttribute('aria-checked', 'false')
  await expect.poll(() => popoverInsideOverlay(overlay)).toBe(true)
  await mute.click()
  await expect(mute).toHaveAttribute('aria-checked', 'true')
  await expect(overlay.getByRole('button', { name: '提示音' })).toHaveAttribute(
    'aria-pressed',
    'false'
  )
  await expect(page.getByRole('button', { name: '提示音' })).toHaveAttribute(
    'aria-pressed',
    'false'
  )
  await volume.fill('0.4')
  await volume.blur()
  await expect
    .poll(() => page.evaluate(() => (window as unknown as DevhubWindow).devhub.getSettings()))
    .toMatchObject({ hookVolume: 0.4, notifyMuted: true })
  await overlay.getByRole('heading', { name: '收藏' }).click()
  await expect(volume).toBeHidden()
  await overlay.getByRole('button', { name: '提示音' }).click()
  await expect(volume).toBeVisible()
  await overlay.keyboard.press('Escape')
  await expect(volume).toBeHidden()
  const regionOf = (locator: Locator): Promise<string> =>
    locator.evaluate((el) => {
      const read = (node: Element | null): string => {
        if (!node) return ''
        const value = getComputedStyle(node).getPropertyValue('-webkit-app-region').trim()
        if (value === 'drag') return 'drag'
        return read(node.parentElement)
      }
      return read(el)
    })
  // A drag ancestor would swallow these clicks on Windows. Neither the row nor the buttons may sit in one.
  await expect.poll(() => regionOf(overlay.getByRole('heading', { name: '长期运行' }))).toBe('')
  await expect.poll(() => regionOf(overlay.getByRole('button', { name: '停止 全量dev' }))).toBe('')
  await expect.poll(() => regionOf(overlay.locator('pre'))).toBe('')

  // Blank card area moves the window. The heading is not a control.
  const beforeMove = await overlayBounds(app)
  const heading = overlay.getByRole('heading', { name: '长期运行' })
  const headingBox = await heading.boundingBox()
  if (!headingBox || !beforeMove) throw new Error('overlay heading is missing')
  await overlay.mouse.move(
    headingBox.x + headingBox.width / 2,
    headingBox.y + headingBox.height / 2
  )
  await overlay.mouse.down()
  await overlay.mouse.move(
    headingBox.x + headingBox.width / 2 - 56,
    headingBox.y + headingBox.height / 2 + 40,
    { steps: 8 }
  )
  await overlay.mouse.up()
  await expect
    .poll(async () => {
      const next = await overlayBounds(app)
      if (!next) return 0
      return Math.abs(next.x - beforeMove.x) + Math.abs(next.y - beforeMove.y)
    })
    .toBeGreaterThan(20)
  await expect
    .poll(() => overlay.locator('pre').evaluate((el) => getComputedStyle(el).userSelect))
    .toBe('text')

  const widened = await dragOverlayEdge(overlay, app, 'w', -48)
  expect(widened.after).toBeGreaterThan(widened.before)

  const beforeResize = await overlayBounds(app)
  const edge = overlay.locator('[data-overlay-resize="e"]')
  if (!beforeResize || !(await edge.boundingBox()))
    throw new Error('overlay resize handle is missing')
  const widths: number[] = []
  const grip = { x: 0, y: 0 }
  await expect
    .poll(async () => {
      const current = await edge.boundingBox()
      if (!current) return ''
      grip.x = current.x + current.width / 2
      grip.y = current.y + Math.min(current.height / 2, 80)
      return overlay.evaluate(
        ({ px, py }) => {
          const el = document.elementFromPoint(px, py)
          return el?.closest('[data-overlay-resize]')?.getAttribute('data-overlay-resize') ?? ''
        },
        { px: grip.x, py: grip.y }
      )
    })
    .toBe('e')
  await overlay.mouse.move(grip.x, grip.y)
  await overlay.mouse.down()
  // Drag inward in steps and sample the width. A flicker would jump the width back up.
  for (let step = 1; step <= 8; step++) {
    await overlay.mouse.move(grip.x - step * 9, grip.y)
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
  await expect(overlay.getByRole('button', { name: '不透明度' })).toHaveCount(0)
  await overlay.getByRole('button', { name: '提示音' }).click()
  await expect(overlay.getByRole('slider', { name: '提示音音量' })).toBeVisible()
  await expect.poll(() => popoverInsideOverlay(overlay)).toBe(true)
  await expect.poll(async () => (await overlayBounds(app))?.height ?? 0).toBeGreaterThanOrEqual(200)
  await overlay.keyboard.press('Escape')
  await expect(overlay.getByRole('slider', { name: '提示音音量' })).toBeHidden()
  await expect.poll(async () => (await overlayBounds(app))?.height ?? 999).toBeLessThan(180)
  await overlay.screenshot({ path: testInfo.outputPath('overlay-empty.png') })
})

test('overlay gear opens this script’s settings inside the window', async ({
  launchDevhub,
  createProject
}) => {
  const dir = await createProject('gear', {
    '.devhub.yaml': [
      'scripts:',
      '  mock:',
      '    command: node -e "console.log(1)"',
      '    overlay: true'
    ].join('\n')
  })
  const { app, page } = await launchDevhub()
  await addProjectViaApi(page, dir)
  const overlay = await openOverlay(app, page)
  const gear = overlay.getByRole('button', { name: 'mock 的设置' })
  await expect(gear).toBeVisible()
  await expect(gear).toHaveClass(/app-no-drag/)
  expect(
    (
      await gear.evaluate((el) => getComputedStyle(el).getPropertyValue('-webkit-app-region'))
    ).trim()
  ).not.toBe('drag')
  await gear.click()
  const dialog = overlay.getByRole('dialog')
  await expect(dialog.getByRole('heading', { name: 'mock 的设置' })).toBeVisible()
  await expect
    .poll(() =>
      dialog.evaluate((el) => {
        const rect = el.getBoundingClientRect()
        return (
          rect.top >= -1 &&
          rect.left >= -1 &&
          rect.bottom <= window.innerHeight + 1 &&
          rect.right <= window.innerWidth + 1
        )
      })
    )
    .toBe(true)
  await dialog.getByRole('checkbox', { name: '收藏' }).check()
  await expect(dialog.getByRole('checkbox', { name: '收藏' })).toBeChecked()
})
