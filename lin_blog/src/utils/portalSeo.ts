import type { ArticleItem } from '../api/article.ts'
import type { PortalDiary } from '../api/portal.ts'

export const PORTAL_SITE_NAME = '林知雨 · 个人刊物'
export const PORTAL_DEFAULT_TITLE = '林知雨 · 个人刊物'
export const PORTAL_DEFAULT_DESCRIPTION =
  '林知雨的个人博客，记录代码、摄影与日常。'

export type PortalContentKind = 'article' | 'gallery' | 'diary'

const archivePaths: Record<PortalContentKind, string> = {
  article: '/portal/articles',
  gallery: '/portal/gallery',
  diary: '/portal/diary',
}

const archiveCopy: Record<
  PortalContentKind,
  { title: string; description: string }
> = {
  article: {
    title: '文章归档',
    description: '技术长文与生活记录，按时间与热度翻阅林知雨的全部文章。',
  },
  gallery: {
    title: '摄影图库',
    description: '光线、街角与旅途中的停顿，组成一本持续生长的个人影像志。',
  },
  diary: {
    title: '随笔随记',
    description: '天气、照片与短句，记录日常里值得留下来的时刻。',
  },
}

export interface PortalSeoConfig {
  title: string
  description?: string
  url?: string
  image?: string
  type?: 'website' | 'article'
  publishedTime?: string | null
  modifiedTime?: string | null
  robots?: string
  jsonLd?: Record<string, unknown> | null
}

function browserOrigin(): string {
  return typeof window === 'undefined'
    ? 'http://localhost'
    : window.location.origin
}

function absoluteUrl(value: string | undefined, origin = browserOrigin()): string {
  if (!value) return ''
  try {
    return new URL(value, origin).toString()
  } catch {
    return value
  }
}

export function portalArchiveUrl(
  kind: PortalContentKind,
  origin = browserOrigin()
): string {
  return new URL(archivePaths[kind], origin).toString()
}

export function portalItemUrl(
  kind: PortalContentKind,
  id: number,
  origin = browserOrigin()
): string {
  const url = new URL(archivePaths[kind], origin)
  url.searchParams.set('open', String(id))
  return url.toString()
}

export function plainText(value?: string | null): string {
  if (!value) return ''
  return value
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\s+/g, ' ')
    .trim()
}

export function seoExcerpt(value?: string | null, maxLength = 160): string {
  const text = plainText(value)
  if (text.length <= maxLength) return text
  return `${text.slice(0, Math.max(0, maxLength - 1)).trimEnd()}…`
}

function contentImage(
  value: string | undefined,
  origin = browserOrigin()
): string {
  return absoluteUrl(value, origin)
}

function extractArticleCover(article?: {
  cover?: string | null
  content?: string | null
}): string {
  if (!article) return ''
  if (article.cover) return article.cover
  return article.content?.match(/<img[^>]+src="([^"]+)"/)?.[1] || ''
}

function parseGalleryContent(content?: string | null): string[] {
  if (!content) return []
  try {
    const parsed = JSON.parse(content)
    return Array.isArray(parsed)
      ? parsed.filter((item): item is string => typeof item === 'string')
      : []
  } catch {
    return []
  }
}

export function articleSeoConfig(
  article: ArticleItem,
  url = portalItemUrl('article', article.id),
  origin = browserOrigin()
): PortalSeoConfig {
  const description =
    seoExcerpt(article.introduce) ||
    seoExcerpt(article.content) ||
    PORTAL_DEFAULT_DESCRIPTION
  const image = contentImage(
    extractArticleCover(article) || undefined,
    origin
  )

  return {
    title: article.title,
    description,
    url,
    image,
    type: 'article',
    publishedTime: article.publishedAt || article.createdAt,
    modifiedTime: article.updatedAt,
    jsonLd: {
      '@context': 'https://schema.org',
      '@type': 'BlogPosting',
      headline: article.title,
      description,
      url,
      image: image || undefined,
      datePublished: article.publishedAt || article.createdAt,
      dateModified: article.updatedAt || article.createdAt,
    },
  }
}

export function gallerySeoConfig(
  gallery: ArticleItem,
  url = portalItemUrl('gallery', gallery.id),
  origin = browserOrigin()
): PortalSeoConfig {
  const images = parseGalleryContent(gallery.content)
  const description =
    seoExcerpt(gallery.introduce) ||
    `${gallery.title}，共 ${images.length} 张摄影作品。`
  const image = contentImage(gallery.cover || images[0], origin)

  return {
    title: gallery.title,
    description,
    url,
    image,
    type: 'article',
    publishedTime: gallery.publishedAt || gallery.createdAt,
    modifiedTime: gallery.updatedAt,
    jsonLd: {
      '@context': 'https://schema.org',
      '@type': 'ImageGallery',
      name: gallery.title,
      description,
      url,
      image: images.map(item => contentImage(item, origin)).filter(Boolean),
      datePublished: gallery.publishedAt || gallery.createdAt,
      dateModified: gallery.updatedAt || gallery.createdAt,
    },
  }
}

