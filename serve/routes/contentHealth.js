const contentHealthController = require('../controller/contentHealthController')
const { authMiddleware } = require('../middleware/auth')
const { requirePermission } = require('../utils/accessControl')

module.exports = (app) => {
    app.get(
        '/api/content/health',
        authMiddleware,
        requirePermission('overview.viewAll'),
        contentHealthController.getContentHealth
    )
}
