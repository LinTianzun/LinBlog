import request from '../utils/request'

export type ContentIssueKey =
  | 'missingCover'
  | 'missingIntro'
  | 'uncategorized'
  | 'missingLabels'
  | 'staleContent'
  | 'shortContent'
  | 'emptyGallery'
  | 'brokenLinks'

export interface ContentBrokenLink {
  href: string
  reason: string
}

export interface ContentHealthItem {
  id: number
  title: string
  classify: 'article' | 'image'
  subsetId: number | null
  subsetName: string
  label: string
  introduce: string
  cover: string
  views: number
  issues: ContentIssueKey[]
  brokenLinks: ContentBrokenLink[]
  contentLength: number
  imageCount: number
  publishedAt: string | null
  updatedAt: string | null
  lastTouchedAt: string | null
  editPath: string
  publicPath: string
}

export interface ContentHealthReport {
  generatedAt: string
  staleDays: number
  scanLimit: number
  summary: {
    published: number
    scanned: number
    healthy: number
    issueItems: number
    issues: number
    byIssue: Record<ContentIssueKey, number>
  }
  truncated: boolean
  items: ContentHealthItem[]
}

export interface ApiResult<T> {
  code: number
  message: string
  data?: T
}

export function getContentHealth(staleDays = 180) {
  return request.get<ApiResult<ContentHealthReport>>('/content/health', {
    params: { staleDays },
  })
}
