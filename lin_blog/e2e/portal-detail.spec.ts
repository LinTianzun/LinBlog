import { expect, test } from '@playwright/test'
import { article, installApiMock, modalRootClass } from './fixtures/mockApi'

test('门户文章详情可通过 open 深链接直接打开和关闭', async ({ page }) => {
  await installApiMock(page)

  await page.goto(`/portal/articles?open=${article.id}`)

  const detail = page.locator(modalRootClass).filter({ hasText: '文章阅读' })
  await expect(detail).toBeVisible()
  await expect(detail.getByRole('heading', { name: article.title })).toBeVisible()
  await expect(page).toHaveURL(new RegExp(`open=${article.id}`))
  await expect(page).toHaveTitle(new RegExp(article.title))

  await detail.locator('.yk-modal__close').click()

  await expect(detail).toBeHidden()
  await expect(page).not.toHaveURL(/open=/)
})

test('门户文章详情生成目录并支持锚点跳转', async ({ page }) => {
  await installApiMock(page)

  await page.goto(`/portal/articles?open=${article.id}`)

  const detail = page.locator(modalRootClass).filter({ hasText: '文章阅读' })
  await expect(detail).toBeVisible()
  await expect(detail.locator('.detail-html h2').first()).toHaveAttribute('id', 'why-slow')

  const toc = detail.locator('.reader-outline--desktop')
  await expect(toc).toBeVisible()
  await expect(toc.getByRole('button', { name: '为什么要慢读' })).toBeVisible()

  await toc.getByRole('button', { name: '把节奏交给时间' }).click()

  await expect(toc.locator('li').filter({ hasText: '把节奏交给时间' })).toHaveClass(/active/)
  await expect
    .poll(() => detail.locator('.yk-scrollbar__wrap').evaluate((el) => el.scrollTop))
    .toBeGreaterThan(0)
})

test('阅读进度跟随弹窗内部滚动容器', async ({ page }) => {
  await installApiMock(page)

  await page.goto(`/portal/articles?open=${article.id}`)

  const detail = page.locator(modalRootClass).filter({ hasText: '文章阅读' })
  await expect(detail).toBeVisible()

  const bar = detail.locator('.reading-progress span')
  await expect(bar).toHaveAttribute('style', /width:\s*0%/)

  await detail.locator('.yk-scrollbar__wrap').evaluate((el) => {
    el.scrollTop = el.scrollHeight
  })

  await expect
    .poll(() =>
      bar.evaluate((el) => Number.parseFloat((el as HTMLElement).style.width || '0'))
    )
    .toBeGreaterThan(90)
})

test('窄屏下目录折叠到正文顶部', async ({ page }) => {
  await page.setViewportSize({ width: 900, height: 800 })
  await installApiMock(page)

  await page.goto(`/portal/articles?open=${article.id}`)

  const detail = page.locator(modalRootClass).filter({ hasText: '文章阅读' })
  await expect(detail).toBeVisible()
  await expect(detail.locator('.reader-outline--desktop')).toBeHidden()

  const toc = detail.locator('.reader-outline--mobile')
  await expect(toc).toBeVisible()
  await expect(toc.locator('summary')).toContainText('本文目录 · 3 节')
  await toc.locator('summary').click()
  await expect(toc.getByRole('button', { name: '把节奏交给时间' })).toBeVisible()
})

test('延伸阅读按分类推荐并可原地切换文章', async ({ page }) => {
  await installApiMock(page)

  const relatedArticle = {
    ...article,
    id: 1202,
    title: '在旧书店里慢下来',
    introduce: '从书页、灰尘与午后的光里，重新找回阅读的耐心。',
    views: 66,
    label: 'Vue,写作',
    publishedAt: '2026-10-18T08:30:00.000Z',
    createdAt: '2026-10-18T08:30:00.000Z',
  }
  const unrelatedArticle = {
    ...article,
    id: 1203,
    title: '另一条河岸',
    subsetId: 4,
    subsetName: '摄影',
    label: '摄影',
    views: 260,
  }

  await page.route(/\/api\/public\/article(?:\?.*)?$/, async (route) => {
    const url = new URL(route.request().url())
    const subsetId = url.searchParams.get('subsetId')
    const label = url.searchParams.get('label')
    let list = [article, relatedArticle, unrelatedArticle]
    if (subsetId) {
      list = list.filter((item) => String(item.subsetId) === subsetId)
    }
    if (label) {
      list = list.filter((item) =>
        (item.label || '').split(',').map((value) => value.trim()).includes(label)
      )
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        code: 200,
        message: 'ok',
        data: { total: list.length, page: 1, pageSize: 10, totalPage: 1, list },
      }),
    })
  })
  await page.route(/\/api\/public\/article\/1202$/, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ code: 200, message: 'ok', data: relatedArticle }),
    })
  })

  await page.goto(`/portal/articles?open=${article.id}`)

  const detail = page.locator(modalRootClass).filter({ hasText: '文章阅读' })
  await expect(detail).toBeVisible()
  const related = detail.locator('.related-wrap')
  await expect(related).toBeVisible()
  await expect(related.locator('.related-card')).toHaveCount(2)
  await expect(related.locator('.related-card').first()).toContainText('在旧书店里慢下来')

  await related.locator('.related-card').first().click()
  await expect(detail.getByRole('heading', { name: '在旧书店里慢下来' })).toBeVisible()
  await expect(page).toHaveURL(/open=1202/)
})

test('代码块可一键复制', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write'])
  await installApiMock(page)

  await page.goto(`/portal/articles?open=${article.id}`)

  const detail = page.locator(modalRootClass).filter({ hasText: '文章阅读' })
  await expect(detail).toBeVisible()

  const copyButton = detail.locator('.code-copy').first()
  await expect(copyButton).toHaveText('复制')
  await copyButton.click()
  await expect(copyButton).toHaveText('已复制')
  await expect
    .poll(() => page.evaluate(() => navigator.clipboard.readText()))
    .toContain('const line = "slow"')
})
