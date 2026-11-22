import type { ArticleItem } from '../api/article.ts'
import { findSimilar, type SimilarityDoc } from './contentSimilarity.ts'

const splitLabels = (label?: string | null): string[] =>
  (label || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)

const articleTimestamp = (article: ArticleItem): number => {
  const value = article.publishedAt || article.createdAt
  const time = value ? new Date(value).getTime() : 0
  return Number.isFinite(time) ? time : 0
}

/**
 * 从候选池里挑相关文章：同分类优先，其次共享标签，最后看热度与时间。
 * 同一篇文章只保留最高分的一次，避免多路请求合并后重复。
 */
export function pickRelatedArticles(
  current: ArticleItem,
  candidates: ArticleItem[],
  limit = 3
): ArticleItem[] {
  if (limit <= 0) return []

  const currentLabels = new Set(splitLabels(current.label))
  const scored = new Map<number, { article: ArticleItem; score: number }>()

  for (const item of candidates) {
    if (!item || item.id === current.id || item.state === 'deleted') continue

    let score = 0
    if (current.subsetId !== null && item.subsetId === current.subsetId) {
      score += 5
    }
    for (const label of splitLabels(item.label)) {
      if (currentLabels.has(label)) score += 3
    }
    if (item.classify === current.classify) score += 1

    const existing = scored.get(item.id)
    if (!existing || score > existing.score) {
      scored.set(item.id, { article: item, score })
    }
  }

  return [...scored.values()]
    .sort(
      (left, right) =>
        right.score - left.score ||
        right.article.views - left.article.views ||
        articleTimestamp(right.article) - articleTimestamp(left.article) ||
        right.article.id - left.article.id
    )
    .slice(0, limit)
    .map((entry) => entry.article)
}

const toSimilarityDoc = (article: ArticleItem): SimilarityDoc => ({
  id: article.id,
  kind: article.classify === 'image' ? 'gallery' : 'article',
  title: article.title,
  description: article.introduce ?? undefined,
  content: article.content ?? undefined,
  labels: splitLabels(article.label),
  subsetId: article.subsetId,
})

/**
 * 在结构化推荐之上补一层正文相似度：
 * 同分类/同标签仍然优先，但「标题与正文讲的是同一件事」可以越过热度排序。
 */
export function rankRelatedArticles(
  current: ArticleItem,
  candidates: ArticleItem[],
  limit = 3
): ArticleItem[] {
  if (limit <= 0) return []
  const structured = pickRelatedArticles(current, candidates, Math.max(limit * 2, 4))
  const pool = new Map<number, ArticleItem>()
  for (const item of [...structured, ...candidates]) {
    if (!item || item.id === current.id || item.state === 'deleted') continue
    pool.set(item.id, item)
  }

  const similar = findSimilar(
    toSimilarityDoc(current),
    [...pool.values()].map(toSimilarityDoc),
    { limit: Math.max(limit * 2, 4), crossKind: false }
  )

  const result: ArticleItem[] = []
  const seen = new Set<number>()
  // 先放结构化推荐的头部，再插入相似度命中的新面孔，两边交错保持主题与新鲜度
  for (const item of structured) {
    if (result.length >= limit) break
    if (seen.has(item.id)) continue
    seen.add(item.id)
    result.push(item)
  }
  for (const { doc } of similar) {
    if (result.length >= limit) break
    if (seen.has(doc.id)) continue
    const article = pool.get(doc.id)
    if (!article) continue
    seen.add(doc.id)
    result.push(article)
  }
  return result
}
