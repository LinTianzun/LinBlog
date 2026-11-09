const aiModel = require('../model/dbModel/ai/index')
const systemLogModel = require('../model/dbModel/systemLog/index')

async function recordAiCall({
    req,
    feature,
    modelName = null,
    modelId = null,
    status = 'success',
    detail = null,
    durationMs = 0,
    usage = null,
    outputChars = 0
}) {
    const userId = req?.user?.userId || null
    const ip = req?.ip || null
    const logDetail = detail ? `[${feature}] ${detail}` : `[${feature}] ${status}`

    // 审计写入失败不应该影响 AI 结果返回：调用方只关心建议本身
    try {
        await aiModel.logUsage({
            // 门户问答与语义搜索允许匿名访问，没有登录用户；
            // 用 0 占位以满足 user_id 非空约束，统计时按「匿名」处理
            userId: userId ?? 0,
            feature,
            modelName,
            modelId,
            status,
            detail,
            durationMs,
            promptTokens: usage?.promptTokens || 0,
            completionTokens: usage?.completionTokens || 0,
            outputChars
        })
    } catch (err) {
        console.warn('[AI] 写入调用记录失败：', err?.message || err)
    }

    try {
        await systemLogModel.insertLog({
            userId,
            action: 'ai',
            module: 'ai',
            // target_id 是整型外键，功能名（suggest/ask 等）只能放进详情，
            // 否则 MySQL 会因类型不匹配直接拒写这条日志
            targetType: 'feature',
            targetId: null,
            detail: logDetail.slice(0, 500),
            ip
        })
    } catch (err) {
        console.warn('[AI] 写入系统日志失败：', err?.message || err)
    }
}

module.exports = { recordAiCall }
