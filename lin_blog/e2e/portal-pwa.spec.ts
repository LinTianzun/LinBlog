import { expect, test } from '@playwright/test'
import { installApiMock } from './fixtures/mockApi'

test('门户离线时显示阅读提示，恢复网络后自动隐藏', async ({ page }) => {
  await installApiMock(page)
  await page.goto('/portal/articles')
  await expect(page.locator('.portal-offline')).toBeHidden()

  await page.evaluate(() => {
    Object.defineProperty(navigator, 'onLine', {
      configurable: true,
      get: () => false,
    })
    window.dispatchEvent(new Event('offline'))
  })
  await expect(page.locator('.portal-offline')).toBeVisible()
  await expect(page.locator('.portal-offline')).toContainText('当前离线')

  await page.evaluate(() => {
    Object.defineProperty(navigator, 'onLine', {
      configurable: true,
      get: () => true,
    })
    window.dispatchEvent(new Event('online'))
  })
  await expect(page.locator('.portal-offline')).toBeHidden()
})
