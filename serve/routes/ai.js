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
    // AI 图库策展：候选标题、简介与标签只做建议，作者逐项确认后才写入
    app.post(
        '/api/ai/gallery/curation',
        authMiddleware,
        aiQuota('gallery'),
        aiSuggestLimit,
        aiController.suggestGalleryCuration
    )
    // AI 私信拟回复：只生成候选话术，作者确认后才会写进输入框
    app.post(
        '/api/ai/message/reply',
        authMiddleware,
        aiQuota('message'),
        aiSuggestLimit,
        aiController.suggestMessageReply
    )
    // AI 运营周报：先聚合一周统计，再由模型组织成文字报告
    app.post(
        '/api/ai/report/operations',
        authMiddleware,
        aiQuota('report'),
        aiSuggestLimit,
        aiController.generateOperationsReport
    )
    // AI 举报辅助判断：只给处置建议，处置状态仍由运营自己改
    app.post(
        '/api/ai/report/review',
        authMiddleware,
        aiQuota('report-review'),
        aiSuggestLimit,
        aiController.reviewReport
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
    // 门户语义搜索：AI 扩展关键词后加权检索，匿名可用，走独立限流
    app.post('/api/public/ai/search', aiAskLimit, aiController.searchPublicContent)

    // ─── AI 管理（需要 ai.manage 权限）─────────────────────────────
    app.get('/api/ai/models', authMiddleware, requirePermission('ai.manage'), aiManageController.getModels)
    app.post('/api/ai/models', authMiddleware, requirePermission('ai.manage'), aiManageController.createModel)
    app.put('/api/ai/models/:id', authMiddleware, requirePermission('ai.manage'), aiManageController.updateModel)
    app.delete('/api/ai/models/:id', authMiddleware, requirePermission('ai.manage'), aiManageController.deleteModel)
    app.post('/api/ai/models/:id/test', authMiddleware, requirePermission('ai.manage'), aiManageController.testModel)
    // 立即巡检全部启用模型：与后台定时巡检共用同一份逻辑
    app.post('/api/ai/health/check', authMiddleware, requirePermission('ai.manage'), aiManageController.checkAllModels)
    // 巡检状态：上次巡检时间与各模型最近一次探测结果
    app.get('/api/ai/health', authMiddleware, requirePermission('ai.manage'), aiManageController.getHealthStatus)
    // 从环境变量导入：把 .env 里的密钥转成后台可管理的模型记录
    app.post('/api/ai/models/import-env', authMiddleware, requirePermission('ai.manage'), aiManageController.importFromEnv)
    app.get('/api/ai/settings', authMiddleware, requirePermission('ai.manage'), aiManageController.getSettings)
    app.put('/api/ai/settings', authMiddleware, requirePermission('ai.manage'), aiManageController.updateSettings)
    app.get('/api/ai/usage', authMiddleware, requirePermission('ai.manage'), aiManageController.getUsage)
    // 用量统计：总览、分组、趋势与待确认图片占用
    app.get('/api/ai/usage/stats', authMiddleware, requirePermission('ai.manage'), aiManageController.getUsageStats)
    // 提示词模板：把写死在代码里的提示词搬到后台，方便按自己的风格调整
    app.get('/api/ai/prompts', authMiddleware, requirePermission('ai.manage'), aiManageController.getPromptTemplates)
    // 新建自定义提示词：挂在某个内置功能下，可在页面上随时切换选用
    app.post('/api/ai/prompts', authMiddleware, requirePermission('ai.manage'), aiManageController.createPromptTemplate)
    app.put('/api/ai/prompts/:key', authMiddleware, requirePermission('ai.manage'), aiManageController.updatePromptTemplate)
    // 选用模板：某个功能的调用改用指定模板，停用或删除后自动回退内置默认
    app.post('/api/ai/prompts/:key/select', authMiddleware, requirePermission('ai.manage'), aiManageController.selectPromptTemplate)
    app.delete('/api/ai/prompts/:key', authMiddleware, requirePermission('ai.manage'), aiManageController.deletePromptTemplate)
    app.post('/api/ai/prompts/:key/reset', authMiddleware, requirePermission('ai.manage'), aiManageController.resetPromptTemplate)
    // 当前登录用户自己的用量：拥有 ai.use 权限即可查看
    app.get('/api/ai/usage/me', authMiddleware, requirePermission('ai.use'), aiManageController.getMyUsage)
}
