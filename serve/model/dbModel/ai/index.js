const { query } = require('../../db/dbnew')
const { encryptSecret, decryptSecret, maskSecret } = require('../../../utils/secretBox')
const { guessProviderLabel } = require('../../../utils/aiProvider')

const MODEL_FIELDS = `
    id, name, provider, base_url, api_key, chat_model, image_model,
    image_size, timeout_ms, enabled, is_default, remark, created_at, updated_at
`

function normalizeModelRow(row) {
    if (!row) return null

    let apiKey = ''
    try {
        apiKey = decryptSecret(row.api_key)
    } catch {
        // 密钥损坏时只提示，不把密文或异常内容返回给前端
        apiKey = ''
    }

    return {
        id: Number(row.id),
        name: String(row.name || ''),
        provider: String(row.provider || 'openai'),
        baseUrl: String(row.base_url || ''),
        apiKeyMasked: maskSecret(apiKey),
        chatModel: String(row.chat_model || ''),
        imageModel: String(row.image_model || ''),
        imageSize: String(row.image_size || '1344x768'),
        timeoutMs: Number(row.timeout_ms) || 20000,
        enabled: Number(row.enabled) === 1,
        isDefault: Number(row.is_default) === 1,
        remark: row.remark ? String(row.remark) : '',
        createdAt: row.created_at,
        updatedAt: row.updated_at
    }
}

function listModels() {
    return query(
        `SELECT ${MODEL_FIELDS} FROM ai_model ORDER BY is_default DESC, id ASC`
    ).then(rows => (rows || []).map(normalizeModelRow))
}

function findModelById(id) {
    return query(
        `SELECT ${MODEL_FIELDS} FROM ai_model WHERE id = ? LIMIT 1`,
        [id]
    ).then(rows => normalizeModelRow(rows?.[0]))
}

/**
 * 当前生效的模型配置：优先默认模型，其次第一个启用模型。
 * 密钥在这里才解密，调用方拿到的是可直接用于请求的明文配置。
 */
async function getActiveModelConfig() {
    const rows = await query(
        `SELECT ${MODEL_FIELDS} FROM ai_model
         WHERE enabled = 1
         ORDER BY is_default DESC, id ASC
         LIMIT 1`
    )
    const row = rows?.[0]
    if (!row) return null

    return {
        id: Number(row.id),
        name: String(row.name || ''),
        provider: String(row.provider || 'openai'),
        baseUrl: String(row.base_url || '').replace(/\/+$/, ''),
        apiKey: decryptSecret(row.api_key),
        chatModel: String(row.chat_model || ''),
        imageModel: String(row.image_model || ''),
        imageSize: String(row.image_size || '1344x768'),
        timeoutMs: Number(row.timeout_ms) || 20000
    }
}

/**
 * 把环境变量里的 AI 配置导入成可管理的模型记录。
 * 已有同地址同模型的记录时只更新密钥与参数，不重复插入。
 */
async function importEnvModel() {
    const config = require('../../../config/default')
    if (!config.ai) {
        return { imported: false, reason: '环境变量未配置 AI（需要 LINBLOG_AI_BASE_URL / LINBLOG_AI_API_KEY / LINBLOG_AI_MODEL）' }
    }

    const rows = await query(
        `SELECT id FROM ai_model WHERE base_url = ? AND chat_model = ? LIMIT 1`,
        [config.ai.baseUrl, config.ai.model]
    )
    const existingId = rows?.[0]?.id

    const payload = {
        name: guessProviderLabel(config.ai.baseUrl, config.ai.model),
        provider: 'openai',
        baseUrl: config.ai.baseUrl,
        apiKey: config.ai.apiKey,
        chatModel: config.ai.model,
        imageModel: config.ai.imageModel,
        imageSize: config.ai.imageSize,
        timeoutMs: config.ai.timeoutMs,
        enabled: true,
        isDefault: true,
        remark: '由环境变量 LINBLOG_AI_* 导入，可在后台继续维护'
    }

    if (existingId) {
        const updated = await updateModel(Number(existingId), payload)
        return { imported: true, created: false, model: updated }
    }

    const created = await createModel(payload)
    return { imported: true, created: true, model: created }
}

/**
 * 指定模型的完整配置（含明文密钥），用于连通性测试这类
 * 需要真实发起请求、但不一定命中默认模型的场景。
 */
async function getModelConfigById(id) {
    const rows = await query(
        `SELECT ${MODEL_FIELDS} FROM ai_model WHERE id = ? LIMIT 1`,
        [id]
    )
    const row = rows?.[0]
    if (!row) return null

    return {
        id: Number(row.id),
        name: String(row.name || ''),
        provider: String(row.provider || 'openai'),
        baseUrl: String(row.base_url || '').replace(/\/+$/, ''),
        apiKey: decryptSecret(row.api_key),
        chatModel: String(row.chat_model || ''),
        imageModel: String(row.image_model || ''),
        imageSize: String(row.image_size || '1344x768'),
        timeoutMs: Number(row.timeout_ms) || 20000
    }
}

