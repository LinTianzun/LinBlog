import { expect, test } from '@playwright/test'
import { installApiMock, seedSession } from './fixtures/mockApi'

test('本地文件列表同时展示内容图片与磁盘文件', async ({ page }) => {
  await seedSession(page, {
    id: 1,
    isSuperAdmin: true,
    username: '林知雨',
    mail: 'admin@linlog.com',
    permissions: ['file.view', 'file.upload', 'file.manage'],
  })
  await installApiMock(page)

  await page.goto('/localfile')
  await expect(page.locator('.file-item').first()).toBeVisible({ timeout: 30_000 })

  // 内容图片（二进制在 image 表）与磁盘文件在同一个列表里
  await expect(page.locator('.file-item')).toHaveCount(2)
  await expect(page.locator('.file-item-source-image')).toHaveCount(1)

  // 内容图片要标明被哪篇文章、图库、随笔引用
  await expect(page.locator('.file-item-owner-article')).toContainText('把日常写成一条慢速河流')
  await expect(page.locator('.file-item-owner-diary')).toContainText('雨天的旧书店')

  // 内容图片用 /api/uploads 地址展示，磁盘文件走 /api/file/:id/download
  await expect(page.locator('.file-item').first().locator('img')).toHaveAttribute(
    'src',
    /\/api\/uploads\/1700000000-cover\.jpg/
  )
})

test('本地文件点击卡片可以选中，不会弹出预览图', async ({ page }) => {
  await seedSession(page, {
    id: 1,
    isSuperAdmin: true,
    username: '林知雨',
    mail: 'admin@linlog.com',
    permissions: ['file.view', 'file.upload', 'file.manage'],
  })
  await installApiMock(page)

  await page.goto('/localfile')
  await expect(page.locator('.file-item').first()).toBeVisible({ timeout: 30_000 })

  await page.locator('.file-item').first().click()
  await expect(page.locator('.file-item-selected')).toHaveCount(1)
  // 预览灯箱不应该被卡片点击触发
  await expect(page.locator('.content-lightbox')).toHaveCount(0)
})

test('回收站展示存储维护面板并支持清理缩略图缓存', async ({ page }) => {
  await seedSession(page, {
    id: 1,
    isSuperAdmin: true,
    username: '林知雨',
    mail: 'admin@linlog.com',
    permissions: ['file.view', 'file.upload', 'file.manage', 'file.purge'],
  })
  await installApiMock(page)
  await page.route('**/api/uploads/*', route => route.fulfill({
    status: 200,
    contentType: 'image/png',
    body: Buffer.from('png-bytes'),
  }))

  await page.goto('/localfile')
  await expect(page.locator('.file-item').first()).toBeVisible({ timeout: 30_000 })

  await page.getByRole('button', { name: '回收站' }).click()
  const modal = page.locator('.yk-modal__main:visible').last()

  // 容量卡与维护卡并排：命中率、占用分布都要可见
  await expect(modal.locator('.file-trash-capacity')).toBeVisible()
  await expect(modal.locator('.file-trash-maintenance')).toBeVisible()
  await expect(modal.locator('.file-trash-maintenance')).toContainText('命中率 80%')
  await expect(modal.locator('.file-trash-maintenance')).toContainText('磁盘 3 个')
  await expect(modal.locator('.file-trash-maintenance')).toContainText('内容图片 5 个')

  await modal.getByRole('button', { name: '清理缓存' }).click()
  await expect(page.locator('.yk-modal__main:visible').last().locator('.file-trash-maintenance'))
    .toContainText('0 个变体')
})
