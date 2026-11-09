const { query } = require('../../db/dbnew')

// 访问记录保留天数：超过后由清理任务归档删除，避免 record 表无限增长
const RETENTION_DAYS = 90

// 写入一条访问记录；字段由中间件解析，游客 user_id 为 NULL
async function createRecord({ userId = null, ip = '', position = null, device = null, browser = null, os = null, path = '/' }) {
    const sql = `
        INSERT INTO record (user_id, ip, position, device, browser, os, path)
        VALUES (?, ?, ?, ?, ?, ?, ?)
    `
    return query(sql, [userId, ip, position, device, browser, os, path])
}

// 近 N 天访问量按天聚合（不补空日期，由控制器补全连续日期轴）
async function countRecordsByDay(days) {
    const sql = `
        SELECT DATE_FORMAT(created_at, '%m-%d') AS date, COUNT(*) AS count
        FROM record
        WHERE created_at >= DATE_SUB(CURDATE(), INTERVAL ? - 1 DAY)
        GROUP BY date
        ORDER BY MIN(created_at)
    `
    return query(sql, [days])
}

// 近 N 天按字段聚合访问分布（device/browser/os/path/position）
async function countRecordsByField(field, days) {
    const column = ['device', 'browser', 'os', 'path', 'position'].includes(field) ? field : 'device'
    const sql = `
        SELECT ${column} AS label, COUNT(*) AS value
        FROM record
        WHERE ${column} IS NOT NULL
          AND created_at >= DATE_SUB(CURDATE(), INTERVAL ? - 1 DAY)
        GROUP BY ${column}
        ORDER BY value DESC
    `
    return query(sql, [days])
}

// 近 N 天热门路径 TOP N：按访问次数降序，用于总览「热门来源」卡片
async function countTopPaths(days, limit = 10) {
    const safeDays = Number.isSafeInteger(days) && days > 0 ? days : 7
    const safeLimit = Number.isSafeInteger(limit) && limit > 0 && limit <= 50 ? limit : 10
    const sql = `
        SELECT path AS path, COUNT(*) AS visits
        FROM record
        WHERE created_at >= DATE_SUB(CURDATE(), INTERVAL ? - 1 DAY)
        GROUP BY path
        ORDER BY visits DESC
        LIMIT ?
    `
    return query(sql, [safeDays, safeLimit])
 }

/**
 * 清理超出保留期的访问记录。
 * 分批删除，避免单条 DELETE 锁住整表影响正常写入。
 * @param {number} [days] - 保留天数，默认 90 天
 * @param {number} [batchSize] - 单批删除条数
 * @returns {Promise<{deleted: number, batches: number}>}
 */
async function pruneRecords(days = RETENTION_DAYS, batchSize = 1000) {
    const retentionDays = Number.isSafeInteger(days) && days > 0 ? days : RETENTION_DAYS
    const size = Number.isSafeInteger(batchSize) && batchSize > 0 ? batchSize : 1000

    let deleted = 0
    let batches = 0
    for (;;) {
        const result = await query(
            `DELETE FROM record
             WHERE created_at < DATE_SUB(NOW(), INTERVAL ? DAY)
             LIMIT ?`,
            [retentionDays, size]
        )
        const affected = Number(result?.affectedRows || 0)
        deleted += affected
        batches += 1
        // 删完或单批未删满（说明已是最后一批）即停止
        if (affected === 0 || affected < size) break
    }

    return { deleted, batches }
}

/**
 * 统计保留期之前还剩多少条待清理（用于日志与运维观测）。
 */
async function countExpiredRecords(days = RETENTION_DAYS) {
    const retentionDays = Number.isSafeInteger(days) && days > 0 ? days : RETENTION_DAYS
    const rows = await query(
        `SELECT COUNT(*) AS total FROM record
         WHERE created_at < DATE_SUB(NOW(), INTERVAL ? DAY)`,
        [retentionDays]
    )
    return Number(rows[0]?.total || 0)
}

/**
 * 运营周报数据：近 N 天的访问、互动与内容产出概览。
 * 只做统计口径的聚合，具体结论交给模型来写。
 */
async function getOperationsSummary(days = 7) {
    const safeDays = Number.isSafeInteger(days) && days > 0 ? Math.min(days, 90) : 7

    const [visitRows, commentRows, messageRows, publishRows, topPathRows] = await Promise.all([
        query(
            `SELECT COUNT(*) AS total,
                    COUNT(DISTINCT ip) AS visitors,
                    SUM(CASE WHEN device = 'mobile' THEN 1 ELSE 0 END) AS mobile
             FROM record
             WHERE created_at >= DATE_SUB(CURDATE(), INTERVAL ? - 1 DAY)`,
            [safeDays]
        ),
        query(
            `SELECT COUNT(*) AS total
             FROM comment
             WHERE status = 1 AND created_at >= DATE_SUB(CURDATE(), INTERVAL ? - 1 DAY)`,
            [safeDays]
        ),
        query(
            `SELECT COUNT(*) AS total
             FROM message
             WHERE type = 'private' AND created_at >= DATE_SUB(CURDATE(), INTERVAL ? - 1 DAY)`,
            [safeDays]
        ),
        query(
            `SELECT classify, COUNT(*) AS total
             FROM article
             WHERE state = 'published'
               AND published_at >= DATE_SUB(CURDATE(), INTERVAL ? - 1 DAY)
             GROUP BY classify`,
            [safeDays]
        ),
        query(
            `SELECT path, COUNT(*) AS visits
             FROM record
             WHERE created_at >= DATE_SUB(CURDATE(), INTERVAL ? - 1 DAY)
             GROUP BY path
             ORDER BY visits DESC
             LIMIT 5`,
            [safeDays]
        )
    ])

    const visit = visitRows?.[0] || {}
    const published = { article: 0, image: 0 }
    for (const row of publishRows || []) {
        const key = row.classify === 'image' ? 'image' : 'article'
        published[key] = Number(row.total || 0)
    }

    return {
        days: safeDays,
        visits: Number(visit.total || 0),
        visitors: Number(visit.visitors || 0),
        mobileVisits: Number(visit.mobile || 0),
        comments: Number(commentRows?.[0]?.total || 0),
        messages: Number(messageRows?.[0]?.total || 0),
        publishedArticles: published.article,
        publishedGalleries: published.image,
        topPaths: (topPathRows || []).map(row => ({
            path: String(row.path || ''),
            visits: Number(row.visits || 0)
        }))
    }
}

module.exports = {
    createRecord,
    countRecordsByDay,
    countRecordsByField,
    countTopPaths,
    pruneRecords,
    countExpiredRecords,
    getOperationsSummary,
    RETENTION_DAYS,
}
