const crypto = require('node:crypto')
const config = require('../config/default')
const aiModel = require('../model/dbModel/ai/index')
const { getDefaultTemplate, renderTemplate } = require('./aiPromptTemplates')

// 单次请求携带的正文上限：超长正文先截断，避免打爆上下文与 token 费用
const MAX_CONTENT_CHARS = 4000
const MAX_WRITING_CHARS = 2000
const MAX_OUTPUT_CHARS = 2000
// 简介字段本身上限 512，建议值再收紧到 200，保证「建议」足够精炼
const MAX_SUMMARY_CHARS = 200
const MAX_LABELS = 5
const WRITING_ACTIONS = new Set(['polish', 'shorten', 'expand', 'continue'])
const MAX_COVER_IMAGE_BYTES = 8 * 1024 * 1024
const COVER_MIME_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp'])
const MAX_GALLERY_TITLE_CHARS = 100
const MAX_GALLERY_INTRO_CHARS = 300
const MAX_SEARCH_TERMS = 6
const MAX_SEARCH_TERM_CHARS = 20
const MAX_REPLY_CHARS = 300
const MAX_REPLY_CANDIDATES = 2
const MAX_REPORT_SECTIONS = 4
const REPORT_REASON_VALUES = ['spam', 'abuse', 'porn', 'illegal', 'misinformation', 'other']
const REPORT_ACTIONS = ['process', 'dismiss', 'warn']
const MAX_REPORT_NOTE_CHARS = 200

async function getActiveAiConfig() {
    const dbModel = await aiModel.getActiveModelConfig()
    if (dbModel && dbModel.chatModel) {
        return {
            id: dbModel.id,
            name: dbModel.name,
            baseUrl: dbModel.baseUrl,
            apiKey: dbModel.apiKey,
            model: dbModel.chatModel,
            imageModel: dbModel.imageModel || dbModel.chatModel,
            imageSize: dbModel.imageSize,
            timeoutMs: dbModel.timeoutMs
        }
    }

    if (config.ai) return { ...config.ai, id: null, name: '环境变量模型' }
    return null
}

/**
 * 组装可用的模型候选链：首选模型在前，其后是其它启用模型（按健康度排序）。
 * 首选模型 id 为空时说明走的是环境变量回退，数据库里没有可切换的模型。
 */
async function getAiConfigChain(primary, chainFn = null) {
    if (!primary) return []

    const chain = [primary]
    if (!primary.id) return chain

    try {
        const fallbacks = chainFn
            ? await chainFn()
            : await aiModel.listFallbackModelConfigs(3)
        for (const item of fallbacks) {
            if (item.id === primary.id) continue
            const candidateModel = item.model || item.chatModel
            if (!candidateModel || !item.apiKey) continue
            chain.push({
                id: item.id,
                name: item.name,
                baseUrl: item.baseUrl,
                apiKey: item.apiKey,
                model: candidateModel,
                imageModel: item.imageModel || candidateModel,
                imageSize: item.imageSize,
                timeoutMs: item.timeoutMs
            })
        }
    } catch (err) {
        // 取候选失败不影响主流程：只是这次没有降级可用
        console.warn('[AI] 读取降级候选模型失败：', err?.message || err)
    }

    return chain
}

async function isAiConfigured() {
    return Boolean(await getActiveAiConfig())
}

function getAiConfig() {
    if (!config.ai) throw notConfiguredError()
    return config.ai
}

function notConfiguredError() {
    return Object.assign(new Error('AI 功能未配置'), { code: 'AI_NOT_CONFIGURED' })
}

/**
 * 富文本正文转纯文本：模型只需要语义，标签与样式全是噪声。
 */
function htmlToText(html) {
    return String(html || '')
        .replace(/<[^>]*>/g, ' ')
        .replace(/&nbsp;/gi, ' ')
        .replace(/&amp;/gi, '&')
        .replace(/&lt;/gi, '<')
        .replace(/&gt;/gi, '>')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, MAX_CONTENT_CHARS)
}

/**
 * 解析提示词模板：优先用后台配置的模板，
 * 查不到、被停用或渲染异常时回退到内置默认提示词。
 * 模板读取失败不应让 AI 功能整体不可用。
 */
