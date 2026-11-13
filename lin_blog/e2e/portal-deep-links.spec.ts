import { expect, test } from '@playwright/test'
import { diaryItem, galleryItem, installApiMock } from './fixtures/mockApi'

test('门户图集详情可通过 open 深链接直接打开和关闭', async ({ page }) => {
  await installApiMock(page)

  await page.goto(`/portal/gallery?open=${galleryItem.id}`)

  const detail = page.getByRole('dialog', { name: galleryItem.title })
  await expect(detail).toBeVisible()
  await expect(detail.getByRole('heading', { name: galleryItem.title })).toBeVisible()
  await expect(detail.locator('.gd-like-btn')).toContainText(String(galleryItem.likes))
  await expect(page).toHaveURL(new RegExp(`open=${galleryItem.id}`))

  await detail.locator('.yk-modal__close').click()

  await expect(detail).toBeHidden()
  await expect(page).not.toHaveURL(/open=/)
})

test('门户随笔详情可通过 open 深链接直接打开和关闭', async ({ page }) => {
  await installApiMock(page)

  await page.goto(`/portal/diary?open=${diaryItem.id}`)

  const detail = page.getByRole('dialog', { name: diaryItem.title })
  await expect(detail).toBeVisible()
  await expect(detail.getByRole('heading', { name: diaryItem.title })).toBeVisible()
  await expect(detail.getByText(diaryItem.content)).toBeVisible()
  await expect(detail.locator('.content-detail-hero-badge').filter({ hasText: diaryItem.weatherName })).toBeVisible()
  await expect(page).toHaveURL(new RegExp(`open=${diaryItem.id}`))

  await detail.locator('.yk-modal__close').click()

  await expect(detail).toBeHidden()
  await expect(page).not.toHaveURL(/open=/)
})
