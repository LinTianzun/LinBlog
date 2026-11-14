const siteController = require('../controller/siteController')
const { authMiddleware } = require('../middleware/auth')
const { requirePermission } = require('../utils/accessControl')

module.exports = (app) => {
    // 公开读取：桌宠开关影响所有访客，必须由服务端下发
    app.get('/api/site/settings', siteController.getSettings)
    // 修改属于站点级展示配置，使用独立的宠物管理权限
    app.put(
        '/api/site/settings',
        authMiddleware,
        requirePermission('pet.manage'),
        siteController.updateSettings
    )
}