async function resolvePromptTemplate(key, variables = {}) {
    const fallbackTemplate = getDefaultTemplate(key)
    const fallback = fallbackTemplate
        ? renderTemplate(fallbackTemplate.content, variables)
        : ''

    try {
        const content = await aiModel.getEnabledPromptTemplate(key)
        if (!content) return fallback
        const rendered = renderTemplate(content, variables).trim()
        return rendered || fallback
    } catch (err) {
        console.warn('[AI] 读取提示词模板失败，回退默认提示词：', err?.message || err)
        return fallback
    }
}

async function buildSuggestionPrompt({ title, content }) {
    const plainContent = htmlToText(content)
    return resolvePromptTemplate('suggest', { title, content: plainContent })
}

function textToPlainText(input) {
    return String(input || '')
        .replace(/<\/(?:p|h[1-6]|li|blockquote|div)>/gi, '\n\n')
        .replace(/<[^>]*>/g, ' ')
        .replace(/&nbsp;/gi, ' ')
        .replace(/&amp;/gi, '&')
        .replace(/&lt;/gi, '<')
        .replace(/&gt;/gi, '>')
        .replace(/[ \t]+/g, ' ')
        .replace(/\n{3,}/g, '\n\n')
        .trim()
        .slice(0, MAX_WRITING_CHARS)
}

function getWritingActionLabel(action) {
    const labels = {
        polish: '润色',
        shorten: '精简',
        expand: '扩写',
        continue: '续写'
    }
    return labels[action] || action
}

async function buildWritingPrompt({ action, text, title = '' }) {
    const plainText = textToPlainText(text)
    const plainTitle = textToPlainText(title).slice(0, 150)
    const actionLabel = getWritingActionLabel(action)
    const requirement = action === 'continue'
        ? '1. 在原文后自然续写 100-200 字，保持原有语境、人设和事实；'
        : `1. 对原文进行${actionLabel}，不添加原文没有的事实；`

    return resolvePromptTemplate('writing', {
        action,
        actionLabel,
        requirement,
        title: plainTitle,
        titleLine: plainTitle ? `文章标题：${plainTitle}` : '',
        text: plainText
    })
}

async function buildCoverPrompt({ title, introduce, content }) {
    const plainTitle = htmlToText(title).slice(0, 100)
    const plainIntroduce = htmlToText(introduce).slice(0, 200)
    const plainContent = htmlToText(content).slice(0, 600)

    return resolvePromptTemplate('cover', {
        title: plainTitle,
        introduce: plainIntroduce,
        content: plainContent,
        introduceLine: plainIntroduce ? `文章简介：${plainIntroduce}` : '',
        contentLine: plainContent ? `正文摘要：${plainContent}` : ''
    })
}

/**
 * 从模型输出中稳健地取出 JSON：兼容 ```json 围栏和前后缀说明文字。
 */
function extractJsonBlock(raw) {
    const start = raw.indexOf('{')
    const end = raw.lastIndexOf('}')
    if (start === -1 || end <= start) return null
    try {
        return JSON.parse(raw.slice(start, end + 1))
    } catch {
        return null
    }
}

function normalizeLabels(value) {
    if (!Array.isArray(value)) return []
    const labels = []
    for (const item of value) {
        if (typeof item !== 'string') continue
        const label = item.trim().slice(0, 20)
        if (label && !labels.includes(label)) labels.push(label)
        if (labels.length >= MAX_LABELS) break
    }
    return labels
}

function parseSuggestionPayload(raw) {
    const parsed = extractJsonBlock(String(raw || ''))
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        throw Object.assign(new Error('模型输出不是合法的 JSON 建议'), { code: 'AI_PARSE_ERROR' })
    }

    const summary = typeof parsed.summary === 'string' ? parsed.summary.trim() : ''
    const labels = normalizeLabels(parsed.labels)
    if (!summary || labels.length === 0) {
        throw Object.assign(new Error('模型建议缺少简介或标签'), { code: 'AI_PARSE_ERROR' })
    }

    return {
        summary: summary.slice(0, MAX_SUMMARY_CHARS),
        labels
    }
}

async function buildGalleryCurationPrompt({ title, introduce, theme, photoCount }) {
    return resolvePromptTemplate('gallery', {
        title: title || '未填写',
        introduce: introduce || '未填写',
        theme: theme || '未填写',
        photoCount
    })
}

/**
 * 语义搜索的查询扩展提示词：让模型把自然语言查询拆成若干可直接检索的关键词。
 * 只做扩，不生成答案，最终排序仍由数据库命中情况决定。
 */
async function buildSearchExpansionPrompt({ query }) {
    return resolvePromptTemplate('search', { query })
}

