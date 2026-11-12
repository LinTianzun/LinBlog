const aiModel = require('../model/dbModel/ai/index')
const { writeSystemLog } = require('./logHelper')
const { notifySuperAdmin } = require('./notificationHelper')
const { sendAlertMail } = require('./mailer')

// 巡检间隔默认 30 分钟：既能及时发现模型故障，又不会频繁打扰服务商
const DEFAULT_INTERVAL_MS = 30 * 60 * 1000
// 连续失败达到该次数才写系统日志告警，避免偶发网络抖动刷屏
const ALERT_FAILURE_THRESHOLD = 3

// 最近一次巡检的完成时间（ISO），供后台展示「上次巡检时间」
let lastCheckedAt = null

function getLastCheckedAt() {
    return lastCheckedAt
}

/**
 * 探测单个模型的连通性，并写入健康状态。
 * 手动「连通性测试」与定时巡检共用这一份逻辑，保证口径一致。
 */
async function probeModel(model, { recordHealth = true } = {}) {
    const startedAt = Date.now()
    const baseUrl = String(model.baseUrl || '').replace(/\/+$/, '')
    const timeoutMs = Number(model.timeoutMs) || 20000
    const chatModel = model.chatModel || model.model || ''

    try {
        const response = await fetch(`${baseUrl}/chat/completions`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${model.apiKey}`
            },
            body: JSON.stringify({
                model: chatModel,
                messages: [{ role: 'user', content: 'ping' }],
                max_tokens: 1
            }),
            signal: AbortSignal.timeout(timeoutMs)
        })
        const latencyMs = Date.now() - startedAt

        if (!response.ok) {
            const reason = `服务返回 HTTP ${response.status}`
            const health = recordHealth
                ? await aiModel.recordModelHealth(model.id, { ok: false, latencyMs, error: reason })
                : null
            return { ok: false, status: response.status, latencyMs, error: reason, health }
        }

        const health = recordHealth
            ? await aiModel.recordModelHealth(model.id, { ok: true, latencyMs })
            : null
        return { ok: true, latencyMs, health }
    } catch (err) {
        const reason = err?.message || '无法连接到模型服务'
        let health = null
        if (recordHealth) {
            try {
                health = await aiModel.recordModelHealth(model.id, { ok: false, error: reason })
            } catch (recordError) {
                console.warn('[AI] 记录模型健康状态失败：', recordError?.message || recordError)
            }
        }
        return { ok: false, latencyMs: Date.now() - startedAt, error: reason, health }
    }
}

/**
 * 巡检全部启用的模型：把每个模型的健康状态刷新一遍。
 * 只在连续失败达到阈值时写系统日志告警。
 */
async function runHealthCheck({ models = null, source = 'manual' } = {}) {
    const list = models || await aiModel.listEnabledModelConfigs()
    const enabled = (list || []).filter(model => (
        model.enabled === undefined || Number(model.enabled) === 1 || model.enabled === true
    ))
    const results = []

    for (const model of enabled) {
        const result = await probeModel(model)
        results.push({
            modelId: Number(model.id),
            modelName: model.name,
            ok: result.ok,
            status: result.status,
            latencyMs: result.latencyMs,
            error: result.error || '',
            health: result.health
        })

        const failures = Number(result.health?.consecutiveFailures || 0)
        if (!result.ok && failures === ALERT_FAILURE_THRESHOLD) {
            const detail = `模型「${model.name}」巡检连续失败 ${failures} 次：${result.error || '未知原因'}`
            writeSystemLog({
                userId: null,
                action: 'ai',
                module: 'ai',
                targetType: 'model',
                targetId: model.id,
                detail
            })

            try {
                await notifySuperAdmin({ content: detail })
            } catch (notifyError) {
                console.warn('[AI] 发送模型健康站内通知失败：', notifyError?.message || notifyError)
            }

            const alertRecipient = process.env.LINBLOG_AI_ALERT_EMAIL
            if (alertRecipient) {
                try {
                    await sendAlertMail({
                        to: alertRecipient,
                        subject: `LinBlog AI 模型健康告警：${model.name}`,
                        text: detail,
                    })
                } catch (mailError) {
                    console.warn('[AI] 发送模型健康告警邮件失败：', mailError?.message || mailError)
                }
            }
        }
    }

    lastCheckedAt = new Date().toISOString()

    const failed = results.filter(item => !item.ok)
    if (failed.length > 0) {
        console.warn(
            `[AI] 模型巡检（${source}）：${failed.length}/${results.length} 个模型不可用（${failed.map(item => item.modelName).join('、')}）`
        )
    }

    return {
        checkedAt: lastCheckedAt,
        total: results.length,
        failedCount: failed.length,
        results
    }
}

/**
 * 定时巡检调度器：周期性地主动探测模型健康状态。
 * 单实例部署即可；多实例部署会重复探测，但健康表写入是幂等的。
 */
function startAiHealthCheck({ intervalMs = DEFAULT_INTERVAL_MS, runOnceAtStart = true } = {}) {
    let running = false
    let stopped = false
    let timer = null

    const tick = async () => {
        if (running || stopped) return
        running = true
        try {
            await runHealthCheck({ source: 'scheduled' })
        } catch (err) {
            console.error('[AI] 模型健康巡检失败：', err?.message || err)
        } finally {
            running = false
        }
    }

    timer = setInterval(() => void tick(), intervalMs)
    timer.unref?.()
    if (runOnceAtStart) void tick()

    return {
        stop() {
            stopped = true
            if (timer) clearInterval(timer)
            timer = null
        },
        runOnce: tick
    }
}

module.exports = {
    probeModel,
    runHealthCheck,
    startAiHealthCheck,
    getLastCheckedAt,
    DEFAULT_INTERVAL_MS,
    ALERT_FAILURE_THRESHOLD
}
