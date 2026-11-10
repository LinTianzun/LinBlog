const assert = require('node:assert/strict')
const path = require('node:path')
const test = require('node:test')

process.env.LINBLOG_JWT_SECRET = 'x'.repeat(40)
process.env.LINBLOG_ALLOWED_ORIGINS = 'http://localhost:5173'

const accessControlConfig = require(path.resolve(__dirname, '../config/accessControl.js'))
const secretBox = require(path.resolve(__dirname, '../utils/secretBox.js'))
const aiModel = require(path.resolve(__dirname, '../model/dbModel/ai/index.js'))
const articleModel = require(path.resolve(__dirname, '../model/dbModel/article/index.js'))
const { aiQuota } = require(path.resolve(__dirname, '../middleware/aiQuota.js'))
const aiClient = require(path.resolve(__dirname, '../utils/aiClient.js'))
const aiController = require(path.resolve(__dirname, '../controller/aiController.js'))
const aiManageController = require(path.resolve(__dirname, '../controller/aiManageController.js'))
const uploadController = require(path.resolve(__dirname, '../controller/uploadController.js'))
const articleController = require(path.resolve(__dirname, '../controller/articleController.js'))
const aiUsageLogger = require(path.resolve(__dirname, '../utils/aiUsageLogger.js'))
const systemLogModel = require(path.resolve(__dirname, '../model/dbModel/systemLog/index.js'))
const aiHealthCheck = require(path.resolve(__dirname, '../utils/aiHealthCheck.js'))

function createRes() {
    return {
        statusCode: 0,
        body: null,
        status(code) {
            this.statusCode = code
            return this
        },
        json(payload) {
            this.body = payload
            return this
        }
    }
}

test('secret box encrypts, decrypts and masks AI keys', () => {
    const plain = 'sk-test-1234567890'
    const encrypted = secretBox.encryptSecret(plain)

    assert.match(encrypted, /^v1:[^:]+:[^:]+:[^:]+$/)
    assert.notEqual(encrypted, plain)
    assert.equal(secretBox.decryptSecret(encrypted), plain)
    assert.equal(secretBox.maskSecret(plain), '********7890')
    assert.equal(secretBox.maskSecret(''), '')
    assert.throws(() => secretBox.decryptSecret('bad-value'), /格式不正确|解密失败/)
})

test('access control exposes AI permissions with sane role defaults', () => {
    const aiPermissions = accessControlConfig.PERMISSIONS.filter(item => item.group === 'ai')
    assert.deepEqual(aiPermissions.map(item => item.key).sort(), ['ai.manage', 'ai.use'])
    assert.ok(accessControlConfig.PERMISSION_GROUPS.some(group => group.key === 'ai'))

    assert.ok(accessControlConfig.DEFAULT_ROLE_PERMISSIONS.admin.includes('ai.manage'))
    assert.ok(accessControlConfig.DEFAULT_ROLE_PERMISSIONS.admin.includes('ai.use'))
    assert.ok(accessControlConfig.DEFAULT_ROLE_PERMISSIONS.editor.includes('ai.use'))
    assert.ok(!accessControlConfig.DEFAULT_ROLE_PERMISSIONS.editor.includes('ai.manage'))
    assert.ok(accessControlConfig.DEFAULT_ROLE_PERMISSIONS.normal.includes('ai.use'))
    assert.ok(!accessControlConfig.DEFAULT_ROLE_PERMISSIONS.visitor.includes('ai.use'))
})

test('ai quota rejects accounts without the ai.use permission', async () => {
    const res = createRes()
    await aiQuota('suggest')(
        { user: { userId: 5, userType: 'visitor', permissions: [] } },
        res,
        () => {
            throw new Error('不应进入下一个中间件')
        }
    )

    assert.equal(res.statusCode, 403)
    assert.match(res.body.message, /没有使用 AI 能力的权限/)
})

test('配图与图片试跑按配图模型检查配额', async () => {
    const originalActive = aiClient.getActiveAiConfig
    const originalSettings = aiModel.getSettings
    const purposes = []

    aiClient.getActiveAiConfig = async ({ purpose = 'chat' } = {}) => {
        purposes.push(purpose)
        return {
            id: purpose === 'image' ? 3 : 2,
            name: purpose === 'image' ? '配图模型' : '文本模型',
            baseUrl: 'https://ai.example.test/v1',
            apiKey: 'key',
            model: purpose === 'image' ? 'image-model' : 'chat-model',
            imageModel: 'image-model',
            imageSize: '1344x768',
            timeoutMs: 20000
        }
    }
    aiModel.getSettings = async () => ({
        quotaEnabled: false,
        dailyLimitPerUser: 20,
        monthlyLimitPerUser: 100,
        superAdminUnlimited: true
    })

    try {
        const user = { userId: 5, userType: 'normal', permissions: ['ai.use'], isSuperAdmin: false }
        await aiQuota('cover')({ user, body: { title: '标题' } }, createRes(), () => {})
        await aiQuota('prompt-preview')({ user, body: { mode: 'image' } }, createRes(), () => {})
        await aiQuota('prompt-preview')({ user, body: { mode: 'text' } }, createRes(), () => {})
        assert.deepEqual(purposes, ['image', 'image', 'chat'])
    } finally {
        aiClient.getActiveAiConfig = originalActive
        aiModel.getSettings = originalSettings
    }
})

test('ai quota returns 429 when the daily limit is exhausted', async () => {
    const originalSettings = aiModel.getSettings
    const originalUsage = aiModel.getUserUsage
    const originalActive = aiModel.getActiveModelConfig
    const originalLog = aiModel.logUsage
    const originalInsert = systemLogModel.insertLog

    aiModel.getSettings = async () => ({
        quotaEnabled: true,
        dailyLimitPerUser: 3,
        monthlyLimitPerUser: 100,
        superAdminUnlimited: true
    })
    aiModel.getUserUsage = async () => ({ daily: 3, monthly: 12 })
    aiModel.getActiveModelConfig = async () => ({
        id: 1,
        name: '智谱',
        baseUrl: 'https://ai.example.test/v4',
        apiKey: 'key',
        chatModel: 'glm-4-flash',
        imageModel: 'cogview-3-flash',
        imageSize: '1344x768',
        timeoutMs: 20000
    })
    aiModel.logUsage = async () => ({})
    systemLogModel.insertLog = async () => ({ insertId: 1 })

    try {
        const res = createRes()
        await aiQuota('suggest')(
            {
                user: {
                    userId: 5,
                    userType: 'normal',
                    permissions: ['ai.use'],
                    isSuperAdmin: false
                },
                ip: '127.0.0.1'
            },
            res,
            () => {
                throw new Error('不应进入下一个中间件')
            }
        )

        assert.equal(res.statusCode, 429)
        assert.match(res.body.message, /每日上限（3 次）/)
    } finally {
        aiModel.getSettings = originalSettings
        aiModel.getUserUsage = originalUsage
        aiModel.getActiveModelConfig = originalActive
        aiModel.logUsage = originalLog
        systemLogModel.insertLog = originalInsert
    }
})

test('模型级限额命中时返回 429 并说明是哪个模型', async () => {
    const originalSettings = aiModel.getSettings
    const originalUsage = aiModel.getUserUsage
    const originalActive = aiModel.getActiveModelConfig
    const originalCountByModel = aiModel.countUsageByModel
    const originalLog = aiModel.logUsage
    const originalInsert = systemLogModel.insertLog
    const originalActiveConfig = aiClient.getActiveAiConfig

    aiModel.getSettings = async () => ({
        quotaEnabled: true,
        dailyLimitPerUser: 100,
        monthlyLimitPerUser: 500,
        superAdminUnlimited: true
    })
    // 全局额度还很充足，只有该模型用超了
    aiModel.getUserUsage = async () => ({ daily: 1, monthly: 2 })
    aiModel.getActiveModelConfig = async () => ({
        id: 7,
        name: '智谱',
        baseUrl: 'https://ai.example.test/v4',
        apiKey: 'key',
        chatModel: 'glm-4-flash',
        imageModel: 'cogview-3-flash',
        imageSize: '1344x768',
        timeoutMs: 20000,
        dailyLimitPerUser: 3,
        monthlyLimitPerUser: 0
    })
    aiModel.countUsageByModel = async () => 3
    aiModel.logUsage = async () => ({})
    systemLogModel.insertLog = async () => ({ insertId: 1 })
    aiClient.getActiveAiConfig = async () => ({
        id: 7,
        name: '智谱',
        baseUrl: 'https://ai.example.test/v4',
        apiKey: 'key',
        model: 'glm-4-flash',
        imageModel: 'cogview-3-flash',
        imageSize: '1344x768',
        timeoutMs: 20000,
        dailyLimitPerUser: 3,
        monthlyLimitPerUser: 0
    })

    try {
        const res = createRes()
        await aiQuota('suggest')(
            {
                user: {
                    userId: 5,
                    userType: 'normal',
                    permissions: ['ai.use'],
                    isSuperAdmin: false
                },
                ip: '127.0.0.1'
            },
            res,
            () => {
                throw new Error('不应进入下一个中间件')
            }
        )

        assert.equal(res.statusCode, 429)
        assert.match(res.body.message, /对该模型的调用次数已达每日上限（3 次）/)
    } finally {
        aiModel.getSettings = originalSettings
        aiModel.getUserUsage = originalUsage
        aiModel.getActiveModelConfig = originalActive
        aiModel.countUsageByModel = originalCountByModel
        aiModel.logUsage = originalLog
        systemLogModel.insertLog = originalInsert
        aiClient.getActiveAiConfig = originalActiveConfig
    }
})

test('模型未配置限额时不影响全局配额判定', async () => {
    const originalSettings = aiModel.getSettings
    const originalUsage = aiModel.getUserUsage
    const originalActive = aiModel.getActiveModelConfig
    const originalCountByModel = aiModel.countUsageByModel
    let counted = false

    aiModel.getSettings = async () => ({
        quotaEnabled: true,
        dailyLimitPerUser: 100,
        monthlyLimitPerUser: 500,
        superAdminUnlimited: true
    })
    aiModel.getUserUsage = async () => ({ daily: 1, monthly: 2 })
    aiModel.getActiveModelConfig = async () => ({
        id: 7,
        name: '智谱',
        baseUrl: 'https://ai.example.test/v4',
        apiKey: 'key',
        chatModel: 'glm-4-flash',
        imageModel: 'cogview-3-flash',
        imageSize: '1344x768',
        timeoutMs: 20000,
        dailyLimitPerUser: 0,
        monthlyLimitPerUser: 0
    })
    aiModel.countUsageByModel = async () => {
        counted = true
        return 0
    }

    try {
        let passed = false
        await aiQuota('suggest')(
            {
                user: {
                    userId: 5,
                    userType: 'normal',
                    permissions: ['ai.use'],
                    isSuperAdmin: false
                },
                ip: '127.0.0.1'
            },
            createRes(),
            () => {
                passed = true
            }
        )

        assert.equal(passed, true)
        assert.equal(counted, false)
    } finally {
        aiModel.getSettings = originalSettings
        aiModel.getUserUsage = originalUsage
        aiModel.getActiveModelConfig = originalActive
        aiModel.countUsageByModel = originalCountByModel
    }
})

