import assert from 'node:assert/strict'
import test from 'node:test'
import type { ArticleItem } from '../src/api/article.ts'
import { pickRelatedArticles, rankRelatedArticles } from '../src/utils/relatedArticles.ts'

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

test('正文相似度能把主题一致但分类不同的文章补进延伸阅读', () => {
  const current = makeArticle({
    id: 10,
    title: '数字花园与双链',
    introduce: '用双链把笔记连成知识网络',
    content: '<p>Obsidian 的双链与反向链接实践</p>',
    label: '知识管理',
    subsetId: 3,
  })
  const hotButUnrelated = makeArticle({
    id: 11,
    title: '周末去山里拍照',
    content: '<p>光线、雾气和一只路过的猫</p>',
    views: 900,
  })
  const textMatch = makeArticle({
    id: 12,
    title: '再谈双链笔记',
    introduce: '知识网络里的反向链接',
    content: '<p>Obsidian 的双链实践与知识网络</p>',
  })

  const structured = rankRelatedArticles(current, [hotButUnrelated, textMatch], 1)
  assert.deepEqual(structured.map((item) => item.id), [11])

  const mixed = rankRelatedArticles(current, [hotButUnrelated, textMatch], 2)
  assert.deepEqual(mixed.map((item) => item.id), [11, 12])
  assert.deepEqual(rankRelatedArticles(current, [hotButUnrelated], 0), [])
})
