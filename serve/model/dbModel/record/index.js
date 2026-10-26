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

module.exports = {
    createRecord,
    countRecordsByDay,
    countRecordsByField,
    pruneRecords,
    countExpiredRecords,
    RETENTION_DAYS,
}
