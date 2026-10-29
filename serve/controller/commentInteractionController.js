const commentInteractionModel = require('../model/dbModel/commentInteraction/index')
const { writeSystemLog } = require('../utils/logHelper')
const { hasPermission } = require('../utils/accessControl')
const { formatPaginationParams } = require('../utils/paginationUtil')

const REPORT_REASONS = new Map([
    ['spam', '广告或引流'],
    ['abuse', '辱骂或人身攻击'],
    ['porn', '色情或低俗内容'],
    ['illegal', '违法或危险内容'],
    ['misinformation', '虚假或误导信息'],
    ['other', '其他原因'],
])

/**
 * 解析并校验互动入参，失败时返回 { error: { code, message } }
 */
function parsePayload(body) {
    const targetType = commentInteractionModel.normalizeTargetType(body?.commentType)
    if (!targetType) {
        return { error: { code: 400, message: '评论类型仅支持 article 或 diary' } }
    }

    const commentId = commentInteractionModel.parseCommentId(body?.commentId)
    if (!commentId) {
        return { error: { code: 400, message: '请传入有效的评论ID' } }
    }

    return { data: { targetType, commentId } }
}

/**
 * 举报额外要求选择原因，补充说明选填。
 */
function parseReportPayload(body) {
    const parsed = parsePayload(body)
    if (parsed.error) return parsed

    const reason = typeof body?.reason === 'string' ? body.reason.trim() : ''
    if (!REPORT_REASONS.has(reason)) {
        return { error: { code: 400, message: '请选择有效的举报原因' } }
    }

    const detail = typeof body?.detail === 'string' ? body.detail.trim() : ''
    if (detail.length > 200) {
        return { error: { code: 400, message: '补充说明不能超过 200 个字符' } }
    }

    return {
        data: {
            ...parsed.data,
            reason,
            detail: detail || null,
        }
    }
}

function REPORT_STATUS_TEXT(status) {
    return status === 0 ? '已恢复为待处理' : status === 1 ? '已标记为已处理' : '已忽略该举报'
}

/**
 * 处理备注：选填，最多 200 字。超长直接返回 400，避免悄悄截断后
 * 运营以为备注完整保存了。
 */
function parseHandleNote(body) {
    if (body?.note === undefined || body?.note === null) return { data: null }
    if (typeof body.note !== 'string') {
        return { error: { code: 400, message: '处理备注必须是字符串' } }
    }
    const note = body.note.trim()
    if (note.length > 200) {
        return { error: { code: 400, message: '处理备注不能超过 200 个字符' } }
    }
    return { data: note || null }
}

/**
 * 切换评论点赞（需登录）
 * POST /api/public/comment/like  body: { commentType, commentId }
 */
async function toggleLike(req, res) {
    try {
        const { userId } = req.user
        if (!userId) {
            return res.status(401).json({ code: 401, message: '请先登录后再点赞' })
        }
        if (!hasPermission(req.user, 'comment.like')) {
            return res.status(403).json({ code: 403, message: '当前账号没有点赞权限' })
        }

        const parsed = parsePayload(req.body)
        if (parsed.error) {
            return res.status(parsed.error.code).json({ code: parsed.error.code, message: parsed.error.message })
        }
        const { targetType, commentId } = parsed.data

        const result = await commentInteractionModel.toggleLike(targetType, commentId, userId)
        if (!result) {
            return res.status(404).json({ code: 404, message: '评论不存在或不可见' })
        }

        writeSystemLog({
            userId,
            action: 'update',
            module: 'comment',
            targetType: `${targetType}_comment`,
            targetId: commentId,
            detail: result.liked ? '点赞评论' : '取消评论点赞',
            ip: req.ip || null,
        })

        res.json({
            code: 200,
            message: result.liked ? '点赞成功' : '已取消点赞',
            data: result
        })
    } catch (err) {
        res.status(500).json({ code: 500, message: '点赞失败：' + err.message })
    }
}

/**
 * 举报评论（需登录；同一用户重复举报不重复计数）
 * POST /api/public/comment/report  body: { commentType, commentId, reason, detail? }
 */
