const crypto = require('node:crypto')
const aiClient = require('../utils/aiClient')
const uploadController = require('./uploadController')
const { recordAiCall } = require('../utils/aiUsageLogger')
const aiModel = require('../model/dbModel/ai/index')
const articleModel = require('../model/dbModel/article/index')
const messageModel = require('../model/dbModel/message/index')
const recordModel = require('../model/dbModel/record/index')
const { hasPermission } = require('../utils/accessControl')

/**
 * 门户 AI 问答：访客提问，先检索站内已发布文章，再让模型基于片段作答。
 * 匿名可用，因此不占用后台账号的 AI 次数配额，只走独立的频率限制。
 */
async function answerPublicQuestion(req, res, options = {}) {
    const question = typeof req.body?.question === 'string' ? req.body.question.trim() : ''
    if (!question) {
        return res.status(400).json({ code: 400, message: '请先输入你想问的问题' })
    }
    if (question.length > 200) {
        return res.status(400).json({ code: 400, message: '问题不能超过 200 字' })
    }

    let aiConfig = null
    try {
        aiConfig = options.aiConfig || await aiClient.getActiveAiConfig()
    } catch (err) {
        console.warn('[AI] 读取门户问答模型配置失败：', err?.message || err)
    }
    if (!aiConfig) {
        return res.status(503).json({ code: 503, message: 'AI 问答暂未开启，请稍后再试' })
    }

    try {
        const startedAt = Date.now()
        const candidates = await articleModel.searchPublishedContentForAsk(question, 6)

        if (candidates.length === 0) {
            return res.json({
                code: 200,
                message: '没有找到相关的站内文章',
                data: {
                    answer: '暂时没有在站内文章里找到相关内容。你可以换个说法，或者直接看看文章归档。',
                    sources: [],
                    found: false
                }
            })
        }

        const snippets = candidates.map(item => ({
            id: item.id,
            title: item.title,
            snippet: aiClient.pickRelevantSnippet(item.content, question) || item.introduce || ''
        })).filter(item => item.snippet)

        const result = await aiClient.answerFromPublishedContent({
            question,
            snippets,
            aiConfig
        })

        const answer = result.text
        const sources = snippets
            .map((item, index) => ({ ...item, index: index + 1 }))
            .filter(item => answer.includes(`[${item.index}]`) || answer.includes(`[${item.index}，`))

        await recordAiCall({
            req,
            feature: 'ask',
            modelName: result.modelUsed?.model || aiConfig.model,
            modelId: result.modelUsed?.id ?? aiConfig.id,
            status: 'success',
            detail: result.modelUsed?.degraded
                ? `门户 AI 问答（默认模型不可用，已降级到「${result.modelUsed.name}」）`
                : '门户 AI 问答',
            durationMs: Date.now() - startedAt,
            usage: result.usage,
            outputChars: answer.length
        })

        return res.json({
            code: 200,
            message: '回答已生成',
            data: {
                answer,
                sources,
                found: true
            }
        })
    } catch (err) {
        if (err?.code === 'AI_NOT_CONFIGURED') {
            return res.status(503).json({ code: 503, message: 'AI 问答暂未开启，请稍后再试' })
        }
        console.error('[AI] 门户问答失败：', err?.message || err)
        return res.status(503).json({ code: 503, message: 'AI 问答暂时不可用，请稍后重试' })
    }
}

/**
 * 门户语义搜索：先用 AI 把自然语言查询扩展成关键词，再在已发布内容里加权检索。
 * 与门户问答一样对匿名访客开放，不占用后台账号的 AI 次数配额，
 * 只走独立的频率限制；模型不可用时退化为普通关键词检索。
 */
