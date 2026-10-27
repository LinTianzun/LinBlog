const assert = require('node:assert/strict')
const path = require('node:path')
const test = require('node:test')

process.env.LINBLOG_JWT_SECRET = 'test-secret-that-is-at-least-32-characters-long'

const subsetController = require(path.resolve(__dirname, '../controller/subsetController.js'))
const subsetModel = require(path.resolve(__dirname, '../model/dbModel/subset/index.js'))

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

test('getSubsets returns count and formatted list', async () => {
    const originalFind = subsetModel.findSubsets
    subsetModel.findSubsets = async () => [
        { id: 1, name: '技术博客', classify: 'article', sort: 10, value: 3, moment: '2026-10-24' }
    ]

    try {
        const res = createRes()
        await subsetController.getSubsets({ query: {}, user: { userId: 1, userType: 'admin' } }, res)

        assert.equal(res.statusCode, 0)
        assert.equal(res.body.code, 200)
        assert.equal(res.body.data.count, 3)
        assert.deepEqual(res.body.data.list[0], {
            id: 1,
            name: '技术博客',
            classify: 'article',
            sort: 10,
            value: 3,
            moment: '2026-10-24'
        })
    } finally {
        subsetModel.findSubsets = originalFind
    }
})

test('getSubsets reuses article subsets for gallery with image counts', async () => {
    const originalFind = subsetModel.findSubsets
    let received = null
    subsetModel.findSubsets = async (params) => {
        received = params
        return [
            { id: 1, name: '技术博客', classify: 'article', sort: 10, value: 2, moment: '2026-10-24' }
        ]
    }

    try {
        const res = createRes()
        await subsetController.getSubsets({ query: { classify: 'image' }, user: { userId: 1, userType: 'admin' } }, res)

        assert.equal(res.body.code, 200)
        assert.deepEqual(received, {
            classify: 'article',
            includeCount: true,
            countClassify: 'image',
            countState: undefined
        })
        assert.equal(res.body.data.list[0].value, 2)
    } finally {
        subsetModel.findSubsets = originalFind
    }
})

test('public getSubsets counts only published articles', async () => {
    const originalFind = subsetModel.findSubsets
    let received = null
    subsetModel.findSubsets = async (params) => {
        received = params
        return [{ id: 1, name: '技术博客', classify: 'article', sort: 10, value: 2, moment: '2026-10-24' }]
    }

    try {
        const res = createRes()
        await subsetController.getSubsets({ query: { classify: 'article' }, publicRead: true }, res)

        assert.equal(res.body.code, 200)
        assert.equal(received.countState, 'published')
        assert.equal(res.body.data.list[0].value, 2)
    } finally {
        subsetModel.findSubsets = originalFind
    }
})

test('createSubset rejects non-manager users', async () => {
    const res = createRes()

    await subsetController.createSubset(
        { body: { name: '旅行', classify: 'article' }, user: { userId: 2, userType: 'normal' } },
        res
    )

    assert.equal(res.statusCode, 403)
    assert.equal(res.body.code, 403)
})

test('createSubset rejects duplicate names within same classify', async () => {
    const originalFind = subsetModel.findSubsetByNameAndClassify
    subsetModel.findSubsetByNameAndClassify = async () => ({ id: 9, status: 1 })

    try {
        const res = createRes()
        await subsetController.createSubset(
            { body: { name: '技术博客', classify: 'article' }, user: { userId: 1, userType: 'admin' } },
            res
        )

        assert.equal(res.statusCode, 409)
        assert.equal(res.body.code, 409)
    } finally {
        subsetModel.findSubsetByNameAndClassify = originalFind
    }
})

test('createSubset revives soft-deleted subset with same name', async () => {
    const originalFind = subsetModel.findSubsetByNameAndClassify
    const originalRevive = subsetModel.reviveSubset
    let revived = null

    subsetModel.findSubsetByNameAndClassify = async () => ({ id: 7, status: 0 })
    subsetModel.reviveSubset = async (id, data) => {
        revived = { id, data }
        return 1
    }

    try {
        const res = createRes()
        await subsetController.createSubset(
            { body: { name: '旅行', classify: 'article' }, user: { userId: 1, userType: 'admin' } },
            res
        )

        assert.equal(res.statusCode, 201)
        assert.equal(res.body.data.subsetId, 7)
        assert.deepEqual(revived, { id: 7, data: { sort: 0 } })
    } finally {
        subsetModel.findSubsetByNameAndClassify = originalFind
        subsetModel.reviveSubset = originalRevive
    }
})

test('createSubset inserts normalized name', async () => {
    const originalFind = subsetModel.findSubsetByNameAndClassify
    const originalInsert = subsetModel.insertSubset
    let saved = null

    subsetModel.findSubsetByNameAndClassify = async () => null
    subsetModel.insertSubset = async (data) => {
        saved = data
        return { subsetId: 12 }
    }

    try {
        const res = createRes()
        await subsetController.createSubset(
            { body: { name: '  旅行  ', classify: 'article' }, user: { userId: 1, userType: 'editor' } },
            res
        )

        assert.equal(res.body.code, 200)
        assert.deepEqual(saved, { name: '旅行', classify: 'article', sort: 0 })
        assert.equal(res.body.data.subsetId, 12)
    } finally {
        subsetModel.findSubsetByNameAndClassify = originalFind
        subsetModel.insertSubset = originalInsert
    }
})

test('deleteSubset blocks when articles still reference the subset', async () => {
    const originalFind = subsetModel.findSubsetById
    const originalCount = subsetModel.countArticlesBySubset
    const originalDelete = subsetModel.softDeleteSubset
    let deleted = false

    subsetModel.findSubsetById = async () => ({ id: 1, status: 1, classify: 'article' })
    subsetModel.countArticlesBySubset = async () => 5
    subsetModel.softDeleteSubset = async () => {
        deleted = true
        return 1
    }

    try {
        const res = createRes()
        await subsetController.deleteSubset({ params: { id: 1 }, user: { userId: 1, userType: 'admin' } }, res)

        assert.equal(res.body.code, 400)
        assert.match(res.body.message, /5 篇文章/)
        assert.equal(deleted, false)
    } finally {
        subsetModel.findSubsetById = originalFind
        subsetModel.countArticlesBySubset = originalCount
        subsetModel.softDeleteSubset = originalDelete
    }
})

test('deleteSubset succeeds for empty subset', async () => {
    const originalFind = subsetModel.findSubsetById
    const originalCount = subsetModel.countArticlesBySubset
    const originalDelete = subsetModel.softDeleteSubset
    let deleted = false

    subsetModel.findSubsetById = async () => ({ id: 1, status: 1, classify: 'article' })
    subsetModel.countArticlesBySubset = async () => 0
    subsetModel.softDeleteSubset = async () => {
        deleted = true
        return 1
    }

    try {
        const res = createRes()
        await subsetController.deleteSubset({ params: { id: 1 }, user: { userId: 1, userType: 'admin' } }, res)

        assert.equal(res.body.code, 200)
        assert.equal(deleted, true)
    } finally {
        subsetModel.findSubsetById = originalFind
        subsetModel.countArticlesBySubset = originalCount
        subsetModel.softDeleteSubset = originalDelete
    }
})
