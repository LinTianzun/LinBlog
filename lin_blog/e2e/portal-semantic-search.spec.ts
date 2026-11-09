import { expect, test } from '@playwright/test'
import { installApiMock } from './fixtures/mockApi'

test('门户语义搜索展示 AI 扩展关键词与命中结果', async ({ page }) => {
  await installApiMock(page)

  await page.goto('/portal/articles')
  await expect(page.locator('.filter-search')).toBeVisible({ timeout: 30_000 })

  await page.locator('.semantic-toggle').click()
  await expect(page.locator('.semantic-toggle')).toHaveClass(/active/)

  await page.locator('.filter-search input').first().fill('看海')
  await page.locator('.filter-search button[aria-label="搜索"]').click()

  const note = page.locator('.semantic-note')
  await expect(note).toBeVisible()
  await expect(note).toContainText('AI 扩展关键词')
  await expect(note).toContainText('海岸')

  await expect(page.locator('.post-title').first()).toContainText('语义搜索命中的文章')
})

test('关闭语义搜索后回到普通关键词检索', async ({ page }) => {
  await installApiMock(page)

  await page.goto('/portal/articles')
  await expect(page.locator('.filter-search')).toBeVisible({ timeout: 30_000 })

  await page.locator('.semantic-toggle').click()
  await page.locator('.filter-search input').first().fill('看海')
  await page.locator('.filter-search button[aria-label="搜索"]').click()
  await expect(page.locator('.semantic-note')).toBeVisible()

  await page.locator('.semantic-toggle').click()
  await expect(page.locator('.semantic-note')).toHaveCount(0)
})
