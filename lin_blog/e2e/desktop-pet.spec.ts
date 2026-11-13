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

test('宠物管理页桌宠可见身体活动范围限制在宠物之家内', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 })
  await seedSession(page, { id: 7, permissions: [] })
  await installApiMock(page)
  await page.goto('/petManage')

  const pet = page.locator('.dsh-pet-root')
  const home = page.locator('[data-pet-home-zone]')
  await expect(pet).toBeVisible({ timeout: 30_000 })
  await expect(home).toBeVisible()

  const assertBodyInsideHome = async () => {
    const homeBox = await home.boundingBox()
    const petBox = await pet.boundingBox()
    expect(homeBox).not.toBeNull()
    expect(petBox).not.toBeNull()
    const bodyBox = {
      x: petBox!.x + petBox!.width * 0.14,
      y: petBox!.y + petBox!.height * 0.172,
      right: petBox!.x + petBox!.width * 0.86,
      bottom: petBox!.y + petBox!.height * 0.917,
    }
    expect(bodyBox.x).toBeGreaterThanOrEqual(homeBox!.x - 12)
    expect(bodyBox.y).toBeGreaterThanOrEqual(homeBox!.y - 12)
    expect(bodyBox.right).toBeLessThanOrEqual(homeBox!.x + homeBox!.width + 12)
    expect(bodyBox.bottom).toBeLessThanOrEqual(
      homeBox!.y + homeBox!.height + 12
    )
  }

  await assertBodyInsideHome()

  const hitBox = await pet.locator('.dsh-pet-hit').boundingBox()
  expect(hitBox).not.toBeNull()
  await page.mouse.move(hitBox!.x + hitBox!.width / 2, hitBox!.y + hitBox!.height / 2)
  await page.mouse.down()
  await page.mouse.move(16, 16, { steps: 8 })
  await page.mouse.up()
  await page.waitForTimeout(700)

  await assertBodyInsideHome()

  const homeBox = await home.boundingBox()
  const nextHitBox = await pet.locator('.dsh-pet-hit').boundingBox()
  expect(homeBox).not.toBeNull()
  expect(nextHitBox).not.toBeNull()
  await page.mouse.move(
    nextHitBox!.x + nextHitBox!.width / 2,
    nextHitBox!.y + nextHitBox!.height / 2
  )
  await page.mouse.down()
  await page.mouse.move(
    homeBox!.x + homeBox!.width + 120,
    homeBox!.y + homeBox!.height + 120,
    { steps: 8 }
  )
  await page.mouse.up()
  await page.waitForTimeout(700)

  await assertBodyInsideHome()
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

test('不同零食提供不同加成并共享冷却', async ({ page }) => {
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
    localStorage.removeItem('LINBLOG_DESKTOP_PET_FOOD')
    localStorage.setItem(
      'LINBLOG_DESKTOP_PET_VITALS:u7',
      JSON.stringify({
        name: '团子',
        mood: 50,
        satiety: 40,
        intimacy: 10,
        streakDays: 1,
        lastVisitDate: today,
        totalInteractions: 5,
        lastFedAt: 0,
        lastGreetingDate: today,
        firstVisitAt: now.getTime() - 86_400_000,
        unlockedAchievements: [],
        celebratedAchievements: [],
        dailyTasks: {
          date: today,
          progress: { feed: 1, publish: 0, comment: 0 },
          rewarded: ['feed'],
        },
        stateVersion: 1,
        updatedAt: now.getTime(),
      })
    )
  })

  await page.goto('/petManage')
  await expect(page.locator('.pet-snack-card')).toHaveCount(5)

  const stat = (label: string) =>
    page.locator('.pet-stat').filter({ hasText: label }).locator('strong')

  const icecream = page.locator('.pet-snack-card').filter({
    hasText: '冰淇淋',
  })
  await expect(icecream).toContainText('饱腹 +12')
  await expect(icecream).toContainText('心情 +20')
  await icecream.click()

  await expect(stat('饱腹')).toHaveText('52')
  await expect(stat('心情')).toHaveText('70')
  await expect(stat('亲密度')).toHaveText('12')
  await expect(icecream).toHaveClass(/is-selected/)
  await expect(page.locator('.pet-snack-card:disabled')).toHaveCount(5)
  await expect(page.locator('.pet-feed-cooldown')).toContainText('冷却中')

  await expect
    .poll(() =>
      page.evaluate(() => localStorage.getItem('LINBLOG_DESKTOP_PET_FOOD'))
    )
    .toBe('icecream')
})

