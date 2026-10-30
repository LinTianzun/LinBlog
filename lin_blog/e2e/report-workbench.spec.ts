import { expect, test, type Page, type Route } from '@playwright/test'
import { installApiMock, modalRootClass, seedSession } from './fixtures/mockApi'

const reportBase = {
  targetType: 'article' as const,
  detail: '',
  handledAt: null,
  handleNote: '',
  handlerName: null,
  reporter: { id: 7, name: '普通用户' },
}

const reportList = [
  {
    ...reportBase,
    id: 101,
    commentId: 201,
    reason: 'spam',
    status: 0,
    createdAt: '2026-10-29T09:00:00.000Z',
    comment: {
      id: 201,
      content: '这是第一条待处理举报',
      status: 1,
      likes: 1,
      complaint: 2,
      createdAt: '2026-10-29T08:00:00.000Z',
      user: { id: 9, name: '读者甲', avatar: null },
    },
    source: { type: 'article' as const, id: 1201, title: '把日常写成一条慢速河流', classify: 'article' as const },
  },
  {
    ...reportBase,
    id: 102,
    commentId: 202,
    reason: 'abuse',
    status: 0,
    createdAt: '2026-10-29T10:00:00.000Z',
    comment: {
      id: 202,
      content: '这是第二条待处理举报',
      status: 1,
      likes: 0,
      complaint: 1,
      createdAt: '2026-10-29T09:00:00.000Z',
      user: { id: 10, name: '读者乙', avatar: null },
    },
    source: { type: 'article' as const, id: 1202, title: '摄影与光线', classify: 'image' as const },
  },
  {
    ...reportBase,
    id: 103,
    commentId: 203,
    reason: 'other',
    status: 0,
    createdAt: '2026-10-30T08:00:00.000Z',
    detail: '希望补充说明',
    comment: {
      id: 203,
      content: '这是第三条待处理举报',
      status: 0,
      likes: 0,
      complaint: 3,
      createdAt: '2026-10-30T07:00:00.000Z',
      user: { id: 11, name: '读者丙', avatar: null },
    },
    source: { type: 'article' as const, id: 1203, title: '雨天随笔', classify: 'diary' as const },
  },
]

interface ReportMocks {
  listQuery: URLSearchParams | null
  batchPayload: Record<string, unknown> | null
  singlePayload: Record<string, unknown> | null
}

async function installReportMock(page: Page): Promise<ReportMocks> {
  const mocks: ReportMocks = {
    listQuery: null,
    batchPayload: null,
    singlePayload: null,
  }

  const fulfill = async (route: Route, data: unknown) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ code: 200, message: 'ok', data }),
    })
  }

  await page.route(url => url.pathname === '/api/comment/reports', async (route) => {
    mocks.listQuery = new URL(route.request().url()).searchParams
    await fulfill(route, {
      total: reportList.length,
      page: 1,
      pageSize: 10,
      totalPage: 1,
      list: reportList,
      summary: {
        total: 4,
        pending: 3,
        resolved: 1,
        dismissed: 0,
        reasons: { spam: 2, abuse: 1, other: 1 },
      },
      trend: [{
        date: '2026-10-30',
        total: 3,
        pending: 3,
        resolved: 0,
        dismissed: 0,
      }],
    })
  })

  await page.route(url => url.pathname === '/api/comment/reports/batch', async (route) => {
    mocks.batchPayload = route.request().postDataJSON() as Record<string, unknown>
    await fulfill(route, { updated: 3, requested: 3, status: 1 })
  })

  await page.route(url => url.pathname === '/api/comment/reports/101', async (route) => {
    mocks.singlePayload = route.request().postDataJSON() as Record<string, unknown>
    await fulfill(route, { id: 101, status: 2 })
  })

  return mocks
}

test('举报工作台可批量标记已处理并提交处理备注', async ({ page }) => {
  await installApiMock(page)
  const mocks = await installReportMock(page)
  await seedSession(page, {
    id: 1,
    username: '林知雨',
    isSuperAdmin: false,
    permissions: ['comment.moderate'],
  })

  await page.goto('/reportedComments')
  await expect(page.locator('.report-stat').filter({ hasText: '待处理' })).toContainText('3')
  await expect(page.locator('.report-card')).toHaveCount(3)

  await page.getByText('全选本页待处理').click()
  await expect(page.locator('.report-batch-bar')).toContainText('已选 3 / 3 条')

  await page.locator('.report-batch-note').fill('统一归档并通知作者')
  await page.locator('.report-batch-actions').getByRole('button', { name: '标记已处理' }).click()

  await expect.poll(() => mocks.batchPayload).not.toBeNull()
  expect(mocks.batchPayload).toMatchObject({
    ids: [101, 102, 103],
    status: 1,
    note: '统一归档并通知作者',
  })
  await expect(page.locator('.report-batch-select')).toContainText('已选 0 / 3 条')
  await expect(page.locator('.report-batch-note')).toHaveValue('')
})

test('举报工作台支持日期筛选与单条备注处理', async ({ page }) => {
  await installApiMock(page)
  const mocks = await installReportMock(page)
  await seedSession(page, {
    id: 1,
    username: '林知雨',
    isSuperAdmin: false,
    permissions: ['comment.moderate'],
  })

  await page.goto('/reportedComments')
  await expect(page.locator('.report-card')).toHaveCount(3)

  await page.getByLabel('开始日期').fill('2026-10-01')
  await page.getByLabel('结束日期').fill('2026-10-30')
  const filterRequest = page.waitForRequest(request =>
    request.method() === 'GET'
    && new URL(request.url()).pathname === '/api/comment/reports'
    && new URL(request.url()).searchParams.get('startDate') === '2026-10-01'
  )
  await page.locator('.report-date-editor').getByRole('button', { name: '应用' }).click()
  const filteredRequest = await filterRequest
  expect(new URL(filteredRequest.url()).searchParams.get('endDate')).toBe('2026-10-30')

  await page.locator('.report-card').first().getByRole('button', { name: '备注处理' }).click()
  const noteDialog = page.locator(modalRootClass).filter({ hasText: '处理举报并填写备注' })
  await expect(noteDialog).toBeVisible()
  await noteDialog.getByRole('button', { name: '忽略举报' }).click()
  await noteDialog.getByPlaceholder('例如：已删除违规评论并通知作者').fill('证据不足，暂不处理')
  await noteDialog.getByRole('button', { name: '保存并完成处理' }).click()

  await expect.poll(() => mocks.singlePayload).not.toBeNull()
  expect(mocks.singlePayload).toMatchObject({
    status: 2,
    note: '证据不足，暂不处理',
  })
  await expect(noteDialog).toBeHidden()
  expect(mocks.listQuery?.get('startDate')).toBe('2026-10-01')
})
