import assert from 'node:assert/strict'
import test from 'node:test'
import type { ArticleItem } from '../src/api/article.ts'
import { pickRelatedArticles } from '../src/utils/relatedArticles.ts'

const makeArticle = (overrides: Partial<ArticleItem> & { id: number }): ArticleItem => ({
  userId: 1,
  title: `文章 ${overrides.id}`,
  subsetId: null,
  subsetName: null,
  classify: 'article',
  label: null,
  introduce: null,
  cover: null,
  views: 0,
  likes: 0,
  comments: 0,
  state: 'published',
  createdAt: '2026-10-01T00:00:00.000Z',
  updatedAt: '2026-10-01T00:00:00.000Z',
  publishedAt: '2026-10-01T00:00:00.000Z',
  ...overrides,
})

test('排除当前文章并优先同分类内容', () => {
  const current = makeArticle({ id: 1, subsetId: 3, label: 'Vue,写作' })
  const result = pickRelatedArticles(current, [
    current,
    makeArticle({ id: 2, subsetId: 9, label: '摄影', views: 99 }),
    makeArticle({ id: 3, subsetId: 3, views: 1 }),
  ])

  assert.deepEqual(result.map((item) => item.id), [3, 2])
})

test('共享标签越多排序越靠前，且会合并重复候选', () => {
  const current = makeArticle({ id: 1, subsetId: 3, label: 'Vue,写作,生活' })
  const result = pickRelatedArticles(current, [
    makeArticle({ id: 2, subsetId: 8, label: 'Vue', views: 80 }),
    makeArticle({ id: 3, subsetId: 8, label: 'Vue,写作', views: 10 }),
    makeArticle({ id: 3, subsetId: 8, label: 'Vue,写作', views: 10 }),
  ])

  assert.deepEqual(result.map((item) => item.id), [3, 2])
})

test('同分时按浏览量、发布时间和 ID 稳定排序', () => {
  const current = makeArticle({ id: 1, subsetId: null, label: null })
  const result = pickRelatedArticles(current, [
    makeArticle({ id: 2, views: 10, publishedAt: '2026-10-01T00:00:00.000Z' }),
    makeArticle({ id: 3, views: 30, publishedAt: '2026-09-01T00:00:00.000Z' }),
    makeArticle({ id: 4, views: 10, publishedAt: '2026-10-02T00:00:00.000Z' }),
  ])

  assert.deepEqual(result.map((item) => item.id), [3, 4, 2])
})

test('跳过已删除内容并遵守数量上限', () => {
  const current = makeArticle({ id: 1 })
  const result = pickRelatedArticles(
    current,
    [
      makeArticle({ id: 2, state: 'deleted' }),
      makeArticle({ id: 3, views: 10 }),
      makeArticle({ id: 4, views: 5 }),
    ],
    1
  )

  assert.deepEqual(result.map((item) => item.id), [3])
  assert.deepEqual(pickRelatedArticles(current, [makeArticle({ id: 3 })], 0), [])
})
