const { query } = require('../../db/dbnew')
const { encryptSecret, decryptSecret, maskSecret } = require('../../../utils/secretBox')
const { guessProviderLabel } = require('../../../utils/aiProvider')

// 待确认图片的暂存上限与有效期：与内存方案保持同一口径
const PENDING_IMAGE_TTL_MINUTES = 10
const MAX_PENDING_IMAGES = 20

const MODEL_FIELDS = `
    id, name, provider, base_url, api_key, chat_model, image_model,
    image_size, timeout_ms, daily_limit_per_user, monthly_limit_per_user,
    enabled, is_default, remark, created_at, updated_at
`

// 与 ai_model_health 做联表时必须限定表名：两张表都有 updated_at，
// 不加前缀 MySQL 会报 "Column 'updated_at' in field list is ambiguous"。
const MODEL_FIELDS_JOINED = `
    m.id, m.name, m.provider, m.base_url, m.api_key, m.chat_model, m.image_model,
    m.image_size, m.timeout_ms, m.daily_limit_per_user, m.monthly_limit_per_user,
    m.enabled, m.is_default, m.remark, m.created_at, m.updated_at
`

const HEALTH_FIELDS = `
    last_test_at, last_success_at, last_latency_ms, avg_latency_ms,
    test_count, success_count, consecutive_failures, last_error
`

function normalizeHealthRow(row) {
    if (!row) {
        return {
            lastTestAt: null,
            lastSuccessAt: null,
            lastLatencyMs: 0,
            avgLatencyMs: 0,
            testCount: 0,
            successCount: 0,
            successRate: 0,
            consecutiveFailures: 0,
            lastError: ''
        }
    }

    const testCount = Number(row.test_count) || 0
    const successCount = Number(row.success_count) || 0
    return {
        lastTestAt: toIsoString(row.last_test_at),
        lastSuccessAt: toIsoString(row.last_success_at),
        lastLatencyMs: Number(row.last_latency_ms) || 0,
        avgLatencyMs: Number(row.avg_latency_ms) || 0,
        testCount,
        successCount,
        successRate: testCount > 0 ? Math.round((successCount / testCount) * 1000) / 10 : 0,
        consecutiveFailures: Number(row.consecutive_failures) || 0,
        lastError: row.last_error ? String(row.last_error) : ''
    }
}

/**
 * 把数据库里的 DATETIME 统一转成 ISO（UTC）字符串。
 * mysql2 按进程时区解析 DATETIME，直接透传会让前端按访客本地时区解读时出现时差。
 */
function toIsoString(value) {
    if (!value) return null
    if (value instanceof Date) {
        return Number.isNaN(value.getTime()) ? null : value.toISOString()
    }
    const text = String(value).trim()
    if (!text) return null
    // DATETIME 形如 "2026-11-09 13:14:00"，按进程本地时区解析后再转 UTC
    const date = new Date(text.includes('T') ? text : text.replace(' ', 'T'))
    return Number.isNaN(date.getTime()) ? null : date.toISOString()
}

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
        dailyLimitPerUser: Number(row.daily_limit_per_user) || 0,
        monthlyLimitPerUser: Number(row.monthly_limit_per_user) || 0,
        enabled: Number(row.enabled) === 1,
        isDefault: Number(row.is_default) === 1,
        remark: row.remark ? String(row.remark) : '',
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        health: normalizeHealthRow(row)
    }
}

function listModels() {
    return query(
        `SELECT m.id, m.name, m.provider, m.base_url, m.api_key, m.chat_model, m.image_model,
                m.image_size, m.timeout_ms, m.daily_limit_per_user, m.monthly_limit_per_user,
                m.enabled, m.is_default, m.remark,
                m.created_at, m.updated_at,
                h.last_test_at, h.last_success_at, h.last_latency_ms, h.avg_latency_ms,
                h.test_count, h.success_count, h.consecutive_failures, h.last_error
         FROM ai_model m
         LEFT JOIN ai_model_health h ON h.model_id = m.id
         ORDER BY m.is_default DESC, m.id ASC`
    ).then(rows => (rows || []).map(normalizeModelRow))
}

function findModelById(id) {
    return query(
        `SELECT m.id, m.name, m.provider, m.base_url, m.api_key, m.chat_model, m.image_model,
                m.image_size, m.timeout_ms, m.daily_limit_per_user, m.monthly_limit_per_user,
                m.enabled, m.is_default, m.remark,
                m.created_at, m.updated_at,
                h.last_test_at, h.last_success_at, h.last_latency_ms, h.avg_latency_ms,
                h.test_count, h.success_count, h.consecutive_failures, h.last_error
         FROM ai_model m
         LEFT JOIN ai_model_health h ON h.model_id = m.id
         WHERE m.id = ? LIMIT 1`,
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
        timeoutMs: Number(row.timeout_ms) || 20000,
        dailyLimitPerUser: Number(row.daily_limit_per_user) || 0,
        monthlyLimitPerUser: Number(row.monthly_limit_per_user) || 0
    }
}

