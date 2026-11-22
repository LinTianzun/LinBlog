const assert = require('node:assert/strict')
const test = require('node:test')

process.env.LINBLOG_JWT_SECRET = 'test-secret-that-is-at-least-32-characters-long'
process.env.LINBLOG_ALLOWED_ORIGINS = 'https://blog.example.com'
process.env.LINBLOG_PUBLIC_URL = 'https://blog.example.com'

const noteModel = require('../model/dbModel/note/index')
const noteController = require('../controller/noteController')

function response() {
    return {
        statusCode: 200,
        body: null,
        headers: {},
        set(key, value) { this.headers[key.toLowerCase()] = value; return this },
        status(code) { this.statusCode = code; return this },
        json(body) { this.body = body; return this },
    }
}

test('笔记输入校验：标题必填、状态白名单、正文类型', () => {
    assert.equal(noteController.validateNoteInput({}).error, '笔记标题不能为空')
    assert.match(noteController.validateNoteInput({ title: 't', content: 'c', state: 'secret' }).error, /state/)
    assert.match(noteController.validateNoteInput({ title: 't', content: 42 }).error, /字符串/)
    assert.deepEqual(
        noteController.validateNoteInput({ title: ' 花园 ', content: '# 正文', state: 'published' }).data,
        { title: '花园', content: '# 正文', state: 'published' }
    )
})

test('公开花园只返回已发布笔记，双链解析到公开目标', async () => {
    const originalList = noteModel.listPublicNotes
    const originalResolve = noteModel.resolvePublicLinks
    const originalAggregate = noteModel.listBacklinksAggregated
    const originalOutgoing = noteModel.listOutgoingLinksAggregated
    const originalUpgrades = noteModel.listPublishedUpgradesForNotes
    noteModel.listPublicNotes = async () => [{
        id: 2,
        title: '入口',
        slug: 'entry',
        content: '去读 [[内页]]',
        excerpt: '去读 内页',
        publishedAt: '2026-11-22T08:00:00.000Z',
        updatedAt: '2026-11-22T08:00:00.000Z',
        outgoingLinks: 1,
        incomingLinks: 0,
    }]
    noteModel.resolvePublicLinks = async () => ({
        titles: { 内页: { id: 3, title: '内页' } },
        ids: {},
    })
    // 索引里带上每条笔记的入链，前端卡片可直接展示谁提到了它
    noteModel.listBacklinksAggregated = async () => [
        { toNoteId: 2, id: 3, title: '内页', slug: 'inner' },
    ]
    noteModel.listOutgoingLinksAggregated = async () => [
        { fromNoteId: 2, id: 3, title: '内页', slug: 'inner' },
    ]
    noteModel.listPublishedUpgradesForNotes = async () => [
        { noteId: 2, id: 901, title: '入口的长文', publishedAt: '2026-11-23T08:00:00.000Z' },
    ]

    try {
        const res = response()
        await noteController.getPublicGarden({}, res)
        assert.equal(res.statusCode, 200)
        assert.equal(res.body.data.total, 1)
        assert.match(res.body.data.list[0].html, /href="\/portal\/notes\?open=3"/)
        assert.deepEqual(res.body.data.list[0].backlinks, [{ id: 3, title: '内页', slug: 'inner' }])
        assert.deepEqual(res.body.data.list[0].outgoing, [{ id: 3, title: '内页', slug: 'inner' }])
        assert.deepEqual(res.body.data.list[0].upgradedArticle, {
            id: 901,
            title: '入口的长文',
            publishedAt: '2026-11-23T08:00:00.000Z',
        })
    } finally {
        noteModel.listPublicNotes = originalList
        noteModel.resolvePublicLinks = originalResolve
        noteModel.listBacklinksAggregated = originalAggregate
        noteModel.listOutgoingLinksAggregated = originalOutgoing
        noteModel.listPublishedUpgradesForNotes = originalUpgrades
    }
})

test('只改正文或只改状态时保留原标题，不会被写成 NULL', async () => {
    const original = noteModel.updateNote
    const calls = []
    noteModel.updateNote = async (id, payload) => {
        calls.push({ id, payload })
        return { found: true, state: payload.state || 'draft' }
    }

    try {
        const res = response()
        await noteController.updateNote(
            { params: { id: '5' }, body: { content: '新的正文' }, user: { userId: 1 }, ip: '127.0.0.1' },
            res
        )
        assert.equal(res.statusCode, 200)
        // content-only 更新不应把 title 一并传成 undefined，否则模型层会覆盖原标题
        assert.deepEqual(calls[0].payload.title, undefined)
        assert.equal(calls[0].payload.content, '新的正文')

        const stateRes = response()
        await noteController.updateNote(
            { params: { id: '5' }, body: { state: 'published' }, user: { userId: 1 }, ip: '127.0.0.1' },
            stateRes
        )
        assert.equal(stateRes.statusCode, 200)
        assert.equal(calls[1].payload.state, 'published')
        assert.equal(calls[1].payload.title, undefined)
    } finally {
        noteModel.updateNote = original
    }
})

