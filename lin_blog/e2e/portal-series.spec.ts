import { expect, test } from '@playwright/test'
import { article, installApiMock, modalRootClass } from './fixtures/mockApi'

const firstArticle = {
  ...article,
  id: 1201,
  title: '第一篇：从空白开始',
  introduce: '先把博客的地基搭起来，再慢慢长出内容。',
  publishedAt: '2026-11-01T08:30:00.000Z',
  createdAt: '2026-11-01T08:30:00.000Z',
}

const secondArticle = {
  ...article,
  id: 1202,
  title: '第二篇：把页面搭起来',
  introduce: '从布局到组件，把第一篇文章真正放到页面上。',
  publishedAt: '2026-11-03T08:30:00.000Z',
  createdAt: '2026-11-03T08:30:00.000Z',
}

const collection = {
  id: 8,
  name: '从零搭一个个人博客',
  description: '从空白目录开始，一步步搭出属于自己的写作空间。',
  cover: '',
  sort: 10,
  status: 1,
  articleCount: 2,
  publishedCount: 2,
  createdAt: '2026-11-01T08:30:00.000Z',
  updatedAt: '2026-11-03T08:30:00.000Z',
  articles: [
    { ...firstArticle, memberSort: 0 },
    { ...secondArticle, memberSort: 10 },
  ],
}

async function mockSeries(page: Parameters<typeof installApiMock>[0]): Promise<void> {
  await page.route(/\/api\/public\/collection(?:\?.*)?$/, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        code: 200,
        message: 'ok',
        data: {
          count: 1,
          list: [{
            id: collection.id,
            name: collection.name,
            description: collection.description,
            cover: collection.cover,
            sort: collection.sort,
            status: collection.status,
            articleCount: collection.articleCount,
            publishedCount: collection.publishedCount,
            createdAt: collection.createdAt,
            updatedAt: collection.updatedAt,
          }],
        },
      }),
    })
  })

  await page.route(/\/api\/public\/collection\/8$/, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ code: 200, message: 'ok', data: collection }),
    })
  })

  for (const item of [firstArticle, secondArticle]) {
    await page.route(new RegExp(`/api/public/article/${item.id}$`), async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ code: 200, message: 'ok', data: item }),
      })
    })
  }

  const contexts = {
    [firstArticle.id]: {
      id: collection.id,
      name: collection.name,
      description: collection.description,
      cover: '',
      position: 1,
      total: 2,
      previous: null,
      next: { id: secondArticle.id, title: secondArticle.title },
    },
    [secondArticle.id]: {
      id: collection.id,
      name: collection.name,
      description: collection.description,
      cover: '',
      position: 2,
      total: 2,
      previous: { id: firstArticle.id, title: firstArticle.title },
      next: null,
    },
  }
  for (const [articleId, context] of Object.entries(contexts)) {
    await page.route(new RegExp(`/api/public/collection/article/${articleId}$`), async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          code: 200,
          message: 'ok',
          data: { count: 1, list: [context] },
        }),
      })
    })
  }
}

test('门户系列页按顺序展示文章并打开阅读', async ({ page }) => {
  await installApiMock(page)
  await mockSeries(page)

  await page.goto('/portal/series')

  const card = page.locator('.series-card').filter({ hasText: collection.name })
  await expect(card).toBeVisible()
  await card.click()

  await expect(page).toHaveURL(/collection=8/)
  await expect(page.getByRole('heading', { name: collection.name })).toBeVisible()

  const rows = page.locator('.series-article')
  await expect(rows).toHaveCount(2)
  await expect(rows.nth(0)).toContainText(firstArticle.title)
  await expect(rows.nth(1)).toContainText(secondArticle.title)

  await rows.nth(1).getByRole('button').click()

  const detail = page.locator(modalRootClass).filter({ hasText: '文章阅读' })
  await expect(detail).toBeVisible()
  await expect(detail.getByRole('heading', { name: secondArticle.title })).toBeVisible()
  await expect(page).toHaveURL(/collection=8/)
  await expect(page).toHaveURL(/open=1202/)

  await detail.locator('.yk-modal__close').click()
  await expect(detail).toBeHidden()
  await expect(page).toHaveURL(/collection=8/)
  await expect(page).not.toHaveURL(/open=/)
})

test('门户系列支持 collection 与 open 深链接', async ({ page }) => {
  await installApiMock(page)
  await mockSeries(page)

  await page.goto('/portal/series?collection=8&open=1202')

  await expect(page.getByRole('heading', { name: collection.name })).toBeVisible()
  const detail = page.locator(modalRootClass).filter({ hasText: '文章阅读' })
  await expect(detail).toBeVisible()
  await expect(detail.getByRole('heading', { name: secondArticle.title })).toBeVisible()
})

test('文章详情显示所属系列与上一篇导航', async ({ page }) => {
  await installApiMock(page)
  await mockSeries(page)

  await page.goto('/portal/series?collection=8&open=1202')

  const detail = page.locator(modalRootClass).filter({ hasText: '文章阅读' })
  await expect(detail).toBeVisible()

  const context = detail.locator('.article-series')
  await expect(context.getByRole('heading', { name: '所属系列' })).toBeVisible()
  await expect(context).toContainText(collection.name)
  await expect(context).toContainText('2 / 2')
  await expect(context).toContainText('已经是系列最后一篇')

  await context.getByRole('button', { name: /上一篇/ }).click()
  await expect(detail.getByRole('heading', { name: firstArticle.title })).toBeVisible()
  await expect(context).toContainText('1 / 2')
  await expect(context).toContainText('已经是系列第一篇')
})
