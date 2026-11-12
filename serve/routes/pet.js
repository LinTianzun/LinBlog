const petController = require('../controller/petController')
const { authMiddleware } = require('../middleware/auth')

module.exports = (app) => {
    // 登录用户的桌宠养成状态：跨设备同步；匿名访客仍走本机存储
    app.get('/api/pet/state', authMiddleware, petController.getState)
    app.put('/api/pet/state', authMiddleware, petController.saveState)
}
