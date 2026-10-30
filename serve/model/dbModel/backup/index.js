const { query } = require('../../db/dbnew')

const KINDS = ['backup', 'drill']
const TRIGGER_TYPES = ['scheduled', 'manual']
const STATUSES = ['success', 'failed']

/**
 * 记录一次备份或恢复演练结果。
 * 备份文件本身以磁盘为准，这张表只保存运行历史，便于运营复盘。
 */
async function insertLog({
    kind = 'backup',
    filename,
    targetDatabase = null,
    sizeBytes = 0,
    checksum = null,
    tableCount = null,
    rowCount = null,
    durationMs = null,
    triggerType = 'manual',
    status = 'success',
    errorMessage = null,
}) {
    const safeKind = KINDS.includes(kind) ? kind : 'backup'
    const safeTrigger = TRIGGER_TYPES.includes(triggerType) ? triggerType : 'manual'
    const safeStatus = STATUSES.includes(status) ? status : 'failed'

    return query(
        `INSERT INTO db_backup_log
            (kind, filename, target_database, size_bytes, checksum, table_count,
             row_count, duration_ms, trigger_type, status, error_message)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
            safeKind,
            String(filename || '').slice(0, 150),
            targetDatabase == null ? null : String(targetDatabase).slice(0, 64),
            Number(sizeBytes) || 0,
            checksum == null ? null : String(checksum).slice(0, 64),
            tableCount == null ? null : Number(tableCount),
            rowCount == null ? null : Number(rowCount),
            durationMs == null ? null : Number(durationMs),
            safeTrigger,
            safeStatus,
            errorMessage == null ? null : String(errorMessage).slice(0, 500),
        ]
    )
}

/**
 * 分页查询备份历史；支持按类型与状态过滤。
 */
async function getLogsByPage({ kind = '', status = '', pageSize = 20, offset = 0 }) {
    const where = []
    const params = []

    if (KINDS.includes(kind)) {
        where.push('kind = ?')
        params.push(kind)
    }
    if (STATUSES.includes(status)) {
        where.push('status = ?')
        params.push(status)
    }

    const whereSql = where.length > 0 ? `WHERE ${where.join(' AND ')}` : ''

    const totalRows = await query(
        `SELECT COUNT(*) AS total FROM db_backup_log ${whereSql}`,
        params
    )
    const list = await query(
        `SELECT id, kind, filename, target_database, size_bytes, checksum, table_count,
                row_count, duration_ms, trigger_type, status, error_message, created_at
         FROM db_backup_log
         ${whereSql}
         ORDER BY created_at DESC, id DESC
         LIMIT ? OFFSET ?`,
        [...params, pageSize, offset]
    )

    return { list, total: Number(totalRows[0]?.total || 0) }
}

/**
 * 最近一次成功备份与最近一次失败，用于设置页的状态提示。
 */
async function getLatestSummary() {
    const [lastSuccess] = await query(
        `SELECT id, filename, size_bytes, table_count, row_count, duration_ms, trigger_type, created_at
         FROM db_backup_log
         WHERE kind = 'backup' AND status = 'success'
         ORDER BY created_at DESC, id DESC
         LIMIT 1`
    )
    const [lastFailure] = await query(
        `SELECT id, filename, error_message, created_at
         FROM db_backup_log
         WHERE kind = 'backup' AND status = 'failed'
         ORDER BY created_at DESC, id DESC
         LIMIT 1`
    )
    const [lastDrill] = await query(
        `SELECT id, filename, target_database, table_count, row_count, duration_ms, status, created_at
         FROM db_backup_log
         WHERE kind = 'drill'
         ORDER BY created_at DESC, id DESC
         LIMIT 1`
    )

    return {
        lastSuccess: lastSuccess || null,
        lastFailure: lastFailure || null,
        lastDrill: lastDrill || null,
    }
}

/**
 * 保留期清理：历史记录只留最近 N 天，避免运维日志无限增长。
 */
async function pruneLogs(days, limit = 1000) {
    const result = await query(
        `DELETE FROM db_backup_log
         WHERE created_at < DATE_SUB(NOW(), INTERVAL ? DAY)
         ORDER BY created_at ASC
         LIMIT ?`,
        [days, limit]
    )
    return Number(result.affectedRows || 0)
}

module.exports = {
    KINDS,
    TRIGGER_TYPES,
    STATUSES,
    insertLog,
    getLogsByPage,
    getLatestSummary,
    pruneLogs,
}
