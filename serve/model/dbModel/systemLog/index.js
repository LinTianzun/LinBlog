const { query } = require('../../db/dbnew')

const ACTIONS = ['login', 'logout', 'create', 'update', 'delete', 'publish', 'revoke', 'status', 'system', 'ai']
// permission 模块：角色权限矩阵变更属于高风险操作，必须可审计
const MODULES = ['user', 'article', 'collection', 'gallery', 'diary', 'file', 'comment', 'message', 'subset', 'label', 'ai', 'permission', 'system', 'backup', 'pet']
const EXPORT_MAX_ROWS = 100000
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/

function normalizeDateText(value) {
    const trimmed = String(value || '').trim()
    if (!DATE_PATTERN.test(trimmed)) return null
    const date = new Date(`${trimmed}T00:00:00Z`)
    if (Number.isNaN(date.getTime())) return null
    // 形如 2026-02-31 会被 Date 进位到下个月，这里按字符串回读再比对一次
    return date.toISOString().slice(0, 10) === trimmed ? trimmed : null
}

/**
 * 日志日期范围转 SQL 条件。结束日期按「次日零点」比较，
 * 避免 MySQL 连接时区与本地时区不一致时漏掉当天末尾日志。
 */
function buildLogDateRange(startDate, endDate) {
    const from = normalizeDateText(startDate)
    const to = normalizeDateText(endDate)
    if (!from || !to) return null
    const [begin, finish] = from <= to ? [from, to] : [to, from]
    const next = new Date(`${finish}T00:00:00Z`)
    next.setUTCDate(next.getUTCDate() + 1)
    return { column: 'l.created_at', from: begin, to: next.toISOString().slice(0, 10) }
}

/**
 * 写入一条系统日志；字段已由调用方归一化，失败由调用方兜底
 * @param {Object} payload - { userId, action, module, targetType, targetId, detail, ip }
 */
async function insertLog({ userId = null, action, module, targetType = null, targetId = null, detail = null, ip = null }) {
    const sql = `
        INSERT INTO system_log (user_id, action, module, target_type, target_id, detail, ip)
        VALUES (?, ?, ?, ?, ?, ?, ?)
    `
    return query(sql, [userId, action, module, targetType, targetId, detail, ip])
}

/**
 * 分页查询日志；keyword 匹配详情/目标类型/目标ID/用户名，支持按模块和动作过滤
 * sortOrder 仅支持 asc/desc，控制 created_at 的升降序
 */
async function getLogsByPage({
    keyword = '',
    module = '',
    action = '',
    startDate = null,
    endDate = null,
    pageSize = 20,
    offset = 0,
    sortOrder = 'desc'
}) {
    const where = []
    const params = []

    if (keyword) {
        where.push('(l.detail LIKE ? OR l.target_type LIKE ? OR CAST(l.target_id AS CHAR) LIKE ? OR u.username LIKE ?)')
        const term = `%${keyword}%`
        params.push(term, term, term, term)
    }
    if (module) {
        // 内容系列早期写在 article 模块下，按 target_type 兼容历史日志
        if (module === 'collection') {
            where.push('(l.module = ? OR l.target_type = ?)')
            params.push(module, 'collection')
        } else {
            where.push('l.module = ?')
            params.push(module)
        }
    }
    if (action) {
        where.push('l.action = ?')
        params.push(action)
    }
    const dateRange = buildLogDateRange(startDate, endDate)
    if (dateRange) {
        where.push(`${dateRange.column} >= ?`, `${dateRange.column} < ?`)
        params.push(dateRange.from, dateRange.to)
    }

    const whereSql = where.length > 0 ? `WHERE ${where.join(' AND ')}` : ''
    const orderDirection = sortOrder === 'asc' ? 'ASC' : 'DESC'

    const totalRows = await query(
        `SELECT COUNT(*) AS total FROM system_log l LEFT JOIN users u ON l.user_id = u.id ${whereSql}`,
        params
    )
    const list = await query(
        `SELECT l.id, l.user_id, u.username, u.user_type, l.action, l.module,
                l.target_type, l.target_id, l.detail, l.ip, l.created_at
         FROM system_log l
         LEFT JOIN users u ON l.user_id = u.id
         ${whereSql}
         ORDER BY l.created_at ${orderDirection}, l.id ${orderDirection}
         LIMIT ? OFFSET ?`,
        [...params, pageSize, offset]
    )

    return { list, total: Number(totalRows[0]?.total || 0) }
}

