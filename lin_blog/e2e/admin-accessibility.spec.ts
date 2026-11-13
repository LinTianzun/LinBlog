import { expect, test } from '@playwright/test'
import { installApiMock, seedSession } from './fixtures/mockApi'

test('后台可通过跳转链接直达工作区', async ({ page }) => {
  await seedSession(page)
  await installApiMock(page)
  await page.goto('/setting')

  const skipLink = page.locator('.admin-skip-link')
  await expect(skipLink).toHaveCount(1)
  await page.keyboard.press('Tab')
  await expect(skipLink).toBeFocused()

  const outline = await skipLink.evaluate((el) => {
    const style = getComputedStyle(el)
    return { style: style.outlineStyle, width: style.outlineWidth }
  })
  expect(outline.style).not.toBe('none')
  expect(outline.width).not.toBe('0px')

  await page.keyboard.press('Enter')
  await expect(page.locator('#admin-main')).toBeFocused()
  expect(page.url()).toContain('#admin-main')
})

test('后台侧栏标记当前页面', async ({ page }) => {
  await seedSession(page)
  await installApiMock(page)
  await page.goto('/setting')

  const current = page.locator('.menu-bar-nav[aria-current="page"]')
  await expect(current).toHaveCount(1)
  await expect(current).toContainText('系统设置')
})

test('后台主题选择器支持方向键与 Enter', async ({ page }) => {
  await seedSession(page)
  await installApiMock(page)
  await page.goto('/setting')

  const html = page.locator('html')
  const initialPreset = await html.getAttribute('data-theme-preset')
  const trigger = page.locator('.theme-trigger')
  await trigger.focus()
  await page.keyboard.press('ArrowDown')

  await expect(page.locator('.theme-option:focus')).toHaveCount(1)
  await page.keyboard.press('ArrowDown')
  await page.keyboard.press('Enter')

  await expect(page.locator('.theme-panel')).toHaveCount(0)
  await expect(trigger).toBeFocused()
  await expect(html).not.toHaveAttribute('data-theme-preset', initialPreset ?? '')
})

test('后台弹窗具备对话框语义、焦点圈定与关闭后焦点归还', async ({ page }) => {
  await seedSession(page, { id: 1, isSuperAdmin: true, permissions: [] })
  await installApiMock(page)
  await page.goto('/aiManage')

  const opener = page.getByRole('button', { name: '+ 接入模型' }).first()
  await expect(opener).toBeVisible({ timeout: 30_000 })
  await opener.focus()
  await page.keyboard.press('Enter')

  const dialog = page.getByRole('dialog')
  await expect(dialog).toBeVisible()
  await expect(dialog).toHaveAttribute('aria-modal', 'true')
  await expect(dialog).toHaveAttribute('aria-labelledby', /yk-modal-title-/)
  await expect(page.locator('#app')).toHaveAttribute('inert', '')
  expect(await dialog.evaluate((el) => el.contains(document.activeElement))).toBe(true)

  const close = dialog.locator('.yk-modal__close')
  await expect(close).toHaveAttribute('role', 'button')
  await expect(close).toHaveAttribute('tabindex', '0')
  await expect(close).toHaveAttribute('aria-label', '关闭弹窗')

  // 从关闭按钮 Shift+Tab 应回到弹窗内最后一个可聚焦元素，而不是落到背景
  await close.focus()
  await page.keyboard.press('Shift+Tab')
  expect(await dialog.evaluate((el) => el.contains(document.activeElement))).toBe(true)

  await close.focus()
  await page.keyboard.press('Enter')
  await expect(dialog).toBeHidden()
  await expect(page.locator('#app')).not.toHaveAttribute('inert', '')
  await expect(opener).toBeFocused()
})