test('桌宠菜单可以选择并投喂不同零食', async ({ page }) => {
  await installApiMock(page)
  await page.goto('/loginRegister')

  const pet = page.locator('.dsh-pet-root')
  await expect(pet).toBeVisible({ timeout: 30_000 })

  await pet.locator('.dsh-pet-hit').click({ button: 'right' })
  await page.locator('.pet-menu button', { hasText: '换零食' }).click()
  await expect(page.locator('.pet-snack-list button')).toHaveCount(5)

  await page.locator('.pet-snack-list button', { hasText: '冰淇淋' }).click()
  await expect(page.locator('.pet-bubble')).toContainText('冰淇淋好好吃')
  await expect
    .poll(() =>
      page.evaluate(() => localStorage.getItem('LINBLOG_DESKTOP_PET_FOOD'))
    )
    .toBe('icecream')
})

test('键盘可以打开菜单、切换焦点并用 Esc 关闭', async ({ page }) => {
  await installApiMock(page)
  await page.goto('/loginRegister')

  const pet = page.locator('.dsh-pet-root')
  await expect(pet).toBeVisible({ timeout: 30_000 })

  const hit = pet.locator('.dsh-pet-hit')
  await hit.focus()
  await page.keyboard.press('ArrowDown')

  const menu = page.locator('.pet-menu')
  await expect(menu).toBeVisible()
  await expect
    .poll(() =>
      page.evaluate(() =>
        document.activeElement?.textContent?.includes('喂一口')
      )
    )
    .toBe(true)

  await page.keyboard.press('ArrowDown')
  await expect
    .poll(() =>
      page.evaluate(() =>
        document.activeElement?.textContent?.includes('换零食')
      )
    )
    .toBe(true)

  await page.keyboard.press('Escape')
  await expect(menu).toBeHidden()
  await expect
    .poll(() =>
      page.evaluate(() =>
        document.activeElement?.classList.contains('dsh-pet-hit')
      )
    )
    .toBe(true)
})