function buildLogFilters({
    keyword = '',
    module = '',
    action = '',
    startDate = null,
    endDate = null
} = {}) {
    const where = []
    const params = []

    if (keyword) {
        where.push('(l.detail LIKE ? OR l.target_type LIKE ? OR CAST(l.target_id AS CHAR) LIKE ? OR u.username LIKE ?)')
        const term = `%${keyword}%`
        params.push(term, term, term, term)
    }
    if (module && MODULES.includes(module)) {
        if (module === 'collection') {
            where.push('(l.module = ? OR l.target_type = ?)')
            params.push(module, 'collection')
        } else {
            where.push('l.module = ?')
            params.push(module)
        }
    }
    if (action && ACTIONS.includes(action)) {
        where.push('l.action = ?')
        params.push(action)
    }
    const dateRange = buildLogDateRange(startDate, endDate)
    if (dateRange) {
        where.push(`${dateRange.column} >= ?`, `${dateRange.column} < ?`)
        params.push(dateRange.from, dateRange.to)
    }
    return { whereSql: where.length > 0 ? `WHERE ${where.join(' AND ')}` : '', params }
}

function escapeCsvCell(value) {
    const text = value == null ? '' : String(value)
    return `"${text.replace(/"/g, '""').replace(/\r?\n/g, '\r\n')}"`
}

function toCsv(rows) {
    const headers = ['id', 'user_id', 'username', 'action', 'module', 'target_type', 'target_id', 'detail', 'ip', 'created_at']
    return [
        headers.join(','),
        ...rows.map(row => headers.map(header => escapeCsvCell(row[header])).join(','))
    ].join('\r\n')
}

async function getLogsForExport({
    keyword = '',
    module = '',
    action = '',
    startDate = null,
    endDate = null,
    sortOrder = 'desc',
    limit = EXPORT_MAX_ROWS
} = {}) {
    const { whereSql, params } = buildLogFilters({ keyword, module, action, startDate, endDate })
    const orderDirection = sortOrder === 'asc' ? 'ASC' : 'DESC'
    const rows = await query(
        `SELECT l.id, l.user_id, u.username, l.action, l.module,
                l.target_type, l.target_id, l.detail, l.ip, l.created_at
         FROM system_log l
         LEFT JOIN users u ON l.user_id = u.id
         ${whereSql}
         ORDER BY l.created_at ${orderDirection}, l.id ${orderDirection}
         LIMIT ?`,
        [...params, Math.min(Math.max(Number(limit) || EXPORT_MAX_ROWS, 1), EXPORT_MAX_ROWS)]
    )
    return { rows: rows || [], csv: toCsv(rows || []) }
}

async function pruneLogs(days = 365, limit = 1000) {
    const retentionDays = Math.max(Number.parseInt(days, 10) || 365, 30)
    const batchSize = Math.max(Math.min(Number.parseInt(limit, 10) || 1000, 10000), 100)
    let deleted = 0

    while (deleted < 100000) {
        const result = await query(
            `DELETE FROM system_log
             WHERE created_at < (NOW() - INTERVAL ? DAY)
             LIMIT ?`,
            [retentionDays, batchSize]
        )
        const affected = Number(result?.affectedRows || 0)
        deleted += affected
        if (affected < batchSize) break
    }

    return { deleted, retentionDays }
}

module.exports = {
    ACTIONS,
    MODULES,
    insertLog,
    getLogsByPage,
    getLogsForExport,
    pruneLogs,
}
