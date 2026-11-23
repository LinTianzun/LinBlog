const assert = require('node:assert/strict')
const test = require('node:test')

const { buildTidyReport, suggestTargets, tokenize } = require('../utils/gardenTidy')

const note = (overrides) => ({
    id: 1,
    title: '笔记',
    content: '正文',
    state: 'published',
    tags: [],
    outgoingLinks: 0,
    incomingLinks: 0,
    updatedAt: '2026-11-20T08:00:00.000Z',
    ...overrides,
})

test('中文二元组跳过虚词，英文统一小写并带前缀', () => {
    const tokens = tokenize('Vue 的响应式原理')
    assert.ok(tokens.includes('w:vue'))
    assert.ok(tokens.includes('c:响应'))
    assert.ok(!tokens.includes('c:的响'))
})

test('推荐标题：相似度为主，已连接的目标不再出现', () => {
    const current = note({ id: 1, title: '双链笔记', content: '知识网络与反向链接', tags: ['知识管理'] })
    const pool = [
        note({ id: 2, title: '再谈双链笔记', content: '知识网络的链接实践', tags: ['知识管理'], incomingLinks: 3 }),
        note({ id: 3, title: '周末去山里拍照', content: '光线与雾气' }),
        note({ id: 4, title: '反向链接为什么重要', content: '别人从哪里找到你' }),
    ]

    const all = suggestTargets({ ...current, linkedIds: [] }, pool, 3)
    assert.equal(all[0].id, 2)
    assert.ok(all[0].reasons.includes('同标签 · 知识管理'))

    const filtered = suggestTargets({ ...current, linkedIds: [2] }, pool, 3)
    assert.ok(!filtered.some(item => item.id === 2))
})

test('目标标题已出现在正文时加分并给出理由', () => {
    const current = note({ id: 1, title: '两种节奏', content: '花园与博客如何分工，这条路线以后再展开写' })
    const pool = [note({ id: 5, title: '花园与博客如何分工', content: '两种节奏' })]
    const [first] = suggestTargets(current, pool, 1)
    assert.equal(first.id, 5)
    assert.ok(first.reasons.includes('正文已提到标题'))
})

test('待整理清单：识别孤立笔记与断链，并附推荐', () => {
    const notes = [
        note({
            id: 1,
            title: '入口',
            content: '去读 [[内页]] 和 [[还不存在的一篇]]',
            outgoingLinks: 1,
            incomingLinks: 0,
            tags: ['索引'],
        }),
        note({ id: 2, title: '内页', content: '正文', outgoingLinks: 0, incomingLinks: 1, tags: ['索引'] }),
        note({ id: 3, title: '孤岛笔记', content: '还没有任何链接', tags: [] }),
        note({ id: 4, title: '草稿', content: '[[入口]]', state: 'draft' }),
    ]

    const report = buildTidyReport(notes, { limit: 3 })
    assert.deepEqual(report.orphans.map(item => item.id), [3])
    assert.deepEqual(report.brokenLinks.map(item => item.id), [1])
    assert.deepEqual(report.brokenLinks[0].missingLinks, ['还不存在的一篇'])
    assert.ok(report.brokenLinks[0].suggestions.every(item => item.id !== 2))
    assert.equal(report.summary.published, 3)
    assert.equal(report.summary.orphan, 1)
    assert.equal(report.summary.broken, 1)
})

test('已发布文章可作为推荐目标，并保留长文标记', () => {
    const current = note({
        id: 1,
        title: '从双链到门户',
        content: '花园里的想法后来整理成了完整长文',
        tags: ['花园'],
    })
    const report = buildTidyReport(
        [current],
        {
            limit: 2,
            articles: [{
                id: 9,
                title: '从双链到门户：完整版',
                content: '把花园里的想法整理成完整长文，讲清知识网络',
                tags: ['花园'],
                kind: 'article',
            }],
        }
    )

    assert.equal(report.orphans.length, 1)
    const suggestion = report.orphans[0].suggestions.find(item => item.id === 9)
    assert.ok(suggestion)
    assert.equal(suggestion.kind, 'article')
    assert.equal(suggestion.key, 'article:9')
    assert.equal(suggestion.url, '/portal/articles?open=9')
    assert.ok(suggestion.reasons.includes('长文'))
})

test('已链接的长文不再推荐，笔记与文章同 ID 时仍能同时区分', () => {
    const current = note({
        id: 1,
        title: '双链与长文',
        content: '已经写过 [完整版](/portal/articles?open=9)',
        tags: ['花园'],
        linkedArticleIds: [9],
    })
    const pool = [
        { ...note({ id: 9, title: '同名笔记', content: '双链与长文' }), kind: 'note' },
        { ...note({ id: 9, title: '双链与长文完整版', content: '双链与长文' }), kind: 'article' },
    ]

    const suggestions = suggestTargets(current, pool, 5)
    assert.ok(suggestions.some(item => item.key === 'note:9'))
    assert.ok(!suggestions.some(item => item.key === 'article:9'))

    // 文章与当前笔记同 ID 时不能被「排除自己」误伤
    const sameId = suggestTargets(
        note({ id: 9, title: '双链与长文', content: '标题相近' }),
        [{ ...note({ id: 9, title: '双链与长文完整版', content: '标题相近' }), kind: 'article' }],
        3
    )
    assert.ok(sameId.some(item => item.key === 'article:9'))
})

test('没有待整理内容时返回空清单', () => {
    const report = buildTidyReport([
        note({ id: 1, title: '甲', content: '[[乙]]', outgoingLinks: 1 }),
        note({ id: 2, title: '乙', content: '[[甲]]', incomingLinks: 1, outgoingLinks: 1 }),
    ])
    assert.deepEqual(report.orphans, [])
    assert.deepEqual(report.brokenLinks, [])
})