function parseSearchExpansionPayload(raw) {
    const parsed = extractJsonBlock(String(raw || ''))
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        throw Object.assign(new Error('模型输出不是合法的 JSON 扩展结果'), { code: 'AI_PARSE_ERROR' })
    }

    const terms = []
    for (const item of Array.isArray(parsed.terms) ? parsed.terms : []) {
        if (typeof item !== 'string') continue
        const term = item.trim().slice(0, MAX_SEARCH_TERM_CHARS)
        if (term && !terms.includes(term)) terms.push(term)
        if (terms.length >= MAX_SEARCH_TERMS) break
    }
    if (terms.length === 0) {
        throw Object.assign(new Error('模型没有返回可用的搜索关键词'), { code: 'AI_PARSE_ERROR' })
    }

    return { terms }
}

/**
 * 私信拟回复的提示词：只生成候选话术，发送与否完全由作者决定。
 */
async function buildMessageReplyPrompt({ peerName, history, tone = '' }) {
    const dialogue = history
        .map(item => `${item.senderName || (item.senderId === 0 ? '我' : '对方')}：${item.content}`)
        .join('\n')

    return resolvePromptTemplate('message', {
        peerName: peerName || '读者',
        history: dialogue,
        tone,
        toneLine: tone ? `5. 作者希望的语气：${tone}` : '5. 语气自然友好即可。'
    })
}

function parseMessageReplyPayload(raw) {
    const parsed = extractJsonBlock(String(raw || ''))
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        throw Object.assign(new Error('模型输出不是合法的 JSON 回复'), { code: 'AI_PARSE_ERROR' })
    }

    const replies = []
    for (const item of Array.isArray(parsed.replies) ? parsed.replies : []) {
        if (typeof item !== 'string') continue
        const text = item.trim().slice(0, MAX_REPLY_CHARS)
        if (text && !replies.includes(text)) replies.push(text)
        if (replies.length >= MAX_REPLY_CANDIDATES) break
    }
    if (replies.length === 0) {
        throw Object.assign(new Error('模型没有返回可用的回复建议'), { code: 'AI_PARSE_ERROR' })
    }

    return { replies }
}

/**
 * 运营周报提示词：模型只根据给定的统计数字写报告，不允许编造未提供的数据。
 */
async function buildOperationsReportPrompt({ summary, aiUsage }) {
    const topPaths = (summary.topPaths || [])
        .map(item => `${item.path}（${item.visits} 次）`)
        .join('、') || '无'

    return resolvePromptTemplate('operations', {
        days: summary.days,
        visits: summary.visits,
        visitors: summary.visitors,
        mobileVisits: summary.mobileVisits,
        comments: summary.comments,
        messages: summary.messages,
        publishedArticles: summary.publishedArticles,
        publishedGalleries: summary.publishedGalleries,
        topPaths,
        aiTotal: aiUsage.total,
        aiSuccessRate: aiUsage.successRate,
        aiAvgDuration: aiUsage.avgDurationMs
    })
}

function parseOperationsReportPayload(raw) {
    const text = normalizeWritingText(raw)
    if (!text) {
        throw Object.assign(new Error('模型没有返回可用的周报'), { code: 'AI_PARSE_ERROR' })
    }

    const sections = []
    for (const line of text.split(/\r?\n/)) {
        const trimmed = line.trim()
        if (!trimmed) continue
        // 以「本周概况：」这种「短句 + 冒号」的形式识别小节标题
        const matched = trimmed.match(/^([^：:]{2,12})[：:]\s*(.+)$/)
        if (matched) {
            sections.push({ title: matched[1].trim(), content: matched[2].trim() })
        } else if (sections.length > 0) {
            sections[sections.length - 1].content += ` ${trimmed}`
        } else {
            sections.push({ title: '本周概况', content: trimmed })
        }
        if (sections.length >= MAX_REPORT_SECTIONS) break
    }

    if (sections.length === 0) {
        throw Object.assign(new Error('模型没有返回可用的周报'), { code: 'AI_PARSE_ERROR' })
    }

    return { sections }
}

/**
 * 举报辅助判断的提示词：模型只给判断建议，最终处置仍由运营自己做。
 */
async function buildReportReviewPrompt({ report, reasonLabel }) {
    return resolvePromptTemplate('report-review', {
        reasonLabel,
        detail: report.detail ? `读者补充说明：${report.detail}` : '读者补充说明：无',
        commentUserName: report.commentUserName,
        commentContent: report.commentContent,
        sourceTitle: report.sourceTitle,
        complaint: report.commentComplaint
    })
}

