const assert = require('node:assert/strict')
const path = require('node:path')
const test = require('node:test')

process.env.LINBLOG_JWT_SECRET = 'test-secret-that-is-at-least-32-characters-long'

const collectionController = require(path.resolve(__dirname, '../controller/collectionController.js'))
const collectionModel = require(path.resolve(__dirname, '../model/dbModel/collection/index.js'))

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

const admin = { userId: 1, userType: 'admin' }

test('public collections hide series without published articles', async () => {
    const originalFind = collectionModel.findCollections
    collectionModel.findCollections = async ({ publicOnly }) => {
        assert.equal(publicOnly, true)
        return [
            {
                id: 1,
                name: '从零搭博客',
                description: '系列说明',
                cover: '',
                sort: 10,
                status: 1,
                articleCount: 2,
                publishedCount: 2,
                createdAt: '2026-11-13',
                updatedAt: '2026-11-13'
            },
            {
                id: 2,
                name: '草稿系列',
                description: '',
                cover: '',
                sort: 0,
                status: 1,
                articleCount: 0,
                publishedCount: 0,
                createdAt: '2026-11-13',
                updatedAt: '2026-11-13'
            }
        ]
    }

    try {
        const res = createRes()
        await collectionController.getPublicCollections({}, res)

        assert.equal(res.body.code, 200)
        assert.equal(res.body.data.count, 1)
        assert.equal(res.body.data.list[0].name, '从零搭博客')
        assert.equal(res.body.data.list[0].publishedCount, 2)
    } finally {
        collectionModel.findCollections = originalFind
    }
})

test('public collection detail rejects an empty series', async () => {
    const originalFind = collectionModel.findCollectionById
    collectionModel.findCollectionById = async () => ({
        id: 1,
        name: '空系列',
        description: '',
        cover: '',
        sort: 0,
        status: 1,
        createdAt: '2026-11-13',
        updatedAt: '2026-11-13',
        articles: []
    })

    try {
        const res = createRes()
        await collectionController.getPublicCollectionById({ params: { id: '1' } }, res)

        assert.equal(res.statusCode, 404)
        assert.equal(res.body.code, 404)
    } finally {
        collectionModel.findCollectionById = originalFind
    }
})

test('public collection detail returns ordered published articles', async () => {
    const originalFind = collectionModel.findCollectionById
    collectionModel.findCollectionById = async (id, options) => {
        assert.equal(id, 3)
        assert.deepEqual(options, { publicOnly: true })
        return {
            id: 3,
            name: '系列',
            description: '说明',
            cover: '/cover.png',
            sort: 8,
            status: 1,
            createdAt: '2026-11-13',
            updatedAt: '2026-11-13',
            articles: [
                {
                    id: 11,
                    title: '第一篇',
                    state: 'published',
                    classify: 'article',
                    memberSort: 0
                },
                {
                    id: 12,
                    title: '第二篇',
                    state: 'published',
                    classify: 'article',
                    memberSort: 10
                }
            ]
        }
    }

    try {
        const res = createRes()
        await collectionController.getPublicCollectionById({ params: { id: '3' } }, res)

        assert.equal(res.body.code, 200)
        assert.equal(res.body.data.name, '系列')
        assert.deepEqual(res.body.data.articles.map(item => item.id), [11, 12])
        assert.equal(res.body.data.publishedCount, 2)
    } finally {
        collectionModel.findCollectionById = originalFind
    }
})

test('article series context returns position and ordered neighbors', async () => {
    const originalFind = collectionModel.findPublicCollectionsForArticle
    collectionModel.findPublicCollectionsForArticle = async (articleId) => {
        assert.equal(articleId, 12)
        return [
            {
                id: 8,
                name: '从零搭博客',
                description: '系列说明',
                cover: '',
                position: 2,
                total: 3,
                previous: { id: 11, title: '第一篇' },
                next: { id: 13, title: '第三篇' }
            }
        ]
    }

    try {
        const res = createRes()
        await collectionController.getPublicCollectionsForArticle(
            { params: { articleId: '12' } },
            res
        )

        assert.equal(res.body.code, 200)
        assert.equal(res.body.data.count, 1)
        assert.equal(res.body.data.list[0].position, 2)
        assert.deepEqual(res.body.data.list[0].next, { id: 13, title: '第三篇' })
    } finally {
        collectionModel.findPublicCollectionsForArticle = originalFind
    }
})

