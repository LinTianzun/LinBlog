import { expect, test } from '@playwright/test'
import { installApiMock, seedSession } from './fixtures/mockApi'

test('博主从会话列表回复读者私信', async ({ page }) => {
  await installApiMock(page)
  await seedSession(page, {
    id: 1,
    username: '林知雨',
    mail: 'owner@example.com',
    permissions: ['message.private'],
  })

  await page.goto('/messages?userId=2')
  await expect(page.locator('.conversation-item')).toContainText('读者乙')
  await expect(page.locator('.chat-thread')).toContainText('想和你聊聊摄影')

  const composer = page.getByPlaceholder('输入回复内容，Ctrl + Enter 发送')
  await composer.fill('收到，晚点详细回复你')

  const requestPromise = page.waitForRequest(request =>
    request.method() === 'POST'
    && new URL(request.url()).pathname === '/api/message'
  )
  await page.getByRole('button', { name: '发送', exact: true }).click()

  const request = await requestPromise
  expect(request.postDataJSON()).toMatchObject({
    receiverId: 2,
    type: 'private',
    content: '收到，晚点详细回复你',
  })
  await expect(page.locator('.chat-thread')).toContainText('收到，晚点详细回复你')
})
