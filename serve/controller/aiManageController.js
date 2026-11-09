const aiModel = require('../model/dbModel/ai/index')

function toInt(value, fallback = 0) {
    const parsed = Number.parseInt(String(value ?? ''), 10)
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback
}

function normalizeModelPayload(body = {}) {
    const name = typeof body.name === 'string' ? body.name.trim() : ''
    const baseUrl = typeof body.baseUrl === 'string' ? body.baseUrl.trim() : ''
    const chatModel = typeof body.chatModel === 'string' ? body.chatModel.trim() : ''

    if (!name) return { error: '请填写模型名称' }
    if (!baseUrl) return { error: '请填写接口地址' }
    if (!chatModel) return { error: '请填写文本模型名' }

    const payload = {
        name,
        baseUrl,
        chatModel,
        provider: typeof body.provider === 'string' && body.provider.trim()
            ? body.provider.trim()
            : 'openai',
        imageModel: typeof body.imageModel === 'string' ? body.imageModel.trim() : '',
        imageSize: typeof body.imageSize === 'string' && body.imageSize.trim()
            ? body.imageSize.trim()
            : '1344x768',
        timeoutMs: toInt(body.timeoutMs, 20000) || 20000,
        dailyLimitPerUser: toInt(body.dailyLimitPerUser, 0),
        monthlyLimitPerUser: toInt(body.monthlyLimitPerUser, 0),
        enabled: body.enabled !== false,
        isDefault: Boolean(body.isDefault),
        remark: typeof body.remark === 'string' ? body.remark.trim() : ''
    }

    if (body.apiKey) payload.apiKey = String(body.apiKey).trim()
    return { data: payload }
}

/**
 * 校验模型级限额：不能高于全局策略，否则这个字段没有意义。
 * 全局为 0（不限）时，模型级也按不限处理，不再额外约束。
 */
async function validateModelQuota(payload) {
    const settings = await aiModel.getSettings()
    if (payload.dailyLimitPerUser > 0 && settings.dailyLimitPerUser > 0
        && payload.dailyLimitPerUser > settings.dailyLimitPerUser) {
        return '模型每日上限不能高于全局每日上限'
    }
    if (payload.monthlyLimitPerUser > 0 && settings.monthlyLimitPerUser > 0
        && payload.monthlyLimitPerUser > settings.monthlyLimitPerUser) {
        return '模型每月上限不能高于全局每月上限'
    }
    return null
}

async function getModels(req, res) {
    try {
        const list = await aiModel.listModels()
        return res.json({ code: 200, message: '获取 AI 模型列表成功', data: { list } })
    } catch (err) {
        console.error('[AI] 获取模型列表失败：', err?.message || err)
        return res.status(500).json({ code: 500, message: '获取 AI 模型列表失败' })
    }
}

async function createModel(req, res) {
    const normalized = normalizeModelPayload(req.body)
    if (normalized.error) {
        return res.status(400).json({ code: 400, message: normalized.error })
    }
    if (!normalized.data.apiKey) {
        return res.status(400).json({ code: 400, message: '请填写接口密钥' })
    }

    const quotaError = await validateModelQuota(normalized.data)
    if (quotaError) {
        return res.status(400).json({ code: 400, message: quotaError })
    }

    try {
        const model = await aiModel.createModel(normalized.data)
        return res.status(201).json({ code: 201, message: 'AI 模型已创建', data: model })
    } catch (err) {
        console.error('[AI] 创建模型失败：', err?.message || err)
        if (err?.code === 'ER_DUP_ENTRY') {
            return res.status(400).json({ code: 400, message: '模型名称已存在' })
        }
        return res.status(500).json({ code: 500, message: '创建 AI 模型失败' })
    }
}