test('article series context rejects invalid article IDs', async () => {
    const res = createRes()
    await collectionController.getPublicCollectionsForArticle(
        { params: { articleId: 'abc' } },
        res
    )

    assert.equal(res.statusCode, 400)
    assert.equal(res.body.code, 400)
})

test('createCollection rejects non-manager users', async () => {
    const res = createRes()
    await collectionController.createCollection(
        { body: { name: '系列' }, user: { userId: 2, userType: 'normal' } },
        res
    )

    assert.equal(res.statusCode, 403)
    assert.equal(res.body.code, 403)
})

test('collection.view can read the series list but cannot write', async () => {
    const originalFind = collectionModel.findCollections
    collectionModel.findCollections = async () => []

    try {
        const listRes = createRes()
        await collectionController.getCollections({
            user: { userId: 8, permissions: ['collection.view'] }
        }, listRes)
        assert.equal(listRes.body.code, 200)
        assert.deepEqual(listRes.body.data.list, [])

        const writeRes = createRes()
        await collectionController.createCollection({
            body: { name: '只读账号不能创建' },
            user: { userId: 8, permissions: ['collection.view'] }
        }, writeRes)
        assert.equal(writeRes.statusCode, 403)
        assert.equal(writeRes.body.code, 403)
    } finally {
        collectionModel.findCollections = originalFind
    }
})

test('createCollection trims fields and applies a safe sort', async () => {
    const originalInsert = collectionModel.insertCollection
    const originalAvailable = collectionModel.findAvailableArticleIds
    collectionModel.findAvailableArticleIds = async () => [11, 12]
    let saved = null
    collectionModel.insertCollection = async (payload, options) => {
        saved = { payload, options }
        return { collectionId: 9, revision: 1 }
    }

    try {
        const res = createRes()
        await collectionController.createCollection(
            {
                body: {
                    name: '  从零搭博客  ',
                    description: '  系列说明  ',
                    cover: '  /cover.png  ',
            sort: -20,
            articleIds: [11, 12]
                },
                user: admin
            },
            res
        )

        assert.equal(res.statusCode, 201)
        assert.equal(res.body.data.collectionId, 9)
        assert.equal(res.body.data.revision, 1)
        assert.deepEqual(saved, {
            payload: {
                name: '从零搭博客',
                description: '系列说明',
                cover: '/cover.png',
                sort: 0,
                articleIds: [11, 12]
            },
            options: { userId: 1 }
        })
    } finally {
        collectionModel.insertCollection = originalInsert
        collectionModel.findAvailableArticleIds = originalAvailable
    }
})

test('updateCollection rejects unknown series', async () => {
    const originalFind = collectionModel.findCollectionById
    collectionModel.findCollectionById = async () => null

    try {
        const res = createRes()
        await collectionController.updateCollection(
            { params: { id: '99' }, body: { name: '新名字' }, user: admin },
            res
        )

        assert.equal(res.statusCode, 404)
        assert.equal(res.body.code, 404)
    } finally {
        collectionModel.findCollectionById = originalFind
    }
})

test('updateCollection does not treat an unchanged row as missing', async () => {
    const originalFind = collectionModel.findCollectionById
    const originalSave = collectionModel.saveCollectionWithArticles

    collectionModel.findCollectionById = async () => ({ id: 1, name: '系列' })
    collectionModel.saveCollectionWithArticles = async () => ({
        found: true,
        revision: 2,
        articleCount: 0
    })

    try {
        const res = createRes()
        await collectionController.updateCollection(
            { params: { id: '1' }, body: { name: '系列' }, user: admin },
            res
        )

        assert.equal(res.body.code, 200)
    } finally {
        collectionModel.findCollectionById = originalFind
        collectionModel.saveCollectionWithArticles = originalSave
    }
})

