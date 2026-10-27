const commentInteractionModel = require('../model/dbModel/commentInteraction/index')
const { writeSystemLog } = require('../utils/logHelper')

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
 * 切换评论点赞（需登录）
 * POST /api/public/comment/like  body: { commentType, commentId }
 */
async function toggleLike(req, res) {
    try {
        const { userId, userType } = req.user
        if (userType === 'visitor' || !userId) {
            return res.status(401).json({ code: 401, message: '请先登录后再点赞' })
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
 * POST /api/public/comment/report  body: { commentType, commentId }
 */
async function report(req, res) {
    try {
        const { userId, userType } = req.user
        if (userType === 'visitor' || !userId) {
            return res.status(401).json({ code: 401, message: '请先登录后再举报' })
        }

        const parsed = parsePayload(req.body)
        if (parsed.error) {
            return res.status(parsed.error.code).json({ code: parsed.error.code, message: parsed.error.message })
        }
        const { targetType, commentId } = parsed.data

        const result = await commentInteractionModel.report(targetType, commentId, userId)
        if (!result) {
            return res.status(404).json({ code: 404, message: '评论不存在或不可见' })
        }

        if (!result.already) {
            writeSystemLog({
                userId,
                action: 'update',
                module: 'comment',
                targetType: `${targetType}_comment`,
                targetId: commentId,
                detail: '举报评论',
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

module.exports = {
    toggleLike,
    report
}
