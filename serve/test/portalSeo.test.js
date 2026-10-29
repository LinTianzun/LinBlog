const assert = require('node:assert/strict')
const test = require('node:test')

process.env.LINBLOG_JWT_SECRET = 'test-secret-that-is-at-least-32-characters-long'
process.env.LINBLOG_ALLOWED_ORIGINS = 'https://blog.example.com'
process.env.LINBLOG_PUBLIC_URL = 'https://blog.example.com'

const {
    excerpt,
    renderFeed,
    renderRobots,
    renderSitemap,
    resolveOrigin
} = require('../controller/seoController.js')

test('sitemap 会收录门户归档、文章、图库和随笔详情', () => {
    const xml = renderSitemap({
        origin: 'https://blog.example.com',
        articles: [
            {
                id: 1,
                classify: 'article',
                updatedAt: '2026-10-29T10:00:00.000Z',
                publishedAt: '2026-10-29T09:00:00.000Z',
                createdAt: '2026-10-29T08:00:00.000Z'
            },
            {
                id: 2,
                classify: 'image',
                updatedAt: '2026-10-28T10:00:00.000Z',
                publishedAt: '2026-10-28T09:00:00.000Z',
                createdAt: '2026-10-28T08:00:00.000Z'
            }
        ],
        diaries: [
            {
                id: 3,
                createdAt: '2026-10-27T08:00:00.000Z'
            }
        ],
        now: new Date('2026-10-29T12:00:00.000Z')
    })

    assert.match(xml, /<loc>https:\/\/blog\.example\.com\/portal<\/loc>/)
    assert.match(xml, /<loc>https:\/\/blog\.example\.com\/portal\/articles\?open=1<\/loc>/)
    assert.match(xml, /<loc>https:\/\/blog\.example\.com\/portal\/gallery\?open=2<\/loc>/)
    assert.match(xml, /<loc>https:\/\/blog\.example\.com\/portal\/diary\?open=3<\/loc>/)
    assert.match(xml, /<lastmod>2026-10-29T10:00:00.000Z<\/lastmod>/)
})

test('RSS 合并文章、图库与随笔，并按发布时间倒序', () => {
    const xml = renderFeed({
        origin: 'https://blog.example.com',
        articles: [
            {
                id: 1,
                classify: 'article',
                title: '较早的文章',
                introduce: '文章摘要',
                publishedAt: '2026-10-01T08:00:00.000Z',
                createdAt: '2026-10-01T08:00:00.000Z'
            },
            {
                id: 2,
                classify: 'image',
                title: '图库 & 光线',
                introduce: '图库摘要',
                publishedAt: '2026-10-03T08:00:00.000Z',
                createdAt: '2026-10-03T08:00:00.000Z'
            }
        ],
        diaries: [
            {
                id: 3,
                title: '最新的随笔',
                content: '一段随笔内容',
                createdAt: '2026-10-04T08:00:00.000Z'
            }
        ],
        now: new Date('2026-10-29T12:00:00.000Z')
    })

    assert.match(xml, /<rss version="2.0"/)
    assert.match(xml, /<title>图库 &amp; 光线<\/title>/)
    assert.match(xml, /portal\/gallery\?open=2/)
    assert.ok(xml.indexOf('最新的随笔') < xml.indexOf('图库 &amp; 光线'))
    assert.ok(xml.indexOf('图库 &amp; 光线') < xml.indexOf('较早的文章'))
})

test('robots 只开放门户与上传资源，并声明 sitemap 地址', () => {
    const robots = renderRobots('https://blog.example.com/')
    assert.match(robots, /Allow: \/portal/)
    assert.match(robots, /Allow: \/api\/uploads\//)
    assert.match(robots, /Disallow: \/overView/)
    assert.match(robots, /Sitemap: https:\/\/blog\.example\.com\/sitemap\.xml/)
})

test('SEO 站点来源优先使用 LINBLOG_PUBLIC_URL', () => {
    assert.equal(resolveOrigin({}), 'https://blog.example.com')
    assert.equal(excerpt('<p>一段&nbsp;<strong>正文</strong></p>', 20), '一段 正文')
})
