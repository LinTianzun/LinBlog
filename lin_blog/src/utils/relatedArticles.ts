import type { ArticleItem } from '../api/article.ts'

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