async function updateModel(req, res) {
    const modelId = Number(req.params.id)
    if (!Number.isInteger(modelId) || modelId <= 0) {
        return res.status(400).json({ code: 400, message: '无效的模型 ID' })
    }

    const existing = await aiModel.findModelById(modelId)
    if (!existing) {
        return res.status(404).json({ code: 404, message: 'AI 模型不存在' })
    }

    const normalized = normalizeModelPayload({ ...existing, ...req.body })
    if (normalized.error) {
        return res.status(400).json({ code: 400, message: normalized.error })
    }

    const quotaError = await validateModelQuota(normalized.data)
    if (quotaError) {
        return res.status(400).json({ code: 400, message: quotaError })
    }

    try {
        const model = await aiModel.updateModel(modelId, normalized.data)
        return res.json({ code: 200, message: 'AI 模型已更新', data: model })
    } catch (err) {
        console.error('[AI] 更新模型失败：', err?.message || err)
        if (err?.code === 'ER_DUP_ENTRY') {
            return res.status(400).json({ code: 400, message: '模型名称已存在' })
        }
        return res.status(500).json({ code: 500, message: '更新 AI 模型失败' })
    }
}

async function deleteModel(req, res) {
    const modelId = Number(req.params.id)
    if (!Number.isInteger(modelId) || modelId <= 0) {
        return res.status(400).json({ code: 400, message: '无效的模型 ID' })
    }

    try {
        const removed = await aiModel.deleteModel(modelId)
        if (!removed) {
            return res.status(404).json({ code: 404, message: 'AI 模型不存在' })
        }
        return res.json({ code: 200, message: 'AI 模型已删除' })
    } catch (err) {
        console.error('[AI] 删除模型失败：', err?.message || err)
        return res.status(500).json({ code: 500, message: '删除 AI 模型失败' })
    }
}

/**
 * 连通性测试：用最小请求验证地址、密钥与模型名是否可用。
 * 测试请求不计入用户配额，只写系统日志。
 */