/**
 * 列出可用于降级的候选模型（启用状态，按健康度排序）。
 * 默认模型优先，其后按「连续失败次数少、平均耗时长」的顺序排列，
 * 让调用方在首选模型故障时可以退到更稳的模型。
 */
async function listFallbackModelConfigs(limit = 3, queryFn = query) {
    const rows = await queryFn(
        `SELECT ${MODEL_FIELDS_JOINED},
                COALESCE(h.consecutive_failures, 0) AS consecutive_failures,
                COALESCE(h.avg_latency_ms, 0) AS avg_latency_ms
         FROM ai_model m
         LEFT JOIN ai_model_health h ON h.model_id = m.id
         WHERE m.enabled = 1 AND m.chat_model != ''
         ORDER BY m.is_default DESC,
                  COALESCE(h.consecutive_failures, 0) ASC,
                  COALESCE(h.avg_latency_ms, 0) ASC,
                  m.id ASC
         LIMIT ?`,
        [Math.min(Math.max(Number(limit) || 3, 1), 10)]
    )

    return (rows || []).map(row => ({
        id: Number(row.id),
        name: String(row.name || ''),
        baseUrl: String(row.base_url || '').replace(/\/+$/, ''),
        apiKey: decryptSecret(row.api_key),
        chatModel: String(row.chat_model || ''),
        imageModel: String(row.image_model || ''),
        imageSize: String(row.image_size || '1344x768'),
        timeoutMs: Number(row.timeout_ms) || 20000,
        consecutiveFailures: Number(row.consecutive_failures) || 0
    }))
}

/**
 * 把环境变量里的 AI 配置导入成可管理的模型记录。
 * 已有同地址同模型的记录时只更新密钥与参数，不重复插入。
 */
async function importEnvModel({
    queryFn = query,
    createFn = createModel,
    updateFn = updateModel
} = {}) {
    const config = require('../../../config/default')
    if (!config.ai) {
        return { imported: false, reason: '环境变量未配置 AI（需要 LINBLOG_AI_BASE_URL / LINBLOG_AI_API_KEY / LINBLOG_AI_MODEL）' }
    }

    const anyModelRows = await queryFn('SELECT id FROM ai_model LIMIT 1')
    const isFirstModel = (anyModelRows?.length || 0) === 0
    const envRows = await queryFn(
        `SELECT id, chat_model, image_model FROM ai_model WHERE base_url = ?`,
        [config.ai.baseUrl, config.ai.model]
    )
    const matched = (envRows || []).find(row =>
        String(row.chat_model || '') === config.ai.model
        || (config.ai.imageModel && String(row.image_model || '') === config.ai.imageModel)
    )
    const existingId = matched?.id

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
        isDefault: isFirstModel,
        remark: '由环境变量 LINBLOG_AI_* 导入，可在后台继续维护'
    }

    if (existingId) {
        // 已存在的模型只同步「连接信息」：密钥、地址与模型名。
        // 作者在后台改过的名称、启停、默认标记与备注都保留，避免导入把配置冲掉。
        const updated = await updateFn(Number(existingId), {
            provider: payload.provider,
            baseUrl: payload.baseUrl,
            apiKey: payload.apiKey,
            chatModel: payload.chatModel,
            imageModel: payload.imageModel,
            imageSize: payload.imageSize,
            timeoutMs: payload.timeoutMs
        })
        return { imported: true, created: false, model: updated }
    }

    const created = await createFn(payload)
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
        timeoutMs: Number(row.timeout_ms) || 20000,
        dailyLimitPerUser: Number(row.daily_limit_per_user) || 0,
        monthlyLimitPerUser: Number(row.monthly_limit_per_user) || 0,
        enabled: Number(row.enabled) === 1
    }
}

/**
 * 全部启用模型的连接配置（含明文密钥）。
 * 定时巡检要逐个探测，所以这里返回的是可直接发起请求的配置，
 * 只在服务端内部使用，接口层不会把它透给前端。
 */
