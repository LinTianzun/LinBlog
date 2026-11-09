const crypto = require('node:crypto')
const aiClient = require('../utils/aiClient')
const uploadController = require('./uploadController')
const { recordAiCall } = require('../utils/aiUsageLogger')
const aiModel = require('../model/dbModel/ai/index')

/**
 * AI 写作建议：按需生成简介与标签，返回给前端作为建议展示，
 * 作者确认后才填充进表单字段，再走正常的保存流程。
 */
async function suggestArticleMeta(req, res) {
    if (!req.aiModel) {
        return res.status(503).json({
            code: 503,
            message: 'AI 功能未配置，请先在 AI 管理中启用接入模型'
        })
    }

    const title = typeof req.body?.title === 'string' ? req.body.title.trim() : ''
    const content = typeof req.body?.content === 'string' ? req.body.content : ''
    if (!title || !content.trim()) {
        return res.status(400).json({ code: 400, message: '请先填写标题和正文，再获取 AI 建议' })
    }

    try {
        const startedAt = Date.now()
        const suggestion = await aiClient.suggestArticleMeta({
            title,
            content,
            aiConfig: req.aiModel
        })
        await recordAiCall({
            req,
            feature: 'suggest',
            modelName: req.aiModel.model,
            modelId: req.aiModel.id,
            status: 'success',
            detail: '生成文章简介与标签建议',
            durationMs: Date.now() - startedAt,
            usage: suggestion.usage,
            outputChars: (suggestion.summary || '').length
                + (suggestion.labels || []).join(',').length
        })
        return res.json({
            code: 200,
            message: 'AI 建议已生成，请确认后再填充',
            data: suggestion
        })
    } catch (err) {
        if (err?.code === 'AI_NOT_CONFIGURED') {
            return res.status(503).json({ code: 503, message: 'AI 功能未配置' })
        }
        console.error('[AI] 生成建议失败：', err?.message || err)
        return res.status(503).json({ code: 503, message: 'AI 服务暂时不可用，请稍后重试' })
    }
}

/**
 * AI 写作辅助：按需生成润色/精简/扩写/续写文本，返回给前端确认后再写入编辑器。
 */
async function rewriteArticleText(req, res) {
    if (!req.aiModel) {
        return res.status(503).json({
            code: 503,
            message: 'AI 功能未配置，请在服务端设置 LINBLOG_AI_BASE_URL、LINBLOG_AI_API_KEY 与 LINBLOG_AI_MODEL'
        })
    }

    const action = typeof req.body?.action === 'string' ? req.body.action.trim() : ''
    const title = typeof req.body?.title === 'string' ? req.body.title.trim() : ''
    const text = typeof req.body?.text === 'string' ? req.body.text : ''
    if (!['polish', 'shorten', 'expand', 'continue'].includes(action)) {
        return res.status(400).json({ code: 400, message: '不支持的 AI 写作动作' })
    }
    if (!text.trim()) {
        return res.status(400).json({ code: 400, message: '请先选择或填写正文，再使用 AI 写作辅助' })
    }

    try {
        const startedAt = Date.now()
        const suggestion = await aiClient.rewriteText({
            action,
            text,
            title,
            aiConfig: req.aiModel
        })
        await recordAiCall({
            req,
            feature: 'writing',
            modelName: req.aiModel.model,
            modelId: req.aiModel.id,
            status: 'success',
            detail: `AI 写作辅助：${action}`,
            durationMs: Date.now() - startedAt,
            usage: suggestion.usage,
            outputChars: (suggestion.text || '').length
        })
        return res.json({
            code: 200,
            message: 'AI 写作建议已生成，请确认后再写入编辑器',
            data: suggestion
        })
    } catch (err) {
        if (err?.code === 'AI_NOT_CONFIGURED') {
            return res.status(503).json({ code: 503, message: 'AI 功能未配置' })
        }
        if (err?.code === 'AI_INVALID_ACTION') {
            return res.status(400).json({ code: 400, message: '不支持的 AI 写作动作' })
        }
        if (err?.code === 'AI_EMPTY_TEXT') {
            return res.status(400).json({ code: 400, message: '请先选择或填写正文，再使用 AI 写作辅助' })
        }
        console.error('[AI] 生成写作辅助失败：', err?.message || err)
        return res.status(503).json({ code: 503, message: 'AI 服务暂时不可用，请稍后重试' })
    }
}

