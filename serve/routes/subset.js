const subsetController = require('../controller/subsetController')
const { authMiddleware, optionalAuthMiddleware } = require('../middleware/auth')

module.exports = (app) => {
    // 公开的分类列表（访客门户筛选）
    app.get('/api/public/subset', optionalAuthMiddleware, subsetController.getSubsets)

    app.get('/api/subset', authMiddleware, subsetController.getSubsets)
    app.post('/api/subset', authMiddleware, subsetController.createSubset)
    app.put('/api/subset/:id', authMiddleware, subsetController.updateSubset)
    app.delete('/api/subset/:id', authMiddleware, subsetController.deleteSubset)
}
