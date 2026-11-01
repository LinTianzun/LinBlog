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
  await expect(page.locator('.file-item-name-source')).toHaveCount(1)

  // 内容图片用 /api/uploads 地址展示，磁盘文件走 /api/file/:id/download
  await expect(page.locator('.file-item').first().locator('img')).toHaveAttribute(
    'src',
    /\/api\/uploads\/1700000000-cover\.jpg/
  )
})
