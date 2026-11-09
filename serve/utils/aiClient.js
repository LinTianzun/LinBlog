const crypto = require('node:crypto')
const config = require('../config/default')
const aiModel = require('../model/dbModel/ai/index')

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

async function isAiConfigured() {
    return Boolean(await getActiveAiConfig())
}

function getAiConfig() {
    if (!config.ai) throw notConfiguredError()
    return config.ai
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

function buildSuggestionPrompt({ title, content }) {
    const plainContent = htmlToText(content)
    return [
        '你是一名中文博客编辑助手。请根据文章标题和正文，生成一段面向读者的简介和 2-4 个内容标签。',
        '要求：',
        '1. 简介不超过 120 字，概括文章主题，不夸大、不剧透细节；',
        '2. 标签使用简短名词短语，贴合文章主题，不要重复标题里已有的完整短语；',
        '3. 只输出一个 JSON 对象，格式为 {"summary":"...","labels":["..."]}，不要输出任何解释或 Markdown 代码块。',
        '',
        `标题：${title}`,
        `正文：${plainContent}`
    ].join('\n')
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

function buildWritingPrompt({ action, text, title = '' }) {
    const plainText = textToPlainText(text)
    const plainTitle = textToPlainText(title).slice(0, 150)
    const actionLabel = getWritingActionLabel(action)
    const requirement = action === 'continue'
        ? '1. 在原文后自然续写 100-200 字，保持原有语境、人设和事实；'
        : `1. 对原文进行${actionLabel}，不添加原文没有的事实；`

    return [
        '你是一名中文博客编辑助手。请根据要求改写或续写用户提供的正文片段。',
        requirement,
        '2. 只输出处理后的纯文本，不要解释、标题、Markdown 代码块或引号；',
        '3. 保留原文语言，使用博客可读的自然段落；',
        '',
        plainTitle ? `文章标题：${plainTitle}` : '',
        `原文片段：${plainText}`
    ].filter(Boolean).join('\n')
}

function buildCoverPrompt({ title, introduce, content }) {
    const plainTitle = htmlToText(title).slice(0, 100)
    const plainIntroduce = htmlToText(introduce).slice(0, 200)
    const plainContent = htmlToText(content).slice(0, 600)
    return [
        '你是一名博客封面插画师。请根据文章信息生成一张封面插画。',
        '要求：',
        '1. 现代简约的编辑插画风格，构图有呼吸感，色彩协调；',
        '2. 不要出现任何文字、字母、数字、水印或 Logo；',
        '3. 避免具体人物特写，用意象、场景与氛围表达主题；',
        '',
        `文章标题：${plainTitle}`,
        plainIntroduce ? `文章简介：${plainIntroduce}` : '',
        plainContent ? `正文摘要：${plainContent}` : ''
    ].filter(Boolean).join('\n')
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

async function chatCompletion(prompt, { aiConfig, json = false, maxTokens = 500 } = {}) {
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
        signal: AbortSignal.timeout(aiConfig.timeoutMs)
    })

    if (!response.ok) {
        throw Object.assign(
            new Error(`AI 服务商响应异常：HTTP ${response.status}`),
            { code: 'AI_PROVIDER_ERROR' }
        )
    }

    const payload = await response.json()
    const content = payload?.choices?.[0]?.message?.content
    const text = typeof content === 'string' ? content : ''
    return { text, usage: normalizeUsage(payload?.usage) }
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
        signal: AbortSignal.timeout(aiConfig.timeoutMs)
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
        signal: AbortSignal.timeout(aiConfig.timeoutMs)
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
async function suggestArticleMeta({ title, content, aiConfig }) {
    if (!aiConfig) throw notConfiguredError()

    const raw = await chatCompletion(buildSuggestionPrompt({ title, content }), { aiConfig, json: true })
    const parsed = parseSuggestionPayload(raw.text)
    return { ...parsed, usage: raw.usage }
}

/**
 * 生成润色/精简/扩写/续写结果。只返回建议文本，替换仍由作者确认。
 */
async function rewriteText({ action, text, title = '', aiConfig }) {
    validateWritingAction(action)
    if (!aiConfig) throw notConfiguredError()

    const plainText = textToPlainText(text)
    if (!plainText) {
        throw Object.assign(new Error('没有可处理的正文'), { code: 'AI_EMPTY_TEXT' })
    }

    const raw = await chatCompletion(buildWritingPrompt({ action, text: plainText, title }), { aiConfig, maxTokens: 700 })
    const output = normalizeWritingText(raw.text)
    if (!output) {
        throw Object.assign(new Error('模型没有返回可用内容'), { code: 'AI_PARSE_ERROR' })
    }

    return { action, text: output, usage: raw.usage }
}

/**
 * 生成封面插画建议。图片内容与预览由调用方负责暂存，
 * 作者确认前不会写入 image 表。
 */
async function generateCoverImage({ title, introduce, content, aiConfig }) {
    if (!aiConfig) throw notConfiguredError()

    const prompt = buildCoverPrompt({ title, introduce, content })
    const { buffer, mimeType } = await fetchCoverImage(prompt, aiConfig)

    return {
        buffer,
        mimeType,
        dataUri: `data:${mimeType};base64,${buffer.toString('base64')}`,
        prompt,
        usage: {},
        outputChars: 0
    }
}

function isValidCoverToken(token) {
    return typeof token === 'string' && /^[0-9a-f]{48}$/.test(token)
}

module.exports = {
    isAiConfigured,
    getAiConfig,
    getActiveAiConfig,
    suggestArticleMeta,
    rewriteText,
    generateCoverImage,
    isValidCoverToken,
    buildCoverPrompt,
    parseSuggestionPayload,
    buildSuggestionPrompt,
    buildWritingPrompt,
    normalizeWritingText,
    validateWritingAction,
    htmlToText
}