async function searchPublicContent(req, res, options = {}) {
    const queryText = typeof req.body?.query === 'string' ? req.body.query.trim() : ''
    if (!queryText) {
        return res.status(400).json({ code: 400, message: '请先输入要搜索的内容' })
    }
    if (queryText.length > 100) {
        return res.status(400).json({ code: 400, message: '搜索内容不能超过 100 字' })
    }

    let aiConfig = null
    try {
        aiConfig = options.aiConfig || await aiClient.getActiveAiConfig()
    } catch (err) {
        console.warn('[AI] 读取语义搜索模型配置失败：', err?.message || err)
    }

    const startedAt = Date.now()
    const terms = [queryText]
    let degraded = false
    let modelName = ''

    if (aiConfig) {
        try {
            const expansion = await aiClient.expandSearchQuery({ query: queryText, aiConfig })
            for (const term of expansion.terms || []) {
                if (!terms.includes(term)) terms.push(term)
            }
            degraded = Boolean(expansion.modelUsed?.degraded)
            modelName = expansion.modelUsed?.name || ''
            await recordAiCall({
                req,
                feature: 'search',
                modelName: expansion.modelUsed?.model || aiConfig.model,
                modelId: expansion.modelUsed?.id ?? aiConfig.id,
                status: 'success',
                detail: degraded
                    ? `语义搜索关键词扩展（默认模型不可用，已降级到「${expansion.modelUsed.name}」）`
                    : '语义搜索关键词扩展',
                durationMs: Date.now() - startedAt,
                usage: expansion.usage,
                outputChars: (expansion.terms || []).join('').length
            })
        } catch (err) {
            // 扩展失败不阻塞搜索：直接按原关键词检索即可
            console.warn('[AI] 语义搜索关键词扩展失败：', err?.message || err)
        }
    }

    try {
        const list = await articleModel.searchPublishedContentByTerms(terms, 20)
        return res.json({
            code: 200,
            message: list.length > 0 ? '查询成功' : '没有找到相关内容',
            data: {
                query: queryText,
                terms: terms.slice(1),
                list,
                total: list.length,
                semantic: aiConfig !== null,
                degraded,
                modelName
            }
        })
    } catch (err) {
        console.error('[AI] 语义搜索失败：', err?.message || err)
        return res.status(500).json({ code: 500, message: '语义搜索失败，请稍后重试' })
    }
}

/**
 * AI 私信拟回复：读取当前账号与对方的最近对话，生成候选回复话术。
 * 只作建议：作者点「采用」后才会写进输入框，发送动作仍由作者自己完成。
 */
async function suggestMessageReply(req, res, options = {}) {
    if (!req.aiModel) {
        return res.status(503).json({
            code: 503,
            message: 'AI 功能未配置，请先在 AI 管理中启用接入模型'
        })
    }
    if (!hasPermission(req.user, 'message.private')) {
        return res.status(403).json({ code: 403, message: '当前账号没有回复私信的权限' })
    }

    const targetUserId = Number(req.body?.targetUserId)
    if (!Number.isSafeInteger(targetUserId) || targetUserId <= 0) {
        return res.status(400).json({ code: 400, message: '请先选择要回复的会话' })
    }
    const tone = typeof req.body?.tone === 'string' ? req.body.tone.trim() : ''
    const currentUserId = Number(req.user?.userId)

    try {
        const history = await messageModel.getRecentPrivateMessages(currentUserId, targetUserId, 10)
        if (!history.length) {
            return res.status(400).json({ code: 400, message: '这个会话还没有消息，无法生成回复建议' })
        }

        const peer = history.find(item => Number(item.senderId) !== currentUserId)
        const startedAt = Date.now()
        const suggestion = await aiClient.suggestMessageReplies({
            peerName: peer?.senderName || '',
            history,
            tone,
            aiConfig: req.aiModel
        })

        await recordAiCall({
            req,
            feature: 'message',
            modelName: suggestion.modelUsed?.model || req.aiModel.model,
            modelId: suggestion.modelUsed?.id ?? req.aiModel.id,
            status: 'success',
            detail: suggestion.modelUsed?.degraded
                ? `生成私信回复建议（默认模型不可用，已降级到「${suggestion.modelUsed.name}」）`
                : '生成私信回复建议',
            durationMs: Date.now() - startedAt,
            usage: suggestion.usage,
            outputChars: suggestion.replies.join('').length
        })

        return res.json({
            code: 200,
            message: '回复建议已生成，请确认后再使用',
            data: {
                replies: suggestion.replies,
                degraded: Boolean(suggestion.modelUsed?.degraded),
                modelName: suggestion.modelUsed?.name || ''
            }
        })
    } catch (err) {
        if (err?.code === 'AI_NOT_CONFIGURED') {
            return res.status(503).json({ code: 503, message: 'AI 功能未配置' })
        }
        if (err?.code === 'AI_EMPTY_CONTEXT') {
            return res.status(400).json({ code: 400, message: '这个会话还没有消息，无法生成回复建议' })
        }
        if (err?.code === 'AI_PARSE_ERROR') {
            return res.status(503).json({ code: 503, message: 'AI 没有返回可用的回复建议，请稍后重试' })
        }
        console.error('[AI] 生成私信回复建议失败：', err?.message || err)
        return res.status(503).json({ code: 503, message: 'AI 服务暂时不可用，请稍后重试' })
    }
}

