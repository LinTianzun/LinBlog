const labelController = require('../controller/labelController')
const { authMiddleware, optionalAuthMiddleware } = require('../middleware/auth')

module.exports = (app) => {
    // 公开的标签列表（访客门户展示）
    app.get('/api/public/label', optionalAuthMiddleware, labelController.getLabels)

    // 标签列表（含文章计数）
    app.get('/api/label', authMiddleware, labelController.getLabels)

    // 新建标签
    app.post('/api/label', authMiddleware, labelController.createLabel)

    // 删除标签（被文章使用时拒绝）
    app.delete('/api/label/:id', authMiddleware, labelController.deleteLabel)
}
