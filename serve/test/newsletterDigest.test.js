const assert = require('node:assert/strict')
const test = require('node:test')

process.env.LINBLOG_JWT_SECRET = 'test-secret-that-is-at-least-32-characters-long'
process.env.LINBLOG_ALLOWED_ORIGINS = 'https://blog.example.com'
process.env.LINBLOG_PUBLIC_URL = 'https://blog.example.com'

const newsletterModel = require('../model/dbModel/newsletter/index')
const {
    buildDigest,
    renderDigestText,
    renderDigestHtml,
    sendDigestOnce,
    startNewsletterDigest,
} = require('../utils/newsletterDigest')

const ORIGIN = 'https://blog.example.com'
const SINCE = new Date('2026-11-15T00:00:00.000Z')

test('摘要汇总最近文章、图库与随笔，并生成门户详情链接', () => {
    const digest = buildDigest({
        origin: ORIGIN,
        since: SINCE,
        articles: [
            {
                id: 1,
                title: '文章',
                introduce: '<p>文章摘要</p>',
                classify: 'article',
                publishedAt: '2026-11-20T08:00:00.000Z',
            },
            {
                id: 2,
                title: '图库',
                introduce: '一组光线',
                classify: 'image',
                publishedAt: '2026-11-19T08:00:00.000Z',
            },
        ],
        diaries: [
            {
                id: 3,
                title: '随笔',
                content: '<p>日常片段</p>',
                createdAt: '2026-11-21T08:00:00.000Z',
            },
        ],
    })

    assert.equal(digest.items.length, 3)
    assert.equal(digest.items[0].kindLabel, '随笔')
    assert.equal(digest.items[0].url, `${ORIGIN}/portal/diary?open=3`)
    assert.equal(digest.items[0].url, `${ORIGIN}/portal/diary?open=3`)
    assert.equal(digest.items[1].url, `${ORIGIN}/portal/articles?open=1`)
    assert.equal(digest.items[2].url, `${ORIGIN}/portal/gallery?open=2`)
    assert.equal(digest.items[1].description, '文章摘要')
})

test('摘要邮件带退订链接并转义标题', () => {
    const digest = buildDigest({
        origin: ORIGIN,
        since: SINCE,
        articles: [{
            id: 9,
            title: '光 <&> 影',
            introduce: '说明',
            classify: 'article',
            publishedAt: '2026-11-20T08:00:00.000Z',
        }],
    })
    const unsubscribe = `${ORIGIN}/api/newsletter/unsubscribe?token=abc`
    const text = renderDigestText(digest, unsubscribe)
    const html = renderDigestHtml(digest, unsubscribe)

    assert.match(text, /退订[\s\S]*unsubscribe/)
    assert.match(html, /光 &lt;&amp;&gt; 影/)
    assert.match(html, /href="https:\/\/blog\.example\.com\/api\/newsletter\/unsubscribe\?token=abc"/)
})

test('没有新内容时不发信也不读取收件人', async () => {
    const articleModel = require('../model/dbModel/article/index')
    const diaryModel = require('../model/dbModel/diary/index')
    const originalArticles = articleModel.listPublishedContentForFeed
    const originalDiaries = diaryModel.listPublicDiariesForFeed
    const originalList = newsletterModel.listDigestRecipients
    let listed = 0
    articleModel.listPublishedContentForFeed = async () => []
    diaryModel.listPublicDiariesForFeed = async () => []
    newsletterModel.listDigestRecipients = async () => { listed += 1; return [] }

    const config = require('../config/default')
    const originalSmtp = config.smtp.host
    config.smtp.host = 'smtp.example.com'

    try {
        const result = await sendDigestOnce({ origin: ORIGIN, since: SINCE })
        assert.equal(result.reason, 'no_updates')
        assert.equal(result.sent, 0)
        assert.equal(listed, 0)
    } finally {
        articleModel.listPublishedContentForFeed = originalArticles
        diaryModel.listPublicDiariesForFeed = originalDiaries
        newsletterModel.listDigestRecipients = originalList
    }
})

test('按收件人发送摘要，失败的订阅者不会被标记为已发送', async () => {
    const articleModel = require('../model/dbModel/article/index')
    const diaryModel = require('../model/dbModel/diary/index')
    const originalArticles = articleModel.listPublishedContentForFeed
    const originalDiaries = diaryModel.listPublicDiariesForFeed
    const originalList = newsletterModel.listDigestRecipients
    const originalToken = newsletterModel.createUnsubscribeToken
    const originalMark = newsletterModel.markDigestSent
    const mails = []
    const marked = []

    articleModel.listPublishedContentForFeed = async () => [{
        id: 1,
        title: '新文章',
        introduce: '摘要',
        classify: 'article',
        publishedAt: '2026-11-20T08:00:00.000Z',
    }]
    diaryModel.listPublicDiariesForFeed = async () => []
    newsletterModel.listDigestRecipients = async () => [
        { id: 1, email: 'ok@example.com' },
        { id: 2, email: 'fail@example.com' },
    ]
    newsletterModel.createUnsubscribeToken = async id => `token-${id}`
    newsletterModel.markDigestSent = async ids => { marked.push(ids); return ids.length }
    const sendMail = async payload => {
        if (payload.to === 'fail@example.com') throw new Error('SMTP 拒绝')
        mails.push(payload)
        return { delivered: true }
    }

    try {
        const result = await sendDigestOnce({ origin: ORIGIN, since: SINCE, sendMail })
        assert.equal(result.sent, 1)
        assert.equal(result.skipped, 1)
        assert.equal(mails.length, 1)
        assert.match(mails[0].text, /token-1/)
        assert.deepEqual(marked, [[1]])
    } finally {
        articleModel.listPublishedContentForFeed = originalArticles
        diaryModel.listPublicDiariesForFeed = originalDiaries
        newsletterModel.listDigestRecipients = originalList
        newsletterModel.createUnsubscribeToken = originalToken
        newsletterModel.markDigestSent = originalMark
    }
})

test('摘要任务在没有任何待接收地址时不扫描内容', async () => {
    const originalList = newsletterModel.listDigestRecipients
    let digestCalls = 0
    newsletterModel.listDigestRecipients = async () => []

    const scheduler = startNewsletterDigest({
        enabled: true,
        intervalMs: 60_000,
        sendDigest: async () => { digestCalls += 1 },
    })

    try {
        await scheduler.runOnce()
        assert.equal(digestCalls, 0)
    } finally {
        scheduler.stop()
        newsletterModel.listDigestRecipients = originalList
    }
})
