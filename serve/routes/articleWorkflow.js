const controller = require('../controller/articleWorkflowController')
const { authMiddleware } = require('../middleware/auth')

module.exports = (app) => {
    app.get('/api/article/:id/workflow', authMiddleware, controller.getWorkflow)
    app.post('/api/article/:id/workflow/draft', authMiddleware, controller.saveDraft)
    app.get('/api/article/:id/versions', authMiddleware, controller.getVersions)
    app.get('/api/article/:id/versions/:versionId', authMiddleware, controller.getVersion)
    app.post('/api/article/:id/versions/:versionId/restore', authMiddleware, controller.restoreVersion)
    app.post('/api/article/:id/workflow/publish', authMiddleware, controller.publishWorkflow)
    app.post('/api/article/:id/workflow/schedule', authMiddleware, controller.scheduleWorkflow)
    app.delete('/api/article/:id/workflow/schedule', authMiddleware, controller.cancelSchedule)
}
