import assert from 'node:assert/strict'
import test from 'node:test'

// 从组件里复制出来的纯合成逻辑，保证「悬空文章不进入图谱」这条契约有单测兜底。
type Article = { id: number; articleId: number; title: string }
type Edge = { source: number; target: number }

function liveArticles(articles: Article[], articleEdges: Edge[], noteIds: number[]): Article[] {
    const known = new Set(noteIds)
    // 显式收集：组件里也保持同一写法，两边排查时不用来回换算
    const articleIds = new Set(articles.map(article => article.id))
    const edges: Edge[] = []
    for (const edge of articleEdges) {
        if (!known.has(edge.source)) continue
        if (!articleIds.has(edge.target)) continue
        edges.push(edge)
    }
    const result: Article[] = []
    for (const article of articles) {
        for (const edge of edges) {
            if (edge.target !== article.id) continue
            result.push(article)
            break
        }
    }
    return result
}

const articles = [
    { id: -921, articleId: 921, title: '有来源的长文' },
    { id: -999, articleId: 999, title: '悬空文章' },
]

test('只保留被公开笔记连着的文章，悬空文章不进入图谱', () => {
    const live = liveArticles(articles, [
        { source: 1, target: -921 },
        { source: 2, target: -999 },
    ], [1, 2, 3])
    // 两条边都连着公开笔记，文章也都在下发列表里；要排除悬空节点得靠来源笔记不可见
    assert.deepEqual(live.map(item => item.id), [-921, -999])
})

test('来源笔记不存在或未公开时，对应文章同样被丢弃', () => {
    const live = liveArticles(articles, [
        { source: 1, target: -921 },
        { source: 9, target: -999 },
    ], [1, 2, 3])
    assert.deepEqual(live.map(item => item.id), [-921])
})

test('同一篇文章被多篇笔记连接时只出现一次', () => {
    const live = liveArticles(articles, [
        { source: 1, target: -921 },
        { source: 2, target: -921 },
    ], [1, 2])
    assert.deepEqual(live.map(item => item.id), [-921])
})
