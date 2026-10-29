const commentController = require('../controller/commentController')
const commentInteractionController = require('../controller/commentInteractionController')
const { authMiddleware, optionalAuthMiddleware } = require('../middleware/auth')
const {
    commentWriteLimit,
    reportLimit,
    interactionLimit,
} = require('../middleware/rateLimit')

module.exports = (app) => {
    // 分页查询评论（需登录，如需公开可移除authMiddleware）
    app.get('/api/comment', authMiddleware, commentController.getComments)

    // 公开只读：文章详情页展示已发布文章的正常评论
    app.get('/api/public/comment', optionalAuthMiddleware, commentController.getPublicComments)

    // 门户公开评论发表（需登录；匿名返回 401 提示登录）
    app.post('/api/public/comment', optionalAuthMiddleware, commentWriteLimit, commentController.createPublicComment)

    // 评论点赞（门户与后台共用；需登录，匿名返回 401）
    app.post('/api/public/comment/like', optionalAuthMiddleware, interactionLimit, commentInteractionController.toggleLike)

    // 举报评论（同一用户重复举报只记一次）
    app.post('/api/public/comment/report', optionalAuthMiddleware, reportLimit, commentInteractionController.report)

    // 删除评论（文章与随笔共用；需登录，仅本人或管理员可删）
    app.post('/api/public/comment/delete', optionalAuthMiddleware, commentInteractionController.deleteComment)

    // 新增评论（需登录）
    app.post('/api/comment', authMiddleware, commentWriteLimit, commentController.createComment)

    // 删除评论（需登录，URL传评论ID）
    app.delete('/api/comment/:id', authMiddleware, commentController.deleteComment)

    // 分页查询当前用户发出的所有评论（需登录，无需传用户ID/评论ID）
    app.get('/api/comment/my', authMiddleware, commentController.getMyComments)

    // 后台举报处理：列表与处理结果（需登录，控制器内校验 comment.moderate）
    app.get('/api/comment/reports', authMiddleware, commentInteractionController.getReports)
    // 批量处理必须挂在 /:id 之前，否则会被 :id 路由先吃掉
    app.patch('/api/comment/reports/batch', authMiddleware, commentInteractionController.updateReportStatusBatch)
    app.patch('/api/comment/reports/:id', authMiddleware, commentInteractionController.updateReportStatus)
}
