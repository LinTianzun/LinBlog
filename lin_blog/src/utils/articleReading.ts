export interface ArticleHeading {
  id: string
  text: string
  level: 2 | 3
}

export interface PreparedArticleContent {
  html: string
  outline: ArticleHeading[]
}

const HEADING_PATTERN = /<h([23])\b([^>]*)>([\s\S]*?)<\/h\1>/gi
const ID_PATTERN = /\sid=(["'])(.*?)\1/i
const EXISTING_ID_PATTERN = /\sid=(["'])(.*?)\1/gi

const decodeEntities = (value: string): string =>
  value
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) =>
      String.fromCodePoint(Number.parseInt(hex, 16))
    )
    .replace(/&#(\d+);/g, (_, decimal) =>
      String.fromCodePoint(Number(decimal))
    )

export const stripArticleHtml = (html: string): string =>
  decodeEntities(html.replace(/<[^>]*>/g, ' '))
    .replace(/\s+/g, ' ')
    .trim()

const collectExistingIds = (html: string): Set<string> => {
  const ids = new Set<string>()
  for (const match of html.matchAll(EXISTING_ID_PATTERN)) {
    const id = match[2]?.trim()
    if (id) ids.add(id)
  }
  return ids
}

const uniqueHeadingId = (
  base: string,
  used: Set<string>,
  reserved: Set<string>
): string => {
  const fallback = base || 'article-heading'
  let candidate = fallback
  let suffix = 2
  while (used.has(candidate) || reserved.has(candidate)) {
    candidate = `${fallback}-${suffix}`
    suffix += 1
  }
  return candidate
}

/**
 * 为正文二、三级标题补稳定锚点，并生成目录。
 * 已有 id 会尽量保留；重复 id 自动加后缀，避免目录跳错位置。
 */
export function prepareArticleContent(
  html: string
): PreparedArticleContent {
  const outline: ArticleHeading[] = []
  const used = new Set<string>()
  const reserved = collectExistingIds(html)
  let index = 0

  const prepared = html.replace(
    HEADING_PATTERN,
    (match, levelRaw: string, attrs: string, inner: string) => {
      index += 1
      const text = stripArticleHtml(inner)
      if (!text) return match
      const level = Number(levelRaw) as 2 | 3
      const existing = ID_PATTERN.exec(attrs)?.[2]?.trim() || ''
      // 标题自带的 id 首次出现时原样保留，后续重复标题再生成后缀；
      // 其他元素上的 id 继续留在 reserved 里，避免新锚点和正文冲突。
      let id = ''
      if (existing && !used.has(existing)) {
        id = existing
        reserved.delete(existing)
      } else {
        id = uniqueHeadingId(
          existing || `article-heading-${index}`,
          used,
          reserved
        )
      }
      used.add(id)
      outline.push({ id, text, level })

      const nextAttrs = existing
        ? existing === id
          ? attrs
          : attrs.replace(ID_PATTERN, ` id="${id}"`)
        : `${attrs} id="${id}"`
      return `<h${levelRaw}${nextAttrs}>${inner}</h${levelRaw}>`
    }
  )

  return { html: prepared, outline }
}