test('ai quota lets the super admin through regardless of usage', async () => {
    const originalSettings = aiModel.getSettings
    const originalUsage = aiModel.getUserUsage
    const originalActive = aiModel.getActiveModelConfig

    aiModel.getSettings = async () => ({
        quotaEnabled: true,
        dailyLimitPerUser: 1,
        monthlyLimitPerUser: 1,
        superAdminUnlimited: true
    })
    aiModel.getUserUsage = async () => ({ daily: 99, monthly: 99 })
    aiModel.getActiveModelConfig = async () => ({
        id: 1,
        name: '智谱',
        baseUrl: 'https://ai.example.test/v4',
        apiKey: 'key',
        chatModel: 'glm-4-flash',
        imageModel: 'cogview-3-flash',
        imageSize: '1344x768',
        timeoutMs: 20000
    })

    try {
        let passed = false
        await aiQuota('suggest')(
            {
                user: {
                    userId: 1,
                    userType: 'admin',
                    permissions: ['ai.use'],
                    isSuperAdmin: true
                }
            },
            createRes(),
            () => {
                passed = true
            }
        )
        assert.equal(passed, true)
    } finally {
        aiModel.getSettings = originalSettings
        aiModel.getUserUsage = originalUsage
        aiModel.getActiveModelConfig = originalActive
    }
})

test('ai usage logger writes both the usage log and the system log', async () => {
    const originalLog = aiModel.logUsage
    const originalInsert = systemLogModel.insertLog
    const usageCalls = []
    const logCalls = []

    aiModel.logUsage = async (payload) => {
        usageCalls.push(payload)
    }
    systemLogModel.insertLog = async (payload) => {
        logCalls.push(payload)
    }

    try {
        await aiUsageLogger.recordAiCall({
            req: { user: { userId: 9 }, ip: '10.0.0.1' },
            feature: 'suggest',
            modelName: 'glm-4-flash',
            status: 'success',
            detail: '生成简介建议'
        })

        assert.equal(usageCalls.length, 1)
        assert.equal(usageCalls[0].userId, 9)
        assert.equal(usageCalls[0].feature, 'suggest')
        assert.equal(logCalls.length, 1)
        assert.equal(logCalls[0].action, 'ai')
        assert.equal(logCalls[0].module, 'ai')
        // target_id 是整型外键，功能名只能写进详情，不能塞进 target_id
        assert.equal(logCalls[0].targetId, null)
        assert.match(logCalls[0].detail, /生成简介建议/)
    } finally {
        aiModel.logUsage = originalLog
        systemLogModel.insertLog = originalInsert
    }
})

test('匿名 AI 调用也能写入用量记录与系统日志', async () => {
    const originalLog = aiModel.logUsage
    const originalInsert = systemLogModel.insertLog
    const usageCalls = []
    const logCalls = []

    aiModel.logUsage = async (payload) => {
        usageCalls.push(payload)
    }
    systemLogModel.insertLog = async (payload) => {
        logCalls.push(payload)
    }

    try {
        // 门户问答与语义搜索对匿名访客开放，请求里没有登录用户
        await aiUsageLogger.recordAiCall({
            req: { ip: '10.0.0.9' },
            feature: 'ask',
            modelName: 'glm-4-flash',
            status: 'success',
            detail: '门户 AI 问答'
        })

        // user_id 有 NOT NULL 约束，匿名调用用 0 占位
        assert.equal(usageCalls.length, 1)
        assert.equal(usageCalls[0].userId, 0)
        assert.equal(usageCalls[0].feature, 'ask')

        assert.equal(logCalls.length, 1)
        assert.equal(logCalls[0].userId, null)
        assert.equal(logCalls[0].targetId, null)
        assert.match(logCalls[0].detail, /门户 AI 问答/)
    } finally {
        aiModel.logUsage = originalLog
        systemLogModel.insertLog = originalInsert
    }
})

test('ai usage logger records duration, tokens and output size', async () => {
    const originalLog = aiModel.logUsage
    const originalInsert = systemLogModel.insertLog
    const usageCalls = []

    aiModel.logUsage = async (payload) => {
        usageCalls.push(payload)
    }
    systemLogModel.insertLog = async () => {}

    try {
        await aiUsageLogger.recordAiCall({
            req: { user: { userId: 9 }, ip: '10.0.0.1' },
            feature: 'writing',
            modelName: 'glm-4-flash',
            status: 'success',
            detail: 'AI 写作辅助：polish',
            durationMs: 1234,
            usage: { promptTokens: 120, completionTokens: 88 },
            outputChars: 260
        })

        assert.equal(usageCalls.length, 1)
        assert.equal(usageCalls[0].durationMs, 1234)
        assert.equal(usageCalls[0].promptTokens, 120)
        assert.equal(usageCalls[0].completionTokens, 88)
        assert.equal(usageCalls[0].outputChars, 260)
    } finally {
        aiModel.logUsage = originalLog
        systemLogModel.insertLog = originalInsert
    }
})

test('用量统计接口返回总览、分组与趋势', async () => {
    const originalSummary = aiModel.getUsageSummary
    const originalByModel = aiModel.getUsageByModel
    const originalByFeature = aiModel.getUsageByFeature
    const originalTrend = aiModel.getUsageTrend
    const originalPending = aiModel.getPendingImageStats
    const originalHealthList = aiModel.listModelHealth

    aiModel.getUsageSummary = async () => ({
        all: { total: 10, success: 9, successRate: 90, avgDurationMs: 1200, totalTokens: 300 },
        last7Days: { total: 4, success: 4, successRate: 100, avgDurationMs: 900, totalTokens: 80 },
        last30Days: { total: 8, success: 8, successRate: 100, avgDurationMs: 1000, totalTokens: 200 }
    })
    aiModel.getUsageByModel = async () => [
        { modelName: 'glm-4-flash', total: 6, successRate: 100, avgDurationMs: 1100 }
    ]
    aiModel.getUsageByFeature = async () => [
        { feature: 'suggest', total: 5, successRate: 100, avgDurationMs: 800 }
    ]
    aiModel.getUsageTrend = async () => [
        { day: '2026-11-09', total: 3, success: 3, tokens: 60 }
    ]
    aiModel.getPendingImageStats = async () => ({ total: 2, bytes: 4096, expired: 0 })
    aiModel.listModelHealth = async () => [
        { modelId: 1, modelName: '智谱 GLM', enabled: true, avgLatencyMs: 1200, successRate: 100, consecutiveFailures: 0 }
    ]

    try {
        const res = {
            statusCode: 0,
            body: null,
            status(code) { this.statusCode = code; return this },
            json(payload) { this.body = payload; return this }
        }
        await aiManageController.getUsageStats({ query: { days: 30 } }, res)

        assert.equal(res.statusCode, 0)
        assert.equal(res.body.code, 200)
        assert.equal(res.body.data.summary.all.total, 10)
        assert.equal(res.body.data.summary.all.successRate, 90)
        assert.equal(res.body.data.byModel[0].modelName, 'glm-4-flash')
        assert.equal(res.body.data.byFeature[0].feature, 'suggest')
        assert.equal(res.body.data.trend[0].day, '2026-11-09')
        assert.equal(res.body.data.pending.total, 2)
        assert.equal(res.body.data.health[0].modelName, '智谱 GLM')
        assert.equal(res.body.data.days, 30)
    } finally {
        aiModel.getUsageSummary = originalSummary
        aiModel.getUsageByModel = originalByModel
        aiModel.getUsageByFeature = originalByFeature
        aiModel.getUsageTrend = originalTrend
        aiModel.getPendingImageStats = originalPending
        aiModel.listModelHealth = originalHealthList
    }
})
test('连通性测试会记录耗时并更新模型健康状态', async () => {
    const originalConfig = aiModel.getModelConfigById
    const originalHealth = aiModel.recordModelHealth
    const healthCalls = []
    const originalFetch = global.fetch

    aiModel.getModelConfigById = async () => ({
        id: 3,
        name: '智谱 GLM',
        baseUrl: 'https://ai.example.test/v4',
        apiKey: 'key',
        model: 'glm-4-flash',
        timeoutMs: 5000
    })
    aiModel.recordModelHealth = async (modelId, payload) => {
        healthCalls.push({ modelId, ...payload })
        return { testCount: 1, successCount: payload.ok ? 1 : 0, successRate: payload.ok ? 100 : 0 }
    }
    global.fetch = async () => new Response(JSON.stringify({
        choices: [{ message: { content: 'pong' } }]
    }), { status: 200 })

    try {
        const res = {
            statusCode: 0,
            body: null,
            status(code) { this.statusCode = code; return this },
            json(payload) { this.body = payload; return this }
        }
        await aiManageController.testModel({ params: { id: '3' } }, res)

        assert.equal(res.statusCode, 0)
        assert.equal(res.body.data.ok, true)
        assert.ok(typeof res.body.data.latencyMs === 'number')
        assert.match(res.body.message, /耗时/)
        assert.equal(healthCalls.length, 1)
        assert.equal(healthCalls[0].modelId, 3)
        assert.equal(healthCalls[0].ok, true)
    } finally {
        aiModel.getModelConfigById = originalConfig
        aiModel.recordModelHealth = originalHealth
        global.fetch = originalFetch
    }
})

test('健康快照回传 ISO 时间，前端可按本地时区显示', async () => {
    const queryFn = async (sql) => {
        if (sql.includes('SELECT test_count')) {
            return [{ test_count: 2, success_count: 2, avg_latency_ms: 1000, consecutive_failures: 0, last_success_at: new Date('2026-11-09T01:40:00.000Z') }]
        }
        return { affectedRows: 1 }
    }

    const snapshot = await aiModel.recordModelHealth(1, { ok: true, latencyMs: 1200 }, queryFn)
    assert.match(snapshot.lastTestAt, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/)
    assert.match(snapshot.lastSuccessAt, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/)
    assert.equal(snapshot.testCount, 3)
    assert.equal(snapshot.successCount, 3)
})

