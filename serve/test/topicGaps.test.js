const assert = require('node:assert/strict')
const test = require('node:test')

const { buildTopicGaps, summarizeTopicGaps } = require('../utils/topicGaps')

const corpus = [
    { id: 1, kind: 'article', title: 'Vue 响应式原理', description: '依赖收集与触发更新', labels: ['Vue', '前端'] },
    { id: 2, kind: 'note', title: '数字花园怎么用', description: '双链与反向链接', labels: ['花园'] },
    { id: 9, kind: 'article', title: '摄影后期入门', description: '调色与裁切', labels: ['摄影'] },
]

test('零结果词按与既有内容的相似度分出缺口、失配与命中', () => {
    const items = buildTopicGaps([
        { keyword: 'Vue 响应式原理', searches: 4, zeroResults: 3 },
        { keyword: 'Rust 所有权', searches: 6, zeroResults: 6 },
    ], corpus)
    assert.equal(items.length, 2)
    // 缺口题排在最前
    assert.equal(items[0].keyword, 'Rust 所有权')
    assert.equal(items[0].status, 'gap')
    assert.deepEqual(items[0].related, [])
    const vue = items.find(item => item.keyword === 'Vue 响应式原理')
    assert.notEqual(vue.status, 'gap')
    assert.equal(vue.related[0].id, 1)
    assert.equal(vue.related[0].kind, 'article')
})

test('没有零结果的搜索词不进入选题清单', () => {
    const items = buildTopicGaps([
        { keyword: '摄影', searches: 9, zeroResults: 0 },
        { keyword: '摄影后期入门', searches: 3, zeroResults: 2 },
    ], corpus)
    assert.equal(items.length, 1)
    assert.equal(items[0].keyword, '摄影后期入门')
})

test('相关结果最多三条，且分数递减', () => {
    const many = Array.from({ length: 8 }, (_, index) => ({
        id: index + 1,
        title: `Vue 笔记 ${index}`,
        description: 'Vue 响应式',
    }))
    const [item] = buildTopicGaps([{ keyword: 'Vue', searches: 2, zeroResults: 2 }], many)
    assert.ok(item.related.length <= 3)
    for (let i = 1; i < item.related.length; i++) {
        assert.ok(item.related[i - 1].score >= item.related[i].score)
    }
})

test('limit 生效且空输入安全', () => {
    const rows = Array.from({ length: 6 }, (_, index) => ({
        keyword: `缺失关键词${index}`,
        searches: 6 - index,
        zeroResults: 6 - index,
    }))
    assert.equal(buildTopicGaps(rows, corpus, { limit: 3 }).length, 3)
    assert.deepEqual(buildTopicGaps(undefined, undefined), [])
})

test('摘要统计各状态数量', () => {
    const summary = summarizeTopicGaps([
        { status: 'gap' },
        { status: 'weak' },
        { status: 'weak' },
        { status: 'matched' },
    ])
    assert.deepEqual(summary, { total: 4, gap: 1, weak: 2, matched: 1 })
})
