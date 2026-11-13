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

  await page.getByRole('tab', { name: '养殖' }).click()
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

test('小院可以在小屋、种植、养殖和钓鱼之间切换', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 })
  await seedSession(page, { id: 7, permissions: [] })
  await installApiMock(page)
  await page.goto('/petManage')

  const room = page.locator('[data-pet-home-zone]')
  await expect(room).toBeVisible({ timeout: 30_000 })
  await expect(page.locator('.pet-home-plot')).toHaveCount(4)
  await expect(page.getByRole('tab', { name: '种植' })).toHaveAttribute(
    'aria-selected',
    'true'
  )

  await page.getByRole('tab', { name: '小屋' }).click()
  await expect(page.locator('.pet-home-interior')).toBeVisible()
  await expect(page.locator('.pet-home-plot')).toHaveCount(0)
  await expect(page.locator('.pet-home-room-note')).toContainText('它的小屋')

  await page.getByRole('tab', { name: '养殖' }).click()
  await expect(page.locator('.pet-home-coop')).toBeVisible()
  await expect(page.locator('.pet-home-pasture')).toBeVisible()
  await expect(page.locator('.pet-home-plot')).toHaveCount(0)

  await page.getByRole('tab', { name: '钓鱼' }).click()
  await expect(page.locator('.pet-home-pond')).toBeVisible()
  await expect(page.locator('.pet-home-coop')).toHaveCount(0)

  await page.getByRole('tab', { name: '种植' }).click()
  await expect(page.locator('.pet-home-plot')).toHaveCount(4)
  await expect(page.locator('.pet-home-pond')).toHaveCount(0)
})
