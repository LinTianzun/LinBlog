const healthController = require('../controller/healthController')
const { authMiddleware } = require('../middleware/auth')

module.exports = (app) => {
    // 运行时信息：内存、运行时间、连接池状态，仅管理员可见
    app.get('/api/health/runtime', authMiddleware, healthController.runtimeInfo)
}
