const praiseModel = require('../model/dbModel/praise/index')
const { writeSystemLog } = require('../utils/logHelper')

function parseArticleId(value) {
    const parsed = Number(value)
    return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null
}

/**
 * 查询当前文章的点赞状态与点赞数（匿名可用）
 * 未登录时 liked 恒为 false，仅返回总数。
 */
async function getLikeState(req, res) {
    try {
        const articleId = parseArticleId(req.params.id)
        if (!articleId) {
            return res.status(400).json({ code: 400, message: '请传入有效的文章ID' })
        }

        const state = await praiseModel.findLikeState(articleId, req.user.userId)
        if (!state) {
            return res.status(404).json({ code: 404, message: '文章不存在' })
        }
        if (state.state !== 'published') {
            return res.status(404).json({ code: 404, message: '文章不存在或未发布' })
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
 * 切换点赞（需登录）
 */
async function toggleLike(req, res) {
    try {
        const { userId, userType } = req.user
        if (userType === 'visitor' || !userId) {
            return res.status(401).json({ code: 401, message: '请先登录后再点赞' })
        }

        const articleId = parseArticleId(req.params.id)
        if (!articleId) {
            return res.status(400).json({ code: 400, message: '请传入有效的文章ID' })
        }

        const result = await praiseModel.toggleLike(articleId, userId)
        if (!result) {
            return res.status(404).json({ code: 404, message: '文章不存在或未发布' })
        }

        writeSystemLog({
            userId,
            action: result.liked ? 'like' : 'unlike',
            module: 'praise',
            targetType: 'article',
            targetId: articleId,
            detail: result.liked ? '点赞文章' : '取消点赞',
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

module.exports = {
    getLikeState,
    toggleLike
}
