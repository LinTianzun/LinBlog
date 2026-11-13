const siteAnalyticsModel = require('../model/dbModel/siteAnalytics/index')

const MAX_RESULT_COUNT = 1_000_000

function cleanText(value, maxLength) {
    return String(value || '')
        .replace(/[\u0000-\u001f\u007f]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, maxLength)
}

function normalizeSearchEvent(body = {}) {
    const keyword = cleanText(body.keyword, 100)
    if (!keyword) return null

    const source = body.source === 'semantic' ? 'semantic' : 'standard'
    const rawCount = Number(body.resultCount)
    const resultCount = Number.isInteger(rawCount) && rawCount >= 0
        ? Math.min(rawCount, MAX_RESULT_COUNT)
        : null

    return { keyword, source, resultCount }
}

function normalizeNotFoundPath(value) {
    const rawPath = cleanText(value, 300)
    if (!rawPath || !rawPath.startsWith('/') || rawPath.startsWith('//')) return null

    const path = rawPath.split(/[?#]/, 1)[0] || '/'
    return path.slice(0, 255)
}

function buildTrend(rows, days, now = new Date()) {
    const byDate = new Map(
        rows.map(row => [
            row.date,
            {
                searches: Number(row.searches) || 0,
                notFound: Number(row.notFound) || 0
            }
        ])
    )

    const trend = []
    for (let i = days - 1; i >= 0; i--) {
        const date = new Date(now.getTime() - i * 24 * 60 * 60 * 1000)
        const label = `${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
        const item = byDate.get(label)
        trend.push({
            date: label,
            searches: item?.searches || 0,
            notFound: item?.notFound || 0
        })
    }
    return trend
}

async function recordSearchEvent(req, res) {
    const payload = normalizeSearchEvent(req.body)
    if (!payload) {
        return res.status(400).json({ code: 400, message: '请传入有效的搜索词' })
    }

    try {
        await siteAnalyticsModel.recordSearch(payload)
        return res.status(204).end()
    } catch (err) {
        return res.status(500).json({ code: 500, message: '搜索事件记录失败：' + err.message })
    }
}

async function recordNotFoundEvent(req, res) {
    const path = normalizeNotFoundPath(req.body?.path)
    if (!path) {
        return res.status(400).json({ code: 400, message: '请传入有效的页面路径' })
    }

    try {
        await siteAnalyticsModel.recordNotFound(path)
        return res.status(204).end()
    } catch (err) {
        return res.status(500).json({ code: 500, message: '404 事件记录失败：' + err.message })
    }
}

async function getSiteEventStats(req, res) {
    try {
        const days = siteAnalyticsModel.normalizeDays(req.query?.days)
        const limit = siteAnalyticsModel.normalizeLimit(req.query?.limit)
        const data = await siteAnalyticsModel.getStats(days, limit)
        const semanticSearches = data.summary.semanticSearches

        return res.json({
            code: 200,
            message: '站点洞察查询成功',
            data: {
                ...data,
                generatedAt: new Date().toISOString(),
                summary: {
                    ...data.summary,
                    standardSearches: Math.max(data.summary.searches - semanticSearches, 0)
                },
                trend: buildTrend(data.trend, days)
            }
        })
    } catch (err) {
        return res.status(500).json({ code: 500, message: '站点洞察查询失败：' + err.message })
    }
}

module.exports = {
    cleanText,
    normalizeSearchEvent,
    normalizeNotFoundPath,
    buildTrend,
    recordSearchEvent,
    recordNotFoundEvent,
    getSiteEventStats
}
