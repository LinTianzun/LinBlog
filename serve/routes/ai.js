const aiController = require('../controller/aiController')
const aiManageController = require('../controller/aiManageController')
const { authMiddleware } = require('../middleware/auth')
const { aiSuggestLimit, aiCoverLimit, aiAskLimit } = require('../middleware/rateLimit')
const { aiQuota } = require('../middleware/aiQuota')
const { requirePermission } = require('../utils/accessControl')

module.exports = (app) => {
    // AI 写作建议：服务端代理模型 API，密钥不出服务端；作者确认后才落表单
    app.post(
        '/api/ai/suggest',
        authMiddleware,
        aiQuota('suggest'),
        aiSuggestLimit,
        aiController.suggestArticleMeta
    )
    // AI 写作辅助：结果只作为候选文本展示，作者确认后才写入编辑器
    app.post(
        '/api/ai/writing',
        authMiddleware,
        aiQuota('writing'),
        aiSuggestLimit,
        aiController.rewriteArticleText
    )
    // AI 封面：生成结果暂存服务端，作者确认后才会写入图片表
    app.post(
        '/api/ai/cover',
        authMiddleware,
        aiQuota('cover'),
        aiCoverLimit,
        aiController.generateCover
    )
    // 确认采用只做落库，不再调用模型，因此不计入次数
    app.post('/api/ai/cover/confirm', authMiddleware, aiSuggestLimit, aiController.confirmCover)

    // 门户 AI 问答：访客可匿名提问，只走独立限流，不占用后台账号配额
    app.post('/api/public/ai/ask', aiAskLimit, aiController.answerPublicQuestion)

    // ─── AI 管理（需要 ai.manage 权限）─────────────────────────────
    app.get('/api/ai/models', authMiddleware, requirePermission('ai.manage'), aiManageController.getModels)
    app.post('/api/ai/models', authMiddleware, requirePermission('ai.manage'), aiManageController.createModel)
    app.put('/api/ai/models/:id', authMiddleware, requirePermission('ai.manage'), aiManageController.updateModel)
    app.delete('/api/ai/models/:id', authMiddleware, requirePermission('ai.manage'), aiManageController.deleteModel)
    app.post('/api/ai/models/:id/test', authMiddleware, requirePermission('ai.manage'), aiManageController.testModel)
    // 从环境变量导入：把 .env 里的密钥转成后台可管理的模型记录
    app.post('/api/ai/models/import-env', authMiddleware, requirePermission('ai.manage'), aiManageController.importFromEnv)
    app.get('/api/ai/settings', authMiddleware, requirePermission('ai.manage'), aiManageController.getSettings)
    app.put('/api/ai/settings', authMiddleware, requirePermission('ai.manage'), aiManageController.updateSettings)
    app.get('/api/ai/usage', authMiddleware, requirePermission('ai.manage'), aiManageController.getUsage)
    // 用量统计：总览、分组、趋势与待确认图片占用
    app.get('/api/ai/usage/stats', authMiddleware, requirePermission('ai.manage'), aiManageController.getUsageStats)
    // 当前登录用户自己的用量：拥有 ai.use 权限即可查看
    app.get('/api/ai/usage/me', authMiddleware, requirePermission('ai.use'), aiManageController.getMyUsage)
}
