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

test('createCollection trims fields and applies a safe sort', async () => {
    const originalInsert = collectionModel.insertCollection
    let saved = null
    collectionModel.insertCollection = async (payload) => {
        saved = payload
        return { collectionId: 9 }
    }

    try {
        const res = createRes()
        await collectionController.createCollection(
            {
                body: {
                    name: '  从零搭博客  ',
                    description: '  系列说明  ',
                    cover: '  /cover.png  ',
                    sort: -20
                },
                user: admin
            },
            res
        )

        assert.equal(res.statusCode, 201)
        assert.equal(res.body.data.collectionId, 9)
        assert.deepEqual(saved, {
            name: '从零搭博客',
            description: '系列说明',
            cover: '/cover.png',
            sort: 0
        })
    } finally {
        collectionModel.insertCollection = originalInsert
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
    const originalUpdate = collectionModel.updateCollection

    collectionModel.findCollectionById = async () => ({ id: 1, name: '系列' })
    collectionModel.updateCollection = async () => 0

    try {
        const res = createRes()
        await collectionController.updateCollection(
            { params: { id: '1' }, body: { name: '系列' }, user: admin },
            res
        )

        assert.equal(res.body.code, 200)
    } finally {
        collectionModel.findCollectionById = originalFind
        collectionModel.updateCollection = originalUpdate
    }
})

test('setCollectionArticles rejects article IDs that are unavailable', async () => {
    const originalFind = collectionModel.findCollectionById
    const originalAvailable = collectionModel.findAvailableArticleIds
    const originalReplace = collectionModel.replaceCollectionArticles
    let replaced = false

    collectionModel.findCollectionById = async () => ({ id: 1, name: '系列' })
    collectionModel.findAvailableArticleIds = async () => [11]
    collectionModel.replaceCollectionArticles = async () => {
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
    const originalReplace = collectionModel.replaceCollectionArticles
    let received = null

    collectionModel.findCollectionById = async () => ({ id: 1, name: '系列' })
    collectionModel.findAvailableArticleIds = async (ids) => {
        assert.deepEqual(ids, [12, 11, 13])
        return [11, 12, 13]
    }
    collectionModel.replaceCollectionArticles = async (id, ids) => {
        received = { id, ids }
        return ids.length
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
    } finally {
        collectionModel.findCollectionById = originalFind
        collectionModel.findAvailableArticleIds = originalAvailable
        collectionModel.replaceCollectionArticles = originalReplace
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
