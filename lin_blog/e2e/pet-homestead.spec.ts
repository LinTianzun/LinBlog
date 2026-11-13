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

test('每日订单可以换金币，商店可以买种子并继续播种', async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 1080 })
  await seedSession(page, { id: 7, permissions: [] })
  await page.addInitScript(() => {
    const now = Date.now()
    const date = new Date(now)
    const day = [
      date.getFullYear(),
      String(date.getMonth() + 1).padStart(2, '0'),
      String(date.getDate()).padStart(2, '0'),
    ].join('-')
    localStorage.setItem(
      'LINBLOG_DESKTOP_PET_HOMESTEAD:u7',
      JSON.stringify({
        plots: [
          { cropId: null, plantedAt: 0, wateredAt: 0, fertilizedAt: 0 },
          { cropId: null, plantedAt: 0, wateredAt: 0, fertilizedAt: 0 },
          { cropId: null, plantedAt: 0, wateredAt: 0, fertilizedAt: 0 },
          { cropId: null, plantedAt: 0, wateredAt: 0, fertilizedAt: 0 }
        ],
        animals: {
          chicken: { lastProduceAt: now, lastManureAt: now },
          cow: { lastProduceAt: now, lastManureAt: now }
        },
        lastFishedAt: now,
        inventory: {
          radish: 3,
          tomato: 0,
          corn: 0,
          strawberry: 0,
          egg: 0,
          milk: 0,
          fish: 0,
          fertilizer: 0
        },
        coins: 50,
        seedStock: {
          radish: 0,
          tomato: 0,
          corn: 0,
          strawberry: 0
        },
        ordersDay: day,
        orders: [
          {
            id: `${day}-test-1`,
            requirements: [{ itemId: 'radish', count: 2 }],
            reward: 40,
            completedAt: 0
          },
          {
            id: `${day}-test-2`,
            requirements: [{ itemId: 'fish', count: 9 }],
            reward: 20,
            completedAt: 0
          },
          {
            id: `${day}-test-3`,
            requirements: [{ itemId: 'milk', count: 9 }],
            reward: 20,
            completedAt: 0
          }
        ],
        totals: { harvests: 0, eggs: 0, milk: 0, fish: 0, manure: 0 },
        updatedAt: now
      })
    )
  })
  await installApiMock(page)
  await page.goto('/petManage')

  await expect(page.locator('.pet-homestead-coins')).toContainText('50', {
    timeout: 30_000,
  })
  await page.locator('.pet-homestead-business-orders').click()

  const modal = page.locator('.yk-modal__main:visible').last()
  await expect(modal.locator('.pet-farm-order')).toHaveCount(3)
  const firstOrder = modal.locator('.pet-farm-order').first()
  await expect(firstOrder).toHaveClass(/is-ready/)
  await firstOrder.locator('.pet-farm-order-foot button').click()
  await expect(modal.locator('.pet-farm-business-coins')).toContainText('90')

  await modal.getByRole('tab', { name: /农场商店/ }).click()
  const radishCard = modal.locator('.pet-farm-shop-card').filter({
    hasText: '胡萝卜种子',
  })
  await radishCard.locator('button').click()
  await expect(modal.locator('.pet-farm-business-coins')).toContainText('78')
  await expect(radishCard).toContainText('库存 3')
  await modal.locator('.yk-modal__close').click()
  await expect(modal).toBeHidden()

  await page.locator('.pet-home-plot').first().click()
  await expect(page.locator('.pet-home-plot').first()).toHaveAttribute(
    'aria-label',
    /胡萝卜还没浇水/
  )
  const saved = await page.evaluate(() => {
    const raw = localStorage.getItem('LINBLOG_DESKTOP_PET_HOMESTEAD:u7')
    return raw
      ? (JSON.parse(raw) as {
          coins?: number
          seedStock?: { radish?: number }
        })
      : null
  })
  expect(saved?.coins).toBe(78)
  expect(saved?.seedStock?.radish).toBe(2)
})

