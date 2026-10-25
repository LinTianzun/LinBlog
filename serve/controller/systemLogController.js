const systemLogModel = require('../model/dbModel/systemLog/index')
const { formatPaginationParams } = require('../utils/paginationUtil')

/**
 * 分页查询系统日志（仅管理员）；支持关键词、模块、动作过滤
 */
async function getLogs(req, res) {
    try {
        if (!req.user || req.user.user_type !== 'admin') {
            return res.status(403).json({ code: 403, message: '无权限操作，仅管理员可以查看系统日志' })
        }

        const params = formatPaginationParams(req.query, {
            defaultPageSize: 20,
            maxPageSize: 100
        })
        if (!params.success) {
            return res.status(400).json({ code: 400, message: params.errorMsg })
        }

        const { page, pageSize, offset } = params.data
        const keyword = typeof req.query.keyword === 'string' ? req.query.keyword.trim() : ''
        const module = systemLogModel.MODULES.includes(req.query.module) ? req.query.module : ''
        const action = systemLogModel.ACTIONS.includes(req.query.action) ? req.query.action : ''

        const { list, total } = await systemLogModel.getLogsByPage({ keyword, module, action, pageSize, offset })

        res.json({
            code: 200,
            message: '获取系统日志成功',
            data: {
                total,
                page,
                pageSize,
                totalPage: Math.ceil(total / pageSize),
                list: list.map(item => ({
                    id: item.id,
                    userId: item.user_id,
                    username: item.username || '（已注销）',
                    userType: item.user_type || null,
                    action: item.action,
                    module: item.module,
                    targetType: item.target_type,
                    targetId: item.target_id,
                    detail: item.detail,
                    ip: item.ip,
                    createdAt: item.created_at
                }))
            }
        })
    } catch (err) {
        res.status(500).json({ code: 500, message: '获取系统日志失败：' + err.message })
    }
}

module.exports = { getLogs }
