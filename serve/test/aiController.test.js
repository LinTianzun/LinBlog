const assert = require('node:assert/strict')
const path = require('node:path')
const test = require('node:test')

// 不连库；AI 配置缺省时功能关闭，正好覆盖降级路径
process.env.LINBLOG_JWT_SECRET = 'x'.repeat(40)
process.env.LINBLOG_ALLOWED_ORIGINS = 'http://localhost:5173'

const aiController = require(path.resolve(__dirname, '../controller/aiController.js'))
const aiClient = require(path.resolve(__dirname, '../utils/aiClient.js'))
const uploadController = require(path.resolve(__dirname, '../controller/uploadController.js'))
const aiModel = require(path.resolve(__dirname, '../model/dbModel/ai/index.js'))

// 控制器从配额中间件拿到的运行时模型配置
const TEST_AI_MODEL = {
    id: 1,
    name: '智谱',
    baseUrl: 'https://ai.example.test/v4',
    apiKey: 'key',
    model: 'glm-4-flash',
    imageModel: 'cogview-3-flash',
    imageSize: '1344x768',
    timeoutMs: 1000
}

function createRes() {
    return {
        statusCode: 0,
        body: null,
        status(code) {
            this.statusCode = code
            return this
        },
        json(payload) {
            this.body = payload
            return this
        }
    }
}

test('ai suggest rejects when no model is configured', async () => {
    const res = createRes()
    await aiController.suggestArticleMeta(
        { body: { title: '标题', content: '正文' }, user: { userId: 1 } },
        res
    )
    assert.equal(res.statusCode, 503)
    assert.equal(res.body.code, 503)
    assert.match(res.body.message, /AI 功能未配置/)
})

test('ai suggest requires a non-empty title and content', async () => {
    for (const body of [{ title: '', content: '正文' }, { title: '标题', content: '   ' }]) {
        const res = createRes()
        await aiController.suggestArticleMeta({ body, user: { userId: 1 }, aiModel: TEST_AI_MODEL }, res)
        assert.equal(res.statusCode, 400)
        assert.equal(res.body.code, 400)
    }
})

test('ai suggest returns the suggestion for confirmed authors', async () => {
    const originalSuggest = aiClient.suggestArticleMeta
    let received = null
    aiClient.suggestArticleMeta = async (payload) => {
        received = payload
        return { summary: '这是一段建议简介', labels: ['前端', 'Vue'] }
    }
    try {
        const res = createRes()
        await aiController.suggestArticleMeta(
            {
                body: { title: '我的文章', content: '<p>正文内容</p>' },
                user: { userId: 7 },
                aiModel: TEST_AI_MODEL
            },
            res
        )
        assert.equal(res.statusCode, 0)
        assert.equal(res.body.code, 200)
        assert.deepEqual(res.body.data, {
            summary: '这是一段建议简介',
            labels: ['前端', 'Vue'],
            degraded: false,
            modelName: ''
        })
        assert.equal(received.title, '我的文章')
        assert.equal(received.content, '<p>正文内容</p>')
        assert.equal(received.aiConfig.model, 'glm-4-flash')
    } finally {
        aiClient.suggestArticleMeta = originalSuggest
    }
})

test('ai suggest degrades to 503 when the provider fails', async () => {
    const originalSuggest = aiClient.suggestArticleMeta
    aiClient.suggestArticleMeta = async () => {
        throw Object.assign(new Error('boom'), { code: 'AI_PROVIDER_ERROR' })
    }
    try {
        const res = createRes()
        await aiController.suggestArticleMeta(
            { body: { title: '标题', content: '正文' }, user: { userId: 1 }, aiModel: TEST_AI_MODEL },
            res
        )
        assert.equal(res.statusCode, 503)
        assert.match(res.body.message, /AI 服务暂时不可用/)
    } finally {
        aiClient.suggestArticleMeta = originalSuggest
    }
})

test('ai gallery curation requires a source before calling the provider', async () => {
    const res = createRes()
    await aiController.suggestGalleryCuration(
        { body: { title: '', introduce: ' ', theme: '' }, user: { userId: 1 }, aiModel: TEST_AI_MODEL },
        res
    )
    assert.equal(res.statusCode, 400)
    assert.match(res.body.message, /标题、简介或补充主题/)
})