test('setCollectionArticles rejects article IDs that are unavailable', async () => {
    const originalFind = collectionModel.findCollectionById
    const originalAvailable = collectionModel.findAvailableArticleIds
    const originalReplace = collectionModel.replaceCollectionArticlesWithVersion
    let replaced = false

    collectionModel.findCollectionById = async () => ({ id: 1, name: '系列' })
    collectionModel.findAvailableArticleIds = async () => [11]
    collectionModel.replaceCollectionArticlesWithVersion = async () => {
        replaced = true
        return 2
    }

    try {
        const res = createRes()
        await collectionController.setCollectionArticles(
            { params: { id: '1' }, body: { articleIds: [11, 12] }, user: admin },
            res
        )

        assert.equal(res.statusCode, 400)
        assert.match(res.body.message, /12/)
        assert.equal(replaced, false)
    } finally {
        collectionModel.findCollectionById = originalFind
        collectionModel.findAvailableArticleIds = originalAvailable
        collectionModel.replaceCollectionArticles = originalReplace
    }
})

test('setCollectionArticles preserves order and removes duplicate IDs', async () => {
    const originalFind = collectionModel.findCollectionById
    const originalAvailable = collectionModel.findAvailableArticleIds
    const originalReplace = collectionModel.replaceCollectionArticlesWithVersion
    let received = null

    collectionModel.findCollectionById = async () => ({ id: 1, name: '系列' })
    collectionModel.findAvailableArticleIds = async (ids) => {
        assert.deepEqual(ids, [12, 11, 13])
        return [11, 12, 13]
    }
    collectionModel.replaceCollectionArticlesWithVersion = async (id, ids, options) => {
        received = { id, ids }
        assert.deepEqual(options, { userId: 1 })
        return { found: true, revision: 4, articleCount: ids.length }
    }

    try {
        const res = createRes()
        await collectionController.setCollectionArticles(
            { params: { id: '1' }, body: { articleIds: [12, 11, 12, 13] }, user: admin },
            res
        )

        assert.equal(res.body.code, 200)
        assert.deepEqual(received, { id: 1, ids: [12, 11, 13] })
        assert.equal(res.body.data.articleCount, 3)
        assert.equal(res.body.data.revision, 4)
    } finally {
        collectionModel.findCollectionById = originalFind
        collectionModel.findAvailableArticleIds = originalAvailable
        collectionModel.replaceCollectionArticles = originalReplace
    }
})

test('getCollectionVersionDiff rejects users without collection access', async () => {
    const res = createRes()
    await collectionController.getCollectionVersionDiff(
        { params: { id: '1', versionId: '2' }, user: { userId: 2, permissions: [] } },
        res
    )

    assert.equal(res.statusCode, 403)
    assert.equal(res.body.code, 403)
})

test('getCollectionVersionDiff returns missing-version errors', async () => {
    const originalFind = collectionModel.findCollectionVersion
    collectionModel.findCollectionVersion = async () => null

    try {
        const res = createRes()
        await collectionController.getCollectionVersionDiff(
            { params: { id: '1', versionId: '2' }, user: admin },
            res
        )

        assert.equal(res.statusCode, 404)
        assert.match(res.body.message, /版本不存在/)
    } finally {
        collectionModel.findCollectionVersion = originalFind
    }
})

test('getCollectionVersionDiff reports metadata, additions, removals and moves', async () => {
    const originalFindVersion = collectionModel.findCollectionVersion
    const originalFindCollection = collectionModel.findCollectionById
    collectionModel.findCollectionVersion = async () => ({
        id: 2,
        revision: 2,
        name: '旧系列名',
        description: '说明不变',
        cover: '/old-cover.png',
        sort: 5,
        source: 'manual',
        operatorName: '管理员',
        createdAt: '2026-11-16T08:00:00.000Z',
        articleIds: [11, 12, 13],
        articles: [
            { id: 11, title: '第一篇', state: 'published', subsetName: '随笔' },
            { id: 12, title: '第二篇', state: 'draft', subsetName: '技术' },
            { id: 13, title: '移出文章', state: 'published', subsetName: '随笔' }
        ]
    })
    collectionModel.findCollectionById = async () => ({
        id: 1,
        name: '新系列名',
        description: '说明不变',
        cover: '/new-cover.png',
        sort: 5,
        publishedCount: 2,
        updatedAt: '2026-11-16T09:00:00.000Z',
        articles: [
            { id: 12, title: '第二篇', state: 'published', subsetName: '技术' },
            { id: 11, title: '第一篇', state: 'published', subsetName: '随笔' },
            { id: 14, title: '新增文章', state: 'draft', subsetName: '生活' }
        ]
    })

    try {
        const res = createRes()
        await collectionController.getCollectionVersionDiff(
            { params: { id: '1', versionId: '2' }, user: admin },
            res
        )

        assert.equal(res.body.code, 200)
        assert.deepEqual(
            res.body.data.metaChanges.map(item => item.field),
            ['name', 'cover']
        )
        assert.equal(res.body.data.summary.added, 1)
        assert.equal(res.body.data.summary.removed, 1)
        assert.equal(res.body.data.summary.moved, 1)
        assert.equal(res.body.data.summary.metaCount, 2)
        assert.equal(res.body.data.summary.hasChanges, true)
        assert.ok(res.body.data.articleChanges.some(item =>
            item.kind === 'added' && item.id === 14 && item.toPosition === 3
        ))
        assert.ok(res.body.data.articleChanges.some(item =>
            item.kind === 'removed' && item.id === 13 && item.fromPosition === 3
        ))
        assert.ok(res.body.data.articleChanges.some(item =>
            item.kind === 'moved' && item.fromPosition !== item.toPosition
        ))
    } finally {
        collectionModel.findCollectionVersion = originalFindVersion
        collectionModel.findCollectionById = originalFindCollection
    }
})

