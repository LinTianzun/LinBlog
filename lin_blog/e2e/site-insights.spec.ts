import { expect, test } from '@playwright/test'
import { installApiMock, seedSession } from './fixtures/mockApi'

test('站点洞察展示搜索与 404 摘要并支持切换周期', async ({ page }) => {
  await installApiMock(page)
  await seedSession(page, {
    id: 1,
    username: '林知雨',
    permissions: ['overview.viewAll'],
  })

  await page.goto('/siteInsights')

  await expect(page.getByRole('heading', { name: '站点洞察' })).toBeVisible()
  await expect(page.locator('.insight-fact').nth(0).locator('strong')).toHaveText('42')
  await expect(page.locator('.insight-fact').nth(2).locator('strong')).toHaveText('8')
  await expect(page.getByRole('link', { name: 'Vue 响应式' })).toBeVisible()
  await expect(page.getByRole('link', { name: '/portal/articles/1201' })).toBeVisible()

  const request = page.waitForRequest(request =>
    request.method() === 'GET'
    && new URL(request.url()).pathname === '/api/overview/siteEvents'
    && new URL(request.url()).searchParams.get('days') === '30'
  )
  await page.getByRole('button', { name: '30 天' }).click()
  await request
  await expect(page.getByRole('button', { name: '30 天' })).toHaveClass(/is-active/)
})

test('门户普通搜索会记录关键词与结果数', async ({ page }) => {
  await installApiMock(page)

  await page.goto('/portal/articles')
  await expect(page.locator('.filter-search')).toBeVisible({ timeout: 30_000 })

  await page.locator('.filter-search input').first().fill('慢速河流')
  const requestPromise = page.waitForRequest(request =>
    request.method() === 'POST'
    && new URL(request.url()).pathname === '/api/public/site-event/search'
  )
  await page.locator('.filter-search button[aria-label="搜索"]').click()

  const request = await requestPromise
  expect(request.postDataJSON()).toMatchObject({
    keyword: '慢速河流',
    source: 'standard',
  })
  expect((request.postDataJSON() as { resultCount?: number }).resultCount).toBeGreaterThanOrEqual(0)
})

test('门户未知路径会记录 404 路径', async ({ page }) => {
  await installApiMock(page)

  const requestPromise = page.waitForRequest(request =>
    request.method() === 'POST'
    && new URL(request.url()).pathname === '/api/public/site-event/not-found'
  )
  await page.goto('/portal/missing-page')

  await expect(page.getByText('页面走丢了')).toBeVisible()
  const request = await requestPromise
  expect(request.postDataJSON()).toEqual({ path: '/portal/missing-page' })
})