/**
 * AI 封面建议：生成结果先暂存到数据库并返回 data URI 预览，
 * 作者点「采用」调用 confirm 后才会写入 image 表。
 * 暂存放在库里而不是进程内存，多实例部署时任意实例都能取到候选。
 */
async function generateCover(req, res) {
    if (!req.aiModel) {
        return res.status(503).json({
            code: 503,
            message: 'AI 功能未配置，请在服务端设置 LINBLOG_AI_BASE_URL、LINBLOG_AI_API_KEY 与 LINBLOG_AI_MODEL'
        })
    }

    const title = typeof req.body?.title === 'string' ? req.body.title.trim() : ''
    const introduce = typeof req.body?.introduce === 'string' ? req.body.introduce : ''
    const content = typeof req.body?.content === 'string' ? req.body.content : ''
    if (!title) {
        return res.status(400).json({ code: 400, message: '请先填写标题，再生成 AI 封面' })
    }

    try {
        const startedAt = Date.now()
        const suggestion = await aiClient.generateCoverImage({
            title,
            introduce,
            content,
            aiConfig: req.aiModel
        })
        const token = crypto.randomBytes(24).toString('hex')
        await aiModel.savePendingImage({
            token,
            userId: req.user?.userId,
            feature: 'cover',
            mimeType: suggestion.mimeType,
            buffer: suggestion.buffer
        })
        await recordAiCall({
            req,
            feature: 'cover',
            modelName: req.aiModel.imageModel,
            modelId: req.aiModel.id,
            status: 'success',
            detail: '生成 AI 封面或配图',
            durationMs: Date.now() - startedAt,
            outputChars: suggestion.outputChars || 0
        })
        return res.json({
            code: 200,
            message: 'AI 封面已生成，请确认后再采用',
            data: {
                token,
                dataUri: suggestion.dataUri,
                prompt: suggestion.prompt
            }
        })
    } catch (err) {
        if (err?.code === 'AI_NOT_CONFIGURED') {
            return res.status(503).json({ code: 503, message: 'AI 功能未配置' })
        }
        console.error('[AI] 生成封面失败：', err?.message || err)
        return res.status(503).json({ code: 503, message: 'AI 封面生成失败，请稍后重试' })
    }
}

/**
 * 确认采用 AI 封面：一次性消费暂存 token，并复用上传的持久化路径落库。
 * 令牌与生成者绑定，他人拿不到也用不了别人的候选。
 */
async function confirmCover(req, res) {
    const token = typeof req.body?.token === 'string' ? req.body.token.trim() : ''
    if (!aiClient.isValidCoverToken(token)) {
        return res.status(400).json({ code: 400, message: '封面建议不存在或已过期，请重新生成' })
    }

    const pending = await aiModel.takePendingImage(token, req.user?.userId)
    if (!pending) {
        return res.status(400).json({ code: 400, message: '封面建议不存在或已过期，请重新生成' })
    }

    try {
        const { url } = await uploadController.persistImageBuffer({
            buffer: pending.buffer,
            mimetype: pending.mimeType,
            userId: req.user?.userId
        })
        return res.json({
            code: 200,
            message: 'AI 封面已保存',
            data: { url }
        })
    } catch (err) {
        console.error('[AI] 保存封面失败：', err?.message || err)
        return res.status(500).json({ code: 500, message: 'AI 封面保存失败，请稍后重试' })
    }
}

module.exports = { suggestArticleMeta, rewriteArticleText, generateCover, confirmCover }
