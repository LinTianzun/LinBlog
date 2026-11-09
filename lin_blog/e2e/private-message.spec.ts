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

test('AI 拟回复只写入输入框，仍需作者自己发送', async ({ page }) => {
  await installApiMock(page)
  await seedSession(page, {
    id: 1,
    username: '林知雨',
    mail: 'owner@example.com',
    permissions: ['message.private', 'ai.use'],
  })

  await page.goto('/messages?userId=2')
  await expect(page.locator('.chat-thread')).toContainText('想和你聊聊摄影')

  await page.getByRole('button', { name: 'AI 拟回复' }).click()
  const suggestion = page.locator('.chat-ai-suggestion')
  await expect(suggestion).toBeVisible()
  await expect(suggestion).toContainText('谢谢你的留言，我看到了。')

  // 采用前输入框为空，也没有任何消息被发送
  const composer = page.getByPlaceholder('输入回复内容，Ctrl + Enter 发送')
  await expect(composer).toHaveValue('')

  await suggestion.getByRole('button', { name: '采用' }).first().click()
  await expect(composer).toHaveValue('谢谢你的留言，我看到了。')
  await expect(page.locator('.chat-ai-suggestion')).toHaveCount(0)

  // 仍然没有发送：消息列表里只有对方的原始消息
  await expect(page.locator('.chat-thread')).not.toContainText('谢谢你的留言，我看到了。')
})

test('没有 ai.use 权限时私信工作台不出现 AI 拟回复入口', async ({ page }) => {
  await installApiMock(page)
  await seedSession(page, {
    id: 1,
    username: '林知雨',
    mail: 'owner@example.com',
    permissions: ['message.private'],
  })

  await page.goto('/messages?userId=2')
  await expect(page.locator('.chat-thread')).toBeVisible({ timeout: 30_000 })

  await expect(page.getByRole('button', { name: 'AI 拟回复' })).toHaveCount(0)
})
