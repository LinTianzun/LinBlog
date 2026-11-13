const assert = require('node:assert/strict')
const path = require('node:path')
const test = require('node:test')

process.env.LINBLOG_JWT_SECRET = 'test-secret-that-is-at-least-32-characters-long'

const controller = require(path.resolve(__dirname, '../controller/contentHealthController.js'))
const model = require(path.resolve(__dirname, '../model/dbModel/contentHealth/index.js'))

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

function targets() {
    return {
        articles: new Map([
            [1, { classify: 'article' }],
            [2, { classify: 'image' }],
            [3, { classify: 'article' }]
        ]),
        diaries: new Set([5]),
        collections: new Set([8])
    }
}

test('content health report detects editorial and link issues', () => {
    const now = new Date('2026-11-13T00:00:00.000Z')
    const oldDate = '2025-01-01T00:00:00.000Z'
    const report = controller.buildContentHealthReport({
        rows: [
            {
                id: 1,
                title: '需要整理的文章',
                classify: 'article',
                subsetId: null,
                subsetName: '',
                label: '',
                introduce: '',
                cover: '',
                content: [
                    '<p>短正文</p>',
                    '<a href="/portal/articles?open=999">失效文章</a>',
                    '<a href="/portal/series?collection=99">失效系列</a>',
                    '<a href="/portal/unknown">未知页面</a>'
                ].join(''),
                views: 12,
                publishedAt: oldDate,
                updatedAt: oldDate,
                createdAt: oldDate
            },
            {
                id: 2,
                title: '空图库',
                classify: 'image',
                subsetId: 1,
                subsetName: '摄影',
                label: '摄影',
                introduce: '图库说明',
                cover: '',
                content: '[]',
                views: 3,
                publishedAt: now.toISOString(),
                updatedAt: now.toISOString(),
                createdAt: now.toISOString()
            }
        ],
        total: 3,
        scanLimit: 2000,
        targets: targets(),
        staleDays: 180,
        now
    })

    assert.equal(report.summary.published, 3)
    assert.equal(report.summary.scanned, 2)
    assert.equal(report.summary.issueItems, 2)
    assert.equal(report.summary.byIssue.missingCover, 1)
    assert.equal(report.summary.byIssue.missingIntro, 1)
    assert.equal(report.summary.byIssue.uncategorized, 1)
    assert.equal(report.summary.byIssue.missingLabels, 1)
    assert.equal(report.summary.byIssue.staleContent, 1)
    assert.equal(report.summary.byIssue.shortContent, 1)
    assert.equal(report.summary.byIssue.emptyGallery, 1)
    assert.equal(report.summary.byIssue.brokenLinks, 1)

    const article = report.items.find(item => item.id === 1)
    assert.ok(article.issues.includes('missingCover'))
    assert.ok(article.issues.includes('brokenLinks'))
    assert.equal(article.brokenLinks.length, 3)
    assert.equal(article.editPath, '/editarticle/1')
    assert.ok(report.truncated)
})

test('valid portal links and recent healthy content are not flagged', () => {
    const content = [
        '<a href="/portal/articles">文章归档</a>',
        '<a href="/portal/articles?open=3">上一篇</a>',
        '<a href="/portal/gallery?open=2">图库</a>',
        '<a href="/portal/diary?open=5">随笔</a>',
        '<a href="/portal/series?collection=8">系列</a>',
        '<a href="https://example.com/outside">外链</a>'
    ].join('')
    const now = new Date('2026-11-13T00:00:00.000Z')
    const text = `这是一段足够长的正文，用来确认健康检查不会因为正文过短而误报。${'内容'.repeat(180)}`
    const report = controller.buildContentHealthReport({
        rows: [{
            id: 3,
            title: '健康文章',
            classify: 'article',
            subsetId: 1,
            subsetName: '技术',
            label: 'Vue',
            introduce: '完整简介',
            cover: '/cover.png',
            content: `<p>${text}</p>${content}`,
            views: 10,
            publishedAt: now.toISOString(),
            updatedAt: now.toISOString(),
            createdAt: now.toISOString()
        }],
        targets: targets(),
        staleDays: 180,
        now
    })

    assert.equal(report.items.length, 0)
    assert.equal(report.summary.healthy, 1)
})

test('stale days are clamped to a safe range', () => {
    assert.equal(controller.normalizeStaleDays(undefined), 180)
    assert.equal(controller.normalizeStaleDays(1), 30)
    assert.equal(controller.normalizeStaleDays(9999), 730)
    assert.equal(controller.normalizeStaleDays('90'), 90)
})

test('getContentHealth returns the aggregated report', async () => {
    const originalMethods = {
        listPublishedContentForHealth: model.listPublishedContentForHealth,
        listPublishedArticleTargets: model.listPublishedArticleTargets,
        listPublishedDiaryIds: model.listPublishedDiaryIds,
        listPublicCollectionIds: model.listPublicCollectionIds
    }
    const now = new Date()
    model.listPublishedContentForHealth = async () => ({
        rows: [{
            id: 1,
            title: '缺封面文章',
            classify: 'article',
            subsetId: 1,
            subsetName: '技术',
            label: 'Vue',
            introduce: '简介',
            cover: '',
            content: `<p>${'正文'.repeat(180)}</p>`,
            views: 1,
            publishedAt: now.toISOString(),
            updatedAt: now.toISOString(),
            createdAt: now.toISOString()
        }],
        total: 1,
        scanLimit: 2000
    })
    model.listPublishedArticleTargets = async () => [{ id: 1, classify: 'article' }]
    model.listPublishedDiaryIds = async () => []
    model.listPublicCollectionIds = async () => []

    try {
        const res = createRes()
        await controller.getContentHealth({ query: { staleDays: '90' } }, res)

        assert.equal(res.body.code, 200)
        assert.equal(res.body.data.staleDays, 90)
        assert.equal(res.body.data.summary.byIssue.missingCover, 1)
        assert.equal(res.body.data.items[0].title, '缺封面文章')
    } finally {
        Object.assign(model, originalMethods)
    }
})

test('article health report ignores external-only invalid URLs', () => {
    const issues = controller.validatePortalLinks(
        '<a href="https://example.com/not-found">外部链接</a>',
        targets()
    )
    assert.deepEqual(issues, [])
})