/**
 * AI 运营周报：先从数据库取一周统计，再让模型组织成文字报告。
 * 报告只是给作者参考的建议，不会自动发布或修改任何内容。
 */
async function generateOperationsReport(req, res, options = {}) {
    if (!req.aiModel) {
        return res.status(503).json({
            code: 503,
            message: 'AI 功能未配置，请先在 AI 管理中启用接入模型'
        })
    }
    if (!hasPermission(req.user, 'overview.viewAll')) {
        return res.status(403).json({ code: 403, message: '当前账号没有查看全站运营数据的权限' })
    }

    const days = Math.min(Math.max(Number(req.body?.days) || 7, 1), 30)

    try {
        const startedAt = Date.now()
        const [summary, usage] = await Promise.all([
            recordModel.getOperationsSummary(days),
            aiModel.getUsageSummary()
        ])

        // getUsageSummary 返回固定三个时间窗口，按周报周期挑最接近的一个
        const usageWindow = days <= 7
            ? usage.last7Days
            : (days <= 30 ? usage.last30Days : usage.all)

        const report = await aiClient.generateOperationsReport({
            summary,
            aiUsage: {
                total: usageWindow?.total || 0,
                successRate: usageWindow?.successRate || 0,
                avgDurationMs: usageWindow?.avgDurationMs || 0
            },
            aiConfig: req.aiModel
        })

        await recordAiCall({
            req,
            feature: 'report',
            modelName: report.modelUsed?.model || req.aiModel.model,
            modelId: report.modelUsed?.id ?? req.aiModel.id,
            status: 'success',
            detail: report.modelUsed?.degraded
                ? `生成运营周报（默认模型不可用，已降级到「${report.modelUsed.name}」）`
                : '生成运营周报',
            durationMs: Date.now() - startedAt,
            usage: report.usage,
            outputChars: report.sections.reduce((total, item) => total + item.content.length, 0)
        })

        return res.json({
            code: 200,
            message: '运营周报已生成',
            data: {
                days,
                sections: report.sections,
                summary,
                degraded: Boolean(report.modelUsed?.degraded),
                modelName: report.modelUsed?.name || ''
            }
        })
    } catch (err) {
        if (err?.code === 'AI_NOT_CONFIGURED') {
            return res.status(503).json({ code: 503, message: 'AI 功能未配置' })
        }
        if (err?.code === 'AI_PARSE_ERROR') {
            return res.status(503).json({ code: 503, message: 'AI 没有返回可用的周报，请稍后重试' })
        }
        console.error('[AI] 生成运营周报失败：', err?.message || err)
        return res.status(503).json({ code: 503, message: 'AI 服务暂时不可用，请稍后重试' })
    }
}
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
            modelName: suggestion.modelUsed?.model || req.aiModel.model,
            modelId: suggestion.modelUsed?.id ?? req.aiModel.id,
            status: 'success',
            detail: suggestion.modelUsed?.degraded
                ? `生成文章简介与标签建议（默认模型不可用，已降级到「${suggestion.modelUsed.name}」）`
                : '生成文章简介与标签建议',
            durationMs: Date.now() - startedAt,
            usage: suggestion.usage,
            outputChars: (suggestion.summary || '').length
                + (suggestion.labels || []).join(',').length
        })
        return res.json({
            code: 200,
            message: 'AI 建议已生成，请确认后再填充',
            data: {
                summary: suggestion.summary,
                labels: suggestion.labels,
                degraded: Boolean(suggestion.modelUsed?.degraded),
                modelName: suggestion.modelUsed?.name || ''
            }
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
 * AI 图库策展：基于当前标题、简介、照片数量与作者补充主题生成候选信息。
 * 返回的标题、简介与标签都只作为建议，作者逐项采用后走正常保存流程。
 */
async function suggestGalleryCuration(req, res) {
    if (!req.aiModel) {
        return res.status(503).json({
            code: 503,
            message: 'AI 功能未配置，请先在 AI 管理中启用接入模型'
        })
    }

    const title = typeof req.body?.title === 'string' ? req.body.title.trim() : ''
    const introduce = typeof req.body?.introduce === 'string' ? req.body.introduce.trim() : ''
    const theme = typeof req.body?.theme === 'string' ? req.body.theme.trim() : ''
    const photoCount = Number(req.body?.photoCount)
    const validPhotoCount = Number.isInteger(photoCount) && photoCount >= 0 && photoCount <= 20 ? photoCount : 0
    if (!title && !introduce && !theme) {
        return res.status(400).json({
            code: 400,
            message: '请先填写标题、简介或补充主题，再获取 AI 策展建议'
        })
    }

    try {
        const startedAt = Date.now()
        const suggestion = await aiClient.suggestGalleryCuration({
            title,
            introduce,
            theme,
            photoCount: validPhotoCount,
            aiConfig: req.aiModel
        })
        await recordAiCall({
            req,
            feature: 'gallery',
            modelName: suggestion.modelUsed?.model || req.aiModel.model,
            modelId: suggestion.modelUsed?.id ?? req.aiModel.id,
            status: 'success',
            detail: suggestion.modelUsed?.degraded
                ? `生成图库策展建议（默认模型不可用，已降级到「${suggestion.modelUsed.name}」）`
                : '生成图库策展建议',
            durationMs: Date.now() - startedAt,
            usage: suggestion.usage,
            outputChars: suggestion.titles.join('').length
                + suggestion.summary.length
                + suggestion.labels.join('').length
        })
        return res.json({
            code: 200,
            message: 'AI 策展建议已生成，请确认后再填充',
            data: {
                titles: suggestion.titles,
                summary: suggestion.summary,
                labels: suggestion.labels,
                degraded: Boolean(suggestion.modelUsed?.degraded),
                modelName: suggestion.modelUsed?.name || ''
            }
        })
    } catch (err) {
        if (err?.code === 'AI_NOT_CONFIGURED') {
            return res.status(503).json({ code: 503, message: 'AI 功能未配置' })
        }
        if (err?.code === 'AI_PARSE_ERROR') {
            return res.status(503).json({ code: 503, message: 'AI 没有返回可用的策展建议，请稍后重试' })
        }
        console.error('[AI] 生成图库策展建议失败：', err?.message || err)
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
            modelName: suggestion.modelUsed?.model || req.aiModel.model,
            modelId: suggestion.modelUsed?.id ?? req.aiModel.id,
            status: 'success',
            detail: suggestion.modelUsed?.degraded
                ? `AI 写作辅助：${action}（默认模型不可用，已降级到「${suggestion.modelUsed.name}」）`
                : `AI 写作辅助：${action}`,
            durationMs: Date.now() - startedAt,
            usage: suggestion.usage,
            outputChars: (suggestion.text || '').length
        })
        return res.json({
            code: 200,
            message: 'AI 写作建议已生成，请确认后再写入编辑器',
            data: {
                action: suggestion.action,
                text: suggestion.text,
                degraded: Boolean(suggestion.modelUsed?.degraded),
                modelName: suggestion.modelUsed?.name || ''
            }
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
            modelName: suggestion.modelUsed?.aiConfig?.imageModel || req.aiModel.imageModel,
            modelId: suggestion.modelUsed?.id ?? req.aiModel.id,
            status: 'success',
            detail: suggestion.modelUsed?.degraded
                ? `生成 AI 封面或配图（默认模型不可用，已降级到「${suggestion.modelUsed.name}」）`
                : '生成 AI 封面或配图',
            durationMs: Date.now() - startedAt,
            outputChars: suggestion.outputChars || 0
        })
        return res.json({
            code: 200,
            message: 'AI 封面已生成，请确认后再采用',
            data: {
                token,
                dataUri: suggestion.dataUri,
                prompt: suggestion.prompt,
                degraded: Boolean(suggestion.modelUsed?.degraded),
                modelName: suggestion.modelUsed?.name || ''
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

module.exports = {
    suggestArticleMeta,
    suggestGalleryCuration,
    rewriteArticleText,
    generateCover,
    confirmCover,
    answerPublicQuestion,
    searchPublicContent,
    suggestMessageReply,
    generateOperationsReport
}
