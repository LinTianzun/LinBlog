import { expect, test, type Route } from '@playwright/test'
import { installApiMock, seedSession } from './fixtures/mockApi'

type NotificationItem = {
  id: number
  senderId: number | null
  senderName: string | null
  senderAvatar: string | null
  receiverId: number
  receiverName: string | null
  type: 'system' | 'notice'
  content: string
  isRead: number
  createdAt: string
}

const fulfillJson = async (route: Route, body: unknown) => {
  await route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify(body),
  })
}

test('顶栏通知中心展示系统消息并支持已读与删除', async ({ page }) => {
  await seedSession(page, {
    id: 7,
    username: '林知雨',
    permissions: ['message.private'],
  })
  await installApiMock(page)

  let notifications: NotificationItem[] = [
    {
      id: 901,
      senderId: 1,
      senderName: '林知雨',
      senderAvatar: null,
      receiverId: 1,
      receiverName: '林知雨',
      type: 'system',
      content: '模型「智谱 GLM」巡检连续失败 3 次：连接超时',
      isRead: 0,
      createdAt: '2026-11-14T09:30:00.000Z',
    },
    {
      id: 902,
      senderId: 1,
      senderName: '林知雨',
      senderAvatar: null,
      receiverId: 1,
      receiverName: '林知雨',
      type: 'notice',
      content: '定时数据库备份失败：连接失败',
      isRead: 0,
      createdAt: '2026-11-14T08:10:00.000Z',
    },
  ]
  const readBatches: number[][] = []
  const deletedIds: number[] = []
  let readAllCalls = 0

  const unreadCount = () => notifications.filter(item => item.isRead === 0).length

  await page.route(
    url => url.pathname === '/api/message/unread/count',
    route => fulfillJson(route, {
      code: 200,
      message: 'ok',
      data: { unreadCount: 1, type: 'private' },
    })
  )
  await page.route(
    url => url.pathname === '/api/message/notifications/unread/count',
    route => fulfillJson(route, {
      code: 200,
      message: 'ok',
      data: { unreadCount: unreadCount(), type: 'notification' },
    })
  )
  await page.route(
    url => url.pathname === '/api/message/notifications',
    route => fulfillJson(route, {
      code: 200,
      message: 'ok',
      data: {
        total: notifications.length,
        page: 1,
        pageSize: 8,
        totalPage: 1,
        list: notifications,
      },
    })
  )
  await page.route(
    url => url.pathname === '/api/message/notifications/read-all',
    async route => {
      readAllCalls += 1
      notifications = notifications.map(item => ({ ...item, isRead: 1 }))
      await fulfillJson(route, { code: 200, message: 'ok', data: { markedCount: 2 } })
    }
  )
  await page.route(
    url => url.pathname === '/api/message/read',
    async route => {
      const payload = route.request().postDataJSON()?.messageIds
      const ids: number[] = Array.isArray(payload) ? payload : [Number(payload)]
      readBatches.push(ids)
      notifications = notifications.map(item =>
        ids.includes(item.id) ? { ...item, isRead: 1 } : item
      )
      await fulfillJson(route, { code: 200, message: 'ok', data: { markedCount: ids.length } })
    }
  )
  await page.route(
    url => /\/api\/message\/\d+$/.test(url.pathname),
    async route => {
      const id = Number(route.request().url().split('/').pop())
      deletedIds.push(id)
      notifications = notifications.filter(item => item.id !== id)
      await fulfillJson(route, { code: 200, message: 'ok' })
    }
  )

  await page.goto('/setting')

  const bell = page.locator('.notice-button')
  await expect(bell).toBeVisible()
  await expect(bell).toHaveAttribute('title', '通知 · 2 条未读')

  await bell.click()
  await expect(page.locator('.notification-item')).toHaveCount(2)
  await expect(page.locator('.notification-item').first()).toContainText('巡检连续失败')
  await expect(page.locator('.notification-item').first()).toContainText('系统')
  await expect(page.locator('.notification-item').nth(1)).toContainText('通知')

  await page.locator('.notification-main').first().click()
  await expect.poll(() => readBatches.at(-1)).toEqual([901])
  await expect(bell).toHaveAttribute('title', '通知 · 1 条未读')

  await page.getByRole('button', { name: '全部已读' }).click()
  await expect.poll(() => readAllCalls).toBe(1)
  await expect(page.locator('.notification-toolbar')).toContainText('未读 0 条')
  await expect(page.getByRole('button', { name: '全部已读' })).toBeDisabled()

  await page.locator('.notification-delete').first().click()
  await expect.poll(() => deletedIds).toEqual([901])
  await expect(page.locator('.notification-item')).toHaveCount(1)
})