export function diarySeoConfig(
  diary: PortalDiary,
  url = portalItemUrl('diary', diary.id),
  origin = browserOrigin()
): PortalSeoConfig {
  const description = seoExcerpt(diary.content) || PORTAL_DEFAULT_DESCRIPTION
  const image = contentImage(diary.picture[0], origin)

  return {
    title: diary.title,
    description,
    url,
    image,
    type: 'article',
    publishedTime: diary.createdAt,
    modifiedTime: diary.createdAt,
    jsonLd: {
      '@context': 'https://schema.org',
      '@type': 'BlogPosting',
      headline: diary.title,
      description,
      url,
      image: image || undefined,
      datePublished: diary.createdAt,
      dateModified: diary.createdAt,
    },
  }
}

export function archiveSeoConfig(
  kind: PortalContentKind,
  url = portalArchiveUrl(kind)
): PortalSeoConfig {
  const copy = archiveCopy[kind]
  return {
    title: copy.title,
    description: copy.description,
    url,
    type: 'website',
  }
}

export function homeSeoConfig(
  url = portalArchiveUrl('article').replace(/\/articles$/, '')
): PortalSeoConfig {
  return {
    title: '首页',
    description: PORTAL_DEFAULT_DESCRIPTION,
    url,
    type: 'website',
  }
}

function upsertMeta(
  attribute: 'name' | 'property',
  key: string,
  content?: string | null
): void {
  if (typeof document === 'undefined') return
  let element = document.head.querySelector<HTMLMetaElement>(
    `meta[${attribute}="${key}"]`
  )
  if (!content) {
    element?.remove()
    return
  }
  if (!element) {
    element = document.createElement('meta')
    element.setAttribute(attribute, key)
    element.dataset.portalSeo = 'true'
    document.head.appendChild(element)
  }
  element.content = content
}

function upsertCanonical(url?: string): void {
  if (typeof document === 'undefined') return
  let link = document.head.querySelector<HTMLLinkElement>(
    'link[rel="canonical"]'
  )
  if (!url) {
    link?.remove()
    return
  }
  if (!link) {
    link = document.createElement('link')
    link.rel = 'canonical'
    link.dataset.portalSeo = 'true'
    document.head.appendChild(link)
  }
  link.href = url
}

function upsertJsonLd(data?: Record<string, unknown> | null): void {
  if (typeof document === 'undefined') return
  let script = document.getElementById('portal-seo-jsonld')
  if (!data) {
    script?.remove()
    return
  }
  if (!script) {
    script = document.createElement('script')
    script.id = 'portal-seo-jsonld'
    script.setAttribute('type', 'application/ld+json')
    script.dataset.portalSeo = 'true'
    document.head.appendChild(script)
  }
  script.textContent = JSON.stringify(data)
}

export function applyPortalSeo(config: PortalSeoConfig): void {
  if (typeof document === 'undefined') return

  const title = config.title.endsWith(PORTAL_SITE_NAME)
    ? config.title
    : `${config.title} | ${PORTAL_SITE_NAME}`
  const description = config.description || PORTAL_DEFAULT_DESCRIPTION

  document.title = title
  document.documentElement.lang = 'zh-CN'
  upsertMeta('name', 'description', description)
  upsertMeta('name', 'robots', config.robots || 'index,follow')
  upsertMeta('property', 'og:site_name', PORTAL_SITE_NAME)
  upsertMeta('property', 'og:title', title)
  upsertMeta('property', 'og:description', description)
  upsertMeta('property', 'og:type', config.type || 'website')
  upsertMeta('property', 'og:url', config.url)
  upsertMeta('property', 'og:image', config.image)
  upsertMeta('property', 'article:published_time', config.publishedTime)
  upsertMeta('property', 'article:modified_time', config.modifiedTime)
  upsertMeta('name', 'twitter:card', config.image ? 'summary_large_image' : 'summary')
  upsertMeta('name', 'twitter:title', title)
  upsertMeta('name', 'twitter:description', description)
  upsertMeta('name', 'twitter:image', config.image)
  upsertCanonical(config.url)
  upsertJsonLd(config.jsonLd)
}

export function applyPrivateSeo(title = 'LinBlog 管理后台'): void {
  if (typeof document === 'undefined') return
  const fullTitle = `${title} | LinBlog`
  document.title = fullTitle
  upsertMeta('name', 'description', 'LinBlog 管理后台')
  upsertMeta('name', 'robots', 'noindex,nofollow')
  upsertMeta('property', 'og:site_name', 'LinBlog')
  upsertMeta('property', 'og:title', fullTitle)
  upsertMeta('property', 'og:description', 'LinBlog 管理后台')
  upsertMeta('property', 'og:type', 'website')
  upsertMeta('property', 'og:url', null)
  upsertMeta('property', 'og:image', null)
  upsertMeta('property', 'article:published_time', null)
  upsertMeta('property', 'article:modified_time', null)
  upsertMeta('name', 'twitter:card', null)
  upsertMeta('name', 'twitter:title', null)
  upsertMeta('name', 'twitter:description', null)
  upsertMeta('name', 'twitter:image', null)
  upsertCanonical(undefined)
  upsertJsonLd(null)
}
