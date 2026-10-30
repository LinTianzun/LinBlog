import { expect, test } from '@playwright/test'
import { installApiMock } from './fixtures/mockApi'

test('门户首屏 hero 用 img 承载并只挂载当前与相邻幻灯片', async ({ page }) => {
  await installApiMock(page)
  await page.goto('/portal')

  const heroPhotos = page.locator('.hero-slide-photo')
  await expect(heroPhotos).toHaveCount(3)

  // 首屏那一张必须 eager + high，才能参与 LCP 竞争并优先拿到带宽
  await expect(heroPhotos.first()).toHaveAttribute('fetchpriority', 'high')
  await expect(heroPhotos.first()).toHaveAttribute('loading', 'eager')
  await expect(heroPhotos.nth(1)).toHaveAttribute('loading', 'lazy')

  // srcset 是这套优化的核心：CSS 背景图做不到按视口挑图
  await expect(heroPhotos.first()).toHaveAttribute(
    'srcset',
    /\/portal\/banner\/[a-z-]+-960\.webp 960w, \/portal\/banner\/[a-z-]+-1920\.webp 1920w/
  )
  await expect(heroPhotos.first()).toHaveAttribute('sizes', '100vw')

  // head 里只保留一张 preload，且指向当前幻灯片
  const preload = page.locator('link[data-portal-banner-preload]')
  await expect(preload).toHaveCount(1)
  const href = await preload.getAttribute('href')
  const activeSrc = await page.locator('.hero-slide.active .hero-slide-photo').getAttribute('src')
  expect(new URL(href!, 'http://127.0.0.1').pathname).toBe(activeSrc)
})

test('窄屏下 hero 选取 960 档资产', async ({ page }) => {
  await installApiMock(page)
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/portal')

  const photo = page.locator('.hero-slide.active .hero-slide-photo')
  // currentSrc 要等浏览器按 srcset/sizes 选完档位才有值，直接读会拿到空串
  await expect
    .poll(() => photo.evaluate((img: HTMLImageElement) => img.currentSrc))
    .not.toBe('')
  const resolved = await photo.evaluate((img: HTMLImageElement) => img.currentSrc)

  expect(resolved).toMatch(/-960\.webp$/)
})
