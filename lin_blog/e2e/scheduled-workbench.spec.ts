import { expect, test, type Page } from '@playwright/test'
import {
  article,
  galleryItem,
  installApiMock,
  modalRootClass,
  seedSession,
} from './fixtures/mockApi'

type ApiState = Awaited<ReturnType<typeof installApiMock>>

async function seedPublisher(page: Page) {
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
      'gallery.manageAll',
      'gallery.viewAll',
      'gallery.publish',
    ],
  })
}

function scheduleItem(
  state: ApiState,
  target: typeof article | typeof galleryItem,
  scheduledAt: string,
  hasUnpublishedChanges = false,
) {
  state.workflows[target.id] = {
    articleId: target.id,
    classify: target.classify,
    state: 'published',
    revision: hasUnpublishedChanges ? 2 : 1,
    savedAt: '2026-10-30T09:00:00.000Z',
    scheduledAt,
    publishedAt: target.publishedAt,
    hasUnpublishedChanges,
    workingCopy: {
      title: target.title,
      subsetId: target.subsetId,
      classify: target.classify,
      label: target.label ?? '',
      introduce: target.introduce ?? '',
      content: target.content ?? '',
      cover: target.cover ?? '',
      state: 'published',
    },
  }
}

test('定时发布工作台展示待发布队列与逾期告警', async ({ page }) => {
  await seedPublisher(page)
  const state = await installApiMock(page)
  scheduleItem(state, article, '2020-01-01T00:00:00.000Z', true)
  scheduleItem(state, galleryItem, '2030-01-01T00:00:00.000Z')

  await page.goto('/scheduledPublish')

  await expect(page.locator('.sched-card')).toHaveCount(2)
  const overdueCard = page.locator('.sched-card').filter({ hasText: article.title })
  await expect(overdueCard.locator('.sched-state-tag.is-overdue')).toHaveText('逾期')
  await expect(overdueCard.locator('.sched-state-tag.is-draft')).toHaveText('有未发布修改')
  await expect(page.getByRole('alert')).toContainText('1 条内容已到点但尚未发布')
  await expect(page.locator('.sched-stat').filter({ hasText: '待发布总数' })).toContainText('2')
  await expect(page.locator('.sched-stat').filter({ hasText: '已到点未发布' })).toContainText('1')
})

test('定时发布工作台可改期、立即发布与取消计划', async ({ page }) => {
  await seedPublisher(page)
  const state = await installApiMock(page)
  scheduleItem(state, article, '2020-01-01T00:00:00.000Z', true)
  scheduleItem(state, galleryItem, '2030-01-01T00:00:00.000Z')

  await page.goto('/scheduledPublish')
  await expect(page.locator('.sched-card')).toHaveCount(2)

  const articleCard = page.locator('.sched-card').filter({ hasText: article.title })
  await articleCard.getByRole('button', { name: '改期' }).click()
  const rescheduleDialog = page.locator(`${modalRootClass}:visible`).last()
  await rescheduleDialog.locator('input[type="datetime-local"]').fill('2030-01-02T09:00')
  const expectedSchedule = await page.evaluate(
    () => new Date('2030-01-02T09:00').toISOString()
  )
  const scheduleRequest = page.waitForRequest(request =>
    request.method() === 'POST'
    && request.url().includes(`/api/article/${article.id}/workflow/schedule`)
  )
  await rescheduleDialog.getByRole('button', { name: '保存改期' }).click()
  expect((await scheduleRequest).postDataJSON()).toMatchObject({
    scheduledAt: expectedSchedule,
  })
  await expect.poll(() => state.workflows[article.id].scheduledAt).toBe(expectedSchedule)

  const publishRequest = page.waitForRequest(request =>
    request.method() === 'POST'
    && request.url().includes(`/api/article/${article.id}/workflow/publish`)
  )
  await articleCard.getByRole('button', { name: '立即发布' }).click()
  const publishDialog = page.locator(`${modalRootClass}:visible`).last()
  await publishDialog.getByRole('button', { name: '确认立即发布' }).click()
  await publishRequest
  await expect.poll(() => state.workflows[article.id].scheduledAt).toBeNull()
  await expect(articleCard).toHaveCount(0)

  const galleryCard = page.locator('.sched-card').filter({ hasText: galleryItem.title })
  await galleryCard.getByRole('button', { name: '取消计划' }).click()
  const cancelDialog = page.locator(`${modalRootClass}:visible`).last()
  const cancelRequest = page.waitForRequest(request =>
    request.method() === 'DELETE'
    && request.url().includes(`/api/article/${galleryItem.id}/workflow/schedule`)
  )
  await cancelDialog.getByRole('button', { name: '确认取消计划' }).click()
  await cancelRequest
  await expect.poll(() => state.workflows[galleryItem.id].scheduledAt).toBeNull()
  await expect(page.locator('.sched-card')).toHaveCount(0)
  await expect(page.getByText('当前没有安排定时发布的内容')).toBeVisible()
})
