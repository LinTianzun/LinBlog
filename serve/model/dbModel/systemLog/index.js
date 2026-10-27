const { query } = require('../../db/dbnew')

const ACTIONS = ['login', 'logout', 'create', 'update', 'delete', 'publish', 'revoke', 'status', 'system']
const MODULES = ['user', 'article', 'gallery', 'diary', 'file', 'comment', 'message', 'subset', 'label', 'system']

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
        where.push('l.module = ?')
        params.push(module)
    }
    if (action) {
        where.push('l.action = ?')
        params.push(action)
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

module.exports = {
    ACTIONS,
    MODULES,
    insertLog,
    getLogsByPage,
}
