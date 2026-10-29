import { expect, test } from '@playwright/test'
import { installApiMock } from './fixtures/mockApi'

test('门户切换浅色与深色渐变主题并持久化', async ({ page }) => {
  await installApiMock(page)
  await page.goto('/portal/articles')

  await page.locator('.theme-trigger').click()
  await page.locator('.theme-option').filter({ hasText: '暖砂流光' }).click()

  const html = page.locator('html')
  await expect(html).toHaveAttribute('data-theme-preset', 'aurora-dream')
  await expect(html).toHaveAttribute('data-theme-kind', 'gradient')
  await expect(html).toHaveAttribute('data-theme', 'light')

  await page.locator('.theme-trigger').click()
  await page.locator('.theme-option').filter({ hasText: '极夜微光' }).click()

  await expect(html).toHaveAttribute('data-theme-preset', 'aurora-boreal')
  await expect(html).toHaveAttribute('data-theme-kind', 'gradient')
  await expect(html).toHaveAttribute('data-theme', 'dark')

  await page.reload()
  await expect(html).toHaveAttribute('data-theme-preset', 'aurora-boreal')
  await expect(html).toHaveAttribute('data-theme-kind', 'gradient')
  await expect(html).toHaveAttribute('data-theme', 'dark')
})
