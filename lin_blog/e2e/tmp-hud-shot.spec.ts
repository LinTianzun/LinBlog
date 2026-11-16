import { test } from '@playwright/test'
import { installApiMock, seedSession } from './fixtures/mockApi'

test('hud screenshots', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 1000 })
    await seedSession(page, { id: 7, permissions: ['pet.manage'] })
    await page.addInitScript(() => {
        const now = Date.now()
        localStorage.setItem(
            'LINBLOG_DESKTOP_PET_HOMESTEAD:u7',
            JSON.stringify({
                plots: [
                    { cropId: 'radish', plantedAt: now - 600000, wateredAt: now - 540000 },
                    { cropId: 'tomato', plantedAt: now - 120000, wateredAt: 0 },
                    { cropId: null, plantedAt: 0, wateredAt: 0 },
                    { cropId: 'corn', plantedAt: now - 1200000, wateredAt: 0 },
                    { cropId: 'cabbage', plantedAt: now - 1200000, wateredAt: 0 },
                    { cropId: null, plantedAt: 0, wateredAt: 0 },
                ],
                animals: { chicken: { lastProduceAt: now - 540000, lastManureAt: now - 420000 }, cow: { lastProduceAt: now - 780000, lastManureAt: now } },
                lastFishedAt: now - 240000,
                inventory: { radish: 3, tomato: 0, corn: 0, strawberry: 0, egg: 2, milk: 1, fish: 1, fertilizer: 2 },
                totals: { harvests: 0, eggs: 0, milk: 0, fish: 0, manure: 0 },
                updatedAt: now,
            })
        )
    })
    await installApiMock(page)
    await page.goto('/petManage')
    await page.waitForTimeout(3500)
    await page.screenshot({ path: 'visual-checks/hud-grow.png' })
    await page.getByRole('tab', { name: '养殖' }).click()
    await page.waitForTimeout(1600)
    await page.screenshot({ path: 'visual-checks/hud-raise.png' })
    await page.getByRole('tab', { name: '钓鱼' }).click()
    await page.waitForTimeout(1600)
    await page.screenshot({ path: 'visual-checks/hud-fish.png' })
    await page.getByRole('tab', { name: '小屋' }).click()
    await page.waitForTimeout(1200)
    await page.screenshot({ path: 'visual-checks/hud-home.png' })
})
