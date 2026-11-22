const { URL } = require('node:url')
const ogImage = require('./ogImage')
const { excerptMarkdown } = require('./noteMarkdown')

const SITE_NAME = '林知雨 · 个人刊物'
const SITE_DESCRIPTION = '林知雨的个人博客，记录代码、摄影与日常。'

const KIND_ARCHIVES = {
    article: { path: '/portal/articles', title: '文章归档' },
    gallery: { path: '/portal/gallery', title: '摄影图库' },
    diary: { path: '/portal/diary', title: '随笔随记' },
    series: { path: '/portal/series', title: '内容系列' },
    note: { path: '/portal/notes', title: '数字花园' },
}

const GALLERY_IMAGE_PATTERN = /<img[^>]+src=["']([^"']+)["']/i

function escapeHtml(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;')
}

function jsonForScript(value) {
    return JSON.stringify(value)
        .replace(/</g, '\\u003c')
        .replace(/>/g, '\\u003e')
        .replace(/&/g, '\\u0026')
        .replace(/\u2028/g, '\\u2028')
        .replace(/\u2029/g, '\\u2029')
}

function plainText(value) {
    return ogImage.plainText(value)
}

function excerpt(value, maxLength = 160) {
    const text = plainText(value)
    if (!text) return ''
    if (text.length <= maxLength) return text
    return `${text.slice(0, Math.max(0, maxLength - 1)).trimEnd()}…`
}

function absoluteUrl(value, origin) {
    if (!value) return ''
    try {
        return new URL(value, origin).toString()
    } catch {
        return ''
    }
}

function isoDate(value) {
    if (!value) return ''
    const date = new Date(value)
    return Number.isNaN(date.getTime()) ? '' : date.toISOString()
}

function itemUrl(origin, kind, id) {
    const archive = KIND_ARCHIVES[kind] || KIND_ARCHIVES.article
    const url = new URL(archive.path, origin)
    url.searchParams.set('open', String(id))
    return url.toString()
}

function seriesUrl(origin, id) {
    const url = new URL(KIND_ARCHIVES.series.path, origin)
    url.searchParams.set('collection', String(id))
    return url.toString()
}

function ogImagePath(kind, id) {
    const safeKind = KIND_ARCHIVES[kind] ? kind : 'home'
    if (safeKind === 'home' || !id) return '/og/home.png'
    return `/og/${safeKind}/${Number(id)}.png`
}

function parseGalleryContent(content) {
    if (!content) return []
    try {
        const parsed = JSON.parse(content)
        return Array.isArray(parsed)
            ? parsed.filter(item => typeof item === 'string')
            : []
    } catch {
        return []
    }
}

function articleCover(article) {
    if (!article) return ''
    if (article.cover) return article.cover
    return article.content?.match(GALLERY_IMAGE_PATTERN)?.[1] || ''
}

function parsePositiveInt(value) {
    const parsed = Number(value)
    return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null
}

function parseMetaTarget(pathname, search = '') {
    if (pathname !== '/portal' && !pathname.startsWith('/portal/')) return null
    const params = new URLSearchParams(search)
    const open = parsePositiveInt(params.get('open'))

    if (pathname === '/portal/articles') {
        return { kind: 'article', id: open }
    }
    if (pathname === '/portal/gallery') {
        return { kind: 'gallery', id: open }
    }
    if (pathname === '/portal/diary') {
        return { kind: 'diary', id: open }
    }
    if (pathname === '/portal/notes') {
        return { kind: 'note', id: open }
    }
    if (pathname === '/portal/series') {
        return { kind: 'series', id: parsePositiveInt(params.get('collection')) }
    }
    return { kind: 'home', id: null }
}

function withSiteName(title) {
    const text = String(title || '').trim() || SITE_NAME
    return text.includes(SITE_NAME) ? text : `${text} | ${SITE_NAME}`
}

function homeMeta(origin) {
    return {
        title: SITE_NAME,
        description: SITE_DESCRIPTION,
        url: new URL('/portal', origin).toString(),
        image: new URL('/og/home.png', origin).toString(),
        type: 'website',
        imageKind: 'home',
        imageId: null,
    }
}

