const assert = require('node:assert/strict')
const path = require('node:path')
const test = require('node:test')

process.env.LINBLOG_JWT_SECRET = 'x'.repeat(40)
process.env.LINBLOG_ALLOWED_ORIGINS = 'http://localhost:5173'

const accessControlConfig = require(path.resolve(__dirname, '../config/accessControl.js'))
const secretBox = require(path.resolve(__dirname, '../utils/secretBox.js'))
const aiModel = require(path.resolve(__dirname, '../model/dbModel/ai/index.js'))
const { aiQuota } = require(path.resolve(__dirname, '../middleware/aiQuota.js'))
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
