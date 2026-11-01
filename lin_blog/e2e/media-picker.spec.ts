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
      'file.view',
    ],
  })
}

test('图库可以从素材库挑选本地图片', async ({ page }) => {
  await seedGallerySession(page)
  const state = await installApiMock(page)

  await page.goto(`/editgallery/${GALLERY_ID}`)
  await expect(page.locator('.edit-gallery-body')).toBeVisible({ timeout: 30_000 })

  const before = await page.locator('.waterfall-item').count()
  expect(before).toBe(2)

  await page.getByRole('button', { name: '从素材库选择' }).click()
  const picker = page.locator('.yk-modal__main:visible').last()
  await expect(picker.locator('.media-picker-item')).toHaveCount(2)

  await picker.locator('.media-picker-item').first().click()
  await picker.getByRole('button', { name: '确定' }).click()

  await expect(page.locator('.waterfall-item')).toHaveCount(before + 1)

  // 素材库图片走 /api/file/:id/raw，工作稿内容里应保留这个地址
  await expect(page.locator('.edit-gallery-save-state')).toContainText(/已自动保存|正在自动保存/, {
    timeout: 15_000,
  })
  const content = state.workflows[GALLERY_ID]?.workingCopy.content || ''
  expect(content).toContain('/api/file/501/raw')
})
