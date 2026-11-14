import { expect, test } from '@playwright/test'
import {
  article,
  installApiMock,
  modalRootClass,
  seedSession,
} from './fixtures/mockApi'

test('草稿箱汇总草稿并支持直接发布', async ({ page }) => {
  await seedSession(page, {
    id: 1,
    isSuperAdmin: false,
    username: '林知雨',
    mail: 'admin@linlog.com',
    permissions: [
      'article.create',
      'article.viewAll',
      'article.manageOwn',
      'article.publish',
    ],
  })
  const state = await installApiMock(page)
  state.articles.push({
    ...article,
    id: 1401,
    title: '还没写完的草稿',
    state: 'draft',
    updatedAt: '2026-11-14T08:00:00.000Z',
  })

  await page.goto('/draftBox')

  const card = page.locator('.draft-card').filter({ hasText: '还没写完的草稿' })
  await expect(card).toHaveCount(1)
  await expect(page.locator('.draft-stat').filter({ hasText: '博客文章' })).toContainText('1')

  await card.getByRole('button', { name: '立即发布' }).click()
  const dialog = page.locator(`${modalRootClass}:visible`).last()
  const publishRequest = page.waitForRequest(request =>
    request.method() === 'PATCH'
    && request.url().includes('/api/article/1401/status')
  )
  await dialog.getByRole('button', { name: '确认发布' }).click()
  await publishRequest

  await expect(card).toHaveCount(0)
  await expect(page.getByText('这里还没有草稿，去写点什么吧')).toBeVisible()
})
