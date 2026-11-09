import { expect, test } from '@playwright/test'
import { article, galleryItem, installApiMock, seedSession } from './fixtures/mockApi'
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
  // 选中态必须明显：徽标 + 主题色描边，而不是只有一条细边框
  await expect(picker.locator('.media-picker-item.is-selected')).toHaveCount(1)
  await expect(picker.locator('.media-picker-item.is-selected .media-picker-item-check')).toBeVisible()
  await picker.getByRole('button', { name: '确定' }).click()

  await expect(page.locator('.waterfall-item')).toHaveCount(before + 1)

  // 素材库图片走 /api/file/:id/raw，工作稿内容里应保留这个地址
  // 自动保存是异步的：轮询工作稿内容，避免读到上一轮的保存结果
  await expect
    .poll(() => state.workflows[GALLERY_ID]?.workingCopy.content || '', { timeout: 15_000 })
    .toContain('/api/file/501/raw')
})

test('文章封面从素材库选择后只展示一张图', async ({ page }) => {
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
      'file.view',
    ],
  })
  await installApiMock(page)

  await page.goto(`/editarticle/${article.id}`)
  await expect(page.locator('.forms-cover')).toBeVisible({ timeout: 30_000 })

  await page.getByRole('button', { name: '从素材库选择' }).click()
  const picker = page.locator('.yk-modal__main:visible').last()
  await picker.locator('.media-picker-item').first().click()
  await picker.getByRole('button', { name: '确定' }).click()

  // 封面上传组件自己会渲染缩略图，额外再加一张预览图会出现「两张封面」
  await expect(page.locator('.forms-cover img')).toHaveCount(1)
})
