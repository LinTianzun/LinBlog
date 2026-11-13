const siteAnalyticsController = require('../controller/siteAnalyticsController')
const { authMiddleware } = require('../middleware/auth')
const { interactionLimit } = require('../middleware/rateLimit')
const { sameOrigin } = require('../middleware/sameOrigin')
const { requirePermission } = require('../utils/accessControl')

module.exports = (app) => {
    // 门户搜索与 404 事件：匿名可上报，只记录关键词/路径，不关联访客身份
    app.post(
        '/api/public/site-event/search',
        sameOrigin,
        interactionLimit,
        siteAnalyticsController.recordSearchEvent
    )
    app.post(
        '/api/public/site-event/not-found',
        sameOrigin,
        interactionLimit,
        siteAnalyticsController.recordNotFoundEvent
    )

    // 后台站点洞察：复用总览权限，避免额外扩张权限矩阵
    app.get(
        '/api/overview/siteEvents',
        authMiddleware,
        requirePermission('overview.viewAll'),
        siteAnalyticsController.getSiteEventStats
    )
}
