const praiseController = require('../controller/praiseController')
const { optionalAuthMiddleware } = require('../middleware/auth')

module.exports = (app) => {
    // 点赞状态与总数：匿名可读，登录后额外返回自己是否已赞
    app.get('/api/public/praise/:id', optionalAuthMiddleware, praiseController.getLikeState)

    // 切换点赞：控制器内校验登录态，匿名返回 401 而不是中间件直接跳转
    app.post('/api/public/praise/:id', optionalAuthMiddleware, praiseController.toggleLike)
}
