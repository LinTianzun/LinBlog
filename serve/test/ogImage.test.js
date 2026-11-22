const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const test = require('node:test')

const express = require('express')

process.env.LINBLOG_JWT_SECRET = 'test-secret-that-is-at-least-32-characters-long'
process.env.LINBLOG_ALLOWED_ORIGINS = 'https://blog.example.com'
process.env.LINBLOG_PUBLIC_URL = 'https://blog.example.com'

const articleModel = require('../model/dbModel/article/index')
const diaryModel = require('../model/dbModel/diary/index')
const collectionModel = require('../model/dbModel/collection/index')
const noteModel = require('../model/dbModel/note/index')
const { buildOgSvg, renderOgImage, wrapText } = require('../utils/ogImage')
const {
    injectPortalMeta,
    parseMetaTarget,
    renderMetaTags,
    metaEtag,
} = require('../utils/portalMeta')
const ogController = require('../controller/ogController')

const ORIGIN = 'https://blog.example.com'

function withMocks(mocks, run) {
    const originals = new Map()
    for (const [target, key, value] of mocks) {
        originals.set(`${key}`, target[key])
        target[key] = value
    }
    return Promise.resolve()
        .then(run)
        .finally(() => {
            for (const [target, key] of mocks) {
                target[key] = originals.get(key)
            }
        })
}

test('OG SVG 使用 1200x630 画布并转义标题中的特殊字符', () => {
    const svg = buildOgSvg({
        title: 'A <script> & "quoted"',
        description: '一段简要说明',
        kind: 'article',
        date: '2026-10-29T10:00:00.000Z',
        url: `${ORIGIN}/portal/articles?open=1`,
    })

    assert.match(svg, /width="1200" height="630"/)
    assert.match(svg, /A &amp; &quot;quoted&quot;/)
    assert.doesNotMatch(svg, /A &amp; &quot;quoted&quot;…/)
    assert.doesNotMatch(svg, /<script>/)
    assert.match(svg, /2026\.10\.29/)
})

test('OG 标题与摘要按画布宽度换行，长文本带省略号', () => {
    const lines = wrapText('一二三四五六七八九十一二三四五六七八九十一二三四五', 10, 2)
    assert.equal(lines.length, 2)
    assert.match(lines[1], /…$/)
})

test('OG 图片渲染为合法 PNG', async () => {
    const image = await renderOgImage({ title: '中文分享卡片', kind: 'home' })
    assert.equal(image.subarray(1, 4).toString(), 'PNG')
    assert.ok(image.length > 1000)
})

