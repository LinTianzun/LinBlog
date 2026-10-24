const labelController = require('../controller/labelController')
const { authMiddleware } = require('../middleware/auth')

module.exports = (app) => {
    // 标签列表（含文章计数）
    app.get('/api/label', authMiddleware, labelController.getLabels)

    // 新建标签
    app.post('/api/label', authMiddleware, labelController.createLabel)

    // 删除标签（被文章使用时拒绝）
    app.delete('/api/label/:id', authMiddleware, labelController.deleteLabel)
}