async function listEnabledModelConfigs() {
    const rows = await query(
        `SELECT ${MODEL_FIELDS} FROM ai_model
         WHERE enabled = 1
         ORDER BY is_default DESC, id ASC`
    )

    return (rows || []).map(row => {
        let apiKey = ''
        try {
            apiKey = decryptSecret(row.api_key)
        } catch {
            // 密钥损坏时按空密钥处理，探测会失败并记录原因
            apiKey = ''
        }

        return {
            id: Number(row.id),
            name: String(row.name || ''),
            baseUrl: String(row.base_url || '').replace(/\/+$/, ''),
            apiKey,
            chatModel: String(row.chat_model || ''),
            timeoutMs: Number(row.timeout_ms) || 20000
        }
    })
}

/**
 * 读取全部提示词模板（按模板标识排序）。
 * 未在数据库中配置的模板会以内置默认内容补齐，保证后台看到的是完整列表。
 */
async function listPromptTemplates() {
    const { listDefaultTemplates } = require('../../../utils/aiPromptTemplates')
    const rows = await query(
        'SELECT id, template_key, feature_key, name, description, content, variables, enabled, is_default, updated_at FROM ai_prompt_template ORDER BY id ASC'
    )

    const stored = new Map((rows || []).map(row => [String(row.template_key), row]))
    const defaults = listDefaultTemplates()

    // 数据库里没有的模板用内置默认值补齐，管理员一眼就能看到还有哪些可配
    const merged = defaults.map(item => {
        const row = stored.get(item.key)
        if (!row) {
            return {
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
            }
        }

        const content = String(row.content || '')
        return {
            id: Number(row.id),
            key: String(row.template_key),
            featureKey: String(row.feature_key || row.template_key),
            name: String(row.name || item.name),
            description: row.description ? String(row.description) : item.description,
            content,
            variables: row.variables ? String(row.variables) : item.variables,
            enabled: Number(row.enabled) === 1,
            isDefault: Number(row.is_default) === 1,
            customized: content.trim() !== item.content.trim(),
            updatedAt: row.updated_at
        }
    })

    // 数据库里存在但内置没有的模板（历史版本遗留）也一并返回
    for (const row of rows || []) {
        const key = String(row.template_key)
        if (merged.some(item => item.key === key)) continue
        merged.push({
            id: Number(row.id),
            key,
            featureKey: String(row.feature_key || key),
            name: String(row.name || key),
            description: row.description ? String(row.description) : '',
            content: String(row.content || ''),
            variables: row.variables ? String(row.variables) : '',
            enabled: Number(row.enabled) === 1,
            isDefault: Number(row.is_default) === 1,
            customized: true,
            updatedAt: row.updated_at
        })
    }

    return merged
}

/**
 * 各功能当前选用的模板：featureKey → templateKey。
 * 没有绑定的功能走内置默认提示词。
 */
async function listPromptBindings() {
    const rows = await query('SELECT feature_key, template_key FROM ai_prompt_binding')
    const bindings = {}
    for (const row of rows || []) {
        bindings[String(row.feature_key)] = String(row.template_key)
    }
    return bindings
}

/**
 * 创建自定义提示词：挂在某个内置功能下，生成唯一模板标识。
 * 内容可以随便写，但功能范围必须来自内置清单，避免出现无法被调用的模板。
 */
async function createPromptTemplate({ featureKey, name, description, content }) {
    const { getDefaultTemplate } = require('../../../utils/aiPromptTemplates')
    const feature = getDefaultTemplate(featureKey)
    if (!feature) return null

    const key = `custom_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`
    await query(
        `INSERT INTO ai_prompt_template
            (template_key, feature_key, name, description, content, variables, enabled, is_default)
         VALUES (?, ?, ?, ?, ?, ?, 1, 0)`,
        [key, featureKey, name, description || null, content, feature.variables]
    )

    const rows = await query('SELECT id, template_key, feature_key, name, description, content, variables, enabled, is_default, updated_at FROM ai_prompt_template WHERE template_key = ? LIMIT 1', [key])
    const row = rows?.[0]
    if (!row) return null
    return {
        id: Number(row.id),
        key: String(row.template_key),
        featureKey: String(row.feature_key),
        name: String(row.name),
        description: row.description ? String(row.description) : '',
        content: String(row.content),
        variables: String(row.variables || ''),
        enabled: true,
        isDefault: false,
        customized: true,
        updatedAt: row.updated_at
    }
}

/**
 * 删除自定义提示词：内置模板不可删除；
 * 有功能正在选用它时，选用关系一并解除（回退到内置默认）。
 */
async function deletePromptTemplate(key) {
    const rows = await query(
        'SELECT id, is_default FROM ai_prompt_template WHERE template_key = ? LIMIT 1',
        [key]
    )
    const row = rows?.[0]
    if (!row) return false
    if (Number(row.is_default) === 1) return null

    await query('DELETE FROM ai_prompt_template WHERE id = ?', [Number(row.id)])
    await query('DELETE FROM ai_prompt_binding WHERE template_key = ?', [key])
    return true
}