test('门户 meta 注入替换旧 SEO 标签且不产生重复 canonical', () => {
    const html = `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8" />
  <meta name="description" content="旧描述" />
  <meta property="og:title" content="旧标题" />
  <meta name="twitter:card" content="summary" />
  <link rel="canonical" href="https://old.example.com/" />
  <link rel="alternate" type="application/rss+xml" href="/feed.xml" />
  <script type="application/ld+json">{"@type":"Thing"}</script>
  <title>旧标题</title>
</head>
<body><div id="app"></div></body>
</html>`

    const output = injectPortalMeta(html, {
        title: '新文章 & 预览',
        description: '新描述',
        url: `${ORIGIN}/portal/articles?open=12`,
        image: `${ORIGIN}/og/article/12.png`,
        type: 'article',
        publishedTime: '2026-10-01T08:00:00.000Z',
        jsonLd: {
            '@context': 'https://schema.org',
            '@type': 'BlogPosting',
            headline: '新文章',
        },
    })

    assert.match(output, /<title>新文章 &amp; 预览 \| 林知雨 · 个人刊物<\/title>/)
    assert.equal((output.match(/rel="canonical"/g) || []).length, 1)
    assert.equal((output.match(/property="og:title"/g) || []).length, 1)
    assert.doesNotMatch(output, /旧描述|旧标题|old\.example\.com|"@type":"Thing"/)
    assert.match(output, /og:image" content="https:\/\/blog\.example\.com\/og\/article\/12\.png"/)
    assert.match(output, /twitter:card" content="summary_large_image"/)
    assert.match(output, /"@type":"BlogPosting"/)
    assert.match(output, /rel="alternate" type="application\/rss\+xml"/)
})

test('门户路径解析出文章、图库、随笔、系列与首页目标', () => {
    assert.deepEqual(parseMetaTarget('/portal/articles', '?open=7'), { kind: 'article', id: 7 })
    assert.deepEqual(parseMetaTarget('/portal/gallery', '?open=8'), { kind: 'gallery', id: 8 })
    assert.deepEqual(parseMetaTarget('/portal/diary', '?open=9'), { kind: 'diary', id: 9 })
    assert.deepEqual(parseMetaTarget('/portal/series', '?collection=3'), { kind: 'series', id: 3 })
    assert.deepEqual(parseMetaTarget('/portal/notes', '?open=11'), { kind: 'note', id: 11 })
    assert.deepEqual(parseMetaTarget('/portal/articles', ''), { kind: 'article', id: null })
    assert.deepEqual(parseMetaTarget('/portal/messages', ''), { kind: 'home', id: null })
    assert.equal(parseMetaTarget('/article', ''), null)
    assert.equal(parseMetaTarget('/api/portal/articles', ''), null)
})

test('花园笔记只对已公开内容生成 OG 元信息', async () => {
    const [meta, hidden] = await withMocks([
        [noteModel, 'findPublicNoteById', async id => (id === 11
            ? {
                id: 11,
                title: '双链与花园',
                content: '用 [[另一篇]] 连接想法',
                publishedAt: '2026-11-20T08:00:00.000Z',
                updatedAt: '2026-11-21T08:00:00.000Z',
            }
            : null)],
    ], async () => Promise.all([
        ogController.loadMeta('note', 11, ORIGIN),
        ogController.loadMeta('note', 12, ORIGIN),
    ]))

    assert.equal(meta.image, `${ORIGIN}/og/note/11.png`)
    assert.equal(meta.imageKind, 'note')
    assert.equal(meta.jsonLd['@type'], 'BlogPosting')
    assert.match(meta.description, /连接想法/)
    assert.equal(hidden, null)
})

test('非法 ID 回落首页分享图，草稿不会出现在 OG 元信息中', async () => {
    const meta = await withMocks([
        [articleModel, 'findAtricleById', async () => null],
    ], () => ogController.loadMeta('article', 999, ORIGIN))
    assert.equal(meta, null)

    const etag1 = metaEtag({ title: 'A', description: 'B', url: `${ORIGIN}/a` })
    const etag2 = metaEtag({ title: 'A', description: 'B', url: `${ORIGIN}/a` })
    const etag3 = metaEtag({ title: 'A2', description: 'B', url: `${ORIGIN}/a` })
    assert.equal(etag1, etag2)
    assert.notEqual(etag1, etag3)
})

test('公开文章 OG 元信息包含封面、时间与 JSON-LD', async () => {
    const meta = await withMocks([
        [articleModel, 'findAtricleById', async () => ({
            id: 12,
            title: '文章 <标题>',
            introduce: '<p>一段&nbsp;摘要</p>',
            content: '',
            cover: '/api/uploads/cover.webp',
            classify: 'article',
            state: 'published',
            publishedAt: '2026-10-01T08:00:00.000Z',
            updatedAt: '2026-10-02T08:00:00.000Z',
            createdAt: '2026-09-30T08:00:00.000Z',
        })],
    ], () => ogController.loadMeta('article', 12, ORIGIN))

    assert.equal(meta.title, '文章 <标题>')
    assert.equal(meta.description, '一段 摘要')
    assert.equal(meta.image, `${ORIGIN}/api/uploads/cover.webp`)
    assert.equal(meta.jsonLd['@type'], 'BlogPosting')
    assert.match(renderMetaTags(meta), /article:published_time" content="2026-10-01T08:00:00\.000Z"/)
})

test('无封面时回退动态 OG 图，图库按图片数量生成摘要', async () => {
    const gallery = await withMocks([
        [articleModel, 'findAtricleById', async () => ({
            id: 21,
            title: '光与影',
            introduce: '',
            content: JSON.stringify(['/a.jpg', '/b.jpg']),
            cover: '',
            classify: 'image',
            publishedAt: null,
            updatedAt: null,
            createdAt: '2026-10-01T08:00:00.000Z',
        })],
    ], () => ogController.loadMeta('gallery', 21, ORIGIN))

    assert.equal(gallery.image, `${ORIGIN}/a.jpg`)
    assert.equal(gallery.description, '光与影，共 2 张摄影作品。')
    assert.equal(gallery.jsonLd['@type'], 'ImageGallery')
})

test('图库在无封面且无图片时使用动态 OG 图', async () => {
    const gallery = await withMocks([
        [articleModel, 'findAtricleById', async () => ({
            id: 22,
            title: '空图库',
            introduce: '',
            content: '[]',
            cover: '',
            classify: 'image',
            createdAt: '2026-10-01T08:00:00.000Z',
        })],
    ], () => ogController.loadMeta('gallery', 22, ORIGIN))

    assert.equal(gallery.image, `${ORIGIN}/og/gallery/22.png`)
})

test('随笔与系列只对公开内容生成元信息', async () => {
    const [diaryMeta, emptySeriesMeta, seriesMeta] = await withMocks([
        [diaryModel, 'findPublicDiaryById', async id => (id === 5
            ? {
                id: 5,
                title: '下雨天',
                content: '雨声与咖啡',
                picture: ['/p.jpg'],
                createdAt: '2026-10-05T08:00:00.000Z',
            }
            : null)],
        [collectionModel, 'findCollectionById', async id => (id === 3
            ? {
                id: 3,
                name: '深入 Vue',
                description: '',
                cover: '',
                publishedCount: 4,
            }
            : id === 4
                ? { id: 4, name: '空系列', publishedCount: 0 }
                : null)],
    ], async () => Promise.all([
        ogController.loadMeta('diary', 5, ORIGIN),
        ogController.loadMeta('series', 4, ORIGIN),
        ogController.loadMeta('series', 3, ORIGIN),
    ]))

    assert.equal(diaryMeta.image, `${ORIGIN}/p.jpg`)
    assert.equal(diaryMeta.jsonLd['@type'], 'BlogPosting')
    assert.equal(emptySeriesMeta, null)
    assert.equal(seriesMeta.jsonLd['@type'], 'CollectionPage')
})

test('门户 meta 中间件对公开详情返回注入后的 HTML', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'linblog-og-'))
    const indexFile = path.join(dir, 'index.html')
    fs.writeFileSync(indexFile, '<!doctype html><html><head><title>SPA</title></head><body><div id="app"></div></body></html>')

    process.env.LINBLOG_PUBLIC_URL = ORIGIN
    const { createPortalHtmlMeta } = require('../middleware/portalHtmlMeta')
    const middleware = createPortalHtmlMeta(indexFile)
    const res = {
        headers: {},
        statusCode: 200,
        body: '',
        setHeader(key, value) { this.headers[key.toLowerCase()] = value },
        type(value) { this.headers['content-type'] = value; return this },
        send(value) { this.body = value; return this },
    }

    await withMocks([
        [articleModel, 'findAtricleById', async () => ({
            id: 14,
            title: '服务端注入',
            introduce: '爬虫可直接读取',
            content: '',
            cover: '',
            classify: 'article',
            publishedAt: '2026-10-01T08:00:00.000Z',
            updatedAt: '2026-10-01T08:00:00.000Z',
            createdAt: '2026-10-01T08:00:00.000Z',
        })],
    ], () => middleware(
        { method: 'GET', path: '/portal/articles', originalUrl: '/portal/articles?open=14' },
        res,
        () => {}
    ))

    assert.match(res.body, /<title>服务端注入 \| 林知雨 · 个人刊物<\/title>/)
    assert.match(res.body, /og:image" content="https:\/\/blog\.example\.com\/og\/article\/14\.png"/)
    assert.equal(res.headers['cache-control'], 'no-cache')
    fs.rmSync(dir, { recursive: true, force: true })
})

test('门户 HTML 与 OG 图接口可通过真实 HTTP 访问', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'linblog-http-'))
    const indexFile = path.join(dir, 'index.html')
    fs.writeFileSync(indexFile, '<!doctype html><html><head><title>SPA</title></head><body><div id="app"></div></body></html>')

    const { createPortalHtmlMeta } = require('../middleware/portalHtmlMeta')
    const ogRoutes = require('../routes/og')
    const article = {
        id: 31,
        title: 'HTTP 分享卡片',
        introduce: '可直接抓取',
        content: '',
        cover: '',
        classify: 'article',
        publishedAt: '2026-10-01T08:00:00.000Z',
        updatedAt: '2026-10-01T08:00:00.000Z',
        createdAt: '2026-10-01T08:00:00.000Z',
    }

    const app = express()
    ogRoutes(app)
    app.use(createPortalHtmlMeta(indexFile))

    const server = app.listen(0, '127.0.0.1')
    await new Promise((resolve) => server.once('listening', resolve))
    const origin = `http://127.0.0.1:${server.address().port}`

    try {
        await withMocks([
            [articleModel, 'findAtricleById', async id => (id === 31 ? article : null)],
        ], async () => {
            const page = await fetch(`${origin}/portal/articles?open=31`)
            const html = await page.text()
            assert.equal(page.status, 200)
            assert.equal(page.headers.get('cache-control'), 'no-cache')
            assert.match(html, /<title>HTTP 分享卡片 \| 林知雨 · 个人刊物<\/title>/)
            assert.match(html, /og:image" content="https:\/\/blog\.example\.com\/og\/article\/31\.png"/)

            const image = await fetch(`${origin}/og/article/31.png`)
            assert.equal(image.status, 200)
            assert.equal(image.headers.get('content-type'), 'image/png')
            assert.match(image.headers.get('cache-control'), /s-maxage=86400/)
            const etag = image.headers.get('etag')
            assert.ok(etag)
            const notModified = await fetch(`${origin}/og/article/31.png`, {
                headers: { 'If-None-Match': etag },
            })
            assert.equal(notModified.status, 304)
        })
    } finally {
        ogController.clearImageCache()
        await new Promise((resolve) => {
            if (typeof server.closeAllConnections === 'function') server.closeAllConnections()
            server.close(resolve)
        })
        fs.rmSync(dir, { recursive: true, force: true })
    }
})
