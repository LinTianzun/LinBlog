const systemLogModel = require('../model/dbModel/systemLog/index')
const { writeSystemLog } = require('../utils/logHelper')
const { formatPaginationParams } = require('../utils/paginationUtil')
const { hasPermission } = require('../utils/accessControl')

function getLogFilters(query = {}) {
    const startDate = typeof query.startDate === 'string' ? query.startDate.trim() : ''
    const endDate = typeof query.endDate === 'string' ? query.endDate.trim() : ''
    const textFilter = (value, maxLength) =>
        typeof value === 'string' ? value.trim().slice(0, maxLength) : ''
    const rawTargetId = Number.parseInt(query.targetId, 10)
    const targetId = Number.isSafeInteger(rawTargetId) && rawTargetId > 0 ? rawTargetId : null
    // 与举报中心一致：必须成对提供且都是合法日期，否则时间范围不参与筛选
    const validDateText = (value) => /^\d{4}-\d{2}-\d{2}$/.test(value)
    const hasDateRange = Boolean(startDate) && Boolean(endDate)
        && validDateText(startDate) && validDateText(endDate)

    return {
        keyword: typeof query.keyword === 'string' ? query.keyword.trim() : '',
        module: systemLogModel.MODULES.includes(query.module) ? query.module : '',
        action: systemLogModel.ACTIONS.includes(query.action) ? query.action : '',
        startDate: hasDateRange ? startDate : null,
        endDate: hasDateRange ? endDate : null,
        operator: textFilter(query.operator, 50),
        ip: textFilter(query.ip, 64),
        targetType: textFilter(query.targetType, 50),
        targetId,
        risk: query.risk === 'high' ? 'high' : '',
        sortOrder: query.sortOrder === 'asc' ? 'asc' : 'desc'
    }
}

function requireLogView(req, res) {
    if (hasPermission(req.user, 'systemLog.view')) return true
    res.status(403).json({ code: 403, message: '当前账号没有查看系统日志的权限' })
    return false
}

async function getLogs(req, res) {
    try {
        if (!requireLogView(req, res)) return

        const params = formatPaginationParams(req.query, {
            defaultPageSize: 20,
            maxPageSize: 100
        })
        if (!params.success) {
            return res.status(400).json({ code: 400, message: params.errorMsg })
        }

        const { page, pageSize, offset } = params.data
        const filters = getLogFilters(req.query)
        const { list, total } = await systemLogModel.getLogsByPage({
            ...filters,
            pageSize,
            offset
        })

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

async function exportLogs(req, res) {
    try {
        if (!requireLogView(req, res)) return
        const filters = getLogFilters(req.query)
        const { csv } = await systemLogModel.getLogsForExport(filters)
        const stamp = new Date().toISOString().slice(0, 19).replace(/[T:]/g, '-')
        res.setHeader('Content-Type', 'text/csv; charset=utf-8')
        res.setHeader('Content-Disposition', `attachment; filename="system-log-${stamp}.csv"`)
        res.send(`\ufeff${csv}`)
    } catch (err) {
        res.status(500).json({ code: 500, message: '导出系统日志失败：' + err.message })
    }
}

async function getRiskSummary(req, res) {
    try {
        if (!requireLogView(req, res)) return
        const days = Number.parseInt(req.query?.days, 10)
        const data = await systemLogModel.getRiskSummary({
            days: Number.isFinite(days) ? days : 7
        })
        res.json({
            code: 200,
            message: '获取高风险操作摘要成功',
            data
        })
    } catch (err) {
        res.status(500).json({ code: 500, message: '获取高风险操作摘要失败：' + err.message })
    }
}

async function pruneLogs(req, res) {
    try {
        if (!hasPermission(req.user, 'backup.manage')) {
            return res.status(403).json({ code: 403, message: '只有超级管理员可以清理系统日志' })
        }

        const days = Number.parseInt(req.body?.days, 10)
        const result = await systemLogModel.pruneLogs(Number.isFinite(days) ? days : undefined)
        writeSystemLog({
            userId: req.user.userId,
            action: 'delete',
            module: 'system',
            targetType: 'system_log',
            detail: `清理超过 ${result.retentionDays} 天的系统日志，删除 ${result.deleted} 条`,
            ip: req.ip || null
        })
        res.json({
            code: 200,
            message: `已清理 ${result.deleted} 条系统日志`,
            data: result
        })
    } catch (err) {
        res.status(500).json({ code: 500, message: '清理系统日志失败：' + err.message })
    }
}

module.exports = { getLogs, exportLogs, getRiskSummary, pruneLogs }