/**
 * 选用模板：把某个功能切换到指定模板。
 * 模板停用后解析层会自动回退内置默认，不需要在这里额外校验 enabled。
 */
async function selectPromptTemplate(key) {
    let rows = await query(
        'SELECT template_key, feature_key FROM ai_prompt_template WHERE template_key = ? LIMIT 1',
        [key]
    )
    let row = rows?.[0]
    if (!row) {
        // 内置模板在存量库里可能还没有行（后来新增的功能），
        // 这时补一条默认记录，功能才能被正常选用
        const { getDefaultTemplate } = require('../../../utils/aiPromptTemplates')
        const fallback = getDefaultTemplate(key)
        if (!fallback) return false
        await query(
            `INSERT INTO ai_prompt_template
                (template_key, feature_key, name, description, content, variables, enabled, is_default)
             VALUES (?, ?, ?, ?, ?, ?, 1, 1)
             ON DUPLICATE KEY UPDATE template_key = VALUES(template_key)`,
            [fallback.key, fallback.key, fallback.name, fallback.description, fallback.content, fallback.variables]
        )
        rows = await query(
            'SELECT template_key, feature_key FROM ai_prompt_template WHERE template_key = ? LIMIT 1',
            [key]
        )
        row = rows?.[0]
    }
    if (!row) return false

    await query(
        `INSERT INTO ai_prompt_binding (feature_key, template_key)
         VALUES (?, ?)
         ON DUPLICATE KEY UPDATE template_key = VALUES(template_key)`,
        [String(row.feature_key), String(row.template_key)]
    )
    return true
}

/**
 * 读取单个启用中的模板内容：查不到或被停用时返回 null，
 * 由调用方回退到内置默认提示词。
 */
async function getEnabledPromptTemplate(key, queryFn = query) {
    // 先看该功能选用了哪个模板；绑定指向停用或已删除的模板时自动失效
    const bound = await queryFn(
        `SELECT t.content
         FROM ai_prompt_binding b
         JOIN ai_prompt_template t ON t.template_key = b.template_key
         WHERE b.feature_key = ? AND t.enabled = 1
         LIMIT 1`,
        [key]
    )
    const boundContent = bound?.[0]?.content
    if (boundContent) return String(boundContent)

    // 没绑定或绑定失效：回退到内置模板（启用中的那份）
    const rows = await queryFn(
        'SELECT content FROM ai_prompt_template WHERE template_key = ? AND enabled = 1 LIMIT 1',
        [key]
    )
    const content = rows?.[0]?.content
    return content ? String(content) : null
}

/**
 * 保存提示词模板：存在则更新，不存在则插入。
 */
async function savePromptTemplate(key, { name, description, content, variables, enabled }) {
    const existing = await query(
        'SELECT id FROM ai_prompt_template WHERE template_key = ? LIMIT 1',
        [key]
    )

    if (existing?.[0]?.id) {
        await query(
            'UPDATE ai_prompt_template SET name = ?, description = ?, content = ?, variables = ?, enabled = ? WHERE id = ?',
            [name, description || null, content, variables || null, enabled ? 1 : 0, Number(existing[0].id)]
        )
    } else {
        await query(
            'INSERT INTO ai_prompt_template (template_key, feature_key, name, description, content, variables, enabled, is_default) VALUES (?, ?, ?, ?, ?, ?, ?, 0)',
            [key, key, name, description || null, content, variables || null, enabled ? 1 : 0]
        )
    }

    return listPromptTemplates()
}

/**
 * 把模板恢复成内置默认内容。
 */
async function resetPromptTemplate(key) {
    const { getDefaultTemplate } = require('../../../utils/aiPromptTemplates')
    const fallback = getDefaultTemplate(key)
    if (!fallback) return null

    const existing = await query(
        'SELECT id FROM ai_prompt_template WHERE template_key = ? LIMIT 1',
        [key]
    )

    if (existing?.[0]?.id) {
        await query(
            'UPDATE ai_prompt_template SET name = ?, description = ?, content = ?, variables = ?, enabled = 1, is_default = 1, feature_key = ? WHERE id = ?',
            [fallback.name, fallback.description, fallback.content, fallback.variables, fallback.key, Number(existing[0].id)]
        )
    } else {
        await query(
            'INSERT INTO ai_prompt_template (template_key, feature_key, name, description, content, variables, enabled, is_default) VALUES (?, ?, ?, ?, ?, ?, 1, 1)',
            [fallback.key, fallback.key, fallback.name, fallback.description, fallback.content, fallback.variables]
        )
    }

    return listPromptTemplates()
}

