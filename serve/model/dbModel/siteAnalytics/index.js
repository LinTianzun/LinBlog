const { query } = require('../../db/dbnew')

const RETENTION_DAYS = 180
const DEFAULT_STATS_DAYS = 7
const MAX_STATS_DAYS = 90
const DEFAULT_LIMIT = 20
const MAX_LIMIT = 50

function normalizeDays(value) {
    const days = Number(value)
    if (!Number.isFinite(days)) return DEFAULT_STATS_DAYS
    return Math.min(Math.max(Math.trunc(days), 1), MAX_STATS_DAYS)
}

function normalizeLimit(value) {
    const limit = Number(value)
    if (!Number.isFinite(limit)) return DEFAULT_LIMIT
    return Math.min(Math.max(Math.trunc(limit), 1), MAX_LIMIT)
}

async function recordSearch({ keyword, source = 'standard', resultCount = null }) {
    return query(
        `INSERT INTO site_event (event_type, keyword, source, result_count)
         VALUES ('search', ?, ?, ?)`,
        [keyword, source, resultCount]
    )
}

async function recordNotFound(path) {
    return query(
        `INSERT INTO site_event (event_type, path)
         VALUES ('not_found', ?)`,
        [path]
    )
}

async function getStats(days = DEFAULT_STATS_DAYS, limit = DEFAULT_LIMIT) {
    const safeDays = normalizeDays(days)
    const safeLimit = normalizeLimit(limit)
    const windowStart = 'DATE_SUB(CURDATE(), INTERVAL ? - 1 DAY)'

    const [searchRows, notFoundRows, termRows, pathRows, trendRows] = await Promise.all([
        query(
            `SELECT COUNT(*) AS searches,
                    COUNT(DISTINCT keyword) AS uniqueSearchTerms,
                    SUM(CASE WHEN result_count = 0 THEN 1 ELSE 0 END) AS zeroResultSearches,
                    SUM(CASE WHEN source = 'semantic' THEN 1 ELSE 0 END) AS semanticSearches
               FROM site_event
              WHERE event_type = 'search'
                AND created_at >= ${windowStart}`,
            [safeDays]
        ),
        query(
            `SELECT COUNT(*) AS total,
                    COUNT(DISTINCT path) AS uniquePaths
               FROM site_event
              WHERE event_type = 'not_found'
                AND created_at >= ${windowStart}`,
            [safeDays]
        ),
        query(
            `SELECT keyword,
                    COUNT(*) AS searches,
                    SUM(CASE WHEN result_count = 0 THEN 1 ELSE 0 END) AS zeroResults,
                    MAX(created_at) AS lastAt
               FROM site_event
              WHERE event_type = 'search'
                AND created_at >= ${windowStart}
              GROUP BY keyword
              ORDER BY searches DESC, lastAt DESC
              LIMIT ?`,
            [safeDays, safeLimit]
        ),
        query(
            `SELECT path,
                    COUNT(*) AS hits,
                    MAX(created_at) AS lastAt
               FROM site_event
              WHERE event_type = 'not_found'
                AND created_at >= ${windowStart}
              GROUP BY path
              ORDER BY hits DESC, lastAt DESC
              LIMIT ?`,
            [safeDays, safeLimit]
        ),
        query(
            `SELECT DATE_FORMAT(created_at, '%m-%d') AS date,
                    SUM(CASE WHEN event_type = 'search' THEN 1 ELSE 0 END) AS searches,
                    SUM(CASE WHEN event_type = 'not_found' THEN 1 ELSE 0 END) AS notFound
               FROM site_event
              WHERE created_at >= ${windowStart}
              GROUP BY date
              ORDER BY MIN(created_at)`,
            [safeDays]
        )
    ])

    const search = searchRows[0] || {}
    const notFound = notFoundRows[0] || {}
    return {
        days: safeDays,
        limit: safeLimit,
        summary: {
            searches: Number(search.searches) || 0,
            uniqueSearchTerms: Number(search.uniqueSearchTerms) || 0,
            zeroResultSearches: Number(search.zeroResultSearches) || 0,
            semanticSearches: Number(search.semanticSearches) || 0,
            notFound: Number(notFound.total) || 0,
            uniqueNotFoundPaths: Number(notFound.uniquePaths) || 0
        },
        searchTerms: termRows.map(row => ({
            keyword: String(row.keyword || ''),
            searches: Number(row.searches) || 0,
            zeroResults: Number(row.zeroResults) || 0,
            lastAt: row.lastAt || null
        })),
        notFoundPaths: pathRows.map(row => ({
            path: String(row.path || ''),
            hits: Number(row.hits) || 0,
            lastAt: row.lastAt || null
        })),
        trend: trendRows.map(row => ({
            date: String(row.date || ''),
            searches: Number(row.searches) || 0,
            notFound: Number(row.notFound) || 0
        }))
    }
}

async function pruneEvents(days = RETENTION_DAYS, batchSize = 1000) {
    const retentionDays = Number.isSafeInteger(days) && days > 0 ? days : RETENTION_DAYS
    const size = Number.isSafeInteger(batchSize) && batchSize > 0 ? batchSize : 1000

    let deleted = 0
    let batches = 0
    for (;;) {
        const result = await query(
            `DELETE FROM site_event
              WHERE created_at < DATE_SUB(NOW(), INTERVAL ? DAY)
              LIMIT ?`,
            [retentionDays, size]
        )
        const affected = Number(result?.affectedRows || 0)
        deleted += affected
        batches += 1
        if (affected === 0 || affected < size) break
    }

    return { deleted, batches }
}

module.exports = {
    RETENTION_DAYS,
    normalizeDays,
    normalizeLimit,
    recordSearch,
    recordNotFound,
    getStats,
    pruneEvents
}
