import { expect, test, type Route } from '@playwright/test'
import { installApiMock, seedSession } from './fixtures/mockApi'

const logs = [
  {
    id: 1,
    userId: 1,
    username: '林知雨',
    userType: 'admin',
    action: 'update',
    module: 'permission',
    targetType: 'permission',
    targetId: null,
    detail: '角色权限变更：编辑 授予「管理内容系列」',
    ip: '127.0.0.1',
    createdAt: '2026-11-14T09:30:00.000Z',
  },
  {
    id: 2,
    userId: 1,
    username: '林知雨',
    userType: 'admin',
    action: 'delete',
    module: 'article',
    targetType: 'article',
    targetId: 3,
    detail: '删除文章「旧文章」',
    ip: '127.0.0.2',
    createdAt: '2026-11-14T08:10:00.000Z',
  },
  {
    id: 3,
    userId: 1,
    username: '林知雨',
    userType: 'admin',
    action: 'update',
    module: 'pet',
    targetType: 'site_setting',
    targetId: null,
    detail: '更新宠物站点设置：显示范围、尺寸档位',
    ip: '127.0.0.3',
    createdAt: '2026-11-13T21:40:00.000Z',
  },
]

const fulfillJson = async (route: Route, body: unknown) => {
  await route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify(body),
  })
}

test('系统日志支持风险筛选、高级筛选与详情抽屉', async ({ page }) => {
  await seedSession(page, {
    id: 1,
    username: '林知雨',
    isSuperAdmin: true,
    permissions: ['systemLog.view'],
  })
  await installApiMock(page)

  const requests: URLSearchParams[] = []
  const pruneRequests: Array<{ days?: number }> = []
  await page.route(
    url => url.pathname === '/api/systemLog',
    async route => {
      requests.push(new URL(route.request().url()).searchParams)
      await fulfillJson(route, {
        code: 200,
        message: 'ok',
        data: {
          total: logs.length,
          page: 1,
          pageSize: 10,
          totalPage: 1,
          list: logs,
        },
      })
    }
  )
  await page.route(
    url => url.pathname === '/api/systemLog/risk-summary',
    route => fulfillJson(route, {
      code: 200,
      message: 'ok',
      data: {
        days: 7,
        highRisk: 3,
        permissionChanges: 1,
        backupOps: 0,
        petChanges: 1,
        recent: [logs[0]],
      },
    })
  )
  await page.route(
    url => url.pathname === '/api/systemLog/prune',
    async route => {
      pruneRequests.push(route.request().postDataJSON() ?? {})
      await fulfillJson(route, {
        code: 200,
        message: '已清理 12 条系统日志',
        data: { deleted: 12, retentionDays: 180 },
      })
    }
  )

  await page.goto('/systemLog')

  await expect(page.getByText('近 7 天有 3 条高风险操作')).toBeVisible()
  const permissionChip = page.locator('.risk-chip', { hasText: '权限变更' })
  await expect(permissionChip).toContainText('1')
  await expect(page.locator('.log-risk-tag').first()).toBeVisible()

  await permissionChip.click()
  await expect.poll(() => requests.at(-1)?.get('module')).toBe('permission')

  await page.locator('.risk-chip', { hasText: '全部高风险' }).click()
  await expect.poll(() => requests.at(-1)?.get('risk')).toBe('high')

  await page.locator('.system-log-row').filter({ hasText: '角色权限变更' }).first().click()
  await expect(page.locator('.log-detail')).toBeVisible()
  await expect(page.locator('.log-detail')).toContainText('127.0.0.1')
  await expect(page.locator('.log-detail')).toContainText('角色权限变更')
  await page.keyboard.press('Escape')
  await expect(page.locator('.log-detail')).toHaveCount(0)

  await page.getByRole('button', { name: /高级筛选/ }).click()
  const operatorInput = page.getByPlaceholder('输入用户名')
  await operatorInput.fill('林知雨')
  await operatorInput.press('Enter')
  await expect.poll(() => requests.at(-1)?.get('operator')).toBe('林知雨')

  const ipInput = page.getByPlaceholder('如 127.0.0')
  await ipInput.fill('127.0.0.1')
  await ipInput.press('Enter')
  await expect.poll(() => requests.at(-1)?.get('ip')).toBe('127.0.0.1')

  await expect(page.locator('.advanced-count')).toHaveText('2')
  await page.getByRole('button', { name: '清除条件' }).click()
  await expect.poll(() => requests.at(-1)?.get('operator')).toBeNull()
  await expect.poll(() => requests.at(-1)?.get('ip')).toBeNull()

  await page.getByLabel('日志保留天数').fill('180')
  await page.getByRole('button', { name: '清理旧日志' }).click()
  await expect(page.locator('.log-prune')).toContainText('180')
  await page.getByRole('button', { name: '确认清理' }).click()
  await expect.poll(() => pruneRequests.at(-1)?.days).toBe(180)
  await expect(page.locator('.maintenance-result')).toContainText('12')
})
