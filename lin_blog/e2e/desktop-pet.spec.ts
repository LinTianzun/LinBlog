import { expect, test } from '@playwright/test'
import { installApiMock, seedSession } from './fixtures/mockApi'

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

test('触摸长按桌宠可以打开操作菜单', async ({ page }) => {
  await installApiMock(page)
  await page.goto('/loginRegister')

  const pet = page.locator('.dsh-pet-root')
  await expect(pet).toBeVisible({ timeout: 30_000 })

  const hit = pet.locator('.dsh-pet-hit')
  const box = await hit.boundingBox()
  expect(box).not.toBeNull()
  const init = {
    pointerType: 'touch',
    pointerId: 11,
    bubbles: true,
    clientX: box!.x + box!.width / 2,
    clientY: box!.y + box!.height / 2,
  }

  await hit.dispatchEvent('pointerdown', init)
  await expect(page.locator('.pet-menu')).toBeVisible({ timeout: 2_000 })
  await hit.dispatchEvent('pointerup', init)
})

test('带跳转的气泡按钮可以打开对应内容', async ({ page }) => {
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
        detail: {
          kind: 'article-published',
          actionPath: '/portal/articles?open=1201',
          actionLabel: '去看看',
        },
      })
    )
  })

  await page.locator('.pet-bubble-action').click()
  await page.waitForURL(/\/portal\/articles\?open=1201/)
})

test('动画加载失败时显示静态桌宠兜底', async ({ page }) => {
  await installApiMock(page)
  await page.goto('/loginRegister')

  const pet = page.locator('.dsh-pet-root')
  await expect(pet).toBeVisible({ timeout: 30_000 })
  await pet.locator('.dsh-pet-video.is-front').dispatchEvent('error')
  await expect(pet.locator('.dsh-pet-fallback')).toBeVisible()
})

test('宠物管理页修改桌宠名字后状态气泡立即使用新名字', async ({ page }) => {
  await seedSession(page, { id: 7, permissions: [] })
  await installApiMock(page)
  await page.goto('/petManage')

  const input = page.locator('.pet-name-field input')
  await expect(input).toBeVisible({ timeout: 30_000 })
  await expect(page.locator('.pet-milestone').first()).toBeVisible()
  await input.fill('团子')
  await input.press('Enter')

  const pet = page.locator('.dsh-pet-root')
  await expect(pet.locator('.dsh-pet-hit')).toHaveAttribute('aria-label', /团子/)

  await pet.locator('.dsh-pet-hit').click({ button: 'right' })
  await page.locator('.pet-menu button', { hasText: '看看状态' }).click()
  await expect(page.locator('.pet-bubble')).toContainText('我叫团子')
})

test('宠物管理页桌宠活动范围限制在宠物之家内', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 })
  await seedSession(page, { id: 7, permissions: [] })
  await installApiMock(page)
  await page.goto('/petManage')

  const pet = page.locator('.dsh-pet-root')
  const home = page.locator('[data-pet-home-zone]')
  await expect(pet).toBeVisible({ timeout: 30_000 })
  await expect(home).toBeVisible()

  const assertInsideHome = async () => {
    const homeBox = await home.boundingBox()
    const petBox = await pet.boundingBox()
    expect(homeBox).not.toBeNull()
    expect(petBox).not.toBeNull()
    expect(petBox!.x).toBeGreaterThanOrEqual(homeBox!.x - 12)
    expect(petBox!.y).toBeGreaterThanOrEqual(homeBox!.y - 12)
    expect(petBox!.x + petBox!.width).toBeLessThanOrEqual(
      homeBox!.x + homeBox!.width + 12
    )
    expect(petBox!.y + petBox!.height).toBeLessThanOrEqual(
      homeBox!.y + homeBox!.height + 12
    )
  }

  await assertInsideHome()

  const hitBox = await pet.locator('.dsh-pet-hit').boundingBox()
  expect(hitBox).not.toBeNull()
  await page.mouse.move(hitBox!.x + hitBox!.width / 2, hitBox!.y + hitBox!.height / 2)
  await page.mouse.down()
  await page.mouse.move(16, 16, { steps: 8 })
  await page.mouse.up()
  await page.waitForTimeout(700)

  await assertInsideHome()
})

test('系统设置只保留本机宠物偏好，不再承载完整宠物配置', async ({ page }) => {
  await seedSession(page, { id: 7, permissions: [] })
  await installApiMock(page)
  await page.goto('/setting')

  const localPet = page.locator('.set-local-pet')
  await expect(localPet).toBeVisible({ timeout: 30_000 })
  await expect(localPet).toContainText('本机隐藏桌宠')
  await expect(localPet).toContainText('夜间安静时段')
  await expect(localPet).toContainText('重置本机偏好')

  await expect(page.locator('.pet-name-field')).toHaveCount(0)
  await expect(page.locator('.pet-milestone')).toHaveCount(0)
  await expect(page.getByText('显示桌面宠物', { exact: true })).toHaveCount(0)
})

