const articleController = require('../controller/articleController')
const { authMiddleware } = require('../middleware/auth')

module.exports = (app) => {
    // 所有文章接口均需登录
    app.use(authMiddleware)
    //  新增文章
    app.post('/api/article', articleController.createArticle)
    //  文章分页查询（支持多条件筛选）
    app.get('/api/article', articleController.getArticles)
    //  根据ID查询文章详情
    app.get('/api/article/:id', articleController.getArticleById)
    //  文章编辑更新
    app.put('/api/article/:id', articleController.updateArticle)
    //  文章删除（逻辑删除）
    app.delete('/api/article/:id', articleController.deleteArticle)
    //  文章状态修改
    app.patch('/api/article/:id/status', articleController.updateArticleStatus)
}