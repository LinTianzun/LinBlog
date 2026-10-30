import { expect, test, type Route } from '@playwright/test'
import { installApiMock } from './fixtures/mockApi'

const wallMessages = [
  {
    id: 501,
    senderName: '读者甲',
    senderAvatar: null,
    content: '第一篇留言：很喜欢这组照片',
    createdAt: '2026-10-20T08:00:00.000Z',
  },
  {
    id: 502,
    senderName: '读者乙',
    senderAvatar: null,
    content: '第二篇留言：期待更新',
    createdAt: '2026-10-21T08:00:00.000Z',
  },
]

test('门户留言墙展示留言，提交后回显到列表首位', async ({ page }) => {
  let created: Record<string, unknown> | null = null
  let wall = [...wallMessages]

  await installApiMock(page)

  await page.route(url => url.pathname === '/api/portal/messages', async (route: Route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        code: 200,
        message: 'ok',
        data: {
          total: wall.length,
          page: 1,
          pageSize: 12,
          totalPage: 1,
          list: wall,
        },
      }),
    })
  })

  await page.route(url => url.pathname === '/api/portal/message', async (route) => {
    created = route.request().postDataJSON() as Record<string, unknown>
    wall = [{
      id: 503,
      senderName: '匿名访客',
      senderAvatar: null,
      content: String(created.content || ''),
      createdAt: new Date().toISOString(),
    }, ...wall]
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ code: 200, message: 'ok', data: { messageId: 503 } }),
    })
  })

  await page.goto('/portal/messages')

  await expect(page.locator('.wall-card')).toHaveCount(2)
  await expect(page.getByText('共 2 条')).toBeVisible()

  await page.getByPlaceholder('给博主留一句想说的话…').fill('第三篇留言：留言墙真的好用')
  await page.getByRole('button', { name: '留言', exact: true }).click()

  await expect.poll(() => created).not.toBeNull()
  expect(created).toEqual({ content: '第三篇留言：留言墙真的好用' })

  await expect(page.getByPlaceholder('给博主留一句想说的话…')).toHaveValue('')
  await expect(page.locator('.wall-card').first()).toContainText('第三篇留言：留言墙真的好用')
  await expect(page.locator('.wall-card')).toHaveCount(3)
})