function parseReportReviewPayload(raw) {
    const parsed = extractJsonBlock(String(raw || ''))
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        throw Object.assign(new Error('模型输出不是合法的 JSON 建议'), { code: 'AI_PARSE_ERROR' })
    }

    const verdictRaw = String(parsed.verdict || '').trim()
    const verdict = ['成立', '部分成立', '不成立'].includes(verdictRaw) ? verdictRaw : '不成立'
    const reason = REPORT_REASON_VALUES.includes(String(parsed.reason || ''))
        ? String(parsed.reason)
        : 'other'
    const action = REPORT_ACTIONS.includes(String(parsed.action || ''))
        ? String(parsed.action)
        : 'dismiss'
    const note = typeof parsed.note === 'string' ? parsed.note.trim().slice(0, MAX_REPORT_NOTE_CHARS) : ''
    if (!note) {
        throw Object.assign(new Error('模型建议缺少处理备注'), { code: 'AI_PARSE_ERROR' })
    }

    return { verdict, reason, action, note }
}

function parseGalleryCurationPayload(raw) {
    const parsed = extractJsonBlock(String(raw || ''))
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        throw Object.assign(new Error('模型输出不是合法的 JSON 建议'), { code: 'AI_PARSE_ERROR' })
    }

    const titles = normalizeLabels(parsed.titles)
        .slice(0, 3)
        .map(label => label.slice(0, MAX_GALLERY_TITLE_CHARS))
    const summary = typeof parsed.summary === 'string' ? parsed.summary.trim().slice(0, MAX_GALLERY_INTRO_CHARS) : ''
    const labels = normalizeLabels(parsed.labels)
    if (titles.length === 0 || !summary || labels.length === 0) {
        throw Object.assign(new Error('模型建议缺少标题、简介或标签'), { code: 'AI_PARSE_ERROR' })
    }

    return { titles, summary, labels }
}

async function chatCompletion(prompt, { aiConfig, json = false, maxTokens = 500 } = {}) {
    const timeoutMs = Number(aiConfig.timeoutMs) || 20000
    const response = await fetch(`${aiConfig.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${aiConfig.apiKey}`
        },
        body: JSON.stringify({
            model: aiConfig.model,
            messages: [
                {
                    role: 'system',
                    content: json
                        ? '你是一名严谨的中文博客编辑助手，只输出符合要求的 JSON。'
                        : '你是一名严谨的中文博客编辑助手，只输出正文片段。'
                },
                { role: 'user', content: prompt }
            ],
            temperature: 0.6,
            max_tokens: maxTokens
        }),
        signal: AbortSignal.timeout(timeoutMs)
    })

    if (!response.ok) {
        throw Object.assign(
            new Error(`AI 服务商响应异常：HTTP ${response.status}`),
            { code: 'AI_PROVIDER_ERROR', status: response.status }
        )
    }

    const payload = await response.json()
    const content = payload?.choices?.[0]?.message?.content
    const text = typeof content === 'string' ? content : ''
    return { text, usage: normalizeUsage(payload?.usage) }
}

/**
 * 判断错误是否值得换一个模型重试。
 * 限流与服务端故障说明模型暂时不可用，换一个模型可能成功；
 * 参数或鉴权错误换模型也救不回来，直接抛出让作者看到真实原因。
 */
function isRetryableModelError(error) {
    if (error?.code !== 'AI_PROVIDER_ERROR') return false
    const status = Number(error?.status || 0)
    return status === 408 || status === 429 || status >= 500
}

/**
 * 依次尝试候选模型：首选失败且属于可重试错误时，自动退到下一个模型。
 * 返回结果里带上实际生效的模型，便于调用记录与统计如实反映。
 */
