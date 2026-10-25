const overviewController = require('../controller/overviewController')
const { authMiddleware } = require('../middleware/auth')

module.exports = (app) => {
    // 总览统计聚合（文章/图库/文件/日记/评论/私信未读）
    app.get('/api/overview/summary', authMiddleware, overviewController.getOverviewSummary)
    // 近一周/近一月访问量趋势与设备/系统分布
    app.get('/api/overview/visitStats', authMiddleware, overviewController.getVisitStats)
}
