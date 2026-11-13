import { expect, test } from '@playwright/test'
import { article, installApiMock, seedSession } from './fixtures/mockApi'

const memberArticle = {
  ...article,
  id: 1201,
  title: '系列里的第一篇文章',
}

const existingCollection = {
  id: 8,
  name: '旧系列',
  description: '已经存在的系列',
  cover: '',
  sort: 10,
  status: 1,
  articleCount: 1,
  publishedCount: 1,
  createdAt: '2026-11-01T08:30:00.000Z',
  updatedAt: '2026-11-03T08:30:00.000Z',
}

const createdCollection = {
  id: 12,
  name: '新系列',
  description: '',
  cover: '',
  sort: 0,
  status: 1,
  articleCount: 0,
  publishedCount: 0,
  createdAt: '2026-11-13T08:30:00.000Z',
  updatedAt: '2026-11-13T08:30:00.000Z',
}

test('后台可以新建系列并保存文章顺序', async ({ page }) => {
  await seedSession(page, { permissions: ['category.manage', 'article.create'] })
  await installApiMock(page)

  let collections = [
    { ...existingCollection },
  ]
  const members: Record<number, typeof memberArticle[]> = {
    8: [{ ...memberArticle }],
    12: [],
  }

  await page.route(/\/api\/collection(?:\?.*)?$/, async (route) => {
    if (route.request().method() === 'POST') {
      const payload = route.request().postDataJSON() as { name?: string }
      collections = [
        {
          ...createdCollection,
          name: payload.name || createdCollection.name,
        },
        ...collections,
      ]
      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({
          code: 200,
          message: '系列创建成功',
          data: { collectionId: createdCollection.id },
        }),
      })
      return
    }

    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        code: 200,
        message: 'ok',
        data: { count: collections.length, list: collections },
      }),
    })
  })

  for (const id of [8, 12]) {
    await page.route(new RegExp(`/api/collection/${id}$`), async (route) => {
      const collection = collections.find(item => item.id === id)
      if (!collection) {
        await route.fulfill({
          status: 404,
          contentType: 'application/json',
          body: JSON.stringify({ code: 404, message: '系列不存在' }),
        })
        return
      }
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          code: 200,
          message: 'ok',
          data: { ...collection, articles: members[id] || [] },
        }),
      })
    })

    await page.route(new RegExp(`/api/collection/${id}/articles$`), async (route) => {
      const payload = route.request().postDataJSON() as { articleIds?: number[] }
      const ids = Array.isArray(payload.articleIds) ? payload.articleIds : []
      members[id] = ids.map(articleId => ({ ...memberArticle, id: articleId }))
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          code: 200,
          message: '系列文章保存成功',
          data: { collectionId: id, articleCount: ids.length },
        }),
      })
    })
  }

  await page.goto('/collectionManage')

  await expect(page.getByRole('heading', { name: '内容系列' })).toBeVisible()
  await expect(page.locator('.collection-item').filter({ hasText: existingCollection.name })).toBeVisible()
  await expect(page.getByRole('heading', { name: existingCollection.name })).toBeVisible()
  await expect(page.locator('.collection-selected-item')).toContainText(memberArticle.title)

  await page.getByRole('button', { name: '+ 新建系列' }).click()
  await page.getByPlaceholder('例如：从零搭一个个人博客').fill(createdCollection.name)
  await page.getByRole('button', { name: '创建系列' }).click()

  await expect(page.locator('.collection-item').filter({ hasText: createdCollection.name })).toBeVisible()
  await expect(page.getByRole('heading', { name: createdCollection.name })).toBeVisible()
  await expect(page.locator('.collection-selected-item')).toHaveCount(0)

  const availableArticle = page.locator('.collection-available-item')
    .filter({ hasText: article.title })
    .first()
  await expect(availableArticle).toBeVisible()
  await availableArticle.click()
  await page.getByRole('button', { name: '保存修改' }).click()
  await expect(page.locator('.collection-selected-item')).toHaveCount(1)
})
