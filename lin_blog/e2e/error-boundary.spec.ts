import { expect, test } from '@playwright/test'
import { installApiMock, seedSession } from './fixtures/mockApi'

/**
 * 总览页的访问量折线图会直接对接口返回的 visit 数组做 map。
 * 这里回一个非数组，让子组件在渲染期抛错，验证错误边界把白屏换成可恢复卡片。
 */
test('页面渲染异常时展示错误边界卡片而不是白屏', async ({ page }) => {
  await seedSession(page, {
    id: 1,
    isSuperAdmin: true,
    username: '林知雨',
    mail: 'admin@linlog.com',
    permissions: ['overview.viewAll', 'systemLog.view'],
  })
  await installApiMock(page)

  // 必须在 installApiMock 之后注册：page.route 后注册的先匹配
  await page.route(
    url => url.pathname === '/api/overview/visitStats',
    async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          code: 200,
          message: 'ok',
          data: { visit: 'not-an-array', device: [], website: [] },
        }),
      })
    }
  )

  await page.goto('/overView')

  // 侧栏等外壳仍在，说明不是整站白屏
  await expect(page.getByText('内容与运营控制台')).toBeVisible()

  // 错误边界卡片替换了崩掉的图表区域
  const boundary = page.locator('.error-boundary')
  await expect(boundary).toBeVisible({ timeout: 15_000 })
  await expect(boundary.getByText('这个页面没能正常渲染')).toBeVisible()
  await expect(boundary.getByRole('button', { name: '重试' })).toBeVisible()
  await expect(boundary.getByRole('button', { name: '刷新页面' })).toBeVisible()

  // 详情默认折叠，展开后能看到错误内容
  const detail = boundary.locator('.error-boundary-detail')
  await expect(detail.locator('pre')).toBeHidden()
  await detail.locator('summary').click()
  await expect(detail.locator('pre')).toBeVisible()
})

test('错误边界在正常情况下不拦截渲染', async ({ page }) => {
  await seedSession(page, {
    id: 1,
    isSuperAdmin: true,
    username: '林知雨',
    mail: 'admin@linlog.com',
    permissions: ['overview.viewAll'],
  })
  await installApiMock(page)

  await page.goto('/overView')

  // 总览页要异步加载图表 chunk，等页面稳定后再断言
  // 侧栏链接与页面标题都叫「系统总览」，用 role 精确锁定页面标题
  await expect(
    page.getByRole('heading', { name: '系统总览' })
  ).toBeVisible({ timeout: 20_000 })
  await expect(
    page.getByText('访问量', { exact: true })
  ).toBeVisible({ timeout: 20_000 })
  // 热门路径在无数据时显示空态而非崩溃
  await expect(page.getByText('暂无访问数据')).toBeVisible()
  // 正常路径不应出现错误卡片
  await expect(page.locator('.error-boundary')).toHaveCount(0)
})
