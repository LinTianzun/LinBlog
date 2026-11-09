const aiClient = require('../utils/aiClient')
const aiModel = require('../model/dbModel/ai/index')
const { hasPermission } = require('../utils/accessControl')
const { recordAiCall } = require('../utils/aiUsageLogger')

/**
 * AI 调用配额守卫：校验 ai.use 权限，并检查每日/每月次数上限。
 * feature 是审计记录里的功能标识（suggest/writing/cover），由路由按调用类型传入。
 */
function aiQuota(feature) {
    return async function aiQuotaMiddleware(req, res, next) {
        if (!hasPermission(req.user, 'ai.use')) {
            return res.status(403).json({
                code: 403,
                message: '当前账号没有使用 AI 能力的权限'
            })
        }

        try {
            const activeModel = await aiClient.getActiveAiConfig()
            if (!activeModel) {
                return res.status(503).json({
                    code: 503,
                    message: 'AI 功能未配置，请先在 AI 管理中启用接入模型'
                })
            }

            // 把生效的运行时配置交给控制器，控制器不再自己判断是否配置
            req.aiModel = activeModel

            const settings = await aiModel.getSettings()
            const isSuperAdmin = Boolean(req.user?.isSuperAdmin || req.user?.is_super_admin)
            const superAdminExempt = settings.superAdminUnlimited && isSuperAdmin

            if (!settings.quotaEnabled || superAdminExempt) {
                return next()
            }

            const usage = await aiModel.getUserUsage(req.user.userId)
            const dailyLimited = settings.dailyLimitPerUser > 0
                && usage.daily >= settings.dailyLimitPerUser
            const monthlyLimited = settings.monthlyLimitPerUser > 0
                && usage.monthly >= settings.monthlyLimitPerUser

            if (dailyLimited || monthlyLimited) {
                const scope = dailyLimited ? '每日' : '每月'
                const limit = dailyLimited ? settings.dailyLimitPerUser : settings.monthlyLimitPerUser
                await recordAiCall({
                    req,
                    feature,
                    modelName: activeModel.model,
                    status: 'denied',
                    detail: `${scope}次数已达上限（${limit}）`
                })
                return res.status(429).json({
                    code: 429,
                    message: `当前账号的 AI 使用次数已达${scope}上限（${limit} 次），请稍后再试`
                })
            }

            // 模型级限额：给单个模型设更严的上限时，以模型维度再判一次
            const modelLimit = await checkModelQuota(req.user.userId, activeModel)
            if (modelLimit) {
                await recordAiCall({
                    req,
                    feature,
                    modelName: activeModel.model,
                    modelId: activeModel.id,
                    status: 'denied',
                    detail: `${modelLimit.scope}模型次数已达上限（${modelLimit.limit}）`
                })
                return res.status(429).json({
                    code: 429,
                    message: `当前账号对该模型的调用次数已达${modelLimit.scope}上限（${modelLimit.limit} 次），请稍后再试`
                })
            }

            return next()
        } catch (err) {
            console.error('[AI] 用量检查失败：', err)
            return res.status(503).json({
                code: 503,
                message: 'AI 用量服务暂时不可用，请稍后重试'
            })
        }
    }
}

/**
 * 模型级限额判定：模型没配限额、或调用发生在环境变量回退场景时直接放行。
 */
async function checkModelQuota(userId, activeModel) {
    const modelId = activeModel?.id
    if (!modelId) return null

    const dailyLimit = Number(activeModel.dailyLimitPerUser) || 0
    const monthlyLimit = Number(activeModel.monthlyLimitPerUser) || 0
    if (dailyLimit <= 0 && monthlyLimit <= 0) return null

    const now = new Date()
    const dayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)

    if (dailyLimit > 0) {
        const used = await aiModel.countUsageByModel(userId, modelId, dayStart)
        if (used >= dailyLimit) return { scope: '每日', limit: dailyLimit }
    }

    if (monthlyLimit > 0) {
        const used = await aiModel.countUsageByModel(userId, modelId, monthStart)
        if (used >= monthlyLimit) return { scope: '每月', limit: monthlyLimit }
    }

    return null
}

module.exports = { aiQuota, checkModelQuota }