test('花园图谱只返回已发布节点与公开双链，ID 统一为数字', async () => {
    const originalList = noteModel.listPublicNotes
    const originalEdges = noteModel.listPublicGraphEdges
    const originalTags = noteModel.listPublicGraphLabels
    const originalUpgrades = noteModel.listPublicArticleUpgrades
    noteModel.listPublicNotes = async () => [{
        id: '2',
        title: '入口',
        slug: 'entry',
        content: '去读 [[内页]] #知识管理',
        publishedAt: '2026-11-22T08:00:00.000Z',
        updatedAt: '2026-11-22T08:00:00.000Z',
        outgoingLinks: 1,
        incomingLinks: 0,
    }]
    noteModel.listPublicGraphEdges = async () => [{ source: '2', target: '3' }]
    noteModel.listPublicGraphLabels = async () => [{ name: '知识管理', count: 1, degree: 2 }]
    noteModel.listPublicArticleUpgrades = async () => [{ noteId: '2', id: '901', title: '入口的长文' }]

    try {
        const res = response()
        await noteController.getPublicGardenGraph({}, res)
        assert.equal(res.statusCode, 200)
        assert.deepEqual(res.body.data.nodes[0], {
            id: 2,
            title: '入口',
            slug: 'entry',
            tags: ['知识管理'],
            publishedAt: '2026-11-22T08:00:00.000Z',
            updatedAt: '2026-11-22T08:00:00.000Z',
            outgoingLinks: 1,
            incomingLinks: 0,
        })
        assert.deepEqual(res.body.data.edges, [{ source: 2, target: 3 }])
        assert.deepEqual(res.body.data.tags, [{ name: '知识管理', count: 1, degree: 2 }])
        // 文章节点用负数 ID，和笔记共用一张图；边从笔记指向文章
        assert.deepEqual(res.body.data.articles, [{ id: -901, articleId: 901, title: '入口的长文' }])
        assert.deepEqual(res.body.data.articleEdges, [{ source: 2, target: -901 }])
    } finally {
        noteModel.listPublicNotes = originalList
        noteModel.listPublicGraphEdges = originalEdges
        noteModel.listPublicGraphLabels = originalTags
        noteModel.listPublicArticleUpgrades = originalUpgrades
    }
})

test('图谱不会把指向花园外笔记的升级关系画成悬空边', async () => {
    const originalList = noteModel.listPublicNotes
    const originalEdges = noteModel.listPublicGraphEdges
    const originalTags = noteModel.listPublicGraphLabels
    const originalUpgrades = noteModel.listPublicArticleUpgrades
    noteModel.listPublicNotes = async () => [{
        id: 2, title: '入口', slug: 'entry', content: '# 入口',
        publishedAt: null, updatedAt: '2026-11-22T08:00:00.000Z',
        outgoingLinks: 0, incomingLinks: 0,
    }]
    noteModel.listPublicGraphEdges = async () => []
    noteModel.listPublicGraphLabels = async () => []
    // 3 号笔记已转为草稿，它的文章也不该出现在公开花园里
    noteModel.listPublicArticleUpgrades = async () => [
        { noteId: 2, id: 901, title: '入口的长文' },
        { noteId: 3, id: 902, title: '草稿笔记的长文' },
    ]

    try {
        const res = response()
        await noteController.getPublicGardenGraph({}, res)
        assert.deepEqual(res.body.data.articleEdges, [{ source: 2, target: -901 }])
        assert.deepEqual(res.body.data.articles.map(item => item.articleId), [901])
    } finally {
        noteModel.listPublicNotes = originalList
        noteModel.listPublicGraphEdges = originalEdges
        noteModel.listPublicGraphLabels = originalTags
        noteModel.listPublicArticleUpgrades = originalUpgrades
    }
})