test('静态模式暂停动画并记住本机偏好', async ({ page }) => {
  await installApiMock(page)
  await page.goto('/loginRegister')

  const pet = page.locator('.dsh-pet-root')
  await expect(pet).toBeVisible({ timeout: 30_000 })
  const hit = pet.locator('.dsh-pet-hit')

  await hit.click({ button: 'right' })
  await page.locator('.pet-menu button', { hasText: '开启静态模式' }).click()
  await expect(page.locator('.pet-bubble')).toContainText('静态模式')

  const readStaticState = () =>
    page.evaluate(() => {
      const raw = localStorage.getItem('LINBLOG_DESKTOP_PET_VISITOR_PREFS')
      const prefs = raw ? JSON.parse(raw) : {}
      const video = document.querySelector<HTMLVideoElement>(
        '.dsh-pet-video.is-front'
      )
      return {
        staticMode: prefs.staticMode,
        paused: Boolean(video?.paused),
      }
    })

  await expect.poll(readStaticState).toMatchObject({
    staticMode: true,
    paused: true,
  })

  await page.reload()
  await expect(pet).toBeVisible({ timeout: 30_000 })
  await expect.poll(readStaticState).toMatchObject({
    staticMode: true,
    paused: true,
  })

  await hit.click({ button: 'right' })
  const toggle = page.locator('.pet-menu button', {
    hasText: '关闭静态模式',
  })
  await expect(toggle).toHaveAttribute('aria-checked', 'true')
  await toggle.click()
  await expect(page.locator('.pet-bubble')).toContainText('动画回来啦')

  await expect.poll(readStaticState).toMatchObject({
    staticMode: false,
    paused: false,
  })
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

test('重新养一只会清空成长并提升状态版本', async ({ page }) => {
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
        mood: 92,
        satiety: 88,
        intimacy: 76,
        streakDays: 30,
        lastVisitDate: today,
        totalInteractions: 520,
        lastFedAt: now.getTime(),
        lastGreetingDate: today,
        firstVisitAt: now.getTime() - 30 * 86_400_000,
        unlockedAchievements: ['streak:3', 'streak:30', 'interaction:500'],
        celebratedAchievements: ['streak:3'],
        dailyTasks: {
          date: today,
          progress: { feed: 1, publish: 1, comment: 1 },
          rewarded: ['feed', 'publish', 'comment'],
        },
        stateVersion: 5,
        updatedAt: now.getTime(),
      })
    )
  })

  await page.goto('/petManage')
  const nameInput = page.locator('.pet-name-field input')
  await expect(nameInput).toHaveValue('团子')
  await expect(page.locator('.pet-task-count')).toHaveText('3/3')

  page.once('dialog', (dialog) => dialog.accept())
  await page.locator('.pet-reset-row').getByRole('button', {
    name: /重新养一只/,
  }).click()

  await expect(nameInput).toHaveValue('')
  await expect(page.locator('.pet-task-count')).toHaveText('0/3')
  await expect(page.locator('.pet-hero')).toContainText('已连续陪伴 0 天')
  await expect
    .poll(() =>
      page.evaluate(() => {
        const raw = localStorage.getItem('LINBLOG_DESKTOP_PET_VITALS:u7')
        const vitals = raw ? JSON.parse(raw) : null
        return {
          name: vitals?.name,
          mood: vitals?.mood,
          intimacy: vitals?.intimacy,
          streakDays: vitals?.streakDays,
          achievements: vitals?.unlockedAchievements,
          stateVersion: vitals?.stateVersion,
        }
      })
    )
    .toMatchObject({
      name: '',
      mood: 70,
      intimacy: 10,
      streakDays: 0,
      achievements: [],
    })

  const stateVersion = await page.evaluate(() => {
    const raw = localStorage.getItem('LINBLOG_DESKTOP_PET_VITALS:u7')
    return raw ? JSON.parse(raw).stateVersion : 0
  })
  expect(stateVersion).toBeGreaterThan(5)
})

