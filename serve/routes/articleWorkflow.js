const controller = require('../controller/articleWorkflowController')
const { authMiddleware } = require('../middleware/auth')

module.exports = (app) => {
    // 固定路径必须放在 /api/article/:id 系列动态路由之前，否则 scheduled 会被当成 id。
    app.get('/api/article/scheduled', authMiddleware, controller.getScheduledQueue)
    app.get('/api/article/:id/workflow', authMiddleware, controller.getWorkflow)
    app.post('/api/article/:id/workflow/draft', authMiddleware, controller.saveDraft)
    app.get('/api/article/:id/versions', authMiddleware, controller.getVersions)
    app.get('/api/article/:id/versions/:versionId', authMiddleware, controller.getVersion)
    app.post('/api/article/:id/versions/:versionId/restore', authMiddleware, controller.restoreVersion)
    app.post('/api/article/:id/workflow/publish', authMiddleware, controller.publishWorkflow)
    app.post('/api/article/:id/workflow/schedule', authMiddleware, controller.scheduleWorkflow)
    app.delete('/api/article/:id/workflow/schedule', authMiddleware, controller.cancelSchedule)
}