test('ai gallery curation returns only confirmed suggestions', async () => {
    const originalSuggest = aiClient.suggestGalleryCuration
    let received = null
    aiClient.suggestGalleryCuration = async (payload) => {
        received = payload
        return {
            titles: ['海边晨光', '潮汐留下的路', '风把云吹慢了'],
            summary: '一组清晨海岸线照片，适合在安静的早晨浏览。',
            labels: ['海岸', '晨光'],
            modelUsed: { id: 1, name: '智谱', model: 'glm-4-flash', degraded: false }
        }
    }
    try {
        const res = createRes()
        await aiController.suggestGalleryCuration(
            {
                body: { title: '海边', introduce: '海边照片', theme: '清晨', photoCount: 6 },
                user: { userId: 7 },
                aiModel: TEST_AI_MODEL
            },
            res
        )
        assert.equal(res.body.code, 200)
        assert.deepEqual(res.body.data.titles, ['海边晨光', '潮汐留下的路', '风把云吹慢了'])
        assert.equal(received.photoCount, 6)
        assert.equal(received.aiConfig.model, 'glm-4-flash')
    } finally {
        aiClient.suggestGalleryCuration = originalSuggest
    }
})

test('ai writing rejects unknown actions and empty text before calling the provider', async () => {
    const res1 = createRes()
    await aiController.rewriteArticleText(
        { body: { action: 'translate', text: '正文' }, user: { userId: 1 }, aiModel: TEST_AI_MODEL },
        res1
    )
    assert.equal(res1.statusCode, 400)

    const res2 = createRes()
    await aiController.rewriteArticleText(
        { body: { action: 'polish', text: '   ' }, user: { userId: 1 }, aiModel: TEST_AI_MODEL },
        res2
    )
    assert.equal(res2.statusCode, 400)
})

test('ai writing returns text for confirmed authors', async () => {
    const originalRewrite = aiClient.rewriteText
    let received = null
    aiClient.rewriteText = async (payload) => {
        received = payload
        return { action: 'polish', text: '润色后的文本' }
    }
    try {
        const res = createRes()
        await aiController.rewriteArticleText(
            {
                body: { action: 'polish', text: '<p>正文内容</p>', title: '标题' },
                user: { userId: 7 },
                aiModel: TEST_AI_MODEL
            },
            res
        )
        assert.equal(res.statusCode, 0)
        assert.equal(res.body.code, 200)
        assert.deepEqual(res.body.data, {
            action: 'polish',
            text: '润色后的文本',
            degraded: false,
            modelName: ''
        })
        assert.equal(received.title, '标题')
    } finally {
        aiClient.rewriteText = originalRewrite
    }
})

test('ai writing strips provider wrappers and clamps long output', async () => {
    const originalFetch = global.fetch
    const longText = '长'.repeat(2200)
    let prompt = null
    global.fetch = async (url, init) => {
        prompt = JSON.parse(init.body).messages[1].content
        return new Response(JSON.stringify({
            choices: [{ message: { content: '```markdown\n润色后的文本\n```' } }]
        }), { status: 200 })
    }
    try {
        const result = await aiClient.rewriteText({
            action: 'polish',
            text: `<p>${longText}</p>`,
            title: '标题',
            aiConfig: TEST_AI_MODEL
        })
        assert.equal(result.action, 'polish')
        assert.equal(result.text, '润色后的文本')
        assert.match(prompt, /对原文进行润色/)
        assert.ok(prompt.length < longText.length)
    } finally {
        global.fetch = originalFetch
    }
})

test('ai cover rejects a missing title before calling the provider', async () => {
    for (const body of [{ title: '', content: '正文' }, { title: '   ', content: '正文' }]) {
        const res = createRes()
        await aiController.generateCover({ body, user: { userId: 1 }, aiModel: TEST_AI_MODEL }, res)
        assert.equal(res.statusCode, 400)
        assert.equal(res.body.code, 400)
    }
})