test('桌宠会自动避让身下的操作按钮', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.addInitScript(() => {
    localStorage.setItem(
      'LINBLOG_DESKTOP_PET_SETTINGS',
      JSON.stringify({
        petRoamingEnabled: false,
        petActivity: 'quiet',
        petBubbleEnabled: false,
      })
    )
  })
  await installApiMock(page)
  await page.goto('/loginRegister')

  const pet = page.locator('.dsh-pet-root')
  await expect(pet).toBeVisible({ timeout: 30_000 })

  await page.evaluate(() => {
    const raw = localStorage.getItem('LINBLOG_DESKTOP_PET_SETTINGS')
    const settings = raw ? JSON.parse(raw) : {}
    const next = {
      ...settings,
      petRoamingEnabled: false,
      petActivity: 'quiet',
      petBubbleEnabled: false,
    }
    localStorage.setItem('LINBLOG_DESKTOP_PET_SETTINGS', JSON.stringify(next))
    window.dispatchEvent(
      new CustomEvent('desktop-pet:settings-change', { detail: next })
    )
  })
  await page.waitForTimeout(150)

  const stage = pet.locator('.dsh-pet-stage')
  const before = await stage.boundingBox()
  expect(before).not.toBeNull()

  const hitBefore = await pet.locator('.dsh-pet-hit').boundingBox()
  expect(hitBefore).not.toBeNull()
  const target = {
    x: hitBefore!.x + hitBefore!.width / 2 - 70,
    y: hitBefore!.y + hitBefore!.height / 2 - 22,
    width: 140,
    height: 44,
  }

  await page.evaluate((rect) => {
    const button = document.createElement('button')
    button.id = 'pet-avoid-target'
    button.type = 'button'
    button.textContent = '测试按钮'
    button.style.cssText = [
      'position: fixed',
      `left: ${rect.x}px`,
      `top: ${rect.y}px`,
      `width: ${rect.width}px`,
      `height: ${rect.height}px`,
      'z-index: 5',
    ].join(';')
    button.addEventListener('click', () => {
      button.dataset.clicked = '1'
    })
    document.body.appendChild(button)
  }, target)

  const bodyOf = (box: { x: number; y: number; width: number; height: number }) => ({
    left: box.x + box.width * 0.14,
    top: box.y + box.height * 0.172,
    right: box.x + box.width * 0.86,
    bottom: box.y + box.height * 0.917,
  })
  const overlapArea = (
    a: { left: number; top: number; right: number; bottom: number },
    b: { left: number; top: number; right: number; bottom: number }
  ) => {
    const width = Math.min(a.right, b.right) - Math.max(a.left, b.left)
    const height = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top)
    return width > 0 && height > 0 ? width * height : 0
  }
  const targetRect = {
    left: target.x,
    top: target.y,
    right: target.x + target.width,
    bottom: target.y + target.height,
  }

  await expect
    .poll(
      async () => {
        const box = await stage.boundingBox()
        if (!box) return -1
        return overlapArea(bodyOf(box), targetRect)
      },
      { timeout: 5_000 }
    )
    .toBe(0)

  const after = await stage.boundingBox()
  expect(after).not.toBeNull()
  expect(
    Math.abs(after!.x - before!.x) + Math.abs(after!.y - before!.y)
  ).toBeGreaterThan(20)

  await page.locator('#pet-avoid-target').dispatchEvent('click')
  await expect(page.locator('#pet-avoid-target')).toHaveAttribute(
    'data-clicked',
    '1'
  )
})

test('同步失败进入待重试，恢复网络后自动补传', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 })
  await seedSession(page, { id: 7, permissions: [] })
  await installApiMock(page)

  let allowPut = false
  let putCount = 0
  const saved: Record<string, unknown>[] = []

  await page.route('**/api/pet/state', async (route) => {
    if (route.request().method() === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ code: 200, message: 'ok', data: null }),
      })
      return
    }

    putCount += 1
    if (!allowPut) {
      await route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({
          code: 500,
          message: 'sync failed',
          data: null,
        }),
      })
      return
    }

    const payload = route.request().postDataJSON()
    if (payload && typeof payload === 'object') {
      saved.push(payload as Record<string, unknown>)
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ code: 200, message: 'ok', data: payload }),
    })
  })

  await page.goto('/petManage')
  await expect(page.locator('.pet-name-field input')).toBeVisible({
    timeout: 30_000,
  })

  const syncChip = page.locator('.pet-sync-chip')
  await expect(syncChip).toHaveText('已同步')

  await page
    .locator('.pet-hero-actions')
    .getByRole('button', { name: /喂一口/ })
    .click()

  await expect(syncChip).toHaveText('待重试', { timeout: 5_000 })
  await expect(page.locator('.pet-sync-note')).toContainText('自动重试')
  await expect(page.locator('.pet-sync-retry')).toBeVisible()

  allowPut = true
  await page.evaluate(() => window.dispatchEvent(new Event('online')))

  await expect(syncChip).toHaveText('已同步', { timeout: 5_000 })
  expect(putCount).toBeGreaterThanOrEqual(2)
  expect(saved.length).toBeGreaterThan(0)
  expect(Number(saved.at(-1)?.mood)).toBeGreaterThan(0)
})
