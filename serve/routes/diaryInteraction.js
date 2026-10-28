const diaryInteractionController = require('../controller/diaryInteractionController')
const { optionalAuthMiddleware } = require('../middleware/auth')
const { commentWriteLimit, interactionLimit } = require('../middleware/rateLimit')

module.exports = (app) => {
    // 随笔点赞状态：匿名可读，登录后额外返回自己是否已赞
    app.get('/api/public/diary/praise/:id', optionalAuthMiddleware, diaryInteractionController.getLikeState)

    // 切换随笔点赞：控制器内校验登录态，匿名返回 401 而不是直接跳转
    app.post('/api/public/diary/praise/:id', optionalAuthMiddleware, interactionLimit, diaryInteractionController.toggleLike)

    // 随笔评论列表（公开只读）
    app.get('/api/public/diary/comment', optionalAuthMiddleware, diaryInteractionController.getComments)

    // 发表随笔评论（需登录，匿名返回 401 提示登录）
    app.post('/api/public/diary/comment', optionalAuthMiddleware, commentWriteLimit, diaryInteractionController.createComment)
}