async function createModel(payload) {
    const result = await query(
        `INSERT INTO ai_model
            (name, provider, base_url, api_key, chat_model, image_model,
             image_size, timeout_ms, daily_limit_per_user, monthly_limit_per_user,
             enabled, is_default, remark)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
            payload.name,
            payload.provider || 'openai',
            payload.baseUrl,
            encryptSecret(payload.apiKey),
            payload.chatModel || '',
            payload.imageModel || '',
            payload.imageSize || '1344x768',
            payload.timeoutMs || 20000,
            payload.dailyLimitPerUser || 0,
            payload.monthlyLimitPerUser || 0,
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
    if (payload.dailyLimitPerUser !== undefined) {
        fields.push('daily_limit_per_user = ?')
        values.push(payload.dailyLimitPerUser)
    }
    if (payload.monthlyLimitPerUser !== undefined) {
        fields.push('monthly_limit_per_user = ?')
        values.push(payload.monthlyLimitPerUser)
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

/**
 * 记录一次连通性测试的结果：耗时、成功率与连续失败次数都会滚动更新。
 */
async function recordModelHealth(modelId, { ok, latencyMs = 0, error = null }, queryFn = query) {
    const rows = await queryFn(
        `SELECT test_count, success_count, avg_latency_ms, consecutive_failures, last_success_at
         FROM ai_model_health WHERE model_id = ? LIMIT 1`,
        [modelId]
    )
    const previous = rows?.[0]

    const testCount = (Number(previous?.test_count) || 0) + 1
    const successCount = (Number(previous?.success_count) || 0) + (ok ? 1 : 0)
    const previousAvg = Number(previous?.avg_latency_ms) || 0
    const previousSuccess = Number(previous?.success_count) || 0
    // 平均耗时按「含本次」的成功次数重算，失败样本不参与均值
    const avgLatencyMs = ok && latencyMs > 0
        ? Math.round((previousAvg * previousSuccess + latencyMs) / (previousSuccess + 1))
        : previousAvg
    const consecutiveFailures = ok ? 0 : (Number(previous?.consecutive_failures) || 0) + 1
    // 用 ISO（UTC）回传时间点，前端才能按访客本地时区显示
    const testedAt = new Date().toISOString()
    const lastSuccessAt = ok
        ? testedAt
        : toIsoString(previous?.last_success_at)

    await queryFn(
        `INSERT INTO ai_model_health
            (model_id, last_test_at, last_success_at, last_latency_ms, avg_latency_ms,
             test_count, success_count, consecutive_failures, last_error)
         VALUES (?, NOW(), ?, ?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE
            last_test_at = NOW(),
            last_success_at = VALUES(last_success_at),
            last_latency_ms = VALUES(last_latency_ms),
            avg_latency_ms = VALUES(avg_latency_ms),
            test_count = VALUES(test_count),
            success_count = VALUES(success_count),
            consecutive_failures = VALUES(consecutive_failures),
            last_error = VALUES(last_error)`,
        [
            modelId,
            ok ? new Date() : null,
            Math.max(0, Math.round(Number(latencyMs) || 0)),
            avgLatencyMs,
            testCount,
            successCount,
            consecutiveFailures,
            error ? String(error).slice(0, 255) : null
        ]
    )

    return {
        testCount,
        successCount,
        successRate: testCount > 0 ? Math.round((successCount / testCount) * 1000) / 10 : 0,
        lastLatencyMs: Math.max(0, Math.round(Number(latencyMs) || 0)),
        avgLatencyMs,
        consecutiveFailures,
        lastError: error ? String(error).slice(0, 255) : '',
        lastTestAt: testedAt,
        lastSuccessAt
    }
}

/**
 * 模型的健康快照列表，供后台展示「谁在变慢、谁在反复失败」。
 */
async function listModelHealth() {
    const rows = await query(
        `SELECT h.model_id, h.last_test_at, h.last_success_at, h.last_latency_ms,
                h.avg_latency_ms, h.test_count, h.success_count,
                h.consecutive_failures, h.last_error, m.name, m.enabled
         FROM ai_model_health h
         JOIN ai_model m ON m.id = h.model_id
         ORDER BY h.consecutive_failures DESC, h.avg_latency_ms DESC`
    )

    return (rows || []).map(row => ({
        modelId: Number(row.model_id),
        modelName: String(row.name || ''),
        enabled: Number(row.enabled) === 1,
        ...normalizeHealthRow(row)
    }))
}
async function getSettings() {
    const rows = await query('SELECT * FROM ai_setting WHERE id = 1 LIMIT 1')
    const row = rows?.[0]
    if (!row) {
        return {
            quotaEnabled: true,
            dailyLimitPerUser: 20,
            monthlyLimitPerUser: 100,
            superAdminUnlimited: true,
            removeWatermark: true,
            watermarkMode: 'crop',
            chatModelId: null,
            imageModelId: null
        }
    }

    return {
        quotaEnabled: Number(row.quota_enabled) === 1,
        dailyLimitPerUser: Number(row.daily_limit_per_user),
        monthlyLimitPerUser: Number(row.monthly_limit_per_user),
        superAdminUnlimited: Number(row.super_admin_unlimited) === 1,
        removeWatermark: Number(row.remove_watermark) === 1,
        watermarkMode: String(row.watermark_mode || 'crop'),
        chatModelId: row.chat_model_id == null ? null : Number(row.chat_model_id),
        imageModelId: row.image_model_id == null ? null : Number(row.image_model_id)
    }
}

async function updateSettings(payload) {
    await query(
        `INSERT INTO ai_setting
            (id, quota_enabled, daily_limit_per_user, monthly_limit_per_user, super_admin_unlimited,
             remove_watermark, watermark_mode, chat_model_id, image_model_id)
         VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE
            quota_enabled = VALUES(quota_enabled),
            daily_limit_per_user = VALUES(daily_limit_per_user),
            monthly_limit_per_user = VALUES(monthly_limit_per_user),
            super_admin_unlimited = VALUES(super_admin_unlimited),
            remove_watermark = VALUES(remove_watermark),
            watermark_mode = VALUES(watermark_mode),
            chat_model_id = VALUES(chat_model_id),
            image_model_id = VALUES(image_model_id)`,
        [
            payload.quotaEnabled ? 1 : 0,
            payload.dailyLimitPerUser,
            payload.monthlyLimitPerUser,
            payload.superAdminUnlimited ? 1 : 0,
            payload.removeWatermark ? 1 : 0,
            payload.watermarkMode,
            payload.chatModelId || null,
            payload.imageModelId || null
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

/**
 * 统计用户在指定时间窗内对某个模型的调用次数。
 * 模型级限额用它判断「这个用户把这个模型用超了没有」。
 */
async function countUsageByModel(userId, modelId, since) {
    const rows = await query(
        `SELECT COUNT(*) AS total FROM ai_usage_log
         WHERE user_id = ?
           AND model_id = ?
           AND created_at >= ?
           AND status IN ('success', 'failed')`,
        [userId, modelId, since]
    )
    return Number(rows?.[0]?.total || 0)
}

async function logUsage({
    userId,
    feature,
    modelName = null,
    modelId = null,
    status = 'success',
    detail = null,
    durationMs = 0,
    promptTokens = 0,
    completionTokens = 0,
    outputChars = 0
}) {
    await query(
        `INSERT INTO ai_usage_log
            (user_id, feature, model_name, model_id, status, detail,
             duration_ms, prompt_tokens, completion_tokens, output_chars)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
            userId,
            feature,
            modelName,
            modelId,
            status,
            detail ? String(detail).slice(0, 255) : null,
            Math.max(0, Math.round(Number(durationMs) || 0)),
            Math.max(0, Math.round(Number(promptTokens) || 0)),
            Math.max(0, Math.round(Number(completionTokens) || 0)),
            Math.max(0, Math.round(Number(outputChars) || 0))
        ]
    )
}