test('ai cover generates a preview and confirm persists it exactly once', async () => {
    const originalFetch = global.fetch
    const originalPersist = uploadController.persistImageBuffer
    const originalSave = aiModel.savePendingImage
    const originalTake = aiModel.takePendingImage
    const persisted = []
    const pngBytes = Buffer.from('89504e470d0a1a0a', 'hex')
    // 候选图片现在入库暂存：用内存 Map 模拟表行为，覆盖一次性消费
    const pendingStore = new Map()

    global.fetch = async (url) => {
        if (String(url).endsWith('/images/generations')) {
            return new Response(JSON.stringify({
                data: [{ url: 'https://cdn.example.test/cover.png' }]
            }), { status: 200 })
        }
        return new Response(pngBytes, {
            status: 200,
            headers: { 'content-type': 'image/png' }
        })
    }
    uploadController.persistImageBuffer = async ({ buffer, mimetype, userId }) => {
        persisted.push({ buffer, mimetype, userId })
        return { filename: 'ai-cover.png', url: '/api/uploads/ai-cover.png' }
    }
    aiModel.savePendingImage = async ({ token, userId, mimeType, buffer }) => {
        pendingStore.set(token, { userId, mimeType, buffer })
        return { token }
    }
    aiModel.takePendingImage = async (token, userId) => {
        const entry = pendingStore.get(token)
        pendingStore.delete(token)
        if (!entry || entry.userId !== userId) return null
        return { mimeType: entry.mimeType, buffer: entry.buffer }
    }

    try {
        const generated = createRes()
        await aiController.generateCover(
            {
                body: { title: '标题', introduce: '简介', content: '<p>正文</p>' },
                user: { userId: 7 },
                aiModel: TEST_AI_MODEL
            },
            generated
        )
        assert.equal(generated.statusCode, 0)
        assert.match(generated.body.data.token, /^[0-9a-f]{48}$/)
        assert.match(generated.body.data.dataUri, /^data:image\/png;base64,/)
        assert.match(generated.body.data.prompt, /不要出现任何文字/)

        const confirmed = createRes()
        await aiController.confirmCover(
            { body: { token: generated.body.data.token }, user: { userId: 7 } },
            confirmed
        )
        assert.equal(confirmed.statusCode, 0)
        assert.equal(confirmed.body.data.url, '/api/uploads/ai-cover.png')
        assert.equal(persisted.length, 1)
        assert.equal(persisted[0].mimetype, 'image/png')
        assert.equal(persisted[0].userId, 7)
        assert.ok(persisted[0].buffer.equals(pngBytes))

        const replay = createRes()
        await aiController.confirmCover(
            { body: { token: generated.body.data.token }, user: { userId: 7 } },
            replay
        )
        assert.equal(replay.statusCode, 400)
        assert.equal(persisted.length, 1)
    } finally {
        global.fetch = originalFetch
        uploadController.persistImageBuffer = originalPersist
        aiModel.savePendingImage = originalSave
        aiModel.takePendingImage = originalTake
    }
})

test('ai cover degrades to 503 when the provider fails', async () => {
    const originalFetch = global.fetch
    global.fetch = async () => new Response(null, { status: 500 })
    try {
        const res = createRes()
        await aiController.generateCover(
            { body: { title: '标题', content: '正文' }, user: { userId: 1 }, aiModel: TEST_AI_MODEL },
            res
        )
        assert.equal(res.statusCode, 503)
        assert.match(res.body.message, /AI 封面生成失败/)
    } finally {
        global.fetch = originalFetch
    }
})

test('confirm cover rejects unknown tokens', async () => {
    const originalTake = aiModel.takePendingImage
    aiModel.takePendingImage = async () => null
    try {
        const res = createRes()
        await aiController.confirmCover(
            { body: { token: 'a'.repeat(48) }, user: { userId: 1 } },
            res
        )
        assert.equal(res.statusCode, 400)
        assert.match(res.body.message, /不存在或已过期/)
    } finally {
        aiModel.takePendingImage = originalTake
    }
})

test('待确认图片只允许生成者本人采用', async () => {
    const originalTake = aiModel.takePendingImage
    const pendingStore = new Map()

    aiModel.takePendingImage = async (token, userId) => {
        const entry = pendingStore.get(token)
        pendingStore.delete(token)
        if (!entry || entry.userId !== userId) return null
        return { mimeType: entry.mimeType, buffer: entry.buffer }
    }

    try {
        const token = 'b'.repeat(48)
        pendingStore.set(token, { userId: 7, mimeType: 'image/png', buffer: Buffer.from('x') })

        // 别人拿着令牌来采用：令牌被消费但拿不到图片
        const other = createRes()
        await aiController.confirmCover(
            { body: { token }, user: { userId: 8 } },
            other
        )
        assert.equal(other.statusCode, 400)
        assert.match(other.body.message, /不存在或已过期/)
    } finally {
        aiModel.takePendingImage = originalTake
    }
})

test('parseSuggestionPayload strips code fences and clamps the result', () => {
    const parsed = aiClient.parseSuggestionPayload(
        '```json\n{"summary":"  简介  ","labels":["a","a","b","",42,"c","d","e","f"]}\n```'
    )
    assert.equal(parsed.summary, '简介')
    assert.deepEqual(parsed.labels, ['a', 'b', 'c', 'd', 'e'])
})

test('parseSuggestionPayload rejects non-JSON or incomplete suggestions', () => {
    assert.throws(() => aiClient.parseSuggestionPayload('抱歉，我无法完成'), /JSON/)
    assert.throws(() => aiClient.parseSuggestionPayload('{"summary":"只有简介"}'), /简介或标签/)
    assert.throws(() => aiClient.parseSuggestionPayload('{"labels":["a"]}'), /简介或标签/)
})
