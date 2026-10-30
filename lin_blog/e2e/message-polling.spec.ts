import { expect, test, type Route } from '@playwright/test'
import { initialConversation, installApiMock, owner, seedSession } from './fixtures/mockApi'

const readerThree = {
  userId: 3,
  name: '读者丙',
  avatar: null,
  lastContent: '刚发来一条新私信',
  lastAt: '2026-10-30T09:20:00.000Z',
  lastSenderId: 3,
  unreadCount: 1,
  total: 1,
  isOwner: false,
}

const fulfillJson = async (route: Route, data: unknown) => {
  await route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ code: 200, message: 'ok', data }),
  })
}

test('私信页轮询刷新未读徽标并提示其他会话新消息', async ({ page }) => {
  await page.clock.install()
  await installApiMock(page)

  let unread = 1
  let conversations = [{ ...initialConversation }]

  await page.route(
    url => url.pathname === '/api/message/unread/count',
    route => fulfillJson(route, { unreadCount: unread, type: 'private' }),
  )
  await page.route(
    url => url.pathname === '/api/permission/me',
    route => fulfillJson(route, {
      permissions: ['message.private'],
      isSuperAdmin: false,
      canEditPermissions: false,
    }),
  )
  await page.route(
    url => url.pathname === '/api/message/conversations',
    route => fulfillJson(route, { owner, conversations }),
  )

  await seedSession(page, {
    id: 1,
    username: '林知雨',
    mail: 'owner@example.com',
    permissions: ['message.private'],
  })

  await page.goto('/messages?userId=2')
  await expect(page.getByRole('button', { name: '私信 · 1 条未读' })).toBeVisible()
  await expect(page.locator('.conversation-item').filter({ hasText: '读者乙' }))
    .toContainText('1')

  unread = 2
  conversations = [
    { ...initialConversation, unreadCount: 2 },
    { ...readerThree },
  ]

  await page.clock.fastForward(20_500)

  await expect(page.getByRole('button', { name: '私信 · 2 条未读' })).toBeVisible()
  await expect(page.getByText('收到来自 读者丙 的新私信')).toBeVisible()
  await expect(page.locator('.conversation-item').filter({ hasText: '读者丙' }))
    .toContainText('刚发来一条新私信')
})
