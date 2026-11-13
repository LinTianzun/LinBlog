import { expect, test, type Page } from '@playwright/test'
import { installApiMock, seedSession } from './fixtures/mockApi'

const seedHomestead = async (
  page: Page,
  options: { cooldown?: boolean } = {}
) => {
  await page.addInitScript(({ cooldown }) => {
    const now = Date.now()
    const day = [
      new Date(now).getFullYear(),
      String(new Date(now).getMonth() + 1).padStart(2, '0'),
      String(new Date(now).getDate()).padStart(2, '0'),
    ].join('-')
    localStorage.setItem(
      'LINBLOG_DESKTOP_PET_HOMESTEAD:u7',
      JSON.stringify({
        plots: [
          {
            cropId: 'radish',
            plantedAt: now - 10 * 60_000,
            wateredAt: now - 9 * 60_000,
            fertilizedAt: 0,
          },
          { cropId: null, plantedAt: 0, wateredAt: 0, fertilizedAt: 0 },
          { cropId: null, plantedAt: 0, wateredAt: 0, fertilizedAt: 0 },
          { cropId: null, plantedAt: 0, wateredAt: 0, fertilizedAt: 0 },
        ],
        animals: {
          chicken: { lastProduceAt: now, lastManureAt: now },
          cow: { lastProduceAt: now, lastManureAt: now },
        },
        lastFishedAt: now,
        inventory: {
          radish: 0,
          tomato: 0,
          corn: 0,
          strawberry: 0,
          egg: 0,
          milk: 0,
          fish: 0,
          fertilizer: 0,
        },
        totals: { harvests: 0, eggs: 0, milk: 0, fish: 0, manure: 0 },
        autoHelp: {
          enabled: true,
          lastAt: cooldown ? now : 0,
          day,
          count: 0,
          total: 0,
        },
        updatedAt: now,
      })
    )
    localStorage.setItem(
      'LINBLOG_DESKTOP_PET_SETTINGS',
      JSON.stringify({
        petSize: 'small',
        petActivity: 'quiet',
        petRoamingEnabled: true,
        petBubbleEnabled: true,
      })
    )
  }, options)
}

test('宠物空闲后会自己走到菜地收获并记入小院仓库', async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 1080 })
  await seedSession(page, { id: 7, permissions: [] })
  await seedHomestead(page)
  await installApiMock(page)
  await page.goto('/petManage')

  const plot = page.locator('.pet-home-plot').first()
  await expect(plot).toHaveAttribute('aria-label', /胡萝卜可以收获了/, {
    timeout: 30_000,
  })
  await expect(page.locator('.dsh-pet-root')).toBeVisible({ timeout: 30_000 })

  await expect
    .poll(
      () =>
        page.evaluate(() => {
          const raw = localStorage.getItem('LINBLOG_DESKTOP_PET_HOMESTEAD:u7')
          const state = raw ? JSON.parse(raw) : null
          return {
            radish: state?.inventory?.radish,
            count: state?.autoHelp?.count,
            crop: state?.plots?.[0]?.cropId,
          }
        }),
      { timeout: 35_000 }
    )
    .toMatchObject({ radish: 2, count: 1, crop: null })

  await expect(page.locator('.pet-bubble')).toContainText('胡萝卜', {
    timeout: 5_000,
  })
})

test('手动去帮忙会尊重冷却并给出提示', async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 1080 })
  await seedSession(page, { id: 7, permissions: [] })
  await seedHomestead(page, { cooldown: true })
  await installApiMock(page)
  await page.goto('/petManage')

  await expect(page.locator('.pet-homestead-auto')).toBeVisible({
    timeout: 30_000,
  })
  await page.locator('.pet-homestead-auto-now').click()

  await expect(page.locator('.pet-bubble')).toContainText('刚忙完', {
    timeout: 5_000,
  })
  await expect(page.locator('.pet-homestead-auto')).toContainText('下次帮忙还要')
})
