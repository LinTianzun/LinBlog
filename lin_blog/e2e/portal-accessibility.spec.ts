import { expect, test } from '@playwright/test'
import { installApiMock } from './fixtures/mockApi'

test('键盘用户可通过跳转链接直达正文', async ({ page }) => {
  await installApiMock(page)
  await page.goto('/portal')

  const skipLink = page.locator('.portal-skip-link')
  // 等 Vue 挂载完成后再走键盘焦点，否则第一次 Tab 还发生在空 body 上
  await expect(skipLink).toHaveCount(1)
  await page.keyboard.press('Tab')
  await expect(skipLink).toBeFocused()

  // 焦点环必须真实可见，不能只剩 hover 背景
  const outline = await skipLink.evaluate((el) => {
    const style = getComputedStyle(el)
    return { style: style.outlineStyle, width: style.outlineWidth }
  })
  expect(outline.style).not.toBe('none')
  expect(outline.width).not.toBe('0px')

  await page.keyboard.press('Enter')
  await expect(page.locator('#portal-main')).toBeFocused()
  expect(page.url()).toContain('#portal-main')
})

test('当前导航项带 aria-current', async ({ page }) => {
  await installApiMock(page)
  await page.goto('/portal/articles')

  await expect(page.locator('.nav-links a[aria-current="page"]')).toHaveText('文章')
  await expect(page.locator('.nav-links a[aria-current="page"]')).toHaveCount(1)
  await expect(page.locator('.foot-links a[aria-current="page"]')).toHaveText('文章')
})

test('主题选择器支持方向键浏览与 Enter 选择', async ({ page }) => {
  await installApiMock(page)
  await page.goto('/portal')

  const html = page.locator('html')
  const initialPreset = await html.getAttribute('data-theme-preset')
  const trigger = page.locator('.theme-trigger')
  await trigger.focus()
  await page.keyboard.press('ArrowDown')

  const options = page.locator('.theme-option')
  await expect(options.first()).toBeVisible()
  await expect(page.locator('.theme-option:focus')).toHaveCount(1)

  await page.keyboard.press('ArrowDown')
  const focusedName = await page.locator('.theme-option:focus .option-name').innerText()
  await page.keyboard.press('Enter')

  await expect(page.locator('.theme-panel')).toHaveCount(0)
  await expect(trigger).toBeFocused()
  await expect(html).not.toHaveAttribute('data-theme-preset', initialPreset ?? '')
  expect(focusedName.length).toBeGreaterThan(0)
})

test('主题面板 Esc 关闭后焦点回到触发器', async ({ page }) => {
  await installApiMock(page)
  await page.goto('/portal')

  const trigger = page.locator('.theme-trigger')
  await trigger.focus()
  await page.keyboard.press('ArrowUp')
  await expect(page.locator('.theme-panel')).toBeVisible()

  await page.keyboard.press('Escape')
  await expect(page.locator('.theme-panel')).toHaveCount(0)
  await expect(trigger).toBeFocused()
})

test('减少动态效果时轮播默认暂停且可手动恢复', async ({ page }) => {
  await installApiMock(page)
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('/portal')

  const toggle = page.locator('.hero-toggle')
  await expect(toggle).toHaveAttribute('aria-label', '继续自动轮播')
  await toggle.click()
  await expect(toggle).toHaveAttribute('aria-label', '暂停自动轮播')
  await toggle.click()
  await expect(toggle).toHaveAttribute('aria-label', '继续自动轮播')
})

test('移动端门户主要页面无横向溢出', async ({ page }) => {
  await installApiMock(page)
  await page.setViewportSize({ width: 390, height: 844 })

  const routes = [
    '/portal',
    '/portal/articles',
    '/portal/series',
    '/portal/gallery',
    '/portal/diary',
    '/portal/messages',
  ]

  for (const route of routes) {
    await page.goto(route)
    await page.waitForLoadState('networkidle')
    const overflow = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      innerWidth: window.innerWidth,
    }))
    expect(overflow.scrollWidth, `${route} 出现横向溢出`).toBeLessThanOrEqual(overflow.innerWidth + 1)
  }
})
