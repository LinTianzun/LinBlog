const aiModel = require('../model/dbModel/ai/index')
const { probeModel, runHealthCheck, getLastCheckedAt } = require('../utils/aiHealthCheck')

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

        const result = await probeModel(target)

        if (!result.ok) {
            return res.status(200).json({
                code: 200,
                message: `连通性测试失败：${result.error}`,
                data: {
                    ok: false,
                    status: result.status,
                    latencyMs: result.latencyMs,
                    health: result.health
                }
            })
        }

        return res.json({
            code: 200,
            message: `连通性测试通过（耗时 ${result.latencyMs} 毫秒）`,
            data: {
                ok: true,
                latencyMs: result.latencyMs,
                health: result.health
            }
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

/**
 * 立即巡检全部启用的模型：与后台定时任务共用同一份逻辑，
 * 便于管理员随时确认各个模型的可用性。
 */
async function checkAllModels(req, res) {
    try {
        const result = await runHealthCheck({ source: 'manual' })
        const message = result.failedCount > 0
            ? `巡检完成：${result.total} 个模型中有 ${result.failedCount} 个不可用`
            : `巡检完成：${result.total} 个模型全部可用`

        return res.json({
            code: 200,
            message,
            data: {
                checkedAt: result.checkedAt,
                total: result.total,
                failedCount: result.failedCount,
                results: result.results.map(item => ({
                    modelId: item.modelId,
                    modelName: item.modelName,
                    ok: item.ok,
                    latencyMs: item.latencyMs,
                    error: item.error
                }))
            }
        })
    } catch (err) {
        console.error('[AI] 模型巡检失败：', err?.message || err)
        return res.status(500).json({ code: 500, message: '模型巡检失败，请稍后重试' })
    }
}

/**
 * 巡检状态：上次巡检时间与各模型最近一次探测时间。
 */
async function getHealthStatus(req, res) {
    try {
        const health = await aiModel.listModelHealth()
        return res.json({
            code: 200,
            message: '获取模型健康状态成功',
            data: {
                lastCheckedAt: getLastCheckedAt(),
                health
            }
        })
    } catch (err) {
        console.error('[AI] 获取模型健康状态失败：', err?.message || err)
        return res.status(500).json({ code: 500, message: '获取模型健康状态失败' })
    }
}

/**
 * 提示词模板列表：返回全部模板（内置 + 自定义）
 * 与各功能当前选用的模板映射，作者在新页面里按功能挑选。
 */
async function getPromptTemplates(req, res) {
    try {
        const [list, bindings] = await Promise.all([
            aiModel.listPromptTemplates(),
            aiModel.listPromptBindings()
        ])
        return res.json({ code: 200, message: '获取提示词模板成功', data: { list, bindings } })
    } catch (err) {
        console.error('[AI] 获取提示词模板失败：', err?.message || err)
        return res.status(500).json({ code: 500, message: '获取提示词模板失败' })
    }
}

/**
 * 新建自定义提示词：必须挂在内置功能下，创建后默认启用。
 */
async function createPromptTemplate(req, res) {
    const featureKey = typeof req.body?.featureKey === 'string' ? req.body.featureKey.trim() : ''
    const name = typeof req.body?.name === 'string' ? req.body.name.trim() : ''
    const description = typeof req.body?.description === 'string' ? req.body.description.trim() : ''
    const content = typeof req.body?.content === 'string' ? req.body.content : ''

    if (!name) {
        return res.status(400).json({ code: 400, message: '请填写提示词名称' })
    }
    if (!content.trim()) {
        return res.status(400).json({ code: 400, message: '提示词内容不能为空' })
    }
    if (content.length > 20000) {
        return res.status(400).json({ code: 400, message: '提示词内容过长' })
    }

    try {
        const created = await aiModel.createPromptTemplate({
            featureKey,
            name: name.slice(0, 64),
            description: description.slice(0, 255),
            content
        })
        if (!created) {
            return res.status(404).json({ code: 404, message: '提示词所属功能不存在' })
        }
        const [list, bindings] = await Promise.all([
            aiModel.listPromptTemplates(),
            aiModel.listPromptBindings()
        ])
        return res.json({ code: 200, message: '自定义提示词已创建', data: { created, list, bindings } })
    } catch (err) {
        console.error('[AI] 创建提示词模板失败：', err?.message || err)
        return res.status(500).json({ code: 500, message: '创建提示词模板失败' })
    }
}

/**
 * 保存提示词模板：内置与自定义模板都走这里；
 * 变量清单跟随所属功能，自定义模板不许改变所属功能。
 */
async function updatePromptTemplate(req, res) {
    const key = typeof req.params.key === 'string' ? req.params.key.trim() : ''
    const content = typeof req.body?.content === 'string' ? req.body.content : ''
    if (!content.trim()) {
        return res.status(400).json({ code: 400, message: '提示词内容不能为空' })
    }
    if (content.length > 20000) {
        return res.status(400).json({ code: 400, message: '提示词内容过长' })
    }

    try {
        const templates = await aiModel.listPromptTemplates()
        const existing = templates.find(item => item.key === key)
        if (!existing) {
            return res.status(404).json({ code: 404, message: '提示词模板不存在' })
        }

        const { getDefaultTemplate } = require('../utils/aiPromptTemplates')
        const feature = getDefaultTemplate(existing.featureKey)
        if (!feature) {
            return res.status(404).json({ code: 404, message: '提示词所属功能不存在' })
        }

        const name = typeof req.body?.name === 'string' && req.body.name.trim()
            ? req.body.name.trim().slice(0, 64)
            : existing.name
        const description = typeof req.body?.description === 'string' && req.body.description.trim()
            ? req.body.description.trim().slice(0, 255)
            : existing.description
    const enabled = req.body?.enabled !== false

        const list = await aiModel.savePromptTemplate(key, {
            name,
            description,
            content,
            variables: feature.variables,
            enabled
        })
        const bindings = await aiModel.listPromptBindings()
        return res.json({ code: 200, message: '提示词模板已保存', data: { list, bindings } })
    } catch (err) {
        console.error('[AI] 保存提示词模板失败：', err?.message || err)
        return res.status(500).json({ code: 500, message: '保存提示词模板失败' })
    }
}

/**
 * 选用模板：把某个功能切换到指定模板，之后该功能调用模型时优先用它。
 */
async function selectPromptTemplate(req, res) {
    const key = typeof req.params.key === 'string' ? req.params.key.trim() : ''
    try {
        const ok = await aiModel.selectPromptTemplate(key)
        if (!ok) {
            return res.status(404).json({ code: 404, message: '提示词模板不存在' })
        }
        const [list, bindings] = await Promise.all([
            aiModel.listPromptTemplates(),
            aiModel.listPromptBindings()
        ])
        return res.json({ code: 200, message: '已切换使用该提示词', data: { list, bindings } })
    } catch (err) {
        console.error('[AI] 选用提示词模板失败：', err?.message || err)
        return res.status(500).json({ code: 500, message: '选用提示词模板失败' })
    }
}

/**
 * 删除自定义提示词：内置模板不可删除。
 */
async function deletePromptTemplate(req, res) {
    const key = typeof req.params.key === 'string' ? req.params.key.trim() : ''
    try {
        const deleted = await aiModel.deletePromptTemplate(key)
        if (deleted === null) {
            return res.status(400).json({ code: 400, message: '内置提示词不能删除，可以恢复默认' })
        }
        if (deleted === false) {
            return res.status(404).json({ code: 404, message: '提示词模板不存在' })
        }
        const [list, bindings] = await Promise.all([
            aiModel.listPromptTemplates(),
            aiModel.listPromptBindings()
        ])
        return res.json({ code: 200, message: '自定义提示词已删除', data: { list, bindings } })
    } catch (err) {
        console.error('[AI] 删除提示词模板失败：', err?.message || err)
        return res.status(500).json({ code: 500, message: '删除提示词模板失败' })
    }
}

/**
 * 恢复默认提示词：把模板内容还原成内置版本。
 */
async function resetPromptTemplate(req, res) {
    const key = typeof req.params.key === 'string' ? req.params.key.trim() : ''
    const { getDefaultTemplate } = require('../utils/aiPromptTemplates')
    if (!getDefaultTemplate(key)) {
        return res.status(404).json({ code: 404, message: '提示词模板不存在' })
    }

    try {
        const list = await aiModel.resetPromptTemplate(key)
        const bindings = await aiModel.listPromptBindings()
        return res.json({ code: 200, message: '已恢复默认提示词', data: { list, bindings } })
    } catch (err) {
        console.error('[AI] 恢复默认提示词失败：', err?.message || err)
        return res.status(500).json({ code: 500, message: '恢复默认提示词失败' })
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
            message: result.created
                ? '环境变量配置已导入为接入模型'
                : '环境变量配置已同步到现有模型（密钥与模型名已更新）',
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
    checkAllModels,
    getHealthStatus,
    getPromptTemplates,
    createPromptTemplate,
    updatePromptTemplate,
    selectPromptTemplate,
    deletePromptTemplate,
    resetPromptTemplate,
    getSettings,
    updateSettings,
    getUsage,
    getUsageStats,
    importFromEnv,
    getMyUsage
}
