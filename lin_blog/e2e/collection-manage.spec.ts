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
  await seedSession(page, {
    permissions: ['collection.view', 'collection.manage', 'article.create'],
  })
  await installApiMock(page)

  let collections = [
    { ...existingCollection },
  ]
  let lastCreatePayload: Record<string, unknown> = {}
  const members: Record<number, typeof memberArticle[]> = {
    8: [{ ...memberArticle }],
    12: [],
  }

  await page.route(/\/api\/collection(?:\?.*)?$/, async (route) => {
    if (route.request().method() === 'POST') {
      const payload = route.request().postDataJSON() as { name?: string }
      lastCreatePayload = payload
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
  await page.getByRole('button', { name: '从素材库选择' }).click()
  const picker = page.locator('.yk-modal__main:visible').last()
  await picker.locator('.media-picker-item').first().click()
  await picker.getByRole('button', { name: '确定' }).click()
  await expect(page.locator('.collection-cover-card img')).toHaveCount(1)
  await page.getByRole('button', { name: '创建系列' }).click()
  await expect.poll(() => lastCreatePayload.cover).toBe('/api/file/501/raw')

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

test('添加文章支持服务端搜索、状态分类筛选和分页加载', async ({ page }) => {
  await seedSession(page, {
    permissions: ['collection.view', 'collection.manage', 'article.create'],
  })
  await installApiMock(page)

  const requests: URLSearchParams[] = []
  await page.route(url => url.pathname === '/api/article', async (route) => {
    const params = new URL(route.request().url()).searchParams
    requests.push(params)
    const pageNo = Math.max(1, Number(params.get('page') || 1))
    const pageSize = Math.max(1, Number(params.get('pageSize') || 20))
    const keyword = (params.get('keyword') || '').trim()
    const total = keyword ? 0 : 45
    const start = (pageNo - 1) * pageSize
    const list = keyword
      ? []
      : Array.from({ length: Math.max(0, Math.min(pageSize, total - start)) }, (_, index) => ({
          ...article,
          id: 3000 + start + index,
          title: `系列候选文章 ${start + index + 1}`,
          state: 'published',
          subsetId: 3,
          subsetName: '生活随笔',
        }))

    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        code: 200,
        message: 'ok',
        data: {
          total,
          page: pageNo,
          pageSize,
          totalPage: Math.ceil(total / pageSize),
          list,
        },
      }),
    })
  })

  await page.goto('/collectionManage')
  // 默认 mock 没有系列；进入新建态即可看到右侧文章选择器
  await page.getByRole('button', { name: '+ 新建系列' }).click()
  await expect(page.locator('.collection-available-item')).toHaveCount(20, { timeout: 30_000 })
  expect(requests[0]?.get('keyword')).toBeNull()
  expect(requests[0]?.get('pageSize')).toBe('20')
  await expect(page.locator('.collection-picker-meta')).toContainText('共 45 篇匹配文章')

  // 状态与分类都交给后端筛选，不再只过滤本机前 100 篇
  await page.locator('.collection-state-tab').filter({ hasText: /^已发布$/ }).click()
  await expect.poll(() => requests.some(item => item.get('state') === 'published')).toBe(true)
  await page.locator('.collection-select').selectOption('3')
  await expect.poll(() => requests.some(item => item.get('subsetId') === '3')).toBe(true)

  // 加载更多会请求下一页并追加列表
  await page.getByRole('button', { name: /加载更多/ }).click()
  await expect(page.locator('.collection-available-item')).toHaveCount(40)
  await expect.poll(() => requests.some(item => item.get('page') === '2')).toBe(true)

  // 关键词搜索走后端，搜不到时给出可理解的空状态
  await page.getByPlaceholder('搜索标题、简介或正文关键词').fill('不存在的文章')
  await expect.poll(() => requests.some(item => item.get('keyword') === '不存在的文章')).toBe(true)
  await expect(page.locator('.collection-panel-empty').filter({ hasText: '没有匹配的文章' })).toBeVisible()
})
