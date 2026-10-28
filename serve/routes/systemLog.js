const systemLogController = require('../controller/systemLogController')
const { authMiddleware } = require('../middleware/auth')
const { requirePermission } = require('../utils/accessControl')

module.exports = (app) => {
    // 系统日志分页查询（仅管理员）
    app.get('/api/systemLog', authMiddleware, requirePermission('systemLog.view'), systemLogController.getLogs)
}
