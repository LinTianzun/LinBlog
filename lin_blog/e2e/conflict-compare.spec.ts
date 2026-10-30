import { expect, test } from '@playwright/test'
import { article, installApiMock, seedSession } from './fixtures/mockApi'
import type { Page } from '@playwright/test'

async function seedEditorSession(page: Page) {
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

async function seedConflictWorkflow(page: Page, state: Awaited<ReturnType<typeof installApiMock>>) {
  state.workflows[article.id] = {
    articleId: article.id,
    classify: 'article',
    state: 'published',
    revision: 5,
    savedAt: '2026-10-30T09:00:00.000Z',
    scheduledAt: null,
    publishedAt: article.publishedAt,
    hasUnpublishedChanges: false,
    workingCopy: {
      title: article.title,
      subsetId: article.subsetId,
      classify: 'article',
      label: article.label ?? '',
      introduce: article.introduce ?? '',
      content: article.content ?? '',
      cover: article.cover ?? '',
      state: 'published',
    },
  }
}

test('冲突时保留我的修改会以对方修订号覆盖保存', async ({ page }) => {
  await seedEditorSession(page)
  const state = await installApiMock(page)
  await seedConflictWorkflow(page, state)

  const draftBodies: Record<string, unknown>[] = []
  page.on('request', request => {
    if (
      request.method() === 'POST' &&
      request.url().includes(`/api/article/${article.id}/workflow/draft`)
    ) {
      const body = request.postDataJSON() as Record<string, unknown> | null
      if (body) draftBodies.push(body)
    }
  })

  await page.goto(`/editarticle/${article.id}`)
  await expect(page.locator('.w-e-text-container')).toBeVisible({ timeout: 30_000 })

  // 模拟其他窗口在本窗口编辑期间抢先保存：修订号推进、标题被对方改掉
  state.workflows[article.id].revision = 6
  state.workflows[article.id].workingCopy.title = '其他窗口的新标题'

  await page.locator('.forms-title').fill('本窗口的标题')
  await expect(page.locator('.edit-article-save-state')).toContainText(
    '工作稿已在其他窗口更新',
    { timeout: 15_000 }
  )

  await page.locator('.edit-article-retry').click()
  const dialog = page.locator('.yk-modal__main:visible').last()
  await expect(dialog).toContainText('修订 #6')
  await expect(dialog).toContainText('本窗口的标题')
  await expect(dialog).toContainText('其他窗口的新标题')

  await dialog.getByRole('button', { name: '保留我的修改并覆盖' }).click()
  await expect(page.locator('.edit-article-save-state')).toContainText('已自动保存', {
    timeout: 15_000,
  })

  const keepBody = draftBodies[draftBodies.length - 1]
  expect(keepBody.revision).toBe(6)
  expect(keepBody.title).toBe('本窗口的标题')
  expect(state.workflows[article.id].revision).toBe(7)
  expect(state.workflows[article.id].workingCopy.title).toBe('本窗口的标题')
})

test('冲突时可采用对方版本回到最新工作稿', async ({ page }) => {
  await seedEditorSession(page)
  const state = await installApiMock(page)
  await seedConflictWorkflow(page, state)

  await page.goto(`/editarticle/${article.id}`)
  await expect(page.locator('.w-e-text-container')).toBeVisible({ timeout: 30_000 })

  state.workflows[article.id].revision = 8
  state.workflows[article.id].workingCopy.title = '其他窗口的最终标题'

  await page.locator('.forms-title').fill('本窗口的标题')
  await expect(page.locator('.edit-article-save-state')).toContainText(
    '工作稿已在其他窗口更新',
    { timeout: 15_000 }
  )

  await page.locator('.edit-article-retry').click()
  const dialog = page.locator('.yk-modal__main:visible').last()
  await expect(dialog).toContainText('修订 #8')

  await dialog.getByRole('button', { name: '采用对方版本' }).click()
  await expect(page.locator('.forms-title')).toHaveValue('其他窗口的最终标题', {
    timeout: 15_000,
  })
  expect(state.workflows[article.id].revision).toBe(8)
})