async function testModel(req, res) {
    const modelId = Number(req.params.id)
    if (!Number.isInteger(modelId) || modelId <= 0) {
        return res.status(400).json({ code: 400, message: '无效的模型 ID' })
    }

    try {
        const target = await aiModel.getModelConfigById(modelId)

        if (!target) {
            return res.status(404).json({ code: 404, message: 'AI 模型不存在' })
        }

        const startedAt = Date.now()
        const response = await fetch(`${target.baseUrl.replace(/\/+$/, '')}/chat/completions`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${target.apiKey}`
            },
            body: JSON.stringify({
                model: target.model,
                messages: [{ role: 'user', content: 'ping' }],
                max_tokens: 1
            }),
            signal: AbortSignal.timeout(target.timeoutMs || 20000)
        })
        const latencyMs = Date.now() - startedAt

        if (!response.ok) {
            const reason = `服务返回 HTTP ${response.status}`
            const health = await aiModel.recordModelHealth(modelId, {
                ok: false,
                latencyMs,
                error: reason
            })
            return res.status(200).json({
                code: 200,
                message: `连通性测试失败：${reason}`,
                data: { ok: false, status: response.status, latencyMs, health }
            })
        }

        const health = await aiModel.recordModelHealth(modelId, { ok: true, latencyMs })
        return res.json({
            code: 200,
            message: `连通性测试通过（耗时 ${latencyMs} 毫秒）`,
            data: { ok: true, latencyMs, health }
        })
    } catch (err) {
        console.error('[AI] 连通性测试失败：', err?.message || err)
        const reason = err?.message || '无法连接到模型服务'
        // 记录失败状态：健康表写失败不影响测试结论
        try {
            await aiModel.recordModelHealth(modelId, { ok: false, error: reason })
        } catch (recordError) {
            console.warn('[AI] 记录模型健康状态失败：', recordError?.message || recordError)
        }
        return res.status(200).json({
            code: 200,
            message: `连通性测试失败：${reason}`,
            data: { ok: false }
        })
    }
}

async function getSettings(req, res) {
    try {
        const settings = await aiModel.getSettings()
        return res.json({ code: 200, message: '获取 AI 用量策略成功', data: settings })
    } catch (err) {
        console.error('[AI] 获取用量策略失败：', err?.message || err)
        return res.status(500).json({ code: 500, message: '获取 AI 用量策略失败' })
    }
}

async function updateSettings(req, res) {
    const quotaEnabled = req.body?.quotaEnabled !== false
    const dailyLimitPerUser = toInt(req.body?.dailyLimitPerUser, 20)
    const monthlyLimitPerUser = toInt(req.body?.monthlyLimitPerUser, 100)
    const superAdminUnlimited = req.body?.superAdminUnlimited !== false

    if (dailyLimitPerUser > 1000 || monthlyLimitPerUser > 10000) {
        return res.status(400).json({ code: 400, message: '次数上限超出允许范围' })
    }

    try {
        const settings = await aiModel.updateSettings({
            quotaEnabled,
            dailyLimitPerUser,
            monthlyLimitPerUser,
            superAdminUnlimited
        })
        return res.json({ code: 200, message: 'AI 用量策略已保存', data: settings })
    } catch (err) {
        console.error('[AI] 保存用量策略失败：', err?.message || err)
        return res.status(500).json({ code: 500, message: '保存 AI 用量策略失败' })
    }
}

async function getUsage(req, res) {
    const limit = Math.min(Math.max(toInt(req.query?.limit, 50), 1), 200)
    try {
        const list = await aiModel.listUsage(limit)
        return res.json({ code: 200, message: '获取 AI 调用记录成功', data: { list } })
    } catch (err) {
        console.error('[AI] 获取调用记录失败：', err?.message || err)
        return res.status(500).json({ code: 500, message: '获取 AI 调用记录失败' })
    }
}

/**
 * 用量统计：总览窗口、按模型/功能分组、每日趋势与待确认图片占用。
 */
async function getUsageStats(req, res) {
    const days = Math.min(Math.max(toInt(req.query?.days, 30), 1), 90)
    try {
        const [summary, byModel, byFeature, trend, pending, health] = await Promise.all([
            aiModel.getUsageSummary(),
            aiModel.getUsageByModel(days),
            aiModel.getUsageByFeature(days),
            aiModel.getUsageTrend(Math.min(days, 30)),
            aiModel.getPendingImageStats(),
            aiModel.listModelHealth()
        ])
        return res.json({
            code: 200,
            message: '获取 AI 用量统计成功',
            data: { summary, byModel, byFeature, trend, pending, health, days }
        })
    } catch (err) {
        console.error('[AI] 获取用量统计失败：', err?.message || err)
        return res.status(500).json({ code: 500, message: '获取 AI 用量统计失败' })
    }
}

/**
 * 从环境变量导入 AI 配置：把 .env 里的密钥转成后台可管理的模型记录，
 * 便于之后在页面里轮换密钥或切换模型。
 */
async function importFromEnv(req, res) {
    try {
        const result = await aiModel.importEnvModel()
        if (!result.imported) {
            return res.status(400).json({ code: 400, message: result.reason || '环境变量未配置 AI' })
        }

        return res.json({
            code: 200,
            message: result.created ? '环境变量配置已导入为默认模型' : '环境变量配置已同步到现有模型',
            data: result.model
        })
    } catch (err) {
        console.error('[AI] 导入环境变量配置失败：', err?.message || err)
        return res.status(500).json({ code: 500, message: '导入环境变量配置失败' })
    }
}

async function getMyUsage(req, res) {
    try {
        const usage = await aiModel.getUserUsage(req.user.userId)
        const settings = await aiModel.getSettings()
        return res.json({
            code: 200,
            message: '获取 AI 用量成功',
            data: {
                ...usage,
                quotaEnabled: settings.quotaEnabled,
                dailyLimitPerUser: settings.dailyLimitPerUser,
                monthlyLimitPerUser: settings.monthlyLimitPerUser
            }
        })
    } catch (err) {
        console.error('[AI] 获取个人用量失败：', err?.message || err)
        return res.status(500).json({ code: 500, message: '获取个人用量失败' })
    }
}

module.exports = {
    getModels,
    createModel,
    updateModel,
    deleteModel,
    testModel,
    getSettings,
    updateSettings,
    getUsage,
    getUsageStats,
    importFromEnv,
    getMyUsage
}