test('降级候选查询限定表名，避免 updated_at 歧义', async () => {
    const captured = []
    const queryFn = async (sql) => {
        captured.push(sql)
        return []
    }

    await aiModel.listFallbackModelConfigs(3, queryFn)

    assert.equal(captured.length, 1)
    const sql = captured[0]
    // ai_model 与 ai_model_health 都有 updated_at，不限定表名会报歧义
    assert.ok(sql.includes('m.updated_at'), '降级候选查询必须用 m. 限定 updated_at')
    const unqualified = sql.replace(/m\.updated_at/g, '').match(/(^|[\s,(])updated_at/)
    assert.equal(unqualified, null, '降级候选查询不能出现未限定表名的 updated_at')
})

test('首选模型可重试故障时自动降级到候选模型', async () => {
    const originalFetch = global.fetch
    const attempted = []

    global.fetch = async (url, options) => {
        const body = JSON.parse(options.body)
        attempted.push(body.model)
        if (body.model === 'primary-model') {
            return new Response('{}', { status: 503 })
        }
        return new Response(JSON.stringify({
            choices: [{ message: { content: '备用模型的结果' } }],
            usage: { prompt_tokens: 10, completion_tokens: 5 }
        }), { status: 200 })
    }

    try {
        const result = await aiClient.runWithFallback(
            [
                { id: 1, name: '首选模型', model: 'primary-model', baseUrl: 'https://a.test/v1', apiKey: 'k' },
                { id: 2, name: '备用模型', model: 'backup-model', baseUrl: 'https://b.test/v1', apiKey: 'k' }
            ],
            async (aiConfig) => {
                const response = await fetch(`${aiConfig.baseUrl}/chat/completions`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ model: aiConfig.model, messages: [] })
                })
                if (!response.ok) {
                    throw Object.assign(new Error(`AI 服务商响应异常：HTTP ${response.status}`), {
                        code: 'AI_PROVIDER_ERROR',
                        status: response.status
                    })
                }
                const payload = await response.json()
                return { text: payload.choices[0].message.content }
            }
        )

        assert.deepEqual(attempted, ['primary-model', 'backup-model'])
        assert.equal(result.text, '备用模型的结果')
        assert.equal(result.modelUsed.id, 2)
        assert.equal(result.modelUsed.degraded, true)
    } finally {
        global.fetch = originalFetch
    }
})

test('参数或鉴权类错误不触发降级，直接抛出真实原因', () => {
    assert.equal(aiClient.isRetryableModelError({ code: 'AI_PROVIDER_ERROR', status: 400 }), false)
    assert.equal(aiClient.isRetryableModelError({ code: 'AI_PROVIDER_ERROR', status: 401 }), false)
    assert.equal(aiClient.isRetryableModelError({ code: 'AI_PROVIDER_ERROR', status: 429 }), true)
    assert.equal(aiClient.isRetryableModelError({ code: 'AI_PROVIDER_ERROR', status: 500 }), true)
    assert.equal(aiClient.isRetryableModelError({ code: 'AI_PARSE_ERROR' }), false)
})

test('所有候选模型都失败时抛出最后一次错误', async () => {
    await assert.rejects(
        () => aiClient.runWithFallback(
            [
                { id: 1, name: '首选模型', model: 'm1', baseUrl: 'https://a.test/v1', apiKey: 'k' },
                { id: 2, name: '备用模型', model: 'm2', baseUrl: 'https://b.test/v1', apiKey: 'k' }
            ],
            async () => {
                throw Object.assign(new Error('AI 服务商响应异常：HTTP 503'), {
                    code: 'AI_PROVIDER_ERROR',
                    status: 503
                })
            }
        ),
        /HTTP 503/
    )
})

test('门户问答只依据站内已发布内容作答，并给出引用来源', async () => {
    const originalSearch = articleModel.searchPublishedContentForAsk
    const originalFetch = global.fetch
    let prompt = null

    articleModel.searchPublishedContentForAsk = async () => ([
        { id: 12, title: '把日常写成一条慢速河流', introduce: '简介', content: '<p>关于慢速河流的记录</p>', classify: 'article' },
        { id: 13, title: '摄影笔记', introduce: '简介', content: '<p>另一篇文章</p>', classify: 'article' }
    ])
    global.fetch = async (url, init) => {
        prompt = JSON.parse(init.body).messages[1].content
        return new Response(JSON.stringify({
            choices: [{ message: { content: '你在《把日常写成一条慢速河流》里写过这件事 [1]。' } }]
        }), { status: 200 })
    }

    try {
        const res = createRes()
        await aiController.answerPublicQuestion(
            { body: { question: '慢速河流' }, ip: '127.0.0.1' },
            res,
            { aiConfig: { id: 1, name: '智谱 GLM', model: 'glm-4-flash', baseUrl: 'https://a.test/v1', apiKey: 'k', timeoutMs: 5000 } }
        )

        assert.equal(res.body.code, 200)
        assert.match(res.body.data.answer, /慢速河流/)
        // 提示词必须带上检索到的片段
        assert.match(prompt, /把日常写成一条慢速河流/)
        assert.match(prompt, /访客问题：慢速河流/)
        // 只把答案里引用到的片段作为来源返回
        assert.equal(res.body.data.sources.length, 1)
        assert.equal(res.body.data.sources[0].id, 12)
    } finally {
        articleModel.searchPublishedContentForAsk = originalSearch
        global.fetch = originalFetch
    }
})

test('门户问答检索不到内容时直接给出提示，不调用模型', async () => {
    const originalSearch = articleModel.searchPublishedContentForAsk
    const originalFetch = global.fetch
    let called = false

    articleModel.searchPublishedContentForAsk = async () => []
    global.fetch = async () => {
        called = true
        return new Response('{}', { status: 200 })
    }

    try {
        const res = createRes()
        await aiController.answerPublicQuestion(
            { body: { question: '不存在的内容' }, ip: '127.0.0.1' },
            res,
            { aiConfig: { id: 1, name: '智谱 GLM', model: 'glm-4-flash', baseUrl: 'https://a.test/v1', apiKey: 'k', timeoutMs: 5000 } }
        )

        assert.equal(res.body.code, 200)
        assert.equal(res.body.data.found, false)
        assert.equal(called, false)
    } finally {
        articleModel.searchPublishedContentForAsk = originalSearch
        global.fetch = originalFetch
    }
})

test('门户问答拒绝空问题与超长问题', async () => {
    const res1 = createRes()
    await aiController.answerPublicQuestion({ body: { question: '  ' } }, res1)
    assert.equal(res1.statusCode, 400)

    const res2 = createRes()
    await aiController.answerPublicQuestion({ body: { question: '问'.repeat(201) } }, res2)
    assert.equal(res2.statusCode, 400)
})

test('写作建议在首选模型故障时自动切换到备用模型', async () => {
    const originalFetch = global.fetch
    const attempted = []

    global.fetch = async (url, options) => {
        const body = JSON.parse(options.body)
        attempted.push(body.model)
        if (body.model === 'primary-model') {
            return new Response('{}', { status: 500 })
        }
        return new Response(JSON.stringify({
            choices: [{ message: { content: '{"summary":"备用模型的简介","labels":["备用"]}' } }]
        }), { status: 200 })
    }
    try {
        const result = await aiClient.suggestArticleMeta({
            title: '标题',
            content: '<p>正文</p>',
            aiConfig: { id: 1, name: '首选模型', model: 'primary-model', baseUrl: 'https://a.test/v1', apiKey: 'k' },
            chainFn: async () => ([
                { id: 2, name: '备用模型', model: 'backup-model', baseUrl: 'https://b.test/v1', apiKey: 'k', timeoutMs: 5000 }
            ])
        })

        assert.deepEqual(attempted, ['primary-model', 'backup-model'])
        assert.equal(result.summary, '备用模型的简介')
        assert.equal(result.modelUsed.degraded, true)
        assert.equal(result.modelUsed.name, '备用模型')
    } finally {
        global.fetch = originalFetch
    }
})

test('图库策展建议在首选模型故障时自动切换到备用模型', async () => {
    const originalFetch = global.fetch
    const attempted = []

    global.fetch = async (url, options) => {
        const body = JSON.parse(options.body)
        attempted.push(body.model)
        if (body.model === 'primary-model') {
            return new Response('{}', { status: 500 })
        }
        return new Response(JSON.stringify({
            choices: [{
                message: {
                    content: '{"titles":["备用标题"],"summary":"备用简介","labels":["备用"]}'
                }
            }]
        }), { status: 200 })
    }
    try {
        const result = await aiClient.suggestGalleryCuration({
            title: '图库',
            introduce: '简介',
            theme: '黄昏',
            photoCount: 5,
            aiConfig: { id: 1, name: '首选模型', model: 'primary-model', baseUrl: 'https://a.test/v1', apiKey: 'k' },
            chainFn: async () => ([
                { id: 2, name: '备用模型', model: 'backup-model', baseUrl: 'https://b.test/v1', apiKey: 'k', timeoutMs: 5000 }
            ])
        })

        assert.deepEqual(attempted, ['primary-model', 'backup-model'])
        assert.deepEqual(result.titles, ['备用标题'])
        assert.equal(result.summary, '备用简介')
        assert.equal(result.modelUsed.degraded, true)
    } finally {
        global.fetch = originalFetch
    }
})

test('语义搜索扩展在首选模型故障时自动切换到备用模型', async () => {
    const originalFetch = global.fetch
    const attempted = []

    global.fetch = async (url, options) => {
        const body = JSON.parse(options.body)
        attempted.push(body.model)
        if (body.model === 'primary-model') {
            return new Response('{}', { status: 500 })
        }
        return new Response(JSON.stringify({
            choices: [{ message: { content: '{"terms":["备用词"]}' } }]
        }), { status: 200 })
    }
    try {
        const result = await aiClient.expandSearchQuery({
            query: '看海',
            aiConfig: { id: 1, name: '首选模型', model: 'primary-model', baseUrl: 'https://a.test/v1', apiKey: 'k' },
            chainFn: async () => ([
                { id: 2, name: '备用模型', model: 'backup-model', baseUrl: 'https://b.test/v1', apiKey: 'k', timeoutMs: 5000 }
            ])
        })

        assert.deepEqual(attempted, ['primary-model', 'backup-model'])
        assert.deepEqual(result.terms, ['备用词'])
        assert.equal(result.modelUsed.degraded, true)
    } finally {
        global.fetch = originalFetch
    }
})

test('语义搜索扩展解析失败时抛出可识别错误', async () => {
    const originalFetch = global.fetch
    global.fetch = async () => new Response(JSON.stringify({
        choices: [{ message: { content: 'not-json' } }]
    }), { status: 200 })
    try {
        await assert.rejects(
            () => aiClient.expandSearchQuery({
                query: '看海',
                aiConfig: { id: 1, name: '模型', model: 'm', baseUrl: 'https://a.test/v1', apiKey: 'k' },
                chainFn: async () => []
            }),
            (err) => err.code === 'AI_PARSE_ERROR'
        )
    } finally {
        global.fetch = originalFetch
    }
})

test('私信拟回复在首选模型故障时自动切换到备用模型', async () => {
    const originalFetch = global.fetch
    const attempted = []

    global.fetch = async (url, options) => {
        const body = JSON.parse(options.body)
        attempted.push(body.model)
        if (body.model === 'primary-model') {
            return new Response('{}', { status: 500 })
        }
        return new Response(JSON.stringify({
            choices: [{ message: { content: '{"replies":["备用模型的回复"]}' } }]
        }), { status: 200 })
    }
    try {
        const result = await aiClient.suggestMessageReplies({
            peerName: '读者乙',
            history: [{ senderId: 2, senderName: '读者乙', content: '想聊聊摄影' }],
            aiConfig: { id: 1, name: '首选模型', model: 'primary-model', baseUrl: 'https://a.test/v1', apiKey: 'k' },
            chainFn: async () => ([
                { id: 2, name: '备用模型', model: 'backup-model', baseUrl: 'https://b.test/v1', apiKey: 'k', timeoutMs: 5000 }
            ])
        })

        assert.deepEqual(attempted, ['primary-model', 'backup-model'])
        assert.deepEqual(result.replies, ['备用模型的回复'])
        assert.equal(result.modelUsed.degraded, true)
    } finally {
        global.fetch = originalFetch
    }
})

