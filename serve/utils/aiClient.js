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
const MAX_GALLERY_TITLE_CHARS = 100
const MAX_GALLERY_INTRO_CHARS = 300
const MAX_SEARCH_TERMS = 6
const MAX_SEARCH_TERM_CHARS = 20

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

function buildGalleryCurationPrompt({ title, introduce, theme, photoCount }) {
    return [
        '你是一名中文摄影图库策展编辑。请根据当前图库信息和作者补充主题，给出候选元信息。',
        '要求：',
        '1. 给出 3 个候选标题，每个不超过 24 字，风格一致但表达角度不同；',
        '2. 给出一段不超过 160 字的策展简介，说明画面氛围、主题与适合的浏览情境；',
        '3. 给出 2-4 个简短标签，不要编造照片中无法判断的事实；',
        '4. 只输出一个 JSON 对象，格式为 {"titles":["..."],"summary":"...","labels":["..."]}，不要输出解释或 Markdown 代码块。',
        '',
        `当前标题：${title || '未填写'}`,
        `当前简介：${introduce || '未填写'}`,
        `作者补充主题：${theme || '未填写'}`,
        `照片数量：${photoCount}`
    ].join('\n')
}

/**
 * 语义搜索的查询扩展提示词：让模型把自然语言查询拆成若干可直接检索的关键词。
 * 只做扩，不生成答案，最终排序仍由数据库命中情况决定。
 */
function buildSearchExpansionPrompt({ query }) {
    return [
        '你是一名中文站内搜索助手。请把用户的自然语言查询扩展成 2-5 个可以直接用于站内全文检索的关键词。',
        '要求：',
        '1. 关键词要用中文短语，覆盖同义词、近义词与常见别名；',
        '2. 不要输出原查询里已有的完整词组；',
        '3. 每个关键词不超过 8 个字，彼此不重复；',
        '4. 只输出一个 JSON 对象，格式为 {"terms":["..."]}，不要输出解释或 Markdown 代码块。',
        '',
        `用户查询：${query}`
    ].join('\n')
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
        const raw = await chatCompletion(buildSuggestionPrompt({ title, content }), { aiConfig: candidate, json: true })
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
    const prompt = buildGalleryCurationPrompt({
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
    const prompt = buildSearchExpansionPrompt({ query: plainQuery.slice(0, 100) })
    return await runWithFallback(chain, async (candidate) => {
        const raw = await chatCompletion(prompt, { aiConfig: candidate, json: true })
        const parsed = parseSearchExpansionPayload(raw.text)
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
        const raw = await chatCompletion(buildWritingPrompt({ action, text: plainText, title }), { aiConfig: candidate, maxTokens: 700 })
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

    const prompt = buildCoverPrompt({ title, introduce, content })
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
function buildAskPrompt({ question, snippets }) {
    const context = snippets.map((item, index) => {
        return `【${index + 1}】${item.title}\n${item.snippet}`
    }).join('\n\n')

    return [
        '你是一名博客站主的助手，负责根据站内已发布的文章回答访客的问题。',
        '要求：',
        '1. 只能依据下面给出的文章片段回答，不要编造片段里没有的信息；',
        '2. 如果片段不足以回答，请直接说明没有找到相关内容，并邀请访客换个说法；',
        '3. 引用了哪几篇内容，就在答案末尾用 [1]、[2] 这样的编号标出来；',
        '4. 用简体中文回答，语气自然，不要使用 Markdown 标题或代码块；',
        '',
        '站内文章片段：',
        context,
        '',
        `访客问题：${question}`
    ].join('\n')
}

/**
 * 门户 AI 问答：先检索站内已发布内容，再让模型基于这些片段作答。
 * 返回答案与实际生效的模型，便于调用记录如实反映。
 */
async function answerFromPublishedContent({ question, snippets, aiConfig, chainFn = null }) {
    if (!aiConfig) throw notConfiguredError()

    const chain = await getAiConfigChain(aiConfig, chainFn)
    const prompt = buildAskPrompt({ question, snippets })
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
    rewriteText,
    generateCoverImage,
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
    buildSuggestionPrompt,
    buildWritingPrompt,
    normalizeWritingText,
    validateWritingAction,
    htmlToText
}
