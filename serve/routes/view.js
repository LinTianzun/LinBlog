const viewController = require('../controller/viewController')
const { optionalAuthMiddleware } = require('../middleware/auth')

module.exports = (app) => {
    // 门户浏览计数：匿名可调用，同一访客在去重窗口内只计一次
    app.post('/api/public/view', optionalAuthMiddleware, viewController.recordView)
}