test('宠物管理页每日任务完成后刷新仍然保留', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 })
  await seedSession(page, { id: 7, permissions: [] })
  await installApiMock(page)
  await page.goto('/loginRegister')

  await page.evaluate(() => {
    const now = new Date()
    const today = [
      now.getFullYear(),
      String(now.getMonth() + 1).padStart(2, '0'),
      String(now.getDate()).padStart(2, '0'),
    ].join('-')
    localStorage.setItem(
      'LINBLOG_DESKTOP_PET_VITALS:u7',
      JSON.stringify({
        name: '团子',
        mood: 50,
        satiety: 30,
        intimacy: 10,
        streakDays: 1,
        lastVisitDate: today,
        totalInteractions: 0,
        lastFedAt: 0,
        lastGreetingDate: today,
        firstVisitAt: now.getTime() - 86_400_000,
        unlockedAchievements: [],
        celebratedAchievements: [],
        dailyTasks: {
          date: today,
          progress: { feed: 0, publish: 0, comment: 0 },
          rewarded: [],
        },
        updatedAt: now.getTime(),
      })
    )
  })

  await page.goto('/petManage')
  await expect(page.locator('.pet-task')).toHaveCount(3)
  const feedTask = page.locator('.pet-task').filter({ hasText: '喂它一次' })
  await expect(feedTask).toContainText('进行中')

  await page.locator('.pet-hero-actions').getByRole('button', { name: /喂一口/ }).click()
  await expect(feedTask).toContainText('已完成')
  await expect(page.locator('.pet-task-count')).toHaveText('1/3')

  await page.reload()
  await expect(
    page.locator('.pet-task').filter({ hasText: '喂它一次' })
  ).toContainText('已完成')
})

test('桌宠隐藏时发布事件仍会记录每日任务', async ({ page }) => {
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
        mood: 50,
        satiety: 60,
        intimacy: 10,
        lastFedAt: 0,
        lastGreetingDate: today,
        firstVisitAt: now.getTime() - 86_400_000,
        dailyTasks: {
          date: today,
          progress: { feed: 0, publish: 0, comment: 0 },
          rewarded: [],
        },
        updatedAt: now.getTime(),
      })
    )
  })
  await installApiMock(page)
  await page.goto('/loginRegister')

  const pet = page.locator('.dsh-pet-root')
  await expect(pet).toBeVisible({ timeout: 30_000 })
  await pet.locator('.dsh-pet-hit').click({ button: 'right' })
  await page.locator('.pet-menu button', { hasText: '仅本机隐藏' }).click()
  await expect(pet).toBeHidden()

  await page.evaluate(() => {
    window.dispatchEvent(
      new CustomEvent('linblog:pet-reaction', {
        detail: { kind: 'article-published' },
      })
    )
  })

  await expect
    .poll(() =>
      page.evaluate(() => {
        const raw = localStorage.getItem('LINBLOG_DESKTOP_PET_VITALS')
        const vitals = raw ? JSON.parse(raw) : null
        return vitals?.dailyTasks?.progress?.publish
      })
    )
    .toBe(1)
})

test('宠物管理页展示已解锁成就与新成就标记', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 })
  await seedSession(page, { id: 7, permissions: [] })
  await installApiMock(page)
  await page.goto('/loginRegister')

  await page.evaluate(() => {
    const now = new Date()
    const today = [
      now.getFullYear(),
      String(now.getMonth() + 1).padStart(2, '0'),
      String(now.getDate()).padStart(2, '0'),
    ].join('-')
    localStorage.setItem(
      'LINBLOG_DESKTOP_PET_VITALS:u7',
      JSON.stringify({
        name: '团子',
        mood: 70,
        satiety: 60,
        intimacy: 20,
        streakDays: 8,
        lastVisitDate: today,
        totalInteractions: 12,
        lastFedAt: 0,
        lastGreetingDate: today,
        firstVisitAt: now.getTime() - 8 * 86_400_000,
        unlockedAchievements: ['streak:3', 'streak:7', 'interaction:10'],
        celebratedAchievements: [],
        dailyTasks: {
          date: today,
          progress: { feed: 0, publish: 0, comment: 0 },
          rewarded: [],
        },
        updatedAt: now.getTime(),
      })
    )
  })

  await page.goto('/petManage')
  const streakGroup = page.locator('.pet-achievement-group').filter({
    hasText: '连续陪伴',
  })
  const streakThree = streakGroup.locator('.pet-milestone').filter({
    hasText: /^3天/,
  })
  await expect(streakThree).toContainText('已解锁')
  await expect(streakThree.locator('.pet-milestone-new')).toBeVisible()
  await expect(page.locator('.pet-card').filter({ hasText: '成长足迹' })).toContainText(
    '已解锁 3 个成就'
  )
})