async function runWithFallback(chain, run) {
    if (!Array.isArray(chain) || chain.length === 0) {
        throw notConfiguredError()
    }

    let lastError = null
    for (let index = 0; index < chain.length; index += 1) {
        const aiConfig = chain[index]
        try {
            const result = await run(aiConfig)
            return {
                ...result,
                aiConfig,
                modelUsed: {
                    id: aiConfig.id ?? null,
                    name: aiConfig.name || aiConfig.model || '',
                    model: aiConfig.model || '',
                    degraded: index > 0
                }
            }
        } catch (error) {
            lastError = error
            const hasNext = index < chain.length - 1
            if (!hasNext || !isRetryableModelError(error)) break
            // 降级说明这个模型真的出了问题，把失败记进健康状态，
            // 下次候选排序时它会自动排到后面
            if (aiConfig.id) {
                try {
                    await aiModel.recordModelHealth(aiConfig.id, {
                        ok: false,
                        error: error?.message || '模型调用失败'
                    })
                } catch (recordError) {
                    console.warn('[AI] 记录模型失败状态出错：', recordError?.message || recordError)
                }
            }
            console.warn(
                `[AI] 模型「${aiConfig.name || aiConfig.model}」调用失败（${error.message}），自动降级到下一个模型`
            )
        }
    }

    throw lastError || notConfiguredError()
}

/**
 * 服务商返回的 token 用量并不总是存在（免费模型常常直接省略），
 * 这里做一次宽松归一化：拿不到就返回空对象，统计侧按 0 处理。
 */
function normalizeUsage(usage) {
    if (!usage || typeof usage !== 'object') return {}
    const pick = (...keys) => {
        for (const key of keys) {
            const value = Number(usage[key])
            if (Number.isFinite(value) && value >= 0) return Math.round(value)
        }
        return 0
    }
    return {
        promptTokens: pick('prompt_tokens', 'input_tokens'),
        completionTokens: pick('completion_tokens', 'output_tokens'),
        totalTokens: pick('total_tokens')
    }
}

function normalizeWritingText(raw) {
    let text = String(raw || '').trim()
    text = text.replace(/^```(?:markdown|text)?\s*\n?/, '').replace(/\n?```\s*$/, '')
    text = text.replace(/^["“](.*)["”]$/s, '$1').trim()
    return text.slice(0, MAX_OUTPUT_CHARS)
}

function imageError(message) {
    return Object.assign(new Error(message), { code: 'AI_IMAGE_ERROR' })
}

// 智谱返回的 content-type 可能与实际字节不符（实测标 PNG 实为 JPEG），
// 按魔数嗅探真实格式，嗅探不出再回退响应头。
function detectCoverMimeType(buffer, headerType) {
    if (buffer.length >= 3 && buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e) {
        return 'image/png'
    }
    if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
        return 'image/jpeg'
    }
    if (buffer.length >= 12 && buffer.subarray(0, 4).toString('latin1') === 'RIFF'
        && buffer.subarray(8, 12).toString('latin1') === 'WEBP') {
        return 'image/webp'
    }
    return COVER_MIME_TYPES.has(headerType) ? headerType : null
}

