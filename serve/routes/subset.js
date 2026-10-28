const subsetController = require('../controller/subsetController')
const { authMiddleware, optionalAuthMiddleware } = require('../middleware/auth')
const { requirePermission } = require('../utils/accessControl')

/**
 * 公开读取标记：门户分类只统计已发布内容，草稿/已驳回不对外计数。
 * 用显式包装而不是在控制器里猜路径，避免路由改名后口径悄悄失效。
 */
function publicRead(req, res, next) {
    req.publicRead = true
    return next()
}

module.exports = (app) => {
    // 公开的分类列表（访客门户筛选）
    app.get('/api/public/subset', publicRead, optionalAuthMiddleware, subsetController.getSubsets)

    app.get('/api/subset', authMiddleware, subsetController.getSubsets)
    app.post('/api/subset', authMiddleware, requirePermission('category.manage'), subsetController.createSubset)
    app.put('/api/subset/:id', authMiddleware, requirePermission('category.manage'), subsetController.updateSubset)
    app.delete('/api/subset/:id', authMiddleware, requirePermission('category.manage'), subsetController.deleteSubset)
}