async function createModel(payload) {
    const result = await query(
        `INSERT INTO ai_model
            (name, provider, base_url, api_key, chat_model, image_model,
             image_size, timeout_ms, enabled, is_default, remark)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
            payload.name,
            payload.provider || 'openai',
            payload.baseUrl,
            encryptSecret(payload.apiKey),
            payload.chatModel || '',
            payload.imageModel || '',
            payload.imageSize || '1344x768',
            payload.timeoutMs || 20000,
            payload.enabled ? 1 : 0,
            payload.isDefault ? 1 : 0,
            payload.remark || null
        ]
    )

    const modelId = Number(result.insertId)
    if (payload.isDefault) {
        await clearOtherDefaults(modelId)
    }
    return findModelById(modelId)
}

async function updateModel(id, payload) {
    const fields = []
    const values = []

    if (payload.name !== undefined) {
        fields.push('name = ?')
        values.push(payload.name)
    }
    if (payload.provider !== undefined) {
        fields.push('provider = ?')
        values.push(payload.provider)
    }
    if (payload.baseUrl !== undefined) {
        fields.push('base_url = ?')
        values.push(payload.baseUrl)
    }
    if (payload.apiKey) {
        fields.push('api_key = ?')
        values.push(encryptSecret(payload.apiKey))
    }
    if (payload.chatModel !== undefined) {
        fields.push('chat_model = ?')
        values.push(payload.chatModel)
    }
    if (payload.imageModel !== undefined) {
        fields.push('image_model = ?')
        values.push(payload.imageModel)
    }
    if (payload.imageSize !== undefined) {
        fields.push('image_size = ?')
        values.push(payload.imageSize)
    }
    if (payload.timeoutMs !== undefined) {
        fields.push('timeout_ms = ?')
        values.push(payload.timeoutMs)
    }
    if (payload.enabled !== undefined) {
        fields.push('enabled = ?')
        values.push(payload.enabled ? 1 : 0)
    }
    if (payload.isDefault !== undefined) {
        fields.push('is_default = ?')
        values.push(payload.isDefault ? 1 : 0)
    }
    if (payload.remark !== undefined) {
        fields.push('remark = ?')
        values.push(payload.remark || null)
    }

    if (fields.length > 0) {
        values.push(id)
        await query(`UPDATE ai_model SET ${fields.join(', ')} WHERE id = ?`, values)
    }

    if (payload.isDefault) {
        await clearOtherDefaults(Number(id))
    }
    return findModelById(id)
}

async function clearOtherDefaults(keepId) {
    await query('UPDATE ai_model SET is_default = 0 WHERE id != ?', [keepId])
}

async function deleteModel(id) {
    const result = await query('DELETE FROM ai_model WHERE id = ?', [id])
    return Number(result.affectedRows) > 0
}

async function getSettings() {
    const rows = await query('SELECT * FROM ai_setting WHERE id = 1 LIMIT 1')
    const row = rows?.[0]
    if (!row) {
        return {
            quotaEnabled: true,
            dailyLimitPerUser: 20,
            monthlyLimitPerUser: 100,
            superAdminUnlimited: true
        }
    }

    return {
        quotaEnabled: Number(row.quota_enabled) === 1,
        dailyLimitPerUser: Number(row.daily_limit_per_user),
        monthlyLimitPerUser: Number(row.monthly_limit_per_user),
        superAdminUnlimited: Number(row.super_admin_unlimited) === 1
    }
}

async function updateSettings(payload) {
    await query(
        `INSERT INTO ai_setting
            (id, quota_enabled, daily_limit_per_user, monthly_limit_per_user, super_admin_unlimited)
         VALUES (1, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE
            quota_enabled = VALUES(quota_enabled),
            daily_limit_per_user = VALUES(daily_limit_per_user),
            monthly_limit_per_user = VALUES(monthly_limit_per_user),
            super_admin_unlimited = VALUES(super_admin_unlimited)`,
        [
            payload.quotaEnabled ? 1 : 0,
            payload.dailyLimitPerUser,
            payload.monthlyLimitPerUser,
            payload.superAdminUnlimited ? 1 : 0
        ]
    )
    return getSettings()
}

/**
 * 统计用户在指定时间窗内的 AI 调用次数（只统计成功与失败的模型调用）。
 */
async function countUsage(userId, since) {
    const rows = await query(
        `SELECT COUNT(*) AS total FROM ai_usage_log
         WHERE user_id = ?
           AND created_at >= ?
           AND status IN ('success', 'failed')`,
        [userId, since]
    )
    return Number(rows?.[0]?.total || 0)
}

async function logUsage({ userId, feature, modelName = null, status = 'success', detail = null }) {
    await query(
        `INSERT INTO ai_usage_log (user_id, feature, model_name, status, detail)
         VALUES (?, ?, ?, ?, ?)`,
        [userId, feature, modelName, status, detail ? String(detail).slice(0, 255) : null]
    )
}

async function listUsage(limit = 50) {
    const rows = await query(
        `SELECT l.id, l.user_id, u.username, l.feature, l.model_name, l.status, l.detail, l.created_at
         FROM ai_usage_log l
         LEFT JOIN users u ON l.user_id = u.id
         ORDER BY l.id DESC
         LIMIT ?`,
        [limit]
    )
    return (rows || []).map(row => ({
        id: Number(row.id),
        userId: Number(row.user_id),
        username: row.username ? String(row.username) : '',
        feature: String(row.feature || ''),
        modelName: row.model_name ? String(row.model_name) : '',
        status: String(row.status || ''),
        detail: row.detail ? String(row.detail) : '',
        createdAt: row.created_at
    }))
}

/**
 * 当前用户自己的用量概览（今日/本月剩余次数）。
 */
async function getUserUsage(userId) {
    const now = new Date()
    const dayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)

    const [daily, monthly] = await Promise.all([
        countUsage(userId, dayStart),
        countUsage(userId, monthStart)
    ])

    return { daily, monthly }
}

module.exports = {
    listModels,
    findModelById,
    getActiveModelConfig,
    getModelConfigById,
    importEnvModel,
    createModel,
    updateModel,
    deleteModel,
    getSettings,
    updateSettings,
    countUsage,
    logUsage,
    listUsage,
    getUserUsage
}
