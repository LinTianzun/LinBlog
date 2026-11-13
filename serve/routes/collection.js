const collectionController = require('../controller/collectionController')
const { authMiddleware, optionalAuthMiddleware } = require('../middleware/auth')
const { requirePermission } = require('../utils/accessControl')

module.exports = (app) => {
    // 门户公开读取：只返回状态正常且包含已发布文章的系列
    app.get('/api/public/collection', optionalAuthMiddleware, collectionController.getPublicCollections)
    app.get('/api/public/collection/article/:articleId', optionalAuthMiddleware, collectionController.getPublicCollectionsForArticle)
    app.get('/api/public/collection/:id', optionalAuthMiddleware, collectionController.getPublicCollectionById)

    // 后台系列管理：复用分类管理权限，避免新增权限矩阵项带来额外迁移
    app.get('/api/collection', authMiddleware, requirePermission('category.manage'), collectionController.getCollections)
    app.get('/api/collection/:id', authMiddleware, requirePermission('category.manage'), collectionController.getCollectionById)
    app.post('/api/collection', authMiddleware, requirePermission('category.manage'), collectionController.createCollection)
    app.put('/api/collection/:id', authMiddleware, requirePermission('category.manage'), collectionController.updateCollection)
    app.delete('/api/collection/:id', authMiddleware, requirePermission('category.manage'), collectionController.deleteCollection)
    app.put('/api/collection/:id/articles', authMiddleware, requirePermission('category.manage'), collectionController.setCollectionArticles)
}
