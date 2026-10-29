const overviewController = require('../controller/overviewController')
const { authMiddleware } = require('../middleware/auth')
const { requirePermission } = require('../utils/accessControl')

module.exports = (app) => {
    // 总览统计聚合（文章/图库/文件/日记/评论/私信未读）
    // overview.viewAll 是总览的准入权限：没有它连自己的内容也不统计，
    // 与「查看全站总览」的语义一致（游客默认没有任何内容权限）
    app.get(
        '/api/overview/summary',
        authMiddleware,
        requirePermission('overview.viewAll'),
        overviewController.getOverviewSummary
    )
    // 近一周/近一月访问量趋势与设备/系统分布
    app.get(
        '/api/overview/visitStats',
        authMiddleware,
        requirePermission('overview.viewAll'),
        overviewController.getVisitStats
    )
}
