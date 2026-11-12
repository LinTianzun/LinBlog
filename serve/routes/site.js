const siteController = require('../controller/siteController')
const { authMiddleware } = require('../middleware/auth')
const { requirePermission } = require('../utils/accessControl')

module.exports = (app) => {
    // 公开读取：桌宠开关影响所有访客，必须由服务端下发
    app.get('/api/site/settings', siteController.getSettings)
    // 修改属于站点级展示配置，沿用「权限管理」档位，避免普通账号改动全站外观
    app.put(
        '/api/site/settings',
        authMiddleware,
        requirePermission('permission.edit'),
        siteController.updateSettings
    )
}