test('运营周报按「标题：正文」切分小节', () => {
    const parsed = aiClient.parseOperationsReportPayload(
        '本周概况：访问 120 次，发布 2 篇文章。\n内容表现：图库有 1 组新增。\n下周建议：多更新一篇技术长文。'
    )
    assert.equal(parsed.sections.length, 3)
    assert.equal(parsed.sections[0].title, '本周概况')
    assert.equal(parsed.sections[0].content, '访问 120 次，发布 2 篇文章。')
    assert.equal(parsed.sections[2].title, '下周建议')
})

test('运营周报在首选模型故障时自动切换到备用模型', async () => {
    const originalFetch = global.fetch
    const attempted = []

    global.fetch = async (url, options) => {
        const body = JSON.parse(options.body)
        attempted.push(body.model)
        if (body.model === 'primary-model') {
            return new Response('{}', { status: 500 })
        }
        return new Response(JSON.stringify({
            choices: [{ message: { content: '本周概况：备用模型写的周报。' } }]
        }), { status: 200 })
    }
    try {
        const result = await aiClient.generateOperationsReport({
            summary: {
                days: 7,
                visits: 10,
                visitors: 5,
                mobileVisits: 3,
                comments: 1,
                messages: 1,
                publishedArticles: 1,
                publishedGalleries: 0,
                topPaths: []
            },
            aiUsage: { total: 1, successRate: 100, avgDurationMs: 100 },
            aiConfig: { id: 1, name: '首选模型', model: 'primary-model', baseUrl: 'https://a.test/v1', apiKey: 'k' },
            chainFn: async () => ([
                { id: 2, name: '备用模型', model: 'backup-model', baseUrl: 'https://b.test/v1', apiKey: 'k', timeoutMs: 5000 }
            ])
        })

        assert.deepEqual(attempted, ['primary-model', 'backup-model'])
        assert.equal(result.sections[0].content, '备用模型写的周报。')
        assert.equal(result.modelUsed.degraded, true)
    } finally {
        global.fetch = originalFetch
    }
})

test('举报辅助判断把非法取值收敛到安全默认', () => {
    const parsed = aiClient.parseReportReviewPayload(JSON.stringify({
        verdict: '随便写的',
        reason: 'not-a-reason',
        action: 'delete-everything',
        note: '  这是一条备注  ',
    }))
    assert.equal(parsed.verdict, '不成立')
    assert.equal(parsed.reason, 'other')
    assert.equal(parsed.action, 'dismiss')
    assert.equal(parsed.note, '这是一条备注')
})

test('举报辅助判断在首选模型故障时自动切换到备用模型', async () => {
    const originalFetch = global.fetch
    const attempted = []

    global.fetch = async (url, options) => {
        const body = JSON.parse(options.body)
        attempted.push(body.model)
        if (body.model === 'primary-model') {
            return new Response('{}', { status: 500 })
        }
        return new Response(JSON.stringify({
            choices: [{
                message: {
                    content: '{"verdict":"成立","reason":"abuse","action":"process","note":"人身攻击"}'
                }
            }]
        }), { status: 200 })
    }
    try {
        const result = await aiClient.reviewReportedComment({
            report: {
                id: 1,
                reason: 'abuse',
                detail: '',
                commentContent: '你太蠢了',
                commentUserName: '某用户',
                commentComplaint: 2,
                sourceTitle: '一篇文章',
                sourceType: 'article'
            },
            reasonLabel: '辱骂或攻击',
            aiConfig: { id: 1, name: '首选模型', model: 'primary-model', baseUrl: 'https://a.test/v1', apiKey: 'k' },
            chainFn: async () => ([
                { id: 2, name: '备用模型', model: 'backup-model', baseUrl: 'https://b.test/v1', apiKey: 'k', timeoutMs: 5000 }
            ])
        })

        assert.deepEqual(attempted, ['primary-model', 'backup-model'])
        assert.equal(result.verdict, '成立')
        assert.equal(result.action, 'process')
        assert.equal(result.modelUsed.degraded, true)
    } finally {
        global.fetch = originalFetch
    }
})

test('连通性测试失败时记录连续失败与错误原因', async () => {
    const originalConfig = aiModel.getModelConfigById
    const originalHealth = aiModel.recordModelHealth
    const healthCalls = []
    const originalFetch = global.fetch

    aiModel.getModelConfigById = async () => ({
        id: 4,
        name: '故障模型',
        baseUrl: 'https://ai.example.test/v4',
        apiKey: 'key',
        model: 'glm-4-flash',
        timeoutMs: 5000
    })
    aiModel.recordModelHealth = async (modelId, payload) => {
        healthCalls.push({ modelId, ...payload })
        return { consecutiveFailures: 1 }
    }
    global.fetch = async () => new Response(null, { status: 502 })

    try {
        const res = {
            statusCode: 0,
            body: null,
            status(code) { this.statusCode = code; return this },
            json(payload) { this.body = payload; return this }
        }
        await aiManageController.testModel({ params: { id: '4' } }, res)

        // 连通性测试失败也走 HTTP 200，用 data.ok 表达结论
        assert.equal(res.statusCode, 200)
        assert.equal(res.body.data.ok, false)
        assert.equal(res.body.data.status, 502)
        assert.equal(healthCalls.length, 1)
        assert.equal(healthCalls[0].ok, false)
        assert.match(healthCalls[0].error, /HTTP 502/)
    } finally {
        aiModel.getModelConfigById = originalConfig
        aiModel.recordModelHealth = originalHealth
        global.fetch = originalFetch
    }
})

test('ai manage controller validates model payloads and settings', async () => {
    const originalCreate = aiModel.createModel
    const originalUpdateSettings = aiModel.updateSettings
    const originalGetSettings = aiModel.getSettings
    let createdPayload = null

    aiModel.createModel = async (payload) => {
        createdPayload = payload
        return { id: 1, ...payload }
    }
    aiModel.updateSettings = async (payload) => payload
    aiModel.getSettings = async () => ({
        quotaEnabled: true,
        dailyLimitPerUser: 20,
        monthlyLimitPerUser: 100,
        superAdminUnlimited: true
    })

    try {
        const missingName = createRes()
        await aiManageController.createModel({ body: { baseUrl: 'https://x.test', chatModel: 'm' } }, missingName)
        assert.equal(missingName.statusCode, 400)

        const missingKey = createRes()
        await aiManageController.createModel(
            { body: { name: '智谱', baseUrl: 'https://x.test', chatModel: 'm' } },
            missingKey
        )
        assert.equal(missingKey.statusCode, 400)
        assert.match(missingKey.body.message, /接口密钥/)

        const created = createRes()
        await aiManageController.createModel(
            { body: { name: '智谱', baseUrl: 'https://x.test', chatModel: 'glm-4-flash', apiKey: 'sk-1' } },
            created
        )
        assert.equal(created.statusCode, 201)
        assert.equal(createdPayload.apiKey, 'sk-1')
        assert.equal(createdPayload.enabled, true)

        const saved = createRes()
        await aiManageController.updateSettings(
            { body: { quotaEnabled: true, dailyLimitPerUser: 5, monthlyLimitPerUser: 50, superAdminUnlimited: false } },
            saved
        )
        assert.equal(saved.body.code, 200)
        assert.equal(saved.body.data.dailyLimitPerUser, 5)
        assert.equal(saved.body.data.superAdminUnlimited, false)

        const tooLarge = createRes()
        await aiManageController.updateSettings(
            { body: { quotaEnabled: true, dailyLimitPerUser: 5000, monthlyLimitPerUser: 50, superAdminUnlimited: true } },
            tooLarge
        )
        assert.equal(tooLarge.statusCode, 400)
    } finally {
        aiModel.createModel = originalCreate
        aiModel.updateSettings = originalUpdateSettings
        aiModel.getSettings = originalGetSettings
    }
})

test('文本与配图任务可以分别路由到不同模型', async () => {
    const originalDefault = aiModel.getActiveModelConfig
    const originalSettings = aiModel.getSettings
    const originalById = aiModel.getModelConfigById

    aiModel.getActiveModelConfig = async () => ({
        id: 1,
        name: '默认模型',
        baseUrl: 'https://default.test/v1',
        apiKey: 'default-key',
        chatModel: 'default-chat',
        imageModel: 'default-image',
        imageSize: '1344x768',
        timeoutMs: 20000
    })
    aiModel.getSettings = async () => ({ chatModelId: 2, imageModelId: 3 })
    aiModel.getModelConfigById = async (id) => {
        if (id === 2) {
            return {
                id: 2,
                name: '文本专用',
                baseUrl: 'https://chat.test/v1',
                apiKey: 'chat-key',
                chatModel: 'chat-only',
                imageModel: '',
                imageSize: '1344x768',
                timeoutMs: 20000,
                enabled: true
            }
        }
        if (id === 3) {
            return {
                id: 3,
                name: '配图专用',
                baseUrl: 'https://image.test/v1',
                apiKey: 'image-key',
                chatModel: 'unused-chat',
                imageModel: 'image-only',
                imageSize: '1024x1024',
                timeoutMs: 30000,
                enabled: true
            }
        }
        return null
    }

    try {
        const chat = await aiClient.getActiveAiConfig({ purpose: 'chat' })
        assert.equal(chat.id, 2)
        assert.equal(chat.model, 'chat-only')
        assert.equal(chat.baseUrl, 'https://chat.test/v1')

        const image = await aiClient.getActiveAiConfig({ purpose: 'image' })
        assert.equal(image.id, 3)
        assert.equal(image.model, 'image-only')
        assert.equal(image.imageModel, 'image-only')
        assert.equal(image.baseUrl, 'https://image.test/v1')
    } finally {
        aiModel.getActiveModelConfig = originalDefault
        aiModel.getSettings = originalSettings
        aiModel.getModelConfigById = originalById
    }
})

test('指定的任务模型停用时回退到默认模型', async () => {
    const originalDefault = aiModel.getActiveModelConfig
    const originalSettings = aiModel.getSettings
    const originalById = aiModel.getModelConfigById

    aiModel.getActiveModelConfig = async () => ({
        id: 1,
        name: '默认模型',
        baseUrl: 'https://default.test/v1',
        apiKey: 'default-key',
        chatModel: 'default-chat',
        imageModel: 'default-image',
        imageSize: '1344x768',
        timeoutMs: 20000
    })
    aiModel.getSettings = async () => ({ chatModelId: 9, imageModelId: null })
    aiModel.getModelConfigById = async () => ({
        id: 9,
        name: '已停用模型',
        chatModel: 'disabled-chat',
        imageModel: '',
        enabled: false
    })

    try {
        const chat = await aiClient.getActiveAiConfig({ purpose: 'chat' })
        assert.equal(chat.id, 1)
        assert.equal(chat.model, 'default-chat')
    } finally {
        aiModel.getActiveModelConfig = originalDefault
        aiModel.getSettings = originalSettings
        aiModel.getModelConfigById = originalById
    }
})

