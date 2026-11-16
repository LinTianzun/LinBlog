const collectionController = require('../controller/collectionController')
const { authMiddleware, optionalAuthMiddleware } = require('../middleware/auth')
const { requirePermission, requireAnyPermission } = require('../utils/accessControl')

module.exports = (app) => {
    // 门户公开读取：只返回状态正常且包含已发布文章的系列
    app.get('/api/public/collection', optionalAuthMiddleware, collectionController.getPublicCollections)
    app.get('/api/public/collection/article/:articleId', optionalAuthMiddleware, collectionController.getPublicCollectionsForArticle)
    app.get('/api/public/collection/:id', optionalAuthMiddleware, collectionController.getPublicCollectionById)

    // 后台系列管理：查看与编辑分开授权，编辑能力同时允许进入列表
    const canViewCollections = requireAnyPermission(['collection.view', 'collection.manage'])
    app.get('/api/collection', authMiddleware, canViewCollections, collectionController.getCollections)
    // 版本路由放在 /:id 之前，避免后续新增动态前缀时被吞掉
    app.get('/api/collection/:id/versions', authMiddleware, canViewCollections, collectionController.getCollectionVersions)
    app.put('/api/collection/:id/version-policy', authMiddleware, requirePermission('collection.manage'), collectionController.updateCollectionVersionPolicy)
    app.post('/api/collection/:id/versions/cleanup', authMiddleware, requirePermission('collection.manage'), collectionController.cleanupCollectionVersions)
    app.get('/api/collection/:id/versions/:versionId/diff', authMiddleware, canViewCollections, collectionController.getCollectionVersionDiff)
    app.get('/api/collection/:id/versions/:versionId', authMiddleware, canViewCollections, collectionController.getCollectionVersion)
    app.post('/api/collection/:id/versions/:versionId/restore', authMiddleware, requirePermission('collection.manage'), collectionController.restoreCollectionVersion)
    app.get('/api/collection/:id', authMiddleware, canViewCollections, collectionController.getCollectionById)
    app.post('/api/collection', authMiddleware, requirePermission('collection.manage'), collectionController.createCollection)
    app.put('/api/collection/:id', authMiddleware, requirePermission('collection.manage'), collectionController.updateCollection)
    app.delete('/api/collection/:id', authMiddleware, requirePermission('collection.manage'), collectionController.deleteCollection)
    app.put('/api/collection/:id/articles', authMiddleware, requirePermission('collection.manage'), collectionController.setCollectionArticles)
}
