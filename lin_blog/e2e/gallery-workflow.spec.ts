import { expect, test } from '@playwright/test'
import { galleryItem, installApiMock, seedSession } from './fixtures/mockApi'
import type { Page } from '@playwright/test'

const GALLERY_ID = galleryItem.id

async function seedGallerySession(page: Page) {
  await seedSession(page, {
    id: 1,
    isSuperAdmin: true,
    username: '林知雨',
    mail: 'admin@linlog.com',
    permissions: [
      'gallery.create',
      'gallery.manageAll',
      'gallery.viewAll',
      'gallery.publish',
    ],
  })
}

test('图库编辑页自动保存工作稿，且不改动线上图库内容', async ({ page }) => {
  await seedGallerySession(page)
  const state = await installApiMock(page)

  let draftCalls = 0
  page.on('request', request => {
    if (
      request.method() === 'POST' &&
      request.url().includes(`/api/article/${GALLERY_ID}/workflow/draft`)
    ) {
      draftCalls += 1
    }
  })

  await page.goto(`/editgallery/${GALLERY_ID}`)
  await expect(page.locator('.edit-gallery-body')).toBeVisible({ timeout: 30_000 })

  await page.locator('.forms-title').fill('自动保存后的图库标题')
  await expect(page.locator('.edit-gallery-save-state')).toContainText(/已自动保存|正在自动保存/, {
    timeout: 15_000,
  })

  expect(draftCalls).toBeGreaterThan(0)
  expect(state.workflows[GALLERY_ID].workingCopy.title).toBe('自动保存后的图库标题')
  expect(state.galleries[0].title).toBe(galleryItem.title)
})

test('图库预览展示图片，版本历史与定时发布可用', async ({ page }) => {
  await seedGallerySession(page)
  const state = await installApiMock(page)

  await page.goto(`/editgallery/${GALLERY_ID}`)
  await expect(page.locator('.edit-gallery-body')).toBeVisible({ timeout: 30_000 })

  await page.getByRole('button', { name: '预览' }).click()
  const preview = page.locator('.yk-modal__main:visible').last()
  await expect(preview.locator('.gallery-preview-title')).toHaveText(galleryItem.title)
  await expect(preview.locator('.gallery-preview-grid img')).toHaveCount(2)
  await preview.getByRole('button', { name: '返回编辑' }).click()

  await page.getByRole('button', { name: '定时发布' }).click()
  await page.getByText('安排发布时间').click()
  const dialog = page.locator('.yk-modal__main:visible').last()
  await dialog.locator('input[type="datetime-local"]').fill('2030-01-02T09:00')
  await dialog.getByRole('button', { name: '确认安排' }).click()

  await expect(page.locator('.edit-gallery-schedule-banner')).toBeVisible({ timeout: 10_000 })
  expect(state.workflows[GALLERY_ID].scheduledAt).toBeTruthy()

  // 版本历史放在最后打开：弹窗会盖住下方的定时发布下拉按钮
  await page.getByRole('button', { name: '版本历史' }).click()
  await expect(
    page.locator('.yk-modal__main:visible').last().locator('.version-panel-title')
  ).toBeVisible()
})