test('AI 策略保存文本与配图模型路由并校验配图能力', async () => {
    const originalGetSettings = aiModel.getSettings
    const originalUpdateSettings = aiModel.updateSettings
    const originalFindModel = aiModel.findModelById
    let saved = null

    aiModel.getSettings = async () => ({
        quotaEnabled: true,
        dailyLimitPerUser: 20,
        monthlyLimitPerUser: 100,
        superAdminUnlimited: true,
        removeWatermark: true,
        watermarkMode: 'crop',
        chatModelId: null,
        imageModelId: null
    })
    aiModel.updateSettings = async (payload) => {
        saved = payload
        return payload
    }
    aiModel.findModelById = async (id) => ({
        id,
        name: `模型${id}`,
        chatModel: id === 2 ? 'chat-b' : 'chat-c',
        imageModel: id === 3 ? 'image-c' : '',
        enabled: true
    })

    try {
        const ok = createRes()
        await aiManageController.updateSettings({
            body: {
                quotaEnabled: true,
                dailyLimitPerUser: 20,
                monthlyLimitPerUser: 100,
                superAdminUnlimited: true,
                chatModelId: 2,
                imageModelId: 3
            }
        }, ok)
        assert.equal(ok.body.code, 200)
        assert.equal(saved.chatModelId, 2)
        assert.equal(saved.imageModelId, 3)

        const invalid = createRes()
        await aiManageController.updateSettings({
            body: { chatModelId: 2, imageModelId: 2 }
        }, invalid)
        assert.equal(invalid.statusCode, 400)
        assert.match(invalid.body.message, /没有配置配图模型名/)
    } finally {
        aiModel.getSettings = originalGetSettings
        aiModel.updateSettings = originalUpdateSettings
        aiModel.findModelById = originalFindModel
    }
})

test('模型级限额不能高于全局上限', async () => {
    const originalGetSettings = aiModel.getSettings
    aiModel.getSettings = async () => ({
        quotaEnabled: true,
        dailyLimitPerUser: 20,
        monthlyLimitPerUser: 100,
        superAdminUnlimited: true
    })

    try {
        const res = {
            statusCode: 0,
            body: null,
            status(code) { this.statusCode = code; return this },
            json(payload) { this.body = payload; return this }
        }
        await aiManageController.createModel({
            body: {
                name: '超限模型',
                baseUrl: 'https://ai.example.test/v4',
                apiKey: 'key',
                chatModel: 'glm-4-flash',
                dailyLimitPerUser: 50
            }
        }, res)

        assert.equal(res.statusCode, 400)
        assert.match(res.body.message, /不能高于全局每日上限/)
    } finally {
        aiModel.getSettings = originalGetSettings
    }
})

test('模型级限额低于全局上限时可以保存', async () => {
    const originalGetSettings = aiModel.getSettings
    const originalCreate = aiModel.createModel
    let created = null

    aiModel.getSettings = async () => ({
        quotaEnabled: true,
        dailyLimitPerUser: 20,
        monthlyLimitPerUser: 100,
        superAdminUnlimited: true
    })
    aiModel.createModel = async (payload) => {
        created = payload
        return { id: 9, ...payload }
    }

    try {
        const res = {
            statusCode: 0,
            body: null,
            status(code) { this.statusCode = code; return this },
            json(payload) { this.body = payload; return this }
        }
        await aiManageController.createModel({
            body: {
                name: '受限模型',
                baseUrl: 'https://ai.example.test/v4',
                apiKey: 'key',
                chatModel: 'glm-4-flash',
                dailyLimitPerUser: 5,
                monthlyLimitPerUser: 30
            }
        }, res)

        assert.equal(res.statusCode, 201)
        assert.equal(created.dailyLimitPerUser, 5)
        assert.equal(created.monthlyLimitPerUser, 30)
    } finally {
        aiModel.getSettings = originalGetSettings
        aiModel.createModel = originalCreate
    }
})

test('ai manage controller never returns the raw api key', async () => {
    const originalList = aiModel.listModels

    aiModel.listModels = async () => [{
        id: 1,
        name: '智谱',
        provider: 'openai',
        baseUrl: 'https://open.bigmodel.cn/api/paas/v4',
        apiKeyMasked: '********7890',
        chatModel: 'glm-4-flash',
        imageModel: 'cogview-3-flash',
        imageSize: '1344x768',
        timeoutMs: 20000,
        enabled: true,
        isDefault: true,
        remark: ''
    }]

    try {
        const res = createRes()
        await aiManageController.getModels({ user: { userId: 1 } }, res)
        assert.equal(res.body.code, 200)
        assert.equal(res.body.data.list[0].apiKeyMasked, '********7890')
        assert.equal(res.body.data.list[0].apiKey, undefined)
    } finally {
        aiModel.listModels = originalList
    }
})

test('ai provider label is inferred from the base url', () => {
    const { guessProviderLabel } = require(path.resolve(__dirname, '../utils/aiProvider.js'))

    assert.equal(guessProviderLabel('https://open.bigmodel.cn/api/paas/v4', 'glm-4-flash'), '智谱 GLM')
    assert.equal(guessProviderLabel('https://api.deepseek.com/v1', 'deepseek-chat'), 'DeepSeek')
    assert.equal(guessProviderLabel('https://example.test/v1', 'glm-4-plus'), '智谱 GLM')
    assert.equal(guessProviderLabel('https://example.test/v1', 'my-model'), '自定义模型')
})

test('importing an additional env model does not steal the default flag', async () => {
    const config = require(path.resolve(__dirname, '../config/default.js'))
    const originalAi = config.ai

    config.ai = {
        baseUrl: 'https://ai.example.test/v4',
        apiKey: 'sk-env-key',
        model: 'glm-4-flash',
        imageModel: 'cogview-3-flash',
        imageSize: '1344x768',
        timeoutMs: 20000
    }
    const queryFn = async (sql) => {
        if (sql.startsWith('SELECT id FROM ai_model LIMIT 1')) return [{ id: 2 }]
        if (sql.startsWith('SELECT id, chat_model, image_model FROM ai_model WHERE base_url')) return []
        throw new Error(`unexpected query: ${sql}`)
    }
    let created = null
    const updateFn = async () => {
        throw new Error('不应更新不匹配的已有模型')
    }
    const createFn = async (payload) => {
        created = payload
        return { id: 3, ...payload }
    }

    try {
        const result = await aiModel.importEnvModel({ queryFn, createFn, updateFn })
        assert.equal(result.imported, true)
        assert.equal(result.created, true)
        assert.equal(created.isDefault, false)
        assert.equal(created.baseUrl, 'https://ai.example.test/v4')
    } finally {
        config.ai = originalAi
    }
})

test('importing env config onto an existing model keeps author settings', async () => {
    const config = require(path.resolve(__dirname, '../config/default.js'))
    const originalAi = config.ai

    config.ai = {
        baseUrl: 'https://ai.example.test/v4',
        apiKey: 'sk-env-key',
        model: 'glm-4-flash',
        imageModel: 'cogview-3-flash',
        imageSize: '1344x768',
        timeoutMs: 20000
    }

    const queryFn = async (sql) => {
        if (sql.startsWith('SELECT id FROM ai_model LIMIT 1')) return [{ id: 2 }]
        if (sql.startsWith('SELECT id, chat_model, image_model FROM ai_model WHERE base_url')) {
            return [{ id: 2, chat_model: 'glm-4-flash', image_model: 'cogview-3-flash' }]
        }
        throw new Error(`unexpected query: ${sql}`)
    }

    let updatedPayload = null
    const updateFn = async (id, payload) => {
        updatedPayload = payload
        return { id, ...payload }
    }
    const createFn = async () => {
        throw new Error('已存在的模型不应重复创建')
    }

    try {
        const result = await aiModel.importEnvModel({ queryFn, createFn, updateFn })
        assert.equal(result.imported, true)
        assert.equal(result.created, false)
        // 只同步连接信息，作者自定义的字段不应出现在更新载荷里
        assert.equal(updatedPayload.apiKey, 'sk-env-key')
        assert.equal(updatedPayload.chatModel, 'glm-4-flash')
        assert.equal(updatedPayload.name, undefined)
        assert.equal(updatedPayload.enabled, undefined)
        assert.equal(updatedPayload.isDefault, undefined)
        assert.equal(updatedPayload.remark, undefined)
    } finally {
        config.ai = originalAi
    }
})

test('importing env models reports missing env configuration', async () => {
    const config = require(path.resolve(__dirname, '../config/default.js'))
    const originalAi = config.ai
    config.ai = null
    try {
        const result = await aiModel.importEnvModel()
        assert.equal(result.imported, false)
        assert.match(result.reason, /环境变量未配置 AI/)
    } finally {
        config.ai = originalAi
    }
})

test('ai manage controller refuses to import when env is not configured', async () => {
    const originalImport = aiModel.importEnvModel
    aiModel.importEnvModel = async () => ({ imported: false, reason: '环境变量未配置 AI' })
    try {
        const res = createRes()
        await aiManageController.importFromEnv({ user: { userId: 1 } }, res)
        assert.equal(res.statusCode, 400)
        assert.match(res.body.message, /环境变量未配置 AI/)
    } finally {
        aiModel.importEnvModel = originalImport
    }
})

test('定时巡检只探测启用中的模型，并汇总失败数量', async () => {
    const originalList = aiModel.listEnabledModelConfigs
    const originalHealth = aiModel.recordModelHealth
    const probed = []
    const originalFetch = global.fetch

    aiModel.listEnabledModelConfigs = async () => [
        { id: 1, name: '智谱 GLM', baseUrl: 'https://a.example.test/v4', apiKey: 'k1', chatModel: 'glm-4-flash', timeoutMs: 5000 },
        { id: 2, name: '备用模型', baseUrl: 'https://b.example.test/v4', apiKey: 'k2', chatModel: 'deepseek-chat', timeoutMs: 5000 }
    ]
    aiModel.recordModelHealth = async (modelId, payload) => {
        probed.push({ modelId, ok: payload.ok })
        return { consecutiveFailures: payload.ok ? 0 : 2 }
    }
    global.fetch = async (url) => {
        // 备用模型返回 502，模拟一个不可用的模型
        if (String(url).includes('b.example.test')) {
            return new Response(null, { status: 502 })
        }
        return new Response(JSON.stringify({ choices: [{ message: { content: 'pong' } }] }), { status: 200 })
    }

    try {
        const result = await aiHealthCheck.runHealthCheck({ source: 'manual' })

        assert.equal(result.total, 2)
        assert.equal(result.failedCount, 1)
        assert.equal(result.results.length, 2)
        assert.equal(result.results[0].ok, true)
        assert.equal(result.results[1].ok, false)
        assert.match(result.results[1].error, /HTTP 502/)
        assert.equal(probed.length, 2)
        // 上次巡检时间要落成 ISO，前端才能按本地时区显示
        assert.match(result.checkedAt, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/)
    } finally {
        aiModel.listEnabledModelConfigs = originalList
        aiModel.recordModelHealth = originalHealth
        global.fetch = originalFetch
    }
})