async function listUsage(limit = 50) {
    const rows = await query(
        `SELECT l.id, l.user_id, u.username, l.feature, l.model_name, l.model_id, l.status, l.detail,
                l.duration_ms, l.prompt_tokens, l.completion_tokens, l.output_chars, l.created_at
         FROM ai_usage_log l
         LEFT JOIN users u ON l.user_id = u.id
         ORDER BY l.id DESC
         LIMIT ?`,
        [limit]
    )
    return (rows || []).map(row => ({
        id: Number(row.id),
        userId: Number(row.user_id),
        // 门户问答与语义搜索允许匿名访问，用 0 占位；
        // 列表里要显示成「匿名访客」而不是「已注销」
        username: Number(row.user_id) === 0
            ? '匿名访客'
            : (row.username ? String(row.username) : '（已注销）'),
        feature: String(row.feature || ''),
        modelName: row.model_name ? String(row.model_name) : '',
        modelId: row.model_id ? Number(row.model_id) : null,
        status: String(row.status || ''),
        detail: row.detail ? String(row.detail) : '',
        durationMs: Number(row.duration_ms) || 0,
        promptTokens: Number(row.prompt_tokens) || 0,
        completionTokens: Number(row.completion_tokens) || 0,
        outputChars: Number(row.output_chars) || 0,
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

/**
 * 暂存一张待确认的 AI 图片。
 * 候选图片入库而不是留在进程内存里，多实例部署时任意实例都能取到，
 * 令牌与用户绑定，避免他人拿别人的令牌顶替采用。
 */
async function savePendingImage({ token, userId, feature = 'cover', mimeType, buffer }) {
    await query(
        `INSERT INTO ai_pending_image
            (token, user_id, feature, mime_type, size, data, expires_at)
         VALUES (?, ?, ?, ?, ?, ?, DATE_ADD(NOW(), INTERVAL ? MINUTE))`,
        [token, userId, feature, mimeType, buffer.length, buffer, PENDING_IMAGE_TTL_MINUTES]
    )
    await prunePendingImages()
    return { token, expiresInMinutes: PENDING_IMAGE_TTL_MINUTES }
}

/**
 * 一次性取出待确认图片：令牌有效且属于当前用户时返回图片并立即删除。
 * 过期、未知或他人令牌都返回 null。
 */
async function takePendingImage(token, userId) {
    const rows = await query(
        `SELECT id, mime_type, data FROM ai_pending_image
         WHERE token = ? AND user_id = ? AND expires_at > NOW()
         LIMIT 1`,
        [token, userId]
    )
    const row = rows?.[0]
    if (!row) return null

    // 删除成功才算消费成功，避免并发下同一张图被采用两次
    const result = await query('DELETE FROM ai_pending_image WHERE id = ?', [row.id])
    if (Number(result.affectedRows) === 0) return null

    return {
        mimeType: String(row.mime_type || ''),
        buffer: Buffer.isBuffer(row.data) ? row.data : Buffer.from(row.data)
    }
}

/**
 * 清理过期候选，并把暂存数量控制在上限内。
 */
async function prunePendingImages() {
    await query('DELETE FROM ai_pending_image WHERE expires_at <= NOW()')
    await query(
        `DELETE FROM ai_pending_image
         WHERE id NOT IN (
            SELECT id FROM (
                SELECT id FROM ai_pending_image ORDER BY id DESC LIMIT ?
            ) AS keep_rows
         )`,
        [MAX_PENDING_IMAGES]
    )
}

/**
 * 待确认图片的暂存统计，用于后台观测占用情况。
 */
async function getPendingImageStats() {
    const rows = await query(
        `SELECT COUNT(*) AS total,
                COALESCE(SUM(size), 0) AS bytes,
                SUM(CASE WHEN expires_at <= NOW() THEN 1 ELSE 0 END) AS expired
         FROM ai_pending_image`
    )
    const row = rows?.[0]
    return {
        total: Number(row?.total || 0),
        bytes: Number(row?.bytes || 0),
        expired: Number(row?.expired || 0)
    }
}

/**
 * 用量总览：调用次数、成功率、平均耗时、token 与输出规模。
 * 按「所有时间 / 近 7 天 / 近 30 天」三个窗口给出对比。
 */
async function getUsageSummary() {
    const windows = [
        { key: 'all', days: 0 },
        { key: 'last7Days', days: 7 },
        { key: 'last30Days', days: 30 }
    ]

    const result = {}
    for (const window of windows) {
        const since = window.days > 0
            ? new Date(Date.now() - window.days * 24 * 60 * 60 * 1000)
            : null
        const sinceClause = since ? 'AND created_at >= ?' : ''

        const rows = await query(
            `SELECT COUNT(*) AS total,
                    SUM(CASE WHEN status = 'success' THEN 1 ELSE 0 END) AS success,
                    SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) AS failed,
                    SUM(CASE WHEN status = 'denied' THEN 1 ELSE 0 END) AS denied,
                    COALESCE(AVG(NULLIF(duration_ms, 0)), 0) AS avg_duration,
                    COALESCE(SUM(prompt_tokens), 0) AS prompt_tokens,
                    COALESCE(SUM(completion_tokens), 0) AS completion_tokens,
                    COALESCE(SUM(output_chars), 0) AS output_chars
             FROM ai_usage_log
             WHERE 1 = 1 ${sinceClause}`,
            since ? [since] : []
        )

        const row = rows?.[0] || {}
        const total = Number(row.total || 0)
        const success = Number(row.success || 0)
        const promptTokens = Number(row.prompt_tokens || 0)
        const completionTokens = Number(row.completion_tokens || 0)
        result[window.key] = {
            total,
            success,
            failed: Number(row.failed || 0),
            denied: Number(row.denied || 0),
            successRate: total > 0 ? Math.round((success / total) * 1000) / 10 : 0,
            avgDurationMs: Math.round(Number(row.avg_duration) || 0),
            promptTokens,
            completionTokens,
            totalTokens: promptTokens + completionTokens,
            outputChars: Number(row.output_chars || 0)
        }
    }

    return result
}

/**
 * 按模型维度汇总用量，用于看清哪个模型消耗最多、成功率如何。
 */
async function getUsageByModel(days = 30) {
    const since = new Date(Date.now() - Math.max(1, days) * 24 * 60 * 60 * 1000)
    const rows = await query(
        `SELECT COALESCE(model_name, '') AS model_name,
                COUNT(*) AS total,
                SUM(CASE WHEN status = 'success' THEN 1 ELSE 0 END) AS success,
                COALESCE(AVG(NULLIF(duration_ms, 0)), 0) AS avg_duration,
                COALESCE(SUM(prompt_tokens), 0) AS prompt_tokens,
                COALESCE(SUM(completion_tokens), 0) AS completion_tokens
         FROM ai_usage_log
         WHERE created_at >= ?
         GROUP BY model_name
         ORDER BY total DESC`,
        [since]
    )

    return (rows || []).map(row => {
        const total = Number(row.total || 0)
        const success = Number(row.success || 0)
        return {
            modelName: String(row.model_name || ''),
            total,
            success,
            successRate: total > 0 ? Math.round((success / total) * 1000) / 10 : 0,
            avgDurationMs: Math.round(Number(row.avg_duration) || 0),
            promptTokens: Number(row.prompt_tokens || 0),
            completionTokens: Number(row.completion_tokens || 0)
        }
    })
}

/**
 * 按功能维度汇总用量（写作建议 / 写作辅助 / 配图）。
 */
async function getUsageByFeature(days = 30) {
    const since = new Date(Date.now() - Math.max(1, days) * 24 * 60 * 60 * 1000)
    const rows = await query(
        `SELECT feature,
                COUNT(*) AS total,
                SUM(CASE WHEN status = 'success' THEN 1 ELSE 0 END) AS success,
                COALESCE(AVG(NULLIF(duration_ms, 0)), 0) AS avg_duration
         FROM ai_usage_log
         WHERE created_at >= ?
         GROUP BY feature
         ORDER BY total DESC`,
        [since]
    )

    return (rows || []).map(row => {
        const total = Number(row.total || 0)
        const success = Number(row.success || 0)
        return {
            feature: String(row.feature || ''),
            total,
            success,
            successRate: total > 0 ? Math.round((success / total) * 1000) / 10 : 0,
            avgDurationMs: Math.round(Number(row.avg_duration) || 0)
        }
    })
}

/**
 * 最近若干天的每日调用量，用于画趋势。
 */
async function getUsageTrend(days = 14) {
    const span = Math.min(Math.max(Number(days) || 14, 1), 90)
    const since = new Date(Date.now() - (span - 1) * 24 * 60 * 60 * 1000)
    since.setHours(0, 0, 0, 0)

    const rows = await query(
        `SELECT DATE(created_at) AS day,
                COUNT(*) AS total,
                SUM(CASE WHEN status = 'success' THEN 1 ELSE 0 END) AS success,
                COALESCE(SUM(prompt_tokens + completion_tokens), 0) AS tokens
         FROM ai_usage_log
         WHERE created_at >= ?
         GROUP BY DATE(created_at)
         ORDER BY day ASC`,
        [since]
    )

    const byDay = new Map(
        (rows || []).map(row => [String(row.day).slice(0, 10), {
            total: Number(row.total || 0),
            success: Number(row.success || 0),
            tokens: Number(row.tokens || 0)
        }])
    )

    const trend = []
    for (let index = 0; index < span; index += 1) {
        const day = new Date(since.getTime() + index * 24 * 60 * 60 * 1000)
        const key = day.toISOString().slice(0, 10)
        const entry = byDay.get(key) || { total: 0, success: 0, tokens: 0 }
        trend.push({ day: key, ...entry })
    }
    return trend
}

module.exports = {
    listModels,
    findModelById,
    getActiveModelConfig,
    listFallbackModelConfigs,
    getModelConfigById,
    listEnabledModelConfigs,
    listPromptBindings,
    createPromptTemplate,
    deletePromptTemplate,
    selectPromptTemplate,
    listPromptTemplates,
    getEnabledPromptTemplate,
    savePromptTemplate,
    resetPromptTemplate,
    importEnvModel,
    createModel,
    updateModel,
    deleteModel,
    recordModelHealth,
    listModelHealth,
    getSettings,
    updateSettings,
    countUsage,
    countUsageByModel,
    logUsage,
    listUsage,
    getUserUsage,
    savePendingImage,
    takePendingImage,
    prunePendingImages,
    getPendingImageStats,
    getUsageSummary,
    getUsageByModel,
    getUsageByFeature,
    getUsageTrend,
    PENDING_IMAGE_TTL_MINUTES
}
