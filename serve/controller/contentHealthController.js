const contentHealthModel = require('../model/dbModel/contentHealth/index')
const { DEFAULT_SCAN_LIMIT } = contentHealthModel

const DEFAULT_STALE_DAYS = 180
const MIN_STALE_DAYS = 30
const MAX_STALE_DAYS = 730
const SHORT_CONTENT_LENGTH = 300

const PORTAL_STATIC_PATHS = new Set([
    '/portal',
    '/portal/articles',
    '/portal/gallery',
    '/portal/diary',
    '/portal/series',
    '/portal/messages'
])

function decodeHtml(value) {
    return String(value || '')
        .replace(/&amp;/gi, '&')
        .replace(/&nbsp;/gi, ' ')
        .replace(/&quot;/gi, '"')
        .replace(/&#39;/gi, "'")
        .replace(/&lt;/gi, '<')
        .replace(/&gt;/gi, '>')
}

function plainText(value) {
    return decodeHtml(
        String(value || '')
            .replace(/<script[\s\S]*?<\/script>/gi, ' ')
            .replace(/<style[\s\S]*?<\/style>/gi, ' ')
            .replace(/<[^>]+>/g, ' ')
    ).replace(/\s+/g, ' ').trim()
}

function parseGalleryImages(content) {
    try {
        const parsed = JSON.parse(String(content || ''))
        return Array.isArray(parsed)
            ? parsed.filter(item => typeof item === 'string' && item.trim())
            : []
    } catch {
        return []
    }
}

function extractHrefs(content) {
    const hrefs = []
    const regex = /href\s*=\s*["']([^"']+)["']/gi
    let match
    while ((match = regex.exec(String(content || ''))) && hrefs.length < 30) {
        const href = decodeHtml(match[1]).trim()
        if (href) hrefs.push(href)
    }
    return [...new Set(hrefs)]
}

function parsePositiveId(value) {
    const id = Number(value)
    return Number.isSafeInteger(id) && id > 0 ? id : null
}

function validatePortalLinks(content, targets) {
    const issues = []
    const seen = new Set()

    for (const href of extractHrefs(content)) {
        if (
            !href ||
            href.startsWith('#') ||
            href.startsWith('mailto:') ||
            /^javascript:/i.test(href)
        ) {
            continue
        }

        // 只校验站内门户链接，外链不主动请求，避免扫描过程访问第三方站点。
        if (!href.startsWith('/portal')) continue

        let url
        try {
            url = new URL(href, 'http://local')
        } catch {
            const key = `${href}|格式错误`
            if (!seen.has(key)) issues.push({ href, reason: '链接格式错误' })
            seen.add(key)
            continue
        }

        let reason = ''
        if (!PORTAL_STATIC_PATHS.has(url.pathname)) {
            reason = '门户路径不存在'
        } else if (url.pathname === '/portal/articles' || url.pathname === '/portal/gallery') {
            const id = parsePositiveId(url.searchParams.get('open'))
            if (id) {
                const target = targets.articles.get(id)
                const expectedClassify = url.pathname === '/portal/gallery' ? 'image' : 'article'
                if (!target || target.classify !== expectedClassify) {
                    reason = `目标${expectedClassify === 'image' ? '图库' : '文章'}不存在或未发布`
                }
            }
        } else if (url.pathname === '/portal/diary') {
            const id = parsePositiveId(url.searchParams.get('open'))
            if (id && !targets.diaries.has(id)) {
                reason = '目标随笔不存在或已删除'
            }
        } else if (url.pathname === '/portal/series') {
            const id = parsePositiveId(url.searchParams.get('collection'))
            if (id && !targets.collections.has(id)) {
                reason = '目标系列不存在或暂无已发布文章'
            }
        }

        if (reason) {
            const key = `${href}|${reason}`
            if (!seen.has(key)) issues.push({ href, reason })
            seen.add(key)
        }
    }

    return issues
}

function normalizeStaleDays(value) {
    const days = Number(value)
    if (!Number.isFinite(days)) return DEFAULT_STALE_DAYS
    return Math.min(Math.max(Math.trunc(days), MIN_STALE_DAYS), MAX_STALE_DAYS)
}

function buildContentHealthReport({
    rows = [],
    total = rows.length,
    scanLimit = DEFAULT_SCAN_LIMIT,
    targets = { articles: new Map(), diaries: new Set(), collections: new Set() },
    staleDays = DEFAULT_STALE_DAYS,
    now = new Date()
} = {}) {
    const staleBefore = now.getTime() - normalizeStaleDays(staleDays) * 24 * 60 * 60 * 1000
    const byIssue = {
        missingCover: 0,
        missingIntro: 0,
        uncategorized: 0,
        missingLabels: 0,
        staleContent: 0,
        shortContent: 0,
        emptyGallery: 0,
        brokenLinks: 0
    }

    const items = []
    for (const row of rows) {
        const content = String(row.content || '')
        const text = plainText(content)
        const imageCount = row.classify === 'image' ? parseGalleryImages(content).length : 0
        const lastTouchedAt = row.updatedAt || row.publishedAt || row.createdAt || null
        const lastTouchedTime = lastTouchedAt ? new Date(lastTouchedAt).getTime() : 0
        const brokenLinks = validatePortalLinks(content, targets)
        const issues = []

        if (row.classify === 'article' && !String(row.cover || '').trim()) {
            issues.push('missingCover')
        }
        if (!String(row.introduce || '').trim()) issues.push('missingIntro')
        if (!row.subsetId) issues.push('uncategorized')
        if (!String(row.label || '').trim()) issues.push('missingLabels')
        if (lastTouchedTime > 0 && lastTouchedTime < staleBefore) issues.push('staleContent')
        if (row.classify === 'article' && text.length < SHORT_CONTENT_LENGTH) {
            issues.push('shortContent')
        }
        if (row.classify === 'image' && imageCount === 0) issues.push('emptyGallery')
        if (brokenLinks.length > 0) issues.push('brokenLinks')

        if (issues.length === 0) continue
        issues.forEach(issue => {
            byIssue[issue] += 1
        })

        items.push({
            id: row.id,
            title: row.title,
            classify: row.classify,
            subsetId: row.subsetId,
            subsetName: row.subsetName || '',
            label: row.label || '',
            introduce: row.introduce || '',
            cover: row.cover || '',
            views: Number(row.views) || 0,
            issues,
            brokenLinks,
            contentLength: text.length,
            imageCount,
            publishedAt: row.publishedAt || null,
            updatedAt: row.updatedAt || null,
            lastTouchedAt,
            editPath: row.classify === 'image'
                ? `/editgallery/${row.id}`
                : `/editarticle/${row.id}`,
            publicPath: row.classify === 'image'
                ? `/portal/gallery?open=${row.id}`
                : `/portal/articles?open=${row.id}`
        })
    }

    items.sort((a, b) => {
        if (b.issues.length !== a.issues.length) return b.issues.length - a.issues.length
        const aTime = a.lastTouchedAt ? new Date(a.lastTouchedAt).getTime() : 0
        const bTime = b.lastTouchedAt ? new Date(b.lastTouchedAt).getTime() : 0
        return aTime - bTime
    })

    const issueTotal = Object.values(byIssue).reduce((sum, count) => sum + count, 0)
    return {
        generatedAt: now.toISOString(),
        staleDays: normalizeStaleDays(staleDays),
        scanLimit,
        summary: {
            published: total,
            scanned: rows.length,
            healthy: Math.max(rows.length - items.length, 0),
            issueItems: items.length,
            issues: issueTotal,
            byIssue
        },
        truncated: total > rows.length,
        items
    }
}

async function getContentHealth(req, res) {
    try {
        const staleDays = normalizeStaleDays(req.query?.staleDays)
        const [contentResult, articleTargets, diaryTargets, collectionTargets] = await Promise.all([
            contentHealthModel.listPublishedContentForHealth(DEFAULT_SCAN_LIMIT),
            contentHealthModel.listPublishedArticleTargets(),
            contentHealthModel.listPublishedDiaryIds(),
            contentHealthModel.listPublicCollectionIds()
        ])

        const targets = {
            articles: new Map(
                articleTargets.map(row => [Number(row.id), { classify: row.classify }])
            ),
            diaries: new Set(diaryTargets.map(row => Number(row.id))),
            collections: new Set(collectionTargets.map(row => Number(row.id)))
        }

        const report = buildContentHealthReport({
            rows: contentResult.rows,
            total: contentResult.total,
            scanLimit: contentResult.scanLimit,
            targets,
            staleDays
        })

        res.json({ code: 200, message: '内容健康检查完成', data: report })
    } catch (err) {
        res.status(500).json({ code: 500, message: '内容健康检查失败：' + err.message })
    }
}

module.exports = {
    DEFAULT_STALE_DAYS,
    SHORT_CONTENT_LENGTH,
    normalizeStaleDays,
    plainText,
    parseGalleryImages,
    extractHrefs,
    validatePortalLinks,
    buildContentHealthReport,
    getContentHealth
}
