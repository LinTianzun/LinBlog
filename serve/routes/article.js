const articleController = require('../controller/articleController')
const { authMiddleware } = require('../middleware/auth')

module.exports = (app) => {
    // 新增文章
    app.post('/api/article', authMiddleware, articleController.createArticle)

    // 文章分页查询（支持多条件筛选）
    app.get('/api/article', authMiddleware, articleController.getArticles)

    // 根据 ID 查询文章详情
    app.get('/api/article/:id', authMiddleware, articleController.getArticleById)

    // 文章编辑更新
    app.put('/api/article/:id', authMiddleware, articleController.updateArticle)

    // 文章删除（逻辑删除）
    app.delete('/api/article/:id', authMiddleware, articleController.deleteArticle)

    // 文章状态修改
    app.patch('/api/article/:id/status', authMiddleware, articleController.updateArticleStatus)
}
