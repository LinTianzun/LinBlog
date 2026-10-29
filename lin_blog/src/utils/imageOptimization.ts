const uploadPathPattern = /\/api\/uploads\/[A-Za-z0-9._-]+$/

export const IMAGE_WIDTHS = {
  thumb: [160, 240, 320],
  card: [240, 320, 480, 640],
  content: [320, 480, 640, 960],
  hero: [480, 720, 960, 1280, 1600],
} as const

type ResponsiveImageOptions = {
  widths?: readonly number[]
  sizes?: string
  width?: number
  loading?: 'lazy' | 'eager'
  fetchPriority?: 'high' | 'low' | 'auto'
}

type ImageAttributes = {
  src?: string
  srcset?: string
  sizes?: string
  loading?: 'lazy' | 'eager'
  decoding?: 'async'
  fetchpriority?: 'high' | 'low' | 'auto'
}

export function isUploadImageUrl(url?: string | null): boolean {
  if (!url) return false
  const path = url.split(/[?#]/, 1)[0]
  return uploadPathPattern.test(path)
}

export function optimizedImageUrl(
  url?: string | null,
  width?: number
): string {
  if (!url) return ''
  if (!width || !isUploadImageUrl(url)) return url

  const hashIndex = url.indexOf('#')
  const hash = hashIndex >= 0 ? url.slice(hashIndex) : ''
  const withoutHash = hashIndex >= 0 ? url.slice(0, hashIndex) : url
  const queryIndex = withoutHash.indexOf('?')
  const path = queryIndex >= 0 ? withoutHash.slice(0, queryIndex) : withoutHash
  const search = queryIndex >= 0 ? withoutHash.slice(queryIndex + 1) : ''
  const params = new URLSearchParams(search)
  params.set('w', String(width))
  params.set('format', 'webp')
  return `${path}?${params.toString()}${hash}`
}

export function imageSrcset(
  url?: string | null,
  widths: readonly number[] = IMAGE_WIDTHS.content
): string {
  if (!isUploadImageUrl(url)) return ''

  return [...new Set(widths)]
    .filter(width => Number.isInteger(width) && width > 0)
    .sort((a, b) => a - b)
    .map(width => `${optimizedImageUrl(url, width)} ${width}w`)
    .join(', ')
}

// 统一生成 img 的响应式属性；非站内图片保持原始 URL，不影响外链资源。
export function responsiveImageAttrs(
  url?: string | null,
  options: ResponsiveImageOptions = {}
): ImageAttributes {
  if (!url) return {}

  const widths = options.widths || IMAGE_WIDTHS.content
  const fallbackWidth =
    options.width || widths.find(width => width >= 960) || widths[widths.length - 1]
  const srcset = imageSrcset(url, widths)

  return {
    src: optimizedImageUrl(url, fallbackWidth),
    ...(srcset ? { srcset, sizes: options.sizes || '100vw' } : {}),
    loading: options.loading || 'lazy',
    decoding: 'async',
    ...(options.fetchPriority ? { fetchpriority: options.fetchPriority } : {}),
  }
}

function escapeHtmlAttribute(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/"/g, '&quot;')
}

// 富文本正文由编辑器直接保存 img 标签；在不改动存储数据的前提下补上响应式加载属性。
export function optimizeRichContentImages(
  html: string,
  options: { widths?: readonly number[]; sizes?: string } = {}
): string {
  if (!html) return html

  const widths = options.widths || IMAGE_WIDTHS.content
  const sizes = options.sizes || '(max-width: 640px) 100vw, 620px'

  return html.replace(/<img\b[^>]*>/gi, tag => {
    const srcMatch = tag.match(/(\bsrc\s*=\s*)(["'])(.*?)\2/i)
    if (!srcMatch) return tag

    const source = srcMatch[3]
    if (!isUploadImageUrl(source)) return tag

    const optimized = escapeHtmlAttribute(
      optimizedImageUrl(source, widths.find(width => width >= 960) || widths[widths.length - 1])
    )
    const srcset = escapeHtmlAttribute(imageSrcset(source, widths))
    let nextTag = tag.replace(
      /(\bsrc\s*=\s*)(["'])(.*?)\2/i,
      (_match, prefix: string, quote: string) => `${prefix}${quote}${optimized}${quote}`
    )

    if (!/\bsrcset\s*=/i.test(nextTag)) {
      nextTag = nextTag.replace(/\s*\/?>$/, end => ` srcset="${srcset}" sizes="${sizes}"${end}`)
    }
    if (!/\bloading\s*=/i.test(nextTag)) {
      nextTag = nextTag.replace(/\s*\/?>$/, end => ` loading="lazy"${end}`)
    }
    if (!/\bdecoding\s*=/i.test(nextTag)) {
      nextTag = nextTag.replace(/\s*\/?>$/, end => ` decoding="async"${end}`)
    }

    return nextTag
  })
}