async function fetchCoverImage(prompt, aiConfig) {
    const timeoutMs = Number(aiConfig.timeoutMs) || 20000
    const response = await fetch(`${aiConfig.baseUrl}/images/generations`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${aiConfig.apiKey}`
        },
        body: JSON.stringify({
            model: aiConfig.imageModel,
            prompt,
            size: aiConfig.imageSize
        }),
        signal: AbortSignal.timeout(timeoutMs)
    })

    if (!response.ok) {
        throw Object.assign(
            new Error(`AI 服务商响应异常：HTTP ${response.status}`),
            { code: 'AI_PROVIDER_ERROR' }
        )
    }

    const payload = await response.json()
    const imageUrl = payload?.data?.[0]?.url
    if (typeof imageUrl !== 'string' || !/^https:\/\//.test(imageUrl)) {
        throw imageError('模型没有返回可用的封面图片')
    }

    const imageResponse = await fetch(imageUrl, {
        signal: AbortSignal.timeout(timeoutMs)
    })
    if (!imageResponse.ok) {
        throw imageError(`封面图片下载失败：HTTP ${imageResponse.status}`)
    }

    const buffer = Buffer.from(await imageResponse.arrayBuffer())
    if (buffer.length === 0 || buffer.length > MAX_COVER_IMAGE_BYTES) {
        throw imageError('模型返回的封面图片大小超出限制')
    }

    const headerType = String(imageResponse.headers.get('content-type') || '').split(';')[0]
    const mimeType = detectCoverMimeType(buffer, headerType)
    if (!mimeType) {
        throw imageError('模型返回的封面格式不受支持')
    }

    return { buffer, mimeType }
}

function validateWritingAction(action) {
    if (!WRITING_ACTIONS.has(action)) {
        throw Object.assign(new Error('不支持的 AI 写作动作'), { code: 'AI_INVALID_ACTION' })
    }
}

/**
 * 生成文章简介与标签建议。只提供建议，是否采用由作者在前端确认。
 */
async function suggestArticleMeta({ title, content, aiConfig, chainFn = null }) {
    if (!aiConfig) throw notConfiguredError()

    const chain = await getAiConfigChain(aiConfig, chainFn)
    const candidates = chain.length > 0 ? chain : [aiConfig]
    const result = await runWithFallback(candidates, async (candidate) => {
        const raw = await chatCompletion(await buildSuggestionPrompt({ title, content }), { aiConfig: candidate, json: true })
        const parsed = parseSuggestionPayload(raw.text)
        return { ...parsed, usage: raw.usage }
    })
    return result
}

/**
 * 生成摄影图库的策展建议。标题、简介与标签都只是候选，作者逐项确认后才写入。
 */
async function suggestGalleryCuration({ title = '', introduce = '', theme = '', photoCount = 0, aiConfig, chainFn = null }) {
    if (!aiConfig) throw notConfiguredError()

    const chain = await getAiConfigChain(aiConfig, chainFn)
    const prompt = await buildGalleryCurationPrompt({
        title: htmlToText(title).slice(0, 100),
        introduce: htmlToText(introduce).slice(0, 300),
        theme: textToPlainText(theme).slice(0, 300),
        photoCount
    })
    return await runWithFallback(chain, async (candidate) => {
        const raw = await chatCompletion(prompt, { aiConfig: candidate, json: true })
        const parsed = parseGalleryCurationPayload(raw.text)
        return { ...parsed, usage: raw.usage }
    })
}

/**
 * 语义搜索的查询扩展：把自然语言查询转成一组可检索关键词。
 * 只扩关键词，不生成答案，最终命中与排序仍由数据库决定。
 */
async function expandSearchQuery({ query, aiConfig, chainFn = null }) {
    if (!aiConfig) throw notConfiguredError()

    const plainQuery = String(query || '').trim()
    if (!plainQuery) {
        throw Object.assign(new Error('搜索关键词不能为空'), { code: 'AI_EMPTY_QUERY' })
    }

    const chain = await getAiConfigChain(aiConfig, chainFn)
    const prompt = await buildSearchExpansionPrompt({ query: plainQuery.slice(0, 100) })
    return await runWithFallback(chain, async (candidate) => {
        const raw = await chatCompletion(prompt, { aiConfig: candidate, json: true })
        const parsed = parseSearchExpansionPayload(raw.text)
        return { ...parsed, usage: raw.usage }
    })
}

/**
 * 私信拟回复：根据最近的对话生成候选话术。
 * 只产出候选，绝不代替作者发送。
 */
async function suggestMessageReplies({ peerName = '', history = [], tone = '', aiConfig, chainFn = null }) {
    if (!aiConfig) throw notConfiguredError()

    const safeHistory = (Array.isArray(history) ? history : [])
        .filter(item => item && typeof item.content === 'string' && item.content.trim())
        .slice(-10)
        .map(item => ({
            senderId: Number(item.senderId) || 0,
            senderName: String(item.senderName || '').slice(0, 30),
            content: String(item.content).trim().slice(0, 300)
        }))
    if (safeHistory.length === 0) {
        throw Object.assign(new Error('没有可参考的对话内容'), { code: 'AI_EMPTY_CONTEXT' })
    }

    const chain = await getAiConfigChain(aiConfig, chainFn)
    const prompt = await buildMessageReplyPrompt({
        peerName: String(peerName || '').slice(0, 30),
        history: safeHistory,
        tone: String(tone || '').trim().slice(0, 50)
    })
    return await runWithFallback(chain, async (candidate) => {
        const raw = await chatCompletion(prompt, { aiConfig: candidate, json: true })
        const parsed = parseMessageReplyPayload(raw.text)
        return { ...parsed, usage: raw.usage }
    })
}

/**
 * 生成运营周报。统计数字由调用方从数据库取好，模型只负责组织语言。
 */
async function generateOperationsReport({ summary, aiUsage, aiConfig, chainFn = null }) {
    if (!aiConfig) throw notConfiguredError()
    if (!summary) throw Object.assign(new Error('缺少周报统计数据'), { code: 'AI_EMPTY_CONTEXT' })

    const chain = await getAiConfigChain(aiConfig, chainFn)
    const prompt = await buildOperationsReportPrompt({ summary, aiUsage })
    return await runWithFallback(chain, async (candidate) => {
        const raw = await chatCompletion(prompt, { aiConfig: candidate, maxTokens: 900 })
        const parsed = parseOperationsReportPayload(raw.text)
        return { ...parsed, usage: raw.usage }
    })
}

/**
 * 举报辅助判断：给出是否成立、更贴切的原因、建议处置与处理备注。
 * 只是建议，处置动作仍由运营在举报工作台自己执行。
 */
async function reviewReportedComment({ report, reasonLabel = '', aiConfig, chainFn = null }) {
    if (!aiConfig) throw notConfiguredError()
    if (!report) throw Object.assign(new Error('缺少举报信息'), { code: 'AI_EMPTY_CONTEXT' })

    const chain = await getAiConfigChain(aiConfig, chainFn)
    const prompt = await buildReportReviewPrompt({ report, reasonLabel })
    return await runWithFallback(chain, async (candidate) => {
        const raw = await chatCompletion(prompt, { aiConfig: candidate, json: true })
        const parsed = parseReportReviewPayload(raw.text)
        return { ...parsed, usage: raw.usage }
    })
}

/**
 * 生成润色/精简/扩写/续写结果。只返回建议文本，替换仍由作者确认。
 */
async function rewriteText({ action, text, title = '', aiConfig, chainFn = null }) {
    validateWritingAction(action)
    if (!aiConfig) throw notConfiguredError()

    const plainText = textToPlainText(text)
    if (!plainText) {
        throw Object.assign(new Error('没有可处理的正文'), { code: 'AI_EMPTY_TEXT' })
    }

    const chain = await getAiConfigChain(aiConfig, chainFn)
    const candidates = chain.length > 0 ? chain : [aiConfig]
    const result = await runWithFallback(candidates, async (candidate) => {
        const raw = await chatCompletion(await buildWritingPrompt({ action, text: plainText, title }), { aiConfig: candidate, maxTokens: 700 })
        const output = normalizeWritingText(raw.text)
        if (!output) {
            throw Object.assign(new Error('模型没有返回可用内容'), { code: 'AI_PARSE_ERROR' })
        }

        return { action, text: output, usage: raw.usage }
    })

    return result
}

/**
 * 生成封面插画建议。图片内容与预览由调用方负责暂存，
 * 作者确认前不会写入 image 表。
 */
async function generateCoverImage({ title, introduce, content, aiConfig, chainFn = null }) {
    if (!aiConfig) throw notConfiguredError()

    const prompt = await buildCoverPrompt({ title, introduce, content })
    const chain = await getAiConfigChain(aiConfig, chainFn)
    // 配图只退到同样具备配图能力的模型，否则换过去也出不了图
    const withImage = chain.filter(item => item.imageModel)
    const candidates = withImage.length > 0 ? withImage : [aiConfig]
    const result = await runWithFallback(candidates, async (candidate) => {
        const { buffer, mimeType } = await fetchCoverImage(prompt, candidate)
        return {
            buffer,
            mimeType,
            dataUri: `data:${mimeType};base64,${buffer.toString('base64')}`,
            prompt,
            usage: {},
            outputChars: 0
        }
    })

    return result
}

/**
 * 提示词试跑：管理员可以在保存/选用前验证草稿效果。
 * mode 决定走哪种模型：text 走对话模型、image 走图片模型；
 * 不传时按所属功能推断（配图类默认出图，其它默认出文字）。
 * 只返回预览结果，不落任何业务数据。
 */
async function previewPrompt({ featureKey, content, variables = {}, mode = 'auto', aiConfig, chainFn = null }) {
    if (!aiConfig) throw notConfiguredError()
    const feature = getDefaultTemplate(featureKey)
    if (!feature) {
        throw Object.assign(new Error('提示词所属功能不存在'), { code: 'AI_INVALID_PROMPT_FEATURE' })
    }

    const prompt = renderTemplate(String(content || '').trim() || feature.content, variables)
    // 试跑模式：作者可以显式指定出文字还是出图片，不指定时按功能推断
    const normalizedMode = ['text', 'image'].includes(mode) ? mode : (featureKey === 'cover' ? 'image' : 'text')
    const isImageFeature = normalizedMode === 'image'
    const chain = await getAiConfigChain(aiConfig, chainFn)
    const candidates = isImageFeature
        ? chain.filter(item => item.imageModel)
        : chain
    const validCandidates = candidates.length > 0 ? candidates : [aiConfig]

    return await runWithFallback(validCandidates, async (candidate) => {
        if (isImageFeature) {
            const { buffer, mimeType } = await fetchCoverImage(prompt, candidate)
            return {
                kind: 'image',
                prompt,
                dataUri: `data:${mimeType};base64,${buffer.toString('base64')}`,
                usage: {},
                outputChars: 0
            }
        }

        const raw = await chatCompletion(prompt, { aiConfig: candidate, maxTokens: 700 })
        const text = normalizeWritingText(raw.text)
        if (!text) {
            throw Object.assign(new Error('模型没有返回可用内容'), { code: 'AI_PARSE_ERROR' })
        }
        return {
            kind: 'text',
            prompt,
            text,
            usage: raw.usage,
            outputChars: text.length
        }
    })
}

function isValidCoverToken(token) {
    return typeof token === 'string' && /^[0-9a-f]{48}$/.test(token)
}

// 门户问答：单次提问上限与引用片段上限，避免把整站内容塞进上下文
const MAX_ASK_QUESTION_CHARS = 200
const MAX_ASK_CONTEXT_CHARS = 1200
const MAX_ASK_SNIPPETS = 6

/**
 * 从正文中截取与提问最相关的片段。
 * 优先按关键词命中位置取窗口，取不到就从开头截断，保证语料始终可用。
 */
function pickRelevantSnippet(content, keyword) {
    const text = htmlToText(content)
    if (!text) return ''
    if (text.length <= MAX_ASK_CONTEXT_CHARS) return text

    const terms = String(keyword || '')
        .split(/[\s,，。？！、;；:：]+/)
        .map(item => item.trim())
        .filter(Boolean)

    for (const term of terms) {
        const index = text.indexOf(term)
        if (index >= 0) {
            const start = Math.max(0, index - Math.floor(MAX_ASK_CONTEXT_CHARS / 3))
            return text.slice(start, start + MAX_ASK_CONTEXT_CHARS)
        }
    }

    return text.slice(0, MAX_ASK_CONTEXT_CHARS)
}

/**
 * 构建门户问答的提示词：只允许依据给定片段回答，并要求给出引用编号。
 */
async function buildAskPrompt({ question, snippets }) {
    const context = snippets.map((item, index) => {
        return `【${index + 1}】${item.title}\n${item.snippet}`
    }).join('\n\n')

    return resolvePromptTemplate('ask', { question, context })
}

/**
 * 门户 AI 问答：先检索站内已发布内容，再让模型基于这些片段作答。
 * 返回答案与实际生效的模型，便于调用记录如实反映。
 */
async function answerFromPublishedContent({ question, snippets, aiConfig, chainFn = null }) {
    if (!aiConfig) throw notConfiguredError()

    const chain = await getAiConfigChain(aiConfig, chainFn)
    const prompt = await buildAskPrompt({ question, snippets })
    const result = await runWithFallback(chain, async (candidate) => {
        const raw = await chatCompletion(prompt, { aiConfig: candidate, maxTokens: 700 })
        const text = normalizeWritingText(raw.text)
        if (!text) {
            throw Object.assign(new Error('模型没有返回可用内容'), { code: 'AI_PARSE_ERROR' })
        }
        return { text, usage: raw.usage }
    })

    return result
}

module.exports = {
    isAiConfigured,
    getAiConfig,
    getActiveAiConfig,
    getAiConfigChain,
    runWithFallback,
    isRetryableModelError,
    suggestArticleMeta,
    suggestGalleryCuration,
    expandSearchQuery,
    suggestMessageReplies,
    generateOperationsReport,
    reviewReportedComment,
    rewriteText,
    generateCoverImage,
    previewPrompt,
    answerFromPublishedContent,
    buildAskPrompt,
    pickRelevantSnippet,
    isValidCoverToken,
    buildCoverPrompt,
    parseSuggestionPayload,
    buildGalleryCurationPrompt,
    parseGalleryCurationPayload,
    buildSearchExpansionPrompt,
    parseSearchExpansionPayload,
    buildMessageReplyPrompt,
    parseMessageReplyPayload,
    buildOperationsReportPrompt,
    parseOperationsReportPayload,
    buildReportReviewPrompt,
    parseReportReviewPayload,
    buildSuggestionPrompt,
    buildWritingPrompt,
    normalizeWritingText,
    validateWritingAction,
    htmlToText
}
