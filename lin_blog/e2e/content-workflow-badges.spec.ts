import { expect, test } from '@playwright/test'
import { article, installApiMock, seedSession } from './fixtures/mockApi'

async function seedAdmin(page: Parameters<typeof seedSession>[0]) {
  await seedSession(page, {
    id: 1,
    isSuperAdmin: true,
    username: '林知雨',
    mail: 'admin@linlog.com',
    permissions: [
      'article.create',
      'article.manageAll',
      'article.viewAll',
      'article.publish',
    ],
  })
}

test('列表卡片显示未发布修改与定时发布状态', async ({ page }) => {
  await seedAdmin(page)
  const state = await installApiMock(page)

  // 模拟编辑页已保存工作稿并安排发布时间
  state.workflows[article.id] = {
    articleId: article.id,
    classify: 'article',
    state: 'published',
    revision: 2,
    savedAt: '2026-10-30T09:00:00.000Z',
    scheduledAt: '2026-11-01T09:00:00.000Z',
    publishedAt: article.publishedAt,
    hasUnpublishedChanges: true,
    workingCopy: {
      title: '工作稿标题',
      subsetId: article.subsetId,
      classify: 'article',
      label: article.label ?? '',
      introduce: article.introduce ?? '',
      content: article.content ?? '',
      cover: article.cover ?? '',
      state: 'published',
    },
  }

  await page.goto('/article')
  const card = page.locator('.article-item').first()
  await expect(card.locator('.article-item-workflow.is-draft')).toHaveText('有未发布修改')
  await expect(card.locator('.article-item-workflow.is-scheduled')).toContainText('定时发布')
})

test('新建文章内容会自动暂存在本机，刷新后可恢复', async ({ page }) => {
  await seedAdmin(page)
  await installApiMock(page)

  await page.goto('/editarticle')
  await expect(page.locator('.w-e-text-container')).toBeVisible({ timeout: 30_000 })
  await page.locator('.forms-title').fill('本机暂存的新文章')

  await expect
    .poll(async () => page.evaluate(() => localStorage.getItem('linblog.local-draft.article-new')))
    .toContain('本机暂存的新文章')

  // 刷新会先触发 beforeunload 提示，再触发「是否恢复本机草稿」确认，两次都要接受
  page.on('dialog', dialog => dialog.accept())
  await page.reload()
  await expect(page.locator('.w-e-text-container')).toBeVisible({ timeout: 30_000 })
  await expect(page.locator('.forms-title')).toHaveValue('本机暂存的新文章')
})
