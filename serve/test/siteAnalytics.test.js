const assert = require('node:assert/strict')
const path = require('node:path')
const test = require('node:test')

process.env.LINBLOG_JWT_SECRET = 'test-secret-that-is-at-least-32-characters-long'

const controller = require(path.resolve(__dirname, '../controller/siteAnalyticsController.js'))
const model = require(path.resolve(__dirname, '../model/dbModel/siteAnalytics/index.js'))

function createRes() {
    return {
        statusCode: 200,
        body: null,
        ended: false,
        status(code) {
            this.statusCode = code
            return this
        },
        json(payload) {
            this.body = payload
            return this
        },
        end() {
            this.ended = true
            return this
        }
    }
}

test('search events trim text, clamp result counts and normalize source', () => {
    assert.deepEqual(
        controller.normalizeSearchEvent({
            keyword: '  Vue\n 响应式  ',
            source: 'semantic',
            resultCount: '12'
        }),
        {
            keyword: 'Vue 响应式',
            source: 'semantic',
            resultCount: 12
        }
    )
    assert.equal(controller.normalizeSearchEvent({ keyword: '   ' }), null)
    assert.equal(
        controller.normalizeSearchEvent({ keyword: '测试', source: 'other', resultCount: -1 }).source,
        'standard'
    )
    assert.equal(
        controller.normalizeSearchEvent({ keyword: '测试', resultCount: -1 }).resultCount,
        null
    )
})

test('404 paths only keep local pathname', () => {
    assert.equal(
        controller.normalizeNotFoundPath('/portal/old-page?from=mail#top'),
        '/portal/old-page'
    )
    assert.equal(controller.normalizeNotFoundPath('https://example.com/missing'), null)
    assert.equal(controller.normalizeNotFoundPath('//example.com/missing'), null)
    assert.equal(controller.normalizeNotFoundPath('   '), null)
})

test('recordSearchEvent stores a sanitized event and returns no content', async () => {
    const original = model.recordSearch
    let saved = null
    model.recordSearch = async (payload) => {
        saved = payload
    }

    try {
        const res = createRes()
        await controller.recordSearchEvent({
            body: { keyword: '  内容健康  ', source: 'semantic', resultCount: 3 }
        }, res)

        assert.equal(res.statusCode, 204)
        assert.equal(res.ended, true)
        assert.deepEqual(saved, {
            keyword: '内容健康',
            source: 'semantic',
            resultCount: 3
        })
    } finally {
        model.recordSearch = original
    }
})

test('recordNotFoundEvent rejects invalid external paths', async () => {
    const original = model.recordNotFound
    let called = false
    model.recordNotFound = async () => {
        called = true
    }

    try {
        const res = createRes()
        await controller.recordNotFoundEvent({ body: { path: 'https://example.com/missing' } }, res)
        assert.equal(res.statusCode, 400)
        assert.equal(called, false)
    } finally {
        model.recordNotFound = original
    }
})

test('site event stats fill the requested trend window', async () => {
    const originalStats = model.getStats
    // 趋势窗口以“今天”为终点，用例不能写死日期，否则跨天就会失败
    const today = new Date()
    const todayLabel = `${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`
    model.getStats = async (days, limit) => ({
        days,
        limit,
        summary: {
            searches: 10,
            uniqueSearchTerms: 4,
            zeroResultSearches: 2,
            semanticSearches: 3,
            notFound: 5,
            uniqueNotFoundPaths: 2
        },
        searchTerms: [],
        notFoundPaths: [],
        trend: [{ date: todayLabel, searches: 5, notFound: 2 }]
    })

    try {
        const res = createRes()
        await controller.getSiteEventStats({ query: { days: '30', limit: '20' } }, res)

        assert.equal(res.body.code, 200)
        assert.equal(res.body.data.summary.standardSearches, 7)
        assert.equal(res.body.data.trend.length, 30)
        assert.deepEqual(res.body.data.trend.at(-1), {
            date: todayLabel,
            searches: 5,
            notFound: 2
        })
    } finally {
        model.getStats = originalStats
    }
})
