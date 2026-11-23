import type { ArticleClassify } from '../api/article'

// 草稿箱的展示规则：分类文案、发布权限、列表查询参数与汇总数字。
// 抽成纯函数后，视图只负责数据加载与交互，规则可以单独测试。

export function draftClassifyLabel(classify: ArticleClassify): string {
  return classify === 'image' ? '摄影图库' : '博客文章'
}

export function draftPublishPermission(classify: ArticleClassify): string {
  return classify === 'image' ? 'gallery.publish' : 'article.publish'
}

export interface DraftListQuery {
  page: number
  pageSize: number
  classify: '' | ArticleClassify
  keyword: string
}

export interface DraftListParams {
  page: number
  pageSize: number
  state: 'draft'
  classify?: ArticleClassify
  keyword?: string
}

/**
 * 组装草稿列表请求参数：只带非空筛选，避免把空字符串当筛选条件发给后端。
 */
export function buildDraftListParams(query: DraftListQuery): DraftListParams {
  const page = Math.floor(Number(query.page))
  const pageSize = Math.floor(Number(query.pageSize))
  return {
    page: Number.isFinite(page) && page > 0 ? page : 1,
    pageSize: Number.isFinite(pageSize) && pageSize > 0 ? pageSize : 20,
    state: 'draft',
    ...(query.classify ? { classify: query.classify } : {}),
    ...(query.keyword.trim() ? { keyword: query.keyword.trim() } : {}),
  }
}

export interface DraftCounts {
  article: number
  gallery: number
  total: number
}

/**
 * 合并两套内容的草稿统计。接口缺字段或返回负数时按 0 处理，
 * 避免汇总卡片出现 NaN。
 */
export function resolveDraftCounts(
  article?: { draft?: number } | null,
  gallery?: { draft?: number } | null
): DraftCounts {
  const articleCount = Math.max(0, Number(article?.draft) || 0)
  const galleryCount = Math.max(0, Number(gallery?.draft) || 0)
  return {
    article: articleCount,
    gallery: galleryCount,
    total: articleCount + galleryCount,
  }
}