test('updateCollectionVersionPolicy validates and saves the retention limit', async () => {
    const originalFind = collectionModel.findCollectionById
    const originalUpdate = collectionModel.updateCollectionVersionPolicy
    let received = null

    collectionModel.findCollectionById = async () => ({
        id: 8,
        name: '系列',
        versionRetention: 20
    })
    collectionModel.updateCollectionVersionPolicy = async (id, retention) => {
        received = { id, retention }
        return { found: true, deleted: 3, retention, total: retention }
    }

    try {
        const res = createRes()
        await collectionController.updateCollectionVersionPolicy(
            { params: { id: '8' }, body: { retention: 10 }, user: admin },
            res
        )

        assert.equal(res.body.code, 200)
        assert.deepEqual(received, { id: 8, retention: 10 })
        assert.equal(res.body.data.deleted, 3)
        assert.equal(res.body.data.retention, 10)
    } finally {
        collectionModel.findCollectionById = originalFind
        collectionModel.updateCollectionVersionPolicy = originalUpdate
    }
})

test('updateCollectionVersionPolicy rejects out-of-range retention', async () => {
    const res = createRes()
    await collectionController.updateCollectionVersionPolicy(
        { params: { id: '8' }, body: { retention: 0 }, user: admin },
        res
    )

    assert.equal(res.statusCode, 400)
    assert.match(res.body.message, /1-100/)
})

test('cleanupCollectionVersions uses the saved policy of the series', async () => {
    const originalFind = collectionModel.findCollectionById
    const originalPrune = collectionModel.pruneCollectionVersions
    let received = null

    collectionModel.findCollectionById = async () => ({
        id: 8,
        name: '系列',
        versionRetention: 12
    })
    collectionModel.pruneCollectionVersions = async (id, options) => {
        received = { id, options }
        return { found: true, deleted: 2, retention: 12, total: 12 }
    }

    try {
        const res = createRes()
        await collectionController.cleanupCollectionVersions(
            { params: { id: '8' }, user: admin },
            res
        )

        assert.equal(res.body.code, 200)
        assert.deepEqual(received, { id: 8, options: { retention: 12 } })
        assert.equal(res.body.data.deleted, 2)
        assert.match(res.body.message, /清理 2 个旧版本/)
    } finally {
        collectionModel.findCollectionById = originalFind
        collectionModel.pruneCollectionVersions = originalPrune
    }
})

test('deleteCollection soft deletes and records the current name', async () => {
    const originalFind = collectionModel.findCollectionById
    const originalDelete = collectionModel.softDeleteCollection
    let deletedId = null

    collectionModel.findCollectionById = async () => ({ id: 4, name: '旧系列' })
    collectionModel.softDeleteCollection = async (id) => {
        deletedId = id
        return 1
    }

    try {
        const res = createRes()
        await collectionController.deleteCollection({ params: { id: '4' }, user: admin }, res)

        assert.equal(res.body.code, 200)
        assert.equal(deletedId, 4)
    } finally {
        collectionModel.findCollectionById = originalFind
        collectionModel.softDeleteCollection = originalDelete
    }
})
