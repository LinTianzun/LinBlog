const viewController = require('../controller/viewController')
const { optionalAuthMiddleware } = require('../middleware/auth')
const { interactionLimit } = require('../middleware/rateLimit')
const { sameOrigin } = require('../middleware/sameOrigin')

module.exports = (app) => {
    // 门户浏览计数：匿名可调用，同一访客在去重窗口内只计一次
    app.post('/api/public/view', sameOrigin, optionalAuthMiddleware, interactionLimit, viewController.recordView)
}
