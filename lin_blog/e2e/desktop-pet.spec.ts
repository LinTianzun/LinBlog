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
