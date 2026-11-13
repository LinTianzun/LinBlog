import { expect, test } from '@playwright/test'
import { installApiMock, seedSession } from './fixtures/mockApi'

test('内容健康页展示巡检摘要、问题筛选与编辑入口', async ({ page }) => {
  await installApiMock(page)
  await seedSession(page, {
    id: 1,
    username: '林知雨',
    permissions: ['overview.viewAll'],
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

test('无总览权限时不显示内容健康入口', async ({ page }) => {
  await installApiMock(page)
  await seedSession(page, { permissions: ['article.create'] })

  await page.goto('/article')

  await expect(page.locator('.menu-bar')).toBeVisible()
  await expect(page.locator('.menu-bar').getByText('内容健康')).toHaveCount(0)
})