test('AI 辅助标记只累计作者真正采用的环节', async () => {
    const originalMark = articleModel.markAiAssisted
    const originalInsert = articleModel.insertArticle
    const marked = []
    articleModel.markAiAssisted = async (articleId, features) => {
        marked.push({ articleId, features })
        return 1
    }
    articleModel.insertArticle = async () => ({ articleId: 77 })

    try {
        const res = createRes()
        await articleController.createArticle({
            body: {
                title: 'AI 辅助的文章',
                content: '<p>正文</p>',
                classify: 'article',
                introduce: '简介',
                aiFeatures: ['suggest', 'writing', 'suggest']
            },
            user: { userId: 1, userType: 'admin', permissions: [], isSuperAdmin: true }
        }, res)

        assert.equal(res.body.code, 200)
        assert.equal(marked.length, 1)
        assert.deepEqual(marked[0].features, ['suggest', 'writing'])
    } finally {
        articleModel.markAiAssisted = originalMark
        articleModel.insertArticle = originalInsert
    }
})

test('未采用 AI 结果时不写辅助标记', async () => {
    const originalMark = articleModel.markAiAssisted
    const originalInsert = articleModel.insertArticle
    let markCalls = 0
    articleModel.markAiAssisted = async () => {
        markCalls += 1
        return 1
    }
    articleModel.insertArticle = async () => ({ articleId: 78 })

    try {
        const res = createRes()
        await articleController.createArticle({
            body: {
                title: '纯手写文章',
                content: '<p>正文</p>',
                classify: 'article',
                introduce: '简介'
            },
            user: { userId: 1, userType: 'admin', permissions: [], isSuperAdmin: true }
        }, res)

        assert.equal(res.body.code, 200)
        assert.equal(markCalls, 0)
    } finally {
        articleModel.markAiAssisted = originalMark
        articleModel.insertArticle = originalInsert
    }
})

test('AI 辅助标记忽略白名单之外的环节', async () => {
    const originalMark = articleModel.markAiAssisted
    const originalInsert = articleModel.insertArticle
    const marked = []
    articleModel.markAiAssisted = async (articleId, features) => {
        marked.push({ articleId, features })
        return 1
    }
    articleModel.insertArticle = async () => ({ articleId: 79 })

    try {
        const res = createRes()
        await articleController.createArticle({
            body: {
                title: '带脏标记的文章',
                content: '<p>正文</p>',
                classify: 'article',
                introduce: '简介',
                aiFeatures: ['suggest', 'DROP TABLE', 'cover']
            },
            user: { userId: 1, userType: 'admin', permissions: [], isSuperAdmin: true }
        }, res)

        assert.equal(res.body.code, 200)
        assert.deepEqual(marked[0].features, ['suggest', 'cover'])
    } finally {
        articleModel.markAiAssisted = originalMark
        articleModel.insertArticle = originalInsert
    }
})

test('巡检连续失败达到阈值时写系统日志告警', async () => {
    const originalHealth = aiModel.recordModelHealth
    const originalInsert = systemLogModel.insertLog
    const logs = []
    const originalFetch = global.fetch

    aiModel.recordModelHealth = async () => ({ consecutiveFailures: 3 })
    systemLogModel.insertLog = async (payload) => {
        logs.push(payload)
        return { insertId: 1 }
    }
    global.fetch = async () => new Response(null, { status: 500 })

    try {
        const result = await aiHealthCheck.runHealthCheck({
            models: [{
                id: 9,
                name: '故障模型',
                baseUrl: 'https://c.example.test/v4',
                apiKey: 'k',
                chatModel: 'glm-4-flash',
                timeoutMs: 5000
            }]
        })

        assert.equal(result.failedCount, 1)
        assert.equal(logs.length, 1)
        assert.equal(logs[0].module, 'ai')
        assert.match(logs[0].detail, /连续失败 3 次/)
    } finally {
        aiModel.recordModelHealth = originalHealth
        systemLogModel.insertLog = originalInsert
        global.fetch = originalFetch
    }
})

test('定时巡检调度器可以停止，且 stop 之后不再触发探测', async () => {
    const originalList = aiModel.listEnabledModelConfigs
    const originalHealth = aiModel.recordModelHealth
    let probes = 0
    const originalFetch = global.fetch

    aiModel.listEnabledModelConfigs = async () => {
        probes += 1
        return []
    }
    aiModel.recordModelHealth = async () => ({ consecutiveFailures: 0 })
    global.fetch = async () => new Response(null, { status: 200 })

    try {
        const scheduler = aiHealthCheck.startAiHealthCheck({ intervalMs: 20, runOnceAtStart: false })
        await new Promise(resolve => setTimeout(resolve, 60))
        const probesBeforeStop = probes
        scheduler.stop()
        await new Promise(resolve => setTimeout(resolve, 60))

        assert.ok(probesBeforeStop > 0, '定时器应当至少触发一次巡检')
        assert.equal(probes, probesBeforeStop, '停止后不应继续巡检')
    } finally {
        aiModel.listEnabledModelConfigs = originalList
        aiModel.recordModelHealth = originalHealth
        global.fetch = originalFetch
    }
})

test('立即巡检接口返回总数、失败数与巡检时间', async () => {
    const originalList = aiModel.listEnabledModelConfigs
    const originalHealth = aiModel.recordModelHealth
    const originalFetch = global.fetch

    aiModel.listEnabledModelConfigs = async () => ([
        { id: 1, name: '智谱 GLM', baseUrl: 'https://a.example.test/v4', apiKey: 'k', chatModel: 'glm-4-flash', timeoutMs: 5000 }
    ])
    aiModel.recordModelHealth = async () => ({ consecutiveFailures: 0 })
    global.fetch = async () => new Response(JSON.stringify({ choices: [{ message: { content: 'pong' } }] }), { status: 200 })

    try {
        const res = createRes()
        await aiManageController.checkAllModels({ user: { userId: 1 } }, res)

        assert.equal(res.body.code, 200)
        assert.equal(res.body.data.total, 1)
        assert.equal(res.body.data.failedCount, 0)
        assert.equal(res.body.data.results[0].ok, true)
        assert.match(res.body.data.checkedAt, /^\d{4}-\d{2}-\d{2}T/)
    } finally {
        aiModel.listEnabledModelConfigs = originalList
        aiModel.recordModelHealth = originalHealth
        global.fetch = originalFetch
    }
})

test('提示词模板列表补齐未配置的默认模板', async () => {
    const originalList = aiModel.listPromptTemplates
    const originalBindings = aiModel.listPromptBindings
    const { listDefaultTemplates } = require(path.resolve(__dirname, '../utils/aiPromptTemplates.js'))
    const defaults = listDefaultTemplates()

    aiModel.listPromptTemplates = async () => defaults.map(item => ({
        id: null,
        key: item.key,
        featureKey: item.key,
        name: item.name,
        description: item.description,
        content: item.content,
        variables: item.variables,
        enabled: true,
        isDefault: true,
        customized: false,
        updatedAt: null
    }))
    aiModel.listPromptBindings = async () => ({})

    try {
        const res = createRes()
        await aiManageController.getPromptTemplates({ user: { userId: 1 } }, res)

        assert.equal(res.body.code, 200)
        assert.ok(res.body.data.list.length >= 9)
        assert.ok(typeof res.body.data.bindings === 'object')
        // 每个模板都要能看出可用变量，作者才知道能填什么
        assert.ok(res.body.data.list.every(item => typeof item.variables === 'string' && item.variables))
        // 每个模板都标明所属功能，页面按功能分组展示
        assert.ok(res.body.data.list.every(item => typeof item.featureKey === 'string' && item.featureKey))
    } finally {
        aiModel.listPromptTemplates = originalList
        aiModel.listPromptBindings = originalBindings
    }
})

test('提示词试跑支持未保存草稿并写入 AI 调用日志', async () => {
    const originalPreview = aiClient.previewPrompt
    const originalGetDefault = aiClient.getDefaultTemplate
    const originalLog = aiModel.logUsage
    const originalInsertLog = systemLogModel.insertLog
    let previewPayload = null
    let logged = null
    aiClient.previewPrompt = async (payload) => {
        previewPayload = payload
        return {
            kind: 'text',
            prompt: '自定义内容：秋季',
            text: '试跑成功',
            usage: { promptTokens: 8, completionTokens: 4, totalTokens: 12 },
            outputChars: 4,
            modelUsed: { id: 3, name: 'GLM', model: 'glm-4-flash', degraded: false }
        }
    }
    aiClient.getDefaultTemplate = (featureKey) => featureKey === 'freeform'
        ? { key: 'freeform', name: '自由创作', content: '', variables: '{{input}}' }
        : null
    aiModel.logUsage = async (payload) => {
        logged = payload
    }
    systemLogModel.insertLog = async () => {}

    try {
        const res = createRes()
        await aiManageController.previewPromptTemplate({
            user: { userId: 1 },
            aiModel: { id: 3, model: 'glm-4-flash' },
            body: {
                featureKey: 'freeform',
                content: '自定义内容：{{input}}',
                variables: { input: '秋季', 'not-a-name': 'value' }
            }
        }, res)

        assert.equal(res.body.code, 200)
        assert.equal(res.body.data.kind, 'text')
        assert.equal(res.body.data.text, '试跑成功')
        assert.equal(previewPayload.variables.input, '秋季')
        assert.equal(previewPayload.variables['not-a-name'], undefined)
        assert.equal(logged.feature, 'prompt-preview')
        assert.equal(logged.status, 'success')
        assert.equal(logged.modelId, 3)
        assert.equal(logged.outputChars, 4)
    } finally {
        aiClient.previewPrompt = originalPreview
        aiClient.getDefaultTemplate = originalGetDefault
        aiModel.logUsage = originalLog
        systemLogModel.insertLog = originalInsertLog
    }
})

test('提示词试跑遇到未知所属功能时返回 400', async () => {
    const res = createRes()
    await aiManageController.previewPromptTemplate({
        body: { featureKey: 'no-such', content: 'x' },
        aiModel: { id: 1, model: 'glm-4-flash' }
    }, res)

    assert.equal(res.statusCode, 400)
})