test('公开笔记详情带上已发布升级文章，草稿文章不对外露出', async () => {
    const originalFind = noteModel.findPublicNoteById
    const originalResolve = noteModel.resolvePublicLinks
    const originalBacklinks = noteModel.listBacklinks
    const originalOutgoing = noteModel.listOutgoingLinks
    const originalUpgrades = noteModel.listPublishedUpgradesForNotes
    noteModel.findPublicNoteById = async () => ({
        id: 2, title: '入口', slug: 'entry', content: '# 入口',
        publishedAt: null, updatedAt: '2026-11-22T08:00:00.000Z',
    })
    noteModel.resolvePublicLinks = async () => ({ titles: {}, ids: {} })
    noteModel.listBacklinks = async () => []
    noteModel.listOutgoingLinks = async () => []
    noteModel.listPublishedUpgradesForNotes = async ids => (
        ids.includes(2)
            ? [{ noteId: 2, id: 901, title: '入口的长文', publishedAt: '2026-11-23T08:00:00.000Z' }]
            : []
    )

    try {
        const res = response()
        await noteController.getPublicNote({ params: { id: '2' } }, res)
        assert.equal(res.statusCode, 200)
        assert.deepEqual(res.body.data.upgradedArticle, {
            id: 901,
            title: '入口的长文',
            publishedAt: '2026-11-23T08:00:00.000Z',
        })
    } finally {
        noteModel.findPublicNoteById = originalFind
        noteModel.resolvePublicLinks = originalResolve
        noteModel.listBacklinks = originalBacklinks
        noteModel.listOutgoingLinks = originalOutgoing
        noteModel.listPublishedUpgradesForNotes = originalUpgrades
    }
})

test('私人笔记详情按作者隔离，未登录以外的用户不能读到别人的笔记', async () => {
    const original = noteModel.findOwnedNote
    noteModel.findOwnedNote = async (id, userId) => (id === 5 && userId === 1
        ? { id: 5, title: '私密', content: '正文', state: 'draft' }
        : null)

    try {
        const own = response()
        await noteController.getNoteById({ params: { id: '5' }, user: { userId: 1 } }, own)
        assert.equal(own.statusCode, 200)

        const other = response()
        await noteController.getNoteById({ params: { id: '5' }, user: { userId: 2 } }, other)
        assert.equal(other.statusCode, 404)
    } finally {
        noteModel.findOwnedNote = original
    }
})

test('待整理清单带出升级文章与回链状态', async () => {
    const originalList = noteModel.listNotesForTidy
    const originalUpgrades = noteModel.listUpgradedArticles
    const requestedIds = []
    noteModel.listNotesForTidy = async () => [
        {
            id: 1,
            title: '已经回链的笔记',
            content: '延伸阅读：/portal/articles?open=9',
            state: 'published',
            outgoingLinks: 0,
            incomingLinks: 0,
            updatedAt: '2026-11-22T08:00:00.000Z',
        },
        {
            id: 2,
            title: '等待回链的笔记',
            content: '这篇还没有文章链接。',
            state: 'published',
            outgoingLinks: 0,
            incomingLinks: 0,
            updatedAt: '2026-11-22T09:00:00.000Z',
        },
    ]
    noteModel.listUpgradedArticles = async (ids) => {
        requestedIds.push(ids)
        return [
            { noteId: 1, id: 9, title: '第一篇长文', state: 'published', publishedAt: '2026-11-21T08:00:00.000Z' },
            { noteId: 2, id: 10, title: '第二篇长文', state: 'draft', publishedAt: null },
        ]
    }

    try {
        const res = response()
        await noteController.getNoteTidy({ query: {}, user: { userId: 1 } }, res)

        assert.equal(res.statusCode, 200)
        assert.deepEqual(requestedIds, [[1, 2]])
        const linked = res.body.data.orphans.find(note => note.id === 1)
        const pending = res.body.data.orphans.find(note => note.id === 2)
        assert.equal(linked.upgradedArticle.title, '第一篇长文')
        assert.equal(linked.articleLinked, true)
        assert.equal(pending.upgradedArticle.id, 10)
        assert.equal(pending.articleLinked, false)
    } finally {
        noteModel.listNotesForTidy = originalList
        noteModel.listUpgradedArticles = originalUpgrades
    }
})

test('单篇笔记升级详情返回文章与当前回链状态', async () => {
    const originalOwned = noteModel.findOwnedNote
    const originalUpgrade = noteModel.findUpgradedArticle
    noteModel.findOwnedNote = async () => ({
        id: 5,
        title: '来源笔记',
        content: '去读 [完整版](/portal/articles?open=21)',
        state: 'published',
    })
    noteModel.findUpgradedArticle = async () => [{
        id: 21,
        title: '完整版',
        state: 'published',
        publishedAt: '2026-11-22T08:00:00.000Z',
    }]

    try {
        const res = response()
        await noteController.getNoteUpgrade(
            { params: { id: '5' }, user: { userId: 1 } },
            res
        )

        assert.equal(res.statusCode, 200)
        assert.equal(res.body.data.article.id, 21)
        assert.equal(res.body.data.articleLinked, true)
    } finally {
        noteModel.findOwnedNote = originalOwned
        noteModel.findUpgradedArticle = originalUpgrade
    }
})
