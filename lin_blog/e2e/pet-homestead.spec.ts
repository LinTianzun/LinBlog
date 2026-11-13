import { expect, test } from '@playwright/test'
import { installApiMock, seedSession } from './fixtures/mockApi'

test('小院可以播种浇水收产物并持久化仓库', async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 1080 })
  await seedSession(page, { id: 7, permissions: [] })
  await page.addInitScript(() => {
    const now = Date.now()
    localStorage.setItem(
      'LINBLOG_DESKTOP_PET_HOMESTEAD:u7',
      JSON.stringify({
        plots: [
          {
            cropId: 'radish',
            plantedAt: now - 10 * 60_000,
            wateredAt: now - 9 * 60_000
          },
          { cropId: 'tomato', plantedAt: now - 2 * 60_000, wateredAt: 0 },
          { cropId: null, plantedAt: 0, wateredAt: 0 },
          { cropId: 'corn', plantedAt: now - 20 * 60_000, wateredAt: 0 }
        ],
        animals: {
          chicken: {
            lastProduceAt: now - 9 * 60_000,
            lastManureAt: now - 7 * 60_000
          },
          cow: { lastProduceAt: now - 13 * 60_000, lastManureAt: now }
        },
        lastFishedAt: now - 4 * 60_000,
        inventory: {
          radish: 3,
          tomato: 0,
          corn: 0,
          strawberry: 0,
          egg: 2,
          milk: 1,
          fish: 1,
          fertilizer: 2
        },
        totals: { harvests: 0, eggs: 0, milk: 0, fish: 0, manure: 0 },
        updatedAt: now
      })
    )
  })
  await installApiMock(page)
  await page.goto('/petManage')

  const plots = page.locator('.pet-home-plot')
  const store = page.locator('.pet-homestead-store')
  await expect(plots).toHaveCount(4, { timeout: 30_000 })
  await expect(store).toContainText('胡萝卜 ×3')

  await plots.nth(2).click()
  await expect(plots.nth(2)).toHaveAttribute('aria-label', /胡萝卜还没浇水/)
  await plots.nth(2).click()
  await expect(plots.nth(2)).toHaveAttribute('aria-label', /胡萝卜已浇水/)

  await page.locator('.pet-home-coop').click()
  await expect(store).toContainText('鸡蛋 ×3')
  await expect(store).toContainText('肥料 ×3')

  await page.locator('.pet-homestead-tend').click()
  await expect(store).toContainText('胡萝卜 ×5')
  await expect(store).toContainText('玉米 ×3')
  await expect(store).toContainText('鱼 ×2')

  const saved = await page.evaluate(() => {
    const raw = localStorage.getItem('LINBLOG_DESKTOP_PET_HOMESTEAD:u7')
    return raw ? (JSON.parse(raw) as { inventory?: { radish?: number } }) : null
  })
  expect(saved?.inventory?.radish).toBe(5)
})