test('小院存档会从云端合并并在改动后自动回传', async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 1080 })
  await seedSession(page, { id: 7, permissions: [] })
  await installApiMock(page)

  const now = Date.now()
  let remote = {
    plots: [
      { cropId: null, plantedAt: 0, wateredAt: 0, fertilizedAt: 0 },
      { cropId: null, plantedAt: 0, wateredAt: 0, fertilizedAt: 0 },
      { cropId: null, plantedAt: 0, wateredAt: 0, fertilizedAt: 0 },
      { cropId: null, plantedAt: 0, wateredAt: 0, fertilizedAt: 0 },
    ],
    animals: {
      chicken: { lastProduceAt: now, lastManureAt: now },
      cow: { lastProduceAt: now, lastManureAt: now },
    },
    lastFishedAt: now,
    inventory: { radish: 2 },
    coins: 210,
    seedStock: { radish: 2 },
    ordersDay: '',
    orders: [],
    totals: { harvests: 2, eggs: 0, milk: 0, fish: 0, manure: 0 },
    autoHelp: {
      enabled: true,
      lastAt: 0,
      day: '',
      count: 0,
      total: 0,
    },
    stateVersion: 0,
    updatedAt: now,
  }
  let uploaded: Record<string, unknown> | null = null

  await page.route('**/api/pet/homestead', async (route) => {
    if (route.request().method() === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ code: 200, message: 'ok', data: remote }),
      })
      return
    }
    const payload = route.request().postDataJSON() as Record<string, unknown>
    uploaded = payload
    remote = { ...remote, ...payload }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ code: 200, message: 'ok', data: remote }),
    })
  })

  await page.goto('/petManage')
  await expect(page.locator('.pet-homestead-coins')).toContainText('210', {
    timeout: 30_000,
  })
  await expect(page.locator('.pet-sync-chip')).toHaveText('已同步')

  await page.locator('.pet-home-plot').first().click()
  await expect(page.locator('.pet-home-plot').first()).toHaveAttribute(
    'aria-label',
    /胡萝卜还没浇水/,
  )
  await expect.poll(() => uploaded).not.toBeNull()
  expect(uploaded?.stateVersion).toBe(0)
  expect((uploaded?.seedStock as { radish?: number } | undefined)?.radish).toBe(1)

  await page.evaluate(() => {
    localStorage.removeItem('LINBLOG_DESKTOP_PET_HOMESTEAD:u7')
  })
  await page.reload()
  await expect(page.locator('.pet-home-plot').first()).toHaveAttribute(
    'aria-label',
    /胡萝卜还没浇水/,
    { timeout: 30_000 },
  )
  await expect(page.locator('.pet-homestead-coins')).toContainText('210')
})

test('小院成就展示累计进度并标记已达成项目', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 })
  await seedSession(page, { id: 7, permissions: [] })
  await page.addInitScript(() => {
    const now = Date.now()
    localStorage.setItem(
      'LINBLOG_DESKTOP_PET_HOMESTEAD:u7',
      JSON.stringify({
        plots: [],
        inventory: { radish: 0, egg: 0, milk: 0, fish: 0, fertilizer: 0 },
        totals: {
          harvests: 25,
          eggs: 20,
          milk: 19,
          fish: 3,
          manure: 15,
        },
        stateVersion: 0,
        updatedAt: now,
      }),
    )
  })
  await installApiMock(page)
  await page.goto('/petManage')

  await expect(page.locator('.pet-home-plot')).toHaveCount(4, {
    timeout: 30_000,
  })
  await page.locator('.pet-homestead-business-achievements').click()
  const modal = page.locator('.yk-modal__main:visible').last()
  await modal.getByRole('tab', { name: /小院成就/ }).click()

  const cards = modal.locator('.pet-farm-achievement')
  await expect(cards).toHaveCount(7)
  await expect(cards.filter({ hasText: '第一捧收成' })).toHaveClass(
    /is-unlocked/,
  )
  await expect(cards.filter({ hasText: '鸡蛋满筐' })).toHaveClass(
    /is-unlocked/,
  )
  const milk = cards.filter({ hasText: '牛奶自由' })
  await expect(milk).not.toHaveClass(/is-unlocked/)
  await expect(milk).toContainText('19/20')
  await expect(cards.filter({ hasText: '钓鱼达人' })).toContainText('3/20')
  await expect(modal).toContainText('已解锁 4/7')

  const firstHarvest = cards.filter({ hasText: '第一捧收成' })
  await firstHarvest.getByRole('button', { name: '领取' }).click()
  await expect(modal.locator('.pet-farm-business-coins')).toContainText('100')
  await expect(firstHarvest).toContainText('已领取')

  const saved = await page.evaluate(() => {
    const raw = localStorage.getItem('LINBLOG_DESKTOP_PET_HOMESTEAD:u7')
    return raw
      ? (JSON.parse(raw) as {
          coins?: number
          claimedAchievements?: string[]
        })
      : null
  })
  expect(saved?.coins).toBe(100)
  expect(saved?.claimedAchievements).toContain('first-harvest')
})
