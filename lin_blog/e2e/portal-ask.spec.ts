import { expect, test } from '@playwright/test'
import { article, installApiMock } from './fixtures/mockApi'

test('门户问答可根据站内文章作答并给出引用来源', async ({ page }) => {
  await installApiMock(page)

  await page.goto('/portal')

  const askBox = page.locator('.portal-ask')
  await expect(askBox).toBeVisible({ timeout: 30_000 })
  await expect(askBox).toContainText('问问我')

  // 空问题时不应发出请求
  await expect(askBox.getByRole('button', { name: '提问' })).toBeDisabled()

  await askBox.locator('.portal-ask-input').fill('你是怎么坚持写博客的？')
  await askBox.getByRole('button', { name: '提问' }).click()

  await expect(askBox.locator('.portal-ask-answer')).toContainText('慢速河流')
  await expect(askBox.locator('.portal-ask-answer')).toContainText('[1]')

  // 引用来源可点回原文
  const source = askBox.locator('.portal-ask-sources a').first()
  await expect(source).toContainText(article.title)
  await expect(source).toHaveAttribute('href', new RegExp(`open=${article.id}`))
})

test('门户问答提问失败时给出错误提示', async ({ page }) => {
  await installApiMock(page)
  await page.route('**/api/public/ai/ask', async (route) => {
    await route.fulfill({
      status: 503,
      contentType: 'application/json',
      body: JSON.stringify({ code: 503, message: 'AI 问答暂时不可用，请稍后重试' }),
    })
  })

  await page.goto('/portal')
  const askBox = page.locator('.portal-ask')
  await expect(askBox).toBeVisible({ timeout: 30_000 })

  await askBox.locator('.portal-ask-input').fill('测试失败提示')
  await askBox.getByRole('button', { name: '提问' }).click()

  await expect(askBox.locator('.portal-ask-error')).toContainText('AI 问答暂时不可用')
})