function archiveMeta(kind, origin) {
    const archive = KIND_ARCHIVES[kind] || KIND_ARCHIVES.article
    return {
        title: archive.title,
        description: SITE_DESCRIPTION,
        url: new URL(archive.path, origin).toString(),
        image: new URL('/og/home.png', origin).toString(),
        type: 'website',
        imageKind: 'home',
        imageId: null,
        noindex: true,
    }
}

/**
 * 把公开内容转换为页面分享所需的元信息。
 * cover 存在时沿用封面，否则回退到动态生成的 OG 图。
 */
function contentMeta(kind, item, origin) {
    if (!item) return null

    if (kind === 'article') {
        const url = itemUrl(origin, 'article', item.id)
        const description = excerpt(item.introduce) || excerpt(item.content) || SITE_DESCRIPTION
        return {
            title: item.title,
            description,
            url,
            image: absoluteUrl(articleCover(item), origin) || new URL(ogImagePath('article', item.id), origin).toString(),
            imageKind: 'article',
            imageId: item.id,
            type: 'article',
            publishedTime: isoDate(item.publishedAt || item.createdAt),
            modifiedTime: isoDate(item.updatedAt || item.createdAt),
            jsonLd: {
                '@context': 'https://schema.org',
                '@type': 'BlogPosting',
                headline: item.title,
                description,
                url,
            },
        }
    }

    if (kind === 'gallery') {
        const images = parseGalleryContent(item.content)
        const url = itemUrl(origin, 'gallery', item.id)
        const cover = item.cover || images[0] || ''
        return {
            title: item.title,
            description: excerpt(item.introduce) || `${item.title}，共 ${images.length} 张摄影作品。`,
            url,
            image: absoluteUrl(cover, origin) || new URL(ogImagePath('gallery', item.id), origin).toString(),
            imageKind: 'gallery',
            imageId: item.id,
            type: 'article',
            publishedTime: isoDate(item.publishedAt || item.createdAt),
            modifiedTime: isoDate(item.updatedAt || item.createdAt),
            jsonLd: {
                '@context': 'https://schema.org',
                '@type': 'ImageGallery',
                name: item.title,
                url,
            },
        }
    }

    if (kind === 'diary') {
        const url = itemUrl(origin, 'diary', item.id)
        const pictures = Array.isArray(item.picture) ? item.picture : parseGalleryContent(item.picture)
        return {
            title: item.title,
            description: excerpt(item.content) || SITE_DESCRIPTION,
            url,
            image: absoluteUrl(pictures[0], origin) || new URL(ogImagePath('diary', item.id), origin).toString(),
            imageKind: 'diary',
            imageId: item.id,
            type: 'article',
            publishedTime: isoDate(item.createdAt),
            modifiedTime: isoDate(item.createdAt),
            jsonLd: {
                '@context': 'https://schema.org',
                '@type': 'BlogPosting',
                headline: item.title,
                url,
            },
        }
    }

    if (kind === 'series') {
        const url = seriesUrl(origin, item.id)
        return {
            title: item.name,
            description: item.description || `按顺序阅读「${item.name}」系列。`,
            url,
            image: absoluteUrl(item.cover, origin) || new URL(ogImagePath('series', item.id), origin).toString(),
            imageKind: 'series',
            imageId: item.id,
            type: 'website',
            jsonLd: {
                '@context': 'https://schema.org',
                '@type': 'CollectionPage',
                name: item.name,
                url,
            },
        }
    }

    if (kind === 'note') {
        const url = itemUrl(origin, 'note', item.id)
        const description = excerptMarkdown(item.content, 160) || SITE_DESCRIPTION
        return {
            title: item.title,
            description,
            url,
            image: new URL(ogImagePath('note', item.id), origin).toString(),
            imageKind: 'note',
            imageId: item.id,
            type: 'article',
            publishedTime: isoDate(item.publishedAt),
            modifiedTime: isoDate(item.updatedAt || item.publishedAt),
            jsonLd: {
                '@context': 'https://schema.org',
                '@type': 'BlogPosting',
                headline: item.title,
                url,
            },
        }
    }

    return null
}

