const articleModel = require('../model/dbModel/article/index')
const fileModel = require('../model/dbModel/file/index')
const diaryModel = require('../model/dbModel/diary/index')
const commentModel = require('../model/dbModel/comment/index')
const messageModel = require('../model/dbModel/message/index')

/**
 * 总览统计聚合接口
 * 复用各模块现有计数方法，不新增 SQL，一次请求汇总前端 gather 卡片所需数据
 */
async function getOverviewSummary(req, res) {
    try {
        const { userId, userType } = req.user

        // 文章 / 图库各自走 countArticlesByState 并按 classify 拆分
        const [articleSummary, gallerySummary, fileSummary, diaryResult, commentResult, messageUnread] =
            await Promise.all([
                articleModel.countArticlesByState({ classify: 'article', userId, userType }),
                articleModel.countArticlesByState({ classify: 'image', userId, userType }),
                fileModel.countFilesSummary(),
                diaryModel.getDiariesByPage({ pageSize: 1, offset: 0 }),
                commentModel.getCommentsByPage(1, 1, 0),
                messageModel.getUnreadCount(userId),
            ])

        res.json({
            code: 200,
            message: '查询成功',
            data: {
                article: articleSummary.all,
                gallery: gallerySummary.all,
                file: fileSummary.total,
                diary: diaryResult.total,
                comment: commentResult.total,
                messageUnread,
            },
        })
    } catch (err) {
        res.status(500).json({ code: 500, message: '总览统计查询失败：' + err.message })
    }
}

module.exports = {
    getOverviewSummary,
}
