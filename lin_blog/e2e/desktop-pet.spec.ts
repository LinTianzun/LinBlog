import { expect, test } from '@playwright/test'
import { installApiMock } from './fixtures/mockApi'

test('桌宠气泡贴近角色头部而不是视频框边缘', async ({ page }) => {
  await installApiMock(page)
  await page.goto('/loginRegister')

  const pet = page.locator('.dsh-pet-root')
  await expect(pet).toBeVisible({ timeout: 30_000 })

  const stageBox = await pet.locator('.dsh-pet-stage').boundingBox()
  expect(stageBox).not.toBeNull()

  await pet.locator('.dsh-pet-hit').click()
  const bubble = pet.locator('.pet-bubble')
  await expect(bubble).toBeVisible()

  const bubbleBox = await bubble.boundingBox()
  expect(bubbleBox).not.toBeNull()

  // 素材角色可见区域从帧高 17.2% 开始；气泡底部应落在头顶附近
  const charHeadY = stageBox!.y + stageBox!.height * 0.172
  const charCenterX = stageBox!.x + stageBox!.width / 2
  const verticalGap = charHeadY - (bubbleBox!.y + bubbleBox!.height)
  const horizontalOffset = Math.abs(
    bubbleBox!.x + bubbleBox!.width / 2 - charCenterX
  )

  expect(verticalGap).toBeGreaterThan(-12)
  expect(verticalGap).toBeLessThan(16)
  expect(horizontalOffset).toBeLessThan(30)
  expect(bubbleBox!.x).toBeGreaterThanOrEqual(0)
  expect(bubbleBox!.x + bubbleBox!.width).toBeLessThanOrEqual(1280)
})

test('业务事件会驱动桌宠气泡回应', async ({ page }) => {
  await page.addInitScript(() => {
    const now = new Date()
    const today = [
      now.getFullYear(),
      String(now.getMonth() + 1).padStart(2, '0'),
      String(now.getDate()).padStart(2, '0'),
    ].join('-')
    localStorage.setItem(
      'LINBLOG_DESKTOP_PET_VITALS',
      JSON.stringify({
        mood: 70,
        satiety: 60,
        intimacy: 10,
        lastFedAt: 0,
        lastGreetingDate: today,
        firstVisitAt: now.getTime() - 86_400_000,
        updatedAt: now.getTime(),
      })
    )
  })
  await installApiMock(page)
  await page.goto('/loginRegister')

  await expect(page.locator('.dsh-pet-root')).toBeVisible({ timeout: 30_000 })
  await page.evaluate(() => {
    window.dispatchEvent(
      new CustomEvent('linblog:pet-reaction', {
        detail: { kind: 'article-published' },
      })
    )
  })

  await expect(page.locator('.pet-bubble')).toContainText('发布成功')
})

test('仅本机隐藏后可通过右下角爪印恢复', async ({ page }) => {
  await installApiMock(page)
  await page.goto('/loginRegister')

  const pet = page.locator('.dsh-pet-root')
  await expect(pet).toBeVisible({ timeout: 30_000 })

  await pet.locator('.dsh-pet-hit').click({ button: 'right' })
  await page.locator('.pet-menu button', { hasText: '仅本机隐藏' }).click()
  await expect(pet).toBeHidden()

  const restore = page.locator('.dsh-pet-restore')
  await expect(restore).toBeVisible()
  await restore.click()

  await expect(pet).toBeVisible()
})
