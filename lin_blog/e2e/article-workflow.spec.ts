import { expect, test } from '@playwright/test'
import { article, installApiMock, seedSession } from './fixtures/mockApi'
import type { Page } from '@playwright/test'

const EDITOR_ARTICLE_ID = article.id

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

test('编辑页自动保存工作稿，且不会改动线上正文', async ({ page }) => {
  await seedEditorSession(page)
  const state = await installApiMock(page)

  let draftCalls = 0
  page.on('request', request => {
    if (
      request.method() === 'POST' &&
      request.url().includes(`/api/article/${EDITOR_ARTICLE_ID}/workflow/draft`)
    ) {
      draftCalls += 1
    }
  })

  await page.goto(`/editarticle/${EDITOR_ARTICLE_ID}`)
  await expect(page.locator('.w-e-text-container')).toBeVisible({ timeout: 30_000 })

  await page.locator('.forms-title').fill('自动保存后的新标题')
  await expect(page.locator('.edit-article-save-state')).toContainText(/已自动保存|正在自动保存/, {
    timeout: 15_000,
  })

  expect(draftCalls).toBeGreaterThan(0)
  expect(state.workflows[EDITOR_ARTICLE_ID].workingCopy.title).toBe('自动保存后的新标题')
  expect(state.workflows[EDITOR_ARTICLE_ID].hasUnpublishedChanges).toBe(true)
  expect(state.articles[0].title).toBe(article.title)
})

test('预览展示当前编辑内容，版本历史面板可打开', async ({ page }) => {
  await seedEditorSession(page)
  await installApiMock(page)

  await page.goto(`/editarticle/${EDITOR_ARTICLE_ID}`)
  await expect(page.locator('.w-e-text-container')).toBeVisible({ timeout: 30_000 })

  await page.getByRole('button', { name: '预览' }).click()
  // 页面上同时存在预览、版本、定时发布三个弹窗，只有可见的那个是当前目标
  const preview = page.locator('.yk-modal__main:visible').last()
  await expect(preview.locator('.article-preview-title')).toHaveText(article.title)
  await preview.getByRole('button', { name: '返回编辑' }).click()

  await page.getByRole('button', { name: '版本历史' }).click()
  await expect(
    page.locator('.yk-modal__main:visible').last().locator('.version-panel-title')
  ).toBeVisible()
})

test('定时发布可安排并取消', async ({ page }) => {
  await seedEditorSession(page)
  const state = await installApiMock(page)

  await page.goto(`/editarticle/${EDITOR_ARTICLE_ID}`)
  await expect(page.locator('.w-e-text-container')).toBeVisible({ timeout: 30_000 })

  await page.getByRole('button', { name: '定时发布' }).click()
  await page.getByText('安排发布时间').click()
  const dialog = page.locator('.yk-modal__main:visible').last()
  await dialog.locator('input[type="datetime-local"]').fill('2030-01-02T09:00')
  await dialog.getByRole('button', { name: '确认安排' }).click()

  await expect(page.locator('.edit-article-schedule-banner')).toBeVisible({ timeout: 10_000 })
  expect(state.workflows[EDITOR_ARTICLE_ID].scheduledAt).toBeTruthy()

  await page.locator('.edit-article-schedule-banner button').click()
  await expect(page.locator('.edit-article-schedule-banner')).toHaveCount(0, { timeout: 10_000 })
  expect(state.workflows[EDITOR_ARTICLE_ID].scheduledAt).toBeNull()
})
