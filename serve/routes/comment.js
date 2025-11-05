const commentController = require('../controller/commentController')
const { authMiddleware } = require('../middleware/auth')

module.exports = (app) => {
    // 分页查询评论（需登录，如需公开可移除authMiddleware）
    app.get('/api/comment', authMiddleware, commentController.getComments)

    // 新增评论（需登录）
    app.post('/api/comment', authMiddleware, commentController.createComment)

    // 删除评论（需登录，URL传评论ID）
    app.delete('/api/comment/:id', authMiddleware, commentController.deleteComment)

    // 分页查询当前用户发出的所有评论（需登录，无需传用户ID/评论ID）
    app.get('/api/comment/my', authMiddleware, commentController.getMyComments)
}