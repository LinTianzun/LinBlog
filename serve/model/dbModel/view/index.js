const { query } = require('../../db/dbnew')

// 浏览量统计：article/image 计到 article.views，diary 计到 diary.views。
// 同一访客（登录用户按 userId，游客按 IP）对同一目标在去重窗口内只计一次，防止刷量。
const DEDUP_WINDOW_MINUTES = 30
// 去重窗口之外的数据没有价值，保留一段时间用于统计趋势后即清理
const RETENTION_DAYS = 7
const TARGET_TABLES = {
    article: { table: 'article', column: 'views' },
    image: { table: 'article', column: 'views' },
    diary: { table: 'diary', column: 'views' }
}

function normalizeTargetType(targetType) {
    if (targetType === 'gallery') return 'image'
    return targetType
}

/**
 * 记录一次浏览；命中去重窗口则不计数。
 * @param {string} targetType - article/image/diary
 * @param {number} targetId
 * @param {string} identifier - 登录用户为 u:{id}，游客为 ip:{ip}
 * @returns {Promise<{counted: boolean, views: number|null}>}
 */
async function recordView(targetType, targetId, identifier) {
    const meta = TARGET_TABLES[normalizeTargetType(targetType)]
    if (!meta) return { counted: false, views: null }

    // 去重：窗口内已记录过同一目标则跳过计数，仅回读当前浏览量
    const recent = await query(
        `SELECT id FROM view_log
         WHERE target_type = ? AND target_id = ? AND identifier = ?
           AND created_at > DATE_SUB(NOW(), INTERVAL ? MINUTE)
         LIMIT 1`,
        [targetType, targetId, identifier, DEDUP_WINDOW_MINUTES]
    )
    if (recent.length > 0) {
        return { counted: false, views: await readViews(meta, targetId) }
    }

    await query(
        `INSERT INTO view_log (target_type, target_id, identifier) VALUES (?, ?, ?)`,
        [targetType, targetId, identifier]
    )
    await query(
        `UPDATE ${meta.table} SET ${meta.column} = ${meta.column} + 1 WHERE id = ?`,
        [targetId]
    )
    void pruneViewLogs(targetType, targetId)
    return { counted: true, views: await readViews(meta, targetId) }
}

/**
 * 清理超出保留期的浏览记录，避免 view_log 无限增长。
 * 清理失败不影响浏览计数（纯日志性质数据）。
 */
async function pruneViewLogs(targetType, targetId) {
    try {
        await query(
            `DELETE FROM view_log
             WHERE target_type = ? AND target_id = ?
               AND created_at < DATE_SUB(NOW(), INTERVAL ? DAY)`,
            [targetType, targetId, RETENTION_DAYS]
        )
    } catch (err) {
        console.warn('[View] 清理过期浏览记录失败：', err.message)
    }
}

async function readViews(meta, targetId) {
    const rows = await query(
        `SELECT ${meta.column} AS views FROM ${meta.table} WHERE id = ? LIMIT 1`,
        [targetId]
    )
    if (rows.length === 0) return null
    return Number(rows[0].views || 0)
}

module.exports = {
    normalizeTargetType,
    recordView,
    pruneViewLogs,
    DEDUP_WINDOW_MINUTES
}