async function report(req, res) {
    try {
        const { userId } = req.user
        if (!userId) {
            return res.status(401).json({ code: 401, message: '请先登录后再举报' })
        }
        if (!hasPermission(req.user, 'comment.report')) {
            return res.status(403).json({ code: 403, message: '当前账号没有举报权限' })
        }

        const parsed = parseReportPayload(req.body)
        if (parsed.error) {
            return res.status(parsed.error.code).json({ code: parsed.error.code, message: parsed.error.message })
        }
        const { targetType, commentId, reason, detail } = parsed.data

        const result = await commentInteractionModel.report(
            targetType, commentId, userId, reason, detail
        )
        if (!result) {
            return res.status(404).json({ code: 404, message: '评论不存在或不可见' })
        }
        if (result.self) {
            return res.status(400).json({ code: 400, message: '不能举报自己的评论' })
        }

        if (!result.already) {
            writeSystemLog({
                userId,
                action: 'update',
                module: 'comment',
                targetType: `${targetType}_comment`,
                targetId: commentId,
                detail: `举报评论：${REPORT_REASONS.get(reason)}`,
                ip: req.ip || null,
            })
        }

        res.json({
            code: 200,
            message: result.already ? '你已举报过该评论' : '举报成功，感谢反馈',
            data: result
        })
    } catch (err) {
        res.status(500).json({ code: 500, message: '举报失败：' + err.message })
    }
}

/**
 * 删除评论（需登录；仅本人或管理员可删）
 * POST /api/public/comment/delete  body: { commentType, commentId }
 * 与点赞/举报共用 targetType 分发，补上随笔评论此前缺失的删除能力。
 */
async function deleteComment(req, res) {
    try {
        const { userId } = req.user
        if (!userId) {
            return res.status(401).json({ code: 401, message: '请先登录后再删除评论' })
        }
        if (!hasPermission(req.user, 'comment.moderate') && !hasPermission(req.user, 'comment.manageOwn')) {
            return res.status(403).json({ code: 403, message: '当前账号没有删除评论的权限' })
        }

        const parsed = parsePayload(req.body)
        if (parsed.error) {
            return res.status(parsed.error.code).json({ code: parsed.error.code, message: parsed.error.message })
        }
        const { targetType, commentId } = parsed.data

        const accessType = hasPermission(req.user, 'comment.moderate') ? 'admin' : 'normal'
        const affected = await commentInteractionModel.deleteComment(
            targetType, commentId, userId, accessType
        )
        if (affected === 0) {
            // 不区分「不存在」与「无权限」，避免通过状态码探测他人评论
            return res.status(403).json({ code: 403, message: '无权限删除该评论（评论不存在/已删除/非本人评论）' })
        }

        writeSystemLog({
            userId,
            action: 'delete',
            module: 'comment',
            targetType: `${targetType}_comment`,
            targetId: commentId,
            detail: '删除评论',
            ip: req.ip || null,
        })

        res.json({
            code: 200,
            message: affected > 1 ? `评论及其 ${affected - 1} 条回复已删除` : '评论删除成功',
            data: { deleted: affected }
        })
    } catch (err) {
        res.status(500).json({ code: 500, message: '删除评论失败：' + err.message })
    }
}

/**
 * 后台举报处理列表（需 comment.moderate）
 * GET /api/comment/reports?page&pageSize&status&reason&targetType&keyword
 */
async function getReports(req, res) {
    try {
        if (!hasPermission(req.user, 'comment.moderate')) {
            return res.status(403).json({ code: 403, message: '当前账号没有处理举报的权限' })
        }

        const paginationResult = formatPaginationParams(req.query)
        if (!paginationResult.success) {
            return res.status(400).json({ code: 400, message: paginationResult.errorMsg })
        }
        const { page, pageSize, offset } = paginationResult.data

        const reason = typeof req.query.reason === 'string' ? req.query.reason.trim() : ''
        if (reason && !REPORT_REASONS.has(reason)) {
            return res.status(400).json({ code: 400, message: '请选择有效的举报原因' })
        }

        const targetType = typeof req.query.targetType === 'string' ? req.query.targetType.trim() : ''
        if (targetType && !['article', 'gallery', 'diary'].includes(targetType)) {
            return res.status(400).json({ code: 400, message: '来源筛选仅支持 article、gallery 或 diary' })
        }

        let status = null
        if (req.query.status !== undefined && req.query.status !== '' && req.query.status !== 'all') {
            const parsed = Number(req.query.status)
            if (!Number.isInteger(parsed) || ![0, 1, 2].includes(parsed)) {
                return res.status(400).json({ code: 400, message: '举报状态仅支持 0、1、2' })
            }
            status = parsed
        }

        const startDate = typeof req.query.startDate === 'string' ? req.query.startDate.trim() : ''
        const endDate = typeof req.query.endDate === 'string' ? req.query.endDate.trim() : ''
        const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/
        const validDateText = (value) => {
            if (!value) return true
            if (!DATE_PATTERN.test(value)) return false
            const date = new Date(`${value}T00:00:00Z`)
            return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value
        }
        if (Boolean(startDate) !== Boolean(endDate)) {
            return res.status(400).json({ code: 400, message: '起止日期需同时提供' })
        }
        if (!validDateText(startDate) || !validDateText(endDate)) {
            return res.status(400).json({ code: 400, message: '时间范围请使用有效的 YYYY-MM-DD 格式' })
        }

        const result = await commentInteractionModel.listReports({
            page,
            pageSize,
            offset,
            reason: reason || null,
            targetType: targetType || null,
            status,
            keyword: typeof req.query.keyword === 'string' ? req.query.keyword : '',
            startDate: startDate || null,
            endDate: endDate || null,
        })

        res.json({
            code: 200,
            message: '查询成功',
            data: result,
        })
    } catch (err) {
        res.status(500).json({ code: 500, message: '查询举报失败：' + err.message })
    }
}

