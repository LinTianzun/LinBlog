import { expect, test } from '@playwright/test'
import { article, installApiMock, modalRootClass } from './fixtures/mockApi'

const GARDEN_NOTE = {
  id: 21,
  title: '花园里还没写完的那页',
  slug: 'unfinished-page',
  publishedAt: '2026-11-10T08:00:00.000Z',
  updatedAt: '2026-11-18T08:00:00.000Z',
}

const SIBLING_ARTICLE = {
  ...article,
  id: 922,
  title: '同一页笔记长出的另一种写法',
  introduce: '从同一个花园想法延伸出来的第二篇长文。',
  content: '<p>这是同源笔记衍生出的另一篇文章。</p>',
}

async function mockArticleDetail(
  page: import('@playwright/test').Page,
  data: Record<string, unknown>,
) {
  await page.route(new RegExp(`/api/public/article/${article.id}$`), async route => {
    if (route.request().method() !== 'GET') return route.fallback()
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({ code: 200, message: 'ok', data }),
    })
  })
}

test('文章详情展示来源花园笔记，点击回到花园并打开原笔记', async ({ page }) => {
  await installApiMock(page)
  await mockArticleDetail(page, { ...article, gardenNote: GARDEN_NOTE })

  await page.goto(`/portal/articles?open=${article.id}`)
  const detail = page.locator(modalRootClass).filter({ hasText: '文章阅读' })
  await expect(detail).toBeVisible()

  const source = detail.getByRole('complementary', { name: '来自花园' })
  await expect(source).toBeVisible()
  await expect(source).toContainText('这篇长文来自花园')
  await expect(source.locator('.garden-source-title')).toHaveText(GARDEN_NOTE.title)

  await source.getByRole('button', { name: '去花园读原笔记' }).click()

  await expect(detail).toBeHidden()
  await expect(page).toHaveURL(new RegExp(`/portal/notes\\?open=${GARDEN_NOTE.id}$`))
})

test('普通文章或来源笔记查询失败时不显示回流区块', async ({ page }) => {
  await installApiMock(page)

  await page.goto(`/portal/articles?open=${article.id}`)
  let detail = page.locator(modalRootClass).filter({ hasText: '文章阅读' })
  await expect(detail).toBeVisible()
  await expect(detail.locator('.garden-source')).toHaveCount(0)
  await expect(detail.locator('.detail-html h2').first()).toBeVisible()

  await detail.locator('.yk-modal__close').click()
  await expect(detail).toBeHidden()

  await mockArticleDetail(page, { ...article, gardenNote: null })
  await page.goto(`/portal/articles?open=${article.id}`)
  detail = page.locator(modalRootClass).filter({ hasText: '文章阅读' })
  await expect(detail).toBeVisible()
  await expect(detail.locator('.garden-source')).toHaveCount(0)
})

test('文章页把同一来源笔记的多篇长文收拢成可展开入口', async ({ page }) => {
  await installApiMock(page)
  await mockArticleDetail(page, {
    ...article,
    gardenNote: GARDEN_NOTE,
    gardenArticles: [{
      id: SIBLING_ARTICLE.id,
      title: SIBLING_ARTICLE.title,
      introduce: SIBLING_ARTICLE.introduce,
      publishedAt: SIBLING_ARTICLE.publishedAt,
    }],
  })
  await page.route(new RegExp(`/api/public/article/${SIBLING_ARTICLE.id}$`), async route => {
    if (route.request().method() !== 'GET') return route.fallback()
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({ code: 200, message: 'ok', data: SIBLING_ARTICLE }),
    })
  })

  await page.goto(`/portal/articles?open=${article.id}`)
  const detail = page.locator(modalRootClass).filter({ hasText: '文章阅读' })
  await expect(detail).toBeVisible()

  const series = detail.locator('.garden-source-series')
  await expect(series.locator('summary')).toContainText('同源长文 · 共 2 篇')
  await series.locator('summary').click()
  await series.getByRole('button', { name: new RegExp(SIBLING_ARTICLE.title) }).click()

  await expect(detail.getByRole('heading', { name: SIBLING_ARTICLE.title })).toBeVisible()
  await expect(page).toHaveURL(new RegExp(`open=${SIBLING_ARTICLE.id}`))
  // 新文章没有来源关系时，上一页的聚合入口不会残留
  await expect(detail.locator('.garden-source-series')).toHaveCount(0)
})