test('提示词试跑可指定生成文字或生成图片', async () => {
    const originalPreview = aiClient.previewPrompt
    let previewPayload = null
    aiClient.previewPrompt = async (payload) => {
        previewPayload = payload
        return {
            kind: payload.mode === 'image' ? 'image' : 'text',
            prompt: '渲染后的提示词',
            text: payload.mode === 'image' ? '' : '生成的文字',
            dataUri: payload.mode === 'image' ? 'data:image/png;base64,AAAA' : '',
            usage: {},
            outputChars: 4,
            modelUsed: { id: 1, name: 'GLM', model: 'glm-4-flash', degraded: false }
        }
    }

    try {
        const textRes = createRes()
        await aiManageController.previewPromptTemplate({
            user: { userId: 1 },
            aiModel: { id: 1, model: 'glm-4-flash' },
            body: { featureKey: 'freeform', content: '内容', mode: 'text' }
        }, textRes)
        assert.equal(textRes.body.code, 200)
        assert.equal(previewPayload.mode, 'text')
        assert.equal(textRes.body.data.kind, 'text')
        assert.equal(textRes.body.data.text, '生成的文字')

        const imageRes = createRes()
        await aiManageController.previewPromptTemplate({
            user: { userId: 1 },
            aiModel: { id: 1, model: 'glm-4-flash' },
            body: { featureKey: 'freeform', content: '内容', mode: 'image' }
        }, imageRes)
        assert.equal(imageRes.body.code, 200)
        assert.equal(previewPayload.mode, 'image')
        assert.equal(imageRes.body.data.kind, 'image')
        assert.equal(imageRes.body.data.dataUri, 'data:image/png;base64,AAAA')

        // 不支持的输出类型直接拒绝
        const badRes = createRes()
        await aiManageController.previewPromptTemplate({
            body: { featureKey: 'freeform', content: '内容', mode: 'video' },
            aiModel: { id: 1, model: 'glm-4-flash' }
        }, badRes)
        assert.equal(badRes.statusCode, 400)
    } finally {
        aiClient.previewPrompt = originalPreview
    }
})

test('提示词助手返回的 JSON 能解析为候选模板', () => {
    const parsed = aiClient.parsePromptAssistantPayload(
        '```json\n{"content":"只输出 JSON 的模板 {{title}}","summary":"补充格式约束"}\n```'
    )
    assert.equal(parsed.content, '只输出 JSON 的模板 {{title}}')
    assert.equal(parsed.summary, '补充格式约束')

    assert.throws(() => aiClient.parsePromptAssistantPayload('不是 JSON'), /模型没有返回可用提示词/)
})

test('提示词助手生成候选并写入 AI 调用日志', async () => {
    const originalAssist = aiClient.assistPromptTemplate
    const originalLog = aiModel.logUsage
    const originalInsertLog = systemLogModel.insertLog
    let assistPayload = null
    let logged = null

    aiClient.assistPromptTemplate = async (payload) => {
        assistPayload = payload
        return {
            content: '你是一名编辑助手。请输出 JSON。',
            summary: '增强输出格式约束',
            usage: { promptTokens: 10, completionTokens: 8, totalTokens: 18 },
            outputChars: 18,
            modelUsed: { id: 4, name: 'GLM', model: 'glm-4-flash', degraded: false }
        }
    }
    aiModel.logUsage = async (payload) => {
        logged = payload
    }
    systemLogModel.insertLog = async () => {}

    try {
        const res = createRes()
        await aiManageController.assistPromptTemplate({
            user: { userId: 1 },
            aiModel: { id: 4, model: 'glm-4-flash' },
            body: {
                task: 'optimize',
                featureKey: 'suggest',
                content: '旧提示词 {{title}}',
                requirement: '强调只输出 JSON',
                variables: { title: '示例标题', 'bad-name': '忽略' }
            }
        }, res)

        assert.equal(res.body.code, 200)
        assert.equal(res.body.data.summary, '增强输出格式约束')
        assert.equal(assistPayload.variables.title, '示例标题')
        assert.deepEqual(Object.keys(assistPayload.variables), ['title'])
        assert.equal(logged.feature, 'prompt-assistant')
        assert.equal(logged.status, 'success')
        assert.equal(logged.modelId, 4)
        assert.equal(logged.outputChars, 18)
    } finally {
        aiClient.assistPromptTemplate = originalAssist
        aiModel.logUsage = originalLog
        systemLogModel.insertLog = originalInsertLog
    }
})

test('提示词助手校验任务、功能与内容长度', async () => {
    const badTask = createRes()
    await aiManageController.assistPromptTemplate({
        body: { task: 'rewrite', featureKey: 'suggest', content: 'x' }
    }, badTask)
    assert.equal(badTask.statusCode, 400)

    const missingFeature = createRes()
    await aiManageController.assistPromptTemplate({
        body: { task: 'optimize', featureKey: '', content: 'x' }
    }, missingFeature)
    assert.equal(missingFeature.statusCode, 400)

    const missingContent = createRes()
    await aiManageController.assistPromptTemplate({
        body: { task: 'optimize', featureKey: 'suggest', content: ' ' }
    }, missingContent)
    assert.equal(missingContent.statusCode, 400)

    const unknownFeature = createRes()
    await aiManageController.assistPromptTemplate({
        user: { userId: 1 },
        aiModel: { id: 1, model: 'glm-4-flash' },
        body: { task: 'create', featureKey: 'no-such' }
    }, unknownFeature)
    assert.equal(unknownFeature.statusCode, 400)
})

test('保存提示词模板：未知模板 404，内置与自定义都可编辑', async () => {
    const originalSave = aiModel.savePromptTemplate
    const originalList = aiModel.listPromptTemplates
    const originalBindings = aiModel.listPromptBindings
    let saved = null
    aiModel.savePromptTemplate = async (key, payload) => {
        saved = { key, payload }
        return []
    }
    aiModel.listPromptTemplates = async () => ([
        {
            id: 1, key: 'suggest', featureKey: 'suggest', name: '写作建议',
            description: '', content: '内置内容', variables: '', enabled: true,
            isDefault: true, customized: false, updatedAt: null
        },
        {
            id: 2, key: 'custom_abc', featureKey: 'suggest', name: '我的风格',
            description: '', content: '自定义内容', variables: '', enabled: true,
            isDefault: false, customized: true, updatedAt: null
        }
    ])
    aiModel.listPromptBindings = async () => ({})

    try {
        const missing = createRes()
        await aiManageController.updatePromptTemplate({ params: { key: 'not-exist' }, body: { content: 'x' } }, missing)
        assert.equal(missing.statusCode, 404)

        const empty = createRes()
        await aiManageController.updatePromptTemplate({ params: { key: 'suggest' }, body: { content: '  ' } }, empty)
        assert.equal(empty.statusCode, 400)

        const ok = createRes()
        await aiManageController.updatePromptTemplate(
            { params: { key: 'suggest' }, body: { content: '自定义提示词' } },
            ok
        )
        assert.equal(ok.body.code, 200)
        assert.equal(saved.key, 'suggest')
        assert.equal(saved.payload.content, '自定义提示词')
        // 未显式传启用状态时默认启用
        assert.equal(saved.payload.enabled, true)

        const custom = createRes()
        await aiManageController.updatePromptTemplate(
            { params: { key: 'custom_abc' }, body: { content: '改一版自定义内容' } },
            custom
        )
        assert.equal(custom.body.code, 200)
        assert.equal(saved.key, 'custom_abc')
    } finally {
        aiModel.savePromptTemplate = originalSave
        aiModel.listPromptTemplates = originalList
        aiModel.listPromptBindings = originalBindings
    }
})

test('自定义提示词可以创建、选用与删除，内置模板拒绝删除', async () => {
    const originalCreate = aiModel.createPromptTemplate
    const originalSelect = aiModel.selectPromptTemplate
    const originalDelete = aiModel.deletePromptTemplate
    const originalList = aiModel.listPromptTemplates
    const originalBindings = aiModel.listPromptBindings

    let created = null
    let selected = null
    let deleted = null
    aiModel.createPromptTemplate = async (payload) => {
        created = payload
        // 与真实实现一致：功能必须来自内置清单，否则视为功能不存在
        const { getDefaultTemplate } = require(path.resolve(__dirname, '../utils/aiPromptTemplates.js'))
        if (!getDefaultTemplate(payload.featureKey)) return null
        return { id: 9, key: 'custom_xyz', featureKey: payload.featureKey }
    }
    aiModel.selectPromptTemplate = async (key) => {
        selected = key
        return key !== 'missing'
    }
    aiModel.deletePromptTemplate = async (key) => {
        deleted = key
        return key === 'builtin' ? null : true
    }
    aiModel.listPromptTemplates = async () => []
    aiModel.listPromptBindings = async () => ({ suggest: 'custom_xyz' })

    try {
        const createdRes = createRes()
        await aiManageController.createPromptTemplate(
            { body: { featureKey: 'suggest', name: '我的风格', content: '内容' } },
            createdRes
        )
        assert.equal(createdRes.body.code, 200)
        assert.equal(created.featureKey, 'suggest')
        assert.equal(created.name, '我的风格')

        const unknownFeature = createRes()
        await aiManageController.createPromptTemplate(
            { body: { featureKey: 'no-such', name: 'x', content: '内容' } },
            unknownFeature
        )
        assert.equal(unknownFeature.statusCode, 404)

        const selectRes = createRes()
        await aiManageController.selectPromptTemplate({ params: { key: 'custom_xyz' } }, selectRes)
        assert.equal(selectRes.body.code, 200)
        assert.equal(selected, 'custom_xyz')

        const missingSelect = createRes()
        await aiManageController.selectPromptTemplate({ params: { key: 'missing' } }, missingSelect)
        assert.equal(missingSelect.statusCode, 404)

        const deleteBuiltin = createRes()
        await aiManageController.deletePromptTemplate({ params: { key: 'builtin' } }, deleteBuiltin)
        assert.equal(deleteBuiltin.statusCode, 400)

        const deleteCustom = createRes()
        await aiManageController.deletePromptTemplate({ params: { key: 'custom_xyz' } }, deleteCustom)
        assert.equal(deleteCustom.body.code, 200)
        assert.equal(deleted, 'custom_xyz')
    } finally {
        aiModel.createPromptTemplate = originalCreate
        aiModel.selectPromptTemplate = originalSelect
        aiModel.deletePromptTemplate = originalDelete
        aiModel.listPromptTemplates = originalList
        aiModel.listPromptBindings = originalBindings
    }
})

test('提示词解析顺序：选用模板优先，其次启用中的内置模板', async () => {
    const queries = []

    const queryFn = async (sql, values) => {
        queries.push({ sql, values })
        if (sql.includes('ai_prompt_binding')) {
            return [{ content: '选用中的自定义内容' }]
        }
        return [{ content: '内置默认内容' }]
    }

    try {
        const bound = await aiModel.getEnabledPromptTemplate('suggest', queryFn)
        assert.equal(bound, '选用中的自定义内容')
        assert.equal(queries[0].values[0], 'suggest')

        queries.length = 0
        const emptyFn = async (sql) => {
            queries.push(sql)
            if (sql.includes('ai_prompt_binding')) return []
            return []
        }
        const fallback = await aiModel.getEnabledPromptTemplate('suggest', emptyFn)
        assert.equal(fallback, null)
    } finally { /* nothing to restore */ }
})

