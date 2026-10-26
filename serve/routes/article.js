const articleController = require('../controller/articleController')
const { authMiddleware, optionalAuthMiddleware } = require('../middleware/auth')

module.exports = (app) => {
    // 新增文章
    app.post('/api/article', authMiddleware, articleController.createArticle)

    // 文章分页查询（支持多条件筛选）
    app.get('/api/article', authMiddleware, articleController.getArticles)

    // 文章状态统计（需放在 /:id 路由前，避免被参数路由吞掉）
    app.get('/api/article/state/summary', authMiddleware, articleController.getArticleStateSummary)

    // 公开只读接口：无论是否登录，都只返回已发布内容；登录仅用于点赞/评论等写操作
    app.get('/api/public/article', optionalAuthMiddleware, articleController.getPublicArticles)
    app.get('/api/public/article/:id', optionalAuthMiddleware, articleController.getPublicArticleById)

    // 根据 ID 查询文章详情
    app.get('/api/article/:id', authMiddleware, articleController.getArticleById)

    // 文章编辑更新
    app.put('/api/article/:id', authMiddleware, articleController.updateArticle)

    // 文章删除（逻辑删除）
    app.delete('/api/article/:id', authMiddleware, articleController.deleteArticle)

    // 文章状态修改
    app.patch('/api/article/:id/status', authMiddleware, articleController.updateArticleStatus)
}