/**
 * 处理单条举报（需 comment.moderate）
 * PATCH /api/comment/reports/:id
 * body: { status: 0 恢复待处理 | 1 已处理 | 2 已忽略 }
 */
async function updateReportStatus(req, res) {
    try {
        if (!hasPermission(req.user, 'comment.moderate')) {
            return res.status(403).json({ code: 403, message: '当前账号没有处理举报的权限' })
        }

        const reportId = commentInteractionModel.parseCommentId(req.params.id)
        if (!reportId) {
            return res.status(400).json({ code: 400, message: '请传入有效的举报ID' })
        }

        const status = Number(req.body?.status)
        if (![0, 1, 2].includes(status)) {
            return res.status(400).json({ code: 400, message: '处理结果仅支持 0（恢复待处理）、1（已处理）或 2（已忽略）' })
        }

        const noteParsed = parseHandleNote(req.body)
        if (noteParsed.error) {
            return res.status(noteParsed.error.code).json({ code: noteParsed.error.code, message: noteParsed.error.message })
        }

        const updated = await commentInteractionModel.updateReportStatus(
            reportId,
            status,
            req.user.userId,
            noteParsed.data
        )
        if (!updated) {
            return res.status(404).json({ code: 404, message: '举报不存在' })
        }

        writeSystemLog({
            userId: req.user.userId,
            action: 'update',
            module: 'comment',
            targetType: 'comment_report',
            targetId: reportId,
            detail: status === 0
                ? '将举报恢复为待处理'
                : status === 1
                    ? '将举报标记为已处理'
                    : `忽略举报${noteParsed.data ? `：${noteParsed.data}` : ''}`,
            ip: req.ip || null,
        })

        res.json({
            code: 200,
            message: REPORT_STATUS_TEXT(status),
            data: { id: reportId, status },
        })
    } catch (err) {
        res.status(500).json({ code: 500, message: '处理举报失败：' + err.message })
    }
}

/**
 * 批量处理举报（需 comment.moderate）
 * PATCH /api/comment/reports/batch
 * body: { ids: number[], status: 0 恢复待处理 | 1 已处理 | 2 已忽略 }
 */
async function updateReportStatusBatch(req, res) {
    try {
        if (!hasPermission(req.user, 'comment.moderate')) {
            return res.status(403).json({ code: 403, message: '当前账号没有处理举报的权限' })
        }

        const ids = Array.isArray(req.body?.ids) ? req.body.ids : null
        if (!ids || ids.length === 0) {
            return res.status(400).json({ code: 400, message: '请至少选择一条举报' })
        }
        if (ids.length > 200) {
            return res.status(400).json({ code: 400, message: '一次最多处理 200 条举报' })
        }

        const status = Number(req.body?.status)
        if (![0, 1, 2].includes(status)) {
            return res.status(400).json({ code: 400, message: '处理结果仅支持 0（恢复待处理）、1（已处理）或 2（已忽略）' })
        }

        const noteParsed = parseHandleNote(req.body)
        if (noteParsed.error) {
            return res.status(noteParsed.error.code).json({ code: noteParsed.error.code, message: noteParsed.error.message })
        }

        const updated = await commentInteractionModel.updateReportStatusBatch(
            ids,
            status,
            req.user.userId,
            noteParsed.data
        )
        if (!updated) {
            return res.status(404).json({ code: 404, message: '选中的举报没有可处理的记录' })
        }

        const action = status === 0 ? '批量恢复待处理' : status === 1 ? '批量标记为已处理' : '批量忽略'
        writeSystemLog({
            userId: req.user.userId,
            action: 'update',
            module: 'comment',
            targetType: 'comment_report',
            targetId: null,
            detail: `${action}：选中 ${ids.length} 条，实际处理 ${updated} 条${noteParsed.data ? `，备注：${noteParsed.data}` : ''}`,
            ip: req.ip || null,
        })

        res.json({
            code: 200,
            message: `已${action.replace('批量', '')} ${updated} 条举报`,
            data: { updated, requested: ids.length, status },
        })
    } catch (err) {
        res.status(500).json({ code: 500, message: '批量处理举报失败：' + err.message })
    }
}

module.exports = {
    toggleLike,
    report,
    deleteComment,
    getReports,
    updateReportStatus,
    updateReportStatusBatch,
}