test('提示词模板渲染会把变量填进正文', () => {
    const { renderTemplate, getDefaultTemplate } = require(path.resolve(__dirname, '../utils/aiPromptTemplates.js'))

    const template = getDefaultTemplate('suggest')
    const rendered = renderTemplate(template.content, { title: '我的标题', content: '我的正文' })

    assert.match(rendered, /标题：我的标题/)
    assert.match(rendered, /正文：我的正文/)
    assert.ok(!rendered.includes('{{title}}'))
})

test('提示词模板变量为空时不留下多余空行', () => {
    const { renderTemplate } = require(path.resolve(__dirname, '../utils/aiPromptTemplates.js'))

    const rendered = renderTemplate('第一行：{{title}}\n{{emptyLine}}\n最后一行', {
        title: '标题',
        emptyLine: ''
    })

    assert.equal(rendered, '第一行：标题\n最后一行')
})

test('AI 图片去水印：命中右下角徽标时裁掉并缩小尺寸', async () => {
    const sharp = require(path.resolve(__dirname, '../node_modules/sharp'))
    const { removeWatermark, detectBadge } = require(path.resolve(__dirname, '../utils/aiWatermark.js'))

    // 构造一张与真实徽标同构的图片：深色底板 + 中性白文字块，贴在右下角
    const width = 1024
    const height = 1024
    const textHeight = Math.round(height * 0.0365)
    const textWidth = Math.round(textHeight * 3.14)
    const plateLeft = width - Math.round(height * 0.043) - textWidth - Math.round(textHeight * 0.68)
    const plateTop = height - Math.round(height * 0.03) - textHeight - Math.round(textHeight * 0.39)

    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
        <rect width="${width}" height="${height}" fill="#3a4a5a"/>
        <rect x="${plateLeft}" y="${plateTop}" width="${textWidth + Math.round(textHeight * 1.7)}"
            height="${textHeight + Math.round(textHeight * 1.46)}" rx="${textHeight * 0.3}" fill="#101820"/>
        <rect x="${width - Math.round(height * 0.043) - textWidth}" y="${height - Math.round(height * 0.03) - textHeight}"
            width="${textWidth}" height="${textHeight}" fill="#f2f4f5"/>
    </svg>`

    const buffer = await sharp(Buffer.from(svg)).png().toBuffer()

    const badge = await detectBadge(buffer)
    assert.ok(badge, '应能识别出右下角徽标')

    const result = await removeWatermark(buffer, 'image/png')
    assert.equal(result.removed, true)

    const after = await sharp(result.buffer).metadata()
    assert.ok(after.width < width)
    assert.ok(after.height < height)
    // 裁掉之后右下角不应再残留徽标
    assert.equal(await detectBadge(result.buffer), null)
})

test('AI 图片去水印：没有徽标的图片保持原样', async () => {
    const sharp = require(path.resolve(__dirname, '../node_modules/sharp'))
    const { removeWatermark } = require(path.resolve(__dirname, '../utils/aiWatermark.js'))

    const buffer = await sharp({
        create: { width: 800, height: 600, channels: 3, background: { r: 120, g: 160, b: 200 } }
    }).png().toBuffer()

    const result = await removeWatermark(buffer, 'image/png')
    assert.equal(result.removed, false)
    assert.equal(result.buffer, buffer)
})

test('AI 图片去水印：关闭去除标识后图片保持服务商原样', async () => {
    const sharp = require(path.resolve(__dirname, '../node_modules/sharp'))
    const { removeWatermark } = require(path.resolve(__dirname, '../utils/aiWatermark.js'))

    const buffer = await sharp({
        create: { width: 640, height: 480, channels: 3, background: { r: 40, g: 60, b: 90 } }
    }).png().toBuffer()

    const result = await removeWatermark(buffer, 'image/png', { enabled: false, mode: 'crop' })
    assert.equal(result.removed, false)
    assert.equal(result.buffer, buffer)
})

test('AI 图片去水印：裁剪后缩放模式会还原原始尺寸', async () => {
    const sharp = require(path.resolve(__dirname, '../node_modules/sharp'))
    const { removeWatermark, detectBadge } = require(path.resolve(__dirname, '../utils/aiWatermark.js'))

    const width = 800
    const height = 600
    const textHeight = Math.round(height * 0.0365)
    const textWidth = Math.round(textHeight * 3.14)
    const plateLeft = width - Math.round(height * 0.043) - textWidth - Math.round(textHeight * 0.68)
    const plateTop = height - Math.round(height * 0.03) - textHeight - Math.round(textHeight * 0.39)

    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
        <rect width="${width}" height="${height}" fill="#42525f"/>
        <rect x="${plateLeft}" y="${plateTop}" width="${textWidth + Math.round(textHeight * 1.7)}"
            height="${textHeight + Math.round(textHeight * 1.46)}" rx="${textHeight * 0.3}" fill="#0d1319"/>
        <rect x="${width - Math.round(height * 0.043) - textWidth}" y="${height - Math.round(height * 0.03) - textHeight}"
            width="${textWidth}" height="${textHeight}" fill="#f4f6f7"/>
    </svg>`

    const buffer = await sharp(Buffer.from(svg)).png().toBuffer()

    const cropped = await removeWatermark(buffer, 'image/png', { enabled: true, mode: 'crop' })
    const croppedMeta = await sharp(cropped.buffer).metadata()
    assert.ok(croppedMeta.width < width)

    const resized = await removeWatermark(buffer, 'image/png', { enabled: true, mode: 'crop-resize' })
    assert.equal(resized.removed, true)
    const resizedMeta = await sharp(resized.buffer).metadata()
    assert.equal(resizedMeta.width, width)
    assert.equal(resizedMeta.height, height)
    // 缩放回原尺寸后徽标仍不应被检出
    assert.equal(await detectBadge(resized.buffer), null)
})

test('魔搭异步出图会轮询任务并下载结果', async () => {
    const originalFetch = global.fetch
    const originalSettings = aiModel.getSettings
    const calls = []
    const pngBytes = Buffer.from('89504e470d0a1a0a', 'hex')

    aiModel.getSettings = async () => ({
        removeWatermark: false,
        watermarkMode: 'crop'
    })
    global.fetch = async (url, init = {}) => {
        const target = String(url)
        if (target.endsWith('/images/generations')) {
            calls.push({ type: 'submit', body: JSON.parse(init.body), headers: init.headers })
            return new Response(JSON.stringify({ task_id: 'task-1' }), { status: 200 })
        }
        if (target.endsWith('/tasks/task-1')) {
            calls.push({ type: 'poll', headers: init.headers })
            return new Response(JSON.stringify({
                task_status: 'SUCCEED',
                output_images: ['https://cdn.example.test/modelscope-image.png']
            }), { status: 200 })
        }
        if (target === 'https://cdn.example.test/modelscope-image.png') {
            return new Response(pngBytes, {
                status: 200,
                headers: { 'content-type': 'image/png' }
            })
        }
        throw new Error(`unexpected fetch: ${target}`)
    }

    try {
        const result = await aiClient.generateCoverImage({
            title: '深夜书房',
            aiConfig: {
                id: 3,
                name: '魔搭',
                baseUrl: 'https://api-inference.modelscope.cn/v1',
                apiKey: 'ms-key',
                model: 'Qwen/Qwen3.5-27B',
                imageModel: 'Qwen/Qwen-Image-2.1',
                imageSize: '1344x768',
                timeoutMs: 20000
            },
            chainFn: async () => []
        })

        assert.match(result.dataUri, /^data:image\/png;base64,/)
        const submit = calls.find(call => call.type === 'submit')
        assert.equal(submit.body.model, 'Qwen/Qwen-Image-2.1')
        // 魔搭只接收 model 与 prompt，不能带智谱的尺寸与去标识字段
        assert.equal(submit.body.size, undefined)
        assert.equal(submit.body.watermark_enabled, undefined)
        assert.equal(submit.headers['X-ModelScope-Async-Mode'], 'true')

        const poll = calls.find(call => call.type === 'poll')
        assert.equal(poll.headers['X-ModelScope-Task-Type'], 'image_generation')
    } finally {
        global.fetch = originalFetch
        aiModel.getSettings = originalSettings
    }
})

test('AI 策略可保存图片处理开关与去除方式', async () => {
    const originalUpdateSettings = aiModel.updateSettings
    let saved = null
    aiModel.updateSettings = async (payload) => {
        saved = payload
        return payload
    }

    try {
        const res = createRes()
        await aiManageController.updateSettings({
            body: {
                quotaEnabled: true,
                dailyLimitPerUser: 20,
                monthlyLimitPerUser: 100,
                superAdminUnlimited: true,
                removeWatermark: false,
                watermarkMode: 'crop-resize'
            }
        }, res)

        assert.equal(res.body.code, 200)
        assert.equal(saved.removeWatermark, false)
        assert.equal(saved.watermarkMode, 'crop-resize')

        // 非法去除方式收敛到默认的裁掉角落
        const fallback = createRes()
        await aiManageController.updateSettings({
            body: { removeWatermark: true, watermarkMode: 'unknown-mode' }
        }, fallback)
        assert.equal(fallback.body.code, 200)
        assert.equal(saved.watermarkMode, 'crop')
    } finally {
        aiModel.updateSettings = originalUpdateSettings
    }
})
test('提示词试跑图片可保存到本地文件素材库', async () => {
    const originalTake = aiModel.takePendingImage
    const originalPersist = uploadController.persistImageBuffer
    const originalInsertLog = systemLogModel.insertLog
    const persisted = []
    let logged = null

    aiModel.takePendingImage = async (token, userId) => {
        if (token !== 'd'.repeat(48) || userId !== 9) return null
        return { mimeType: 'image/png', buffer: Buffer.from('89504e470d0a1a0a', 'hex') }
    }
    uploadController.persistImageBuffer = async (payload) => {
        persisted.push(payload)
        return { filename: 'ai-preview.png', url: '/api/uploads/ai-preview.png' }
    }
    systemLogModel.insertLog = async (payload) => {
        logged = payload
        return { insertId: 1 }
    }

    try {
        const res = createRes()
        await aiManageController.savePreviewImage({
            body: { token: 'd'.repeat(48) },
            user: { userId: 9 },
            ip: '127.0.0.1'
        }, res)

        assert.equal(res.body.code, 200)
        assert.equal(res.body.data.url, '/api/uploads/ai-preview.png')
        assert.equal(persisted.length, 1)
        assert.equal(persisted[0].mimetype, 'image/png')
        assert.equal(persisted[0].userId, 9)
        assert.equal(logged.module, 'file')
        assert.equal(logged.action, 'create')

        // 无效令牌直接拒绝
        const bad = createRes()
        await aiManageController.savePreviewImage({
            body: { token: 'not-a-token' },
            user: { userId: 9 }
        }, bad)
        assert.equal(bad.statusCode, 400)
        assert.equal(persisted.length, 1)
    } finally {
        aiModel.takePendingImage = originalTake
        uploadController.persistImageBuffer = originalPersist
        systemLogModel.insertLog = originalInsertLog
    }
})