function renderMetaTags(meta) {
    const title = withSiteName(meta.title)
    const description = meta.description || SITE_DESCRIPTION
    const tags = [
        `<title>${escapeHtml(title)}</title>`,
        `<meta name="description" content="${escapeHtml(description)}" />`,
        `<meta name="robots" content="${meta.noindex ? 'noindex,follow' : 'index,follow'}" />`,
        '<meta property="og:site_name" content="' + escapeHtml(SITE_NAME) + '" />',
        `<meta property="og:title" content="${escapeHtml(title)}" />`,
        `<meta property="og:description" content="${escapeHtml(description)}" />`,
        `<meta property="og:type" content="${escapeHtml(meta.type || 'website')}" />`,
    ]

    if (meta.url) tags.push(`<meta property="og:url" content="${escapeHtml(meta.url)}" />`)
    if (meta.image) tags.push(`<meta property="og:image" content="${escapeHtml(meta.image)}" />`)
    if (meta.publishedTime) {
        tags.push(`<meta property="article:published_time" content="${escapeHtml(meta.publishedTime)}" />`)
    }
    if (meta.modifiedTime) {
        tags.push(`<meta property="article:modified_time" content="${escapeHtml(meta.modifiedTime)}" />`)
    }

    tags.push(
        `<meta name="twitter:card" content="${meta.image ? 'summary_large_image' : 'summary'}" />`,
        `<meta name="twitter:title" content="${escapeHtml(title)}" />`,
        `<meta name="twitter:description" content="${escapeHtml(description)}" />`
    )
    if (meta.image) tags.push(`<meta name="twitter:image" content="${escapeHtml(meta.image)}" />`)
    if (meta.url) tags.push(`<link rel="canonical" href="${escapeHtml(meta.url)}" />`)

    if (meta.jsonLd) {
        const data = {
            ...meta.jsonLd,
            description: meta.jsonLd.description || description,
            image: meta.jsonLd.image || meta.image || undefined,
            datePublished: meta.jsonLd.datePublished || meta.publishedTime || undefined,
            dateModified: meta.jsonLd.dateModified || meta.modifiedTime || undefined,
        }
        tags.push(`<script type="application/ld+json">${jsonForScript(data)}</script>`)
    }

    return tags.join('\n  ')
}

function stripSeoHead(head) {
    return head
        .replace(/<title\b[^>]*>[\s\S]*?<\/title>/gi, '')
        .replace(/<meta\b[^>]*\b(?:name|property)\s*=\s*["'](?:description|robots|og:[^"']+|twitter:[^"']+|article:[^"']+)["'][^>]*>/gi, '')
        .replace(/<link\b[^>]*\brel\s*=\s*["']canonical["'][^>]*>/gi, '')
        .replace(/<script\b[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>[\s\S]*?<\/script>/gi, '')
}

function injectPortalMeta(html, meta) {
    if (!meta) return html
    const source = String(html || '')
    const headMatch = source.match(/<head\b[^>]*>/i)
    const headEnd = source.toLowerCase().lastIndexOf('</head>')

    if (!headMatch || headEnd < 0) {
        const doctype = /^\s*<!doctype[^>]*>/i.exec(source)?.[0] || '<!doctype html>'
        const rest = source.slice(doctype.length)
        return `${doctype}\n<html lang="zh-CN">\n<head>\n  ${renderMetaTags(meta)}\n</head>\n<body>\n${rest}\n</body>\n</html>`
    }

    const headStart = headMatch.index + headMatch[0].length
    const head = stripSeoHead(source.slice(headStart, headEnd))
    return `${source.slice(0, headStart)}${head}\n  ${renderMetaTags(meta)}\n${source.slice(headEnd)}`
}

function metaEtag(meta) {
    if (!meta) return ''
    const raw = [meta.title, meta.description, meta.url, meta.image, meta.modifiedTime || '', meta.publishedTime || '']
        .join('\n')
    let hash = 2166136261
    for (let index = 0; index < raw.length; index += 1) {
        hash ^= raw.charCodeAt(index)
        hash = Math.imul(hash, 16777619)
    }
    return `"og-${(hash >>> 0).toString(16)}"`
}

module.exports = {
    SITE_NAME,
    SITE_DESCRIPTION,
    ogImagePath,
    itemUrl,
    seriesUrl,
    parseMetaTarget,
    homeMeta,
    archiveMeta,
    contentMeta,
    renderMetaTags,
    injectPortalMeta,
    metaEtag,
    excerpt,
}
