const diaryInteractionModel = require('../model/dbModel/diaryInteraction/index')
const { formatPaginationParams } = require('../utils/paginationUtil')
const { writeSystemLog } = require('../utils/logHelper')
const { hasPermission } = require('../utils/accessControl')

/**
 * 查询随笔点赞状态与总数（匿名可用，未登录只返回总数）
 */
async function getLikeState(req, res) {
    try {
        const state = await diaryInteractionModel.findLikeState(
            req.params.id,
            req.user?.userId ?? null
        )
        if (!state) {
            return res.status(404).json({ code: 404, message: '随笔不存在或已删除' })
        }

        res.json({
            code: 200,
            message: '查询成功',
            data: { liked: state.liked, likes: state.likes }
        })
    } catch (err) {
        res.status(500).json({ code: 500, message: '查询点赞状态失败：' + err.message })
    }
}

/**
 * 切换随笔点赞（需登录）
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

        const result = await diaryInteractionModel.toggleLike(req.params.id, userId)
        if (!result) {
            return res.status(404).json({ code: 404, message: '随笔不存在或已删除' })
        }

        writeSystemLog({
            userId,
            action: result.liked ? 'like' : 'unlike',
            module: 'diary',
            targetType: 'diary',
            targetId: diaryInteractionModel.parseDiaryId(req.params.id),
            detail: result.liked ? '点赞随笔' : '取消随笔点赞',
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
 * 随笔评论列表（公开只读，仅正常随笔下的未删除评论）
 */
async function getComments(req, res) {
    try {
        const diaryId = Number(req.query.diaryId)
        if (!Number.isSafeInteger(diaryId) || diaryId <= 0) {
            return res.status(400).json({ code: 400, message: '请传入有效的随笔ID' })
        }

        const paginationResult = formatPaginationParams(req.query)
        if (!paginationResult.success) {
            return res.status(400).json({ code: 400, message: paginationResult.errorMsg })
        }
        const { page, pageSize, offset } = paginationResult.data

        const result = await diaryInteractionModel.getCommentsByDiary(
            diaryId, page, pageSize, offset, req.user?.userId ?? null
        )

        res.json({
            code: 200,
            message: result.total > 0 ? '查询成功' : '暂无评论',
            data: result
        })
    } catch (err) {
        res.status(500).json({ code: 500, message: '查询随笔评论失败：' + err.message })
    }
}

/**
 * 发表随笔评论（需登录）
 */
async function createComment(req, res) {
    try {
        const { userId } = req.user
        if (!userId) {
            return res.status(401).json({ code: 401, message: '请先登录后再发表评论' })
        }
        if (!hasPermission(req.user, 'comment.create')) {
            return res.status(403).json({ code: 403, message: '当前账号没有发表评论的权限' })
        }

        const diaryId = Number(req.body?.diaryId)
        if (!Number.isSafeInteger(diaryId) || diaryId <= 0) {
            return res.status(400).json({ code: 400, message: '请传入有效的随笔ID' })
        }

        const content = typeof req.body?.content === 'string' ? req.body.content.trim() : ''
        if (!content) {
            return res.status(400).json({ code: 400, message: '评论内容不能为空' })
        }
        if (content.length > 512) {
            return res.status(400).json({ code: 400, message: '评论内容不能超过512字' })
        }

        // 回复目标：0/缺省表示一级评论；后端会把回复二级评论归一到根评论
        const parentId = Number(req.body?.parentId) || 0
        if (!Number.isSafeInteger(parentId) || parentId < 0) {
            return res.status(400).json({ code: 400, message: '请传入有效的回复评论ID' })
        }

        const result = await diaryInteractionModel.createComment({
            diaryId,
            userId,
            content,
            parentId
        })
        if (!result) {
            return res.status(404).json({ code: 404, message: '随笔不存在或已删除' })
        }
        if (result.invalidParent) {
            return res.status(400).json({ code: 400, message: '回复的评论不存在或已删除' })
        }

        writeSystemLog({
            userId,
            action: 'create',
            module: 'diary',
            targetType: 'diary_comment',
            targetId: result.commentId,
            detail: parentId > 0 ? '门户回复随笔评论' : '门户评论随笔',
            ip: req.ip || null,
        })

        res.status(201).json({
            code: 200,
            message: '评论成功',
            data: {
                commentId: result.commentId,
                diaryId,
                createdAt: new Date().toISOString()
            }
        })
    } catch (err) {
        res.status(500).json({ code: 500, message: '评论失败：' + err.message })
    }
}

module.exports = {
    getLikeState,
    toggleLike,
    getComments,
    createComment
}
