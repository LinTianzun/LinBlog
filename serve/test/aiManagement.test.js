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
const aiUsageLogger = require(path.resolve(__dirname, '../utils/aiUsageLogger.js'))
const systemLogModel = require(path.resolve(__dirname, '../model/dbModel/systemLog/index.js'))

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
        assert.equal(logCalls[0].targetId, 'suggest')
        assert.match(logCalls[0].detail, /生成简介建议/)
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
