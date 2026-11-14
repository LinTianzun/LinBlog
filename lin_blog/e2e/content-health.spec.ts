import { expect, test } from '@playwright/test'
import { installApiMock, seedSession } from './fixtures/mockApi'

test('内容健康页展示巡检摘要、问题筛选与编辑入口', async ({ page }) => {
  await installApiMock(page)
  await seedSession(page, {
    id: 1,
    username: '林知雨',
    permissions: ['contentHealth.view'],
  })

  await page.goto('/contentHealth')

  await expect(page.getByRole('heading', { name: '内容健康' })).toBeVisible()
  await expect(page.locator('.health-score strong')).toHaveText('67')
  await expect(page.getByText('有 1 篇内容可以再整理一下')).toBeVisible()
  await expect(page.getByRole('link', { name: '编辑' })).toHaveAttribute('href', '/editarticle/1201')

  await page.getByRole('button', { name: /失效链接/ }).click()
  await expect(page.getByRole('heading', { name: '把日常写成一条慢速河流' })).toBeVisible()
  await expect(page.getByText('/portal/articles?open=999')).toBeVisible()
  await expect(page.getByText('目标文章不存在或未发布')).toBeVisible()

  const request = page.waitForRequest(request =>
    request.method() === 'GET'
    && new URL(request.url()).pathname === '/api/content/health'
    && new URL(request.url()).searchParams.get('staleDays') === '365'
  )
  await page.getByRole('button', { name: '365 天' }).click()
  await request
})

test('无内容健康权限时不显示入口', async ({ page }) => {
  await installApiMock(page)
  await seedSession(page, { permissions: ['article.create'] })

  await page.goto('/article')

  await expect(page.locator('.menu-bar')).toBeVisible()
  await expect(page.locator('.menu-bar').getByText('内容健康')).toHaveCount(0)
})

test('内容健康列表支持分页并在筛选后回到第一页', async ({ page }) => {
  await installApiMock(page)
  await seedSession(page, {
    id: 1,
    username: '林知雨',
    permissions: ['contentHealth.view'],
  })

  const items = Array.from({ length: 13 }, (_, index) => ({
    id: 2200 + index,
    title: `分页检查内容 ${index + 1}`,
    classify: 'article' as const,
    subsetId: 3,
    subsetName: '分页测试',
    label: '分页',
    introduce: '用于验证内容健康页分页。',
    cover: '',
    views: index,
    issues: ['missingCover' as const],
    brokenLinks: [],
    contentLength: 400,
    imageCount: 0,
    publishedAt: '2026-10-20T08:30:00.000Z',
    updatedAt: '2026-10-20T08:30:00.000Z',
    lastTouchedAt: '2026-10-20T08:30:00.000Z',
    editPath: `/editarticle/${2200 + index}`,
    publicPath: `/portal/articles?open=${2200 + index}`,
  }))

  await page.route(/\/api\/content\/health(?:\?.*)?$/, async route => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        code: 200,
        message: 'ok',
        data: {
          generatedAt: '2026-11-13T06:30:00.000Z',
          staleDays: 180,
          scanLimit: 2000,
          summary: {
            published: 13,
            scanned: 13,
            healthy: 0,
            issueItems: 13,
            issues: 13,
            byIssue: {
              missingCover: 13,
              missingIntro: 0,
              uncategorized: 0,
              missingLabels: 0,
              staleContent: 0,
              shortContent: 0,
              emptyGallery: 0,
              brokenLinks: 0,
            },
          },
          truncated: false,
          items,
        },
      }),
    })
  })

  await page.goto('/contentHealth')
  await expect(page.getByRole('heading', { name: '内容健康' })).toBeVisible()
  await expect(page.locator('.health-card')).toHaveCount(10)
  await expect(page.locator('.health-pagination')).toContainText('共 13 条')

  await page.locator('.health-pagination .yk-pagination-pager__item')
    .filter({ hasText: /^2$/ }).click()
  await expect(page.locator('.health-card')).toHaveCount(3)
  await expect(page.locator('.health-card').first()).toContainText('分页检查内容 11')

  await page.getByRole('button', { name: /缺封面/ }).click()
  await expect(page.locator('.health-card')).toHaveCount(10)
  await expect(page.locator('.health-card').first()).toContainText('分页检查内容 1')
})
