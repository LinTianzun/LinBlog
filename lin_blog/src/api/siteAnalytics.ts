import request from '../utils/request'

export type SiteSearchSource = 'standard' | 'semantic'

export interface SiteTrendPoint {
  date: string
  searches: number
  notFound: number
}

export interface SiteSearchTerm {
  keyword: string
  searches: number
  zeroResults: number
  lastAt: string | null
}

export interface SiteNotFoundPath {
  path: string
  hits: number
  lastAt: string | null
}

export interface SiteEventStats {
  generatedAt: string
  days: number
  limit: number
  summary: {
    searches: number
    uniqueSearchTerms: number
    zeroResultSearches: number
    standardSearches: number
    semanticSearches: number
    notFound: number
    uniqueNotFoundPaths: number
  }
  searchTerms: SiteSearchTerm[]
  notFoundPaths: SiteNotFoundPath[]
  trend: SiteTrendPoint[]
}

export interface ApiResult<T> {
  code: number
  message: string
  data?: T
}

export function recordPortalSearch(data: {
  keyword: string
  source?: SiteSearchSource
  resultCount?: number
}) {
  return request.post<void>('/public/site-event/search', data)
}

export function recordPortalNotFound(path: string) {
  return request.post<void>('/public/site-event/not-found', { path })
}

export function getSiteEventStats(days = 7, limit = 20) {
  return request.get<ApiResult<SiteEventStats>>('/overview/siteEvents', {
    params: { days, limit },
  })
}
