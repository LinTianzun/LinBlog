const config = require('../config/default')
const articleModel = require('../model/dbModel/article/index')
const diaryModel = require('../model/dbModel/diary/index')

const SITE_NAME = '林知雨 · 个人刊物'
const SITE_DESCRIPTION = '林知雨的个人博客，记录代码、摄影与日常。'
const FEED_LIMIT = 100

function escapeXml(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&apos;')
}

function plainText(value) {
    return String(value || '')
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

function excerpt(value, maxLength = 180) {
    const text = plainText(value)
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

function itemUrl(origin, kind, id) {
    const path = kind === 'article'
        ? '/portal/articles'
        : kind === 'gallery'
            ? '/portal/gallery'
            : '/portal/diary'
    const url = new URL(path, origin)
    url.searchParams.set('open', String(id))
    return url.toString()
}

function isoDate(value) {
    const date = new Date(value)
    return Number.isNaN(date.getTime()) ? '' : date.toISOString()
}

function resolveOrigin(req) {
    if (config.publicUrl) return config.publicUrl
    const protocol = req?.protocol || 'http'
    const host = typeof req?.get === 'function' ? req.get('host') : ''
    return `${protocol}://${host || 'localhost'}`
}

function renderSitemap({ origin, articles, diaries, now = new Date() }) {
    const base = String(origin).replace(/\/+$/, '')
    const entries = [
        { loc: `${base}/portal`, lastmod: now.toISOString(), changefreq: 'daily', priority: '1.0' },
        { loc: `${base}/portal/articles`, lastmod: now.toISOString(), changefreq: 'daily', priority: '0.9' },
        { loc: `${base}/portal/gallery`, lastmod: now.toISOString(), changefreq: 'weekly', priority: '0.8' },
        { loc: `${base}/portal/diary`, lastmod: now.toISOString(), changefreq: 'daily', priority: '0.8' },
        { loc: `${base}/portal/messages`, lastmod: now.toISOString(), changefreq: 'daily', priority: '0.5' }
    ]

    for (const article of articles || []) {
        entries.push({
            loc: itemUrl(base, article.classify === 'image' ? 'gallery' : 'article', article.id),
            lastmod: isoDate(article.updatedAt || article.publishedAt || article.createdAt) || now.toISOString(),
            changefreq: 'monthly',
            priority: article.classify === 'image' ? '0.7' : '0.8'
        })
    }

    for (const diary of diaries || []) {
        entries.push({
            loc: itemUrl(base, 'diary', diary.id),
            lastmod: isoDate(diary.createdAt) || now.toISOString(),
            changefreq: 'monthly',
            priority: '0.6'
        })
    }

    const urls = entries.map(entry => `  <url>
    <loc>${escapeXml(entry.loc)}</loc>
    <lastmod>${escapeXml(entry.lastmod)}</lastmod>
    <changefreq>${entry.changefreq}</changefreq>
    <priority>${entry.priority}</priority>
  </url>`).join('\n')

    return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls}
</urlset>`
}

function renderFeed({ origin, articles, diaries, now = new Date() }) {
    const base = String(origin).replace(/\/+$/, '')
    const items = [
        ...(articles || []).map(article => ({
            title: article.title,
            link: itemUrl(base, article.classify === 'image' ? 'gallery' : 'article', article.id),
            description: excerpt(article.introduce),
            publishedAt: article.publishedAt || article.createdAt,
            category: article.classify === 'image' ? '摄影' : '文章'
        })),
        ...(diaries || []).map(diary => ({
            title: diary.title,
            link: itemUrl(base, 'diary', diary.id),
            description: excerpt(diary.content),
            publishedAt: diary.createdAt,
            category: '随笔'
        }))
    ]
        .sort((a, b) => new Date(b.publishedAt || 0) - new Date(a.publishedAt || 0))
        .slice(0, FEED_LIMIT)

    const body = items.map(item => {
        const pubDate = new Date(item.publishedAt)
        return `    <item>
      <title>${escapeXml(item.title)}</title>
      <link>${escapeXml(item.link)}</link>
      <guid isPermaLink="true">${escapeXml(item.link)}</guid>
      <description>${escapeXml(item.description || item.title)}</description>
      <category>${escapeXml(item.category)}</category>
      ${Number.isNaN(pubDate.getTime()) ? '' : `<pubDate>${pubDate.toUTCString()}</pubDate>`}
    </item>`
    }).join('\n')

    return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>${escapeXml(SITE_NAME)}</title>
    <link>${escapeXml(`${base}/portal`)}</link>
    <description>${escapeXml(SITE_DESCRIPTION)}</description>
    <language>zh-CN</language>
    <lastBuildDate>${now.toUTCString()}</lastBuildDate>
    <atom:link href="${escapeXml(`${base}/feed.xml`)}" rel="self" type="application/rss+xml" />
${body}
  </channel>
</rss>`
}

function renderRobots(origin) {
    const base = String(origin).replace(/\/+$/, '')
    return `User-agent: *
Allow: /portal
Allow: /api/uploads/
Disallow: /api/
Disallow: /overView
Disallow: /userManagement
Disallow: /permissionManagement
Disallow: /systemLog
Disallow: /reportedComments
Disallow: /messages
Disallow: /localfile
Disallow: /article
Disallow: /gallery
Disallow: /diary
Disallow: /setting
Disallow: /editarticle
Disallow: /editgallery
Disallow: /loginRegister
Disallow: /resetPassword

Sitemap: ${base}/sitemap.xml
`
}

async function getSitemap(req, res) {
    try {
        const [articles, diaries] = await Promise.all([
            articleModel.listPublishedContentForFeed(5000),
            diaryModel.listPublicDiariesForFeed(5000)
        ])
        res.set('Cache-Control', 'public, max-age=300, s-maxage=600')
        res.type('application/xml').send(renderSitemap({
            origin: resolveOrigin(req),
            articles,
            diaries
        }))
    } catch (err) {
        res.status(500).type('text/plain').send(`Sitemap generation failed: ${err.message}`)
    }
}

async function getFeed(req, res) {
    try {
        const [articles, diaries] = await Promise.all([
            articleModel.listPublishedContentForFeed(FEED_LIMIT),
            diaryModel.listPublicDiariesForFeed(FEED_LIMIT)
        ])
        res.set('Cache-Control', 'public, max-age=300, s-maxage=600')
        res.type('application/rss+xml').send(renderFeed({
            origin: resolveOrigin(req),
            articles,
            diaries
        }))
    } catch (err) {
        res.status(500).type('text/plain').send(`RSS generation failed: ${err.message}`)
    }
}

function getRobots(req, res) {
    res.set('Cache-Control', 'public, max-age=3600')
    res.type('text/plain').send(renderRobots(resolveOrigin(req)))
}

module.exports = {
    getSitemap,
    getFeed,
    getRobots,
    renderSitemap,
    renderFeed,
    renderRobots,
    resolveOrigin,
    excerpt
}
