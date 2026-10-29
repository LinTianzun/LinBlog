const commentInteractionModel = require('../model/dbModel/commentInteraction/index')
const { writeSystemLog } = require('../utils/logHelper')
const { hasPermission } = require('../utils/accessControl')

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

module.exports = {
    toggleLike,
    report,
    deleteComment
}
