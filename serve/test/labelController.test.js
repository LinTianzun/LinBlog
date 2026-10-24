const assert = require('node:assert/strict')
const path = require('node:path')
const test = require('node:test')

process.env.LINBLOG_JWT_SECRET = 'test-secret-that-is-at-least-32-characters-long'

const labelController = require(path.resolve(__dirname, '../controller/labelController.js'))
const labelModel = require(path.resolve(__dirname, '../model/dbModel/label/index.js'))

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

test('getLabels returns count and formatted list', async () => {
    const originalFind = labelModel.findLabels
    labelModel.findLabels = async () => [
        { id: 1, name: 'Vue', moment: '2026-10-24', value: 3 },
        { id: 2, name: 'React', moment: '2026-10-24', value: 1 }
    ]

    try {
        const res = createRes()
        await labelController.getLabels({ user: { userId: 1, userType: 'admin' } }, res)

        assert.equal(res.body.code, 200)
        assert.equal(res.body.data.count, 4)
        assert.equal(res.body.data.list[0].value, 3)
    } finally {
        labelModel.findLabels = originalFind
    }
})

test('createLabel rejects non-manager users', async () => {
    const res = createRes()

    await labelController.createLabel(
        { body: { name: '旅行' }, user: { userId: 2, userType: 'normal' } },
        res
    )

    assert.equal(res.statusCode, 403)
})

test('createLabel rejects duplicate names', async () => {
    const originalFind = labelModel.findLabelByName
    labelModel.findLabelByName = async () => ({ id: 9 })

    try {
        const res = createRes()
        await labelController.createLabel(
            { body: { name: 'Vue' }, user: { userId: 1, userType: 'admin' } },
            res
        )

        assert.equal(res.statusCode, 409)
    } finally {
        labelModel.findLabelByName = originalFind
    }
})

test('createLabel inserts normalized name', async () => {
    const originalFind = labelModel.findLabelByName
    const originalInsert = labelModel.insertLabel
    let saved = null

    labelModel.findLabelByName = async () => null
    labelModel.insertLabel = async (name) => {
        saved = name
        return { labelId: 12 }
    }

    try {
        const res = createRes()
        await labelController.createLabel(
            { body: { name: '  效率工具  ' }, user: { userId: 1, userType: 'editor' } },
            res
        )

        assert.equal(res.statusCode, 201)
        assert.equal(saved, '效率工具')
        assert.equal(res.body.data.labelId, 12)
    } finally {
        labelModel.findLabelByName = originalFind
        labelModel.insertLabel = originalInsert
    }
})

test('deleteLabel blocks when articles still use the label', async () => {
    const originalFind = labelModel.findLabels
    const originalCount = labelModel.countArticlesByLabelName
    const originalDelete = labelModel.deleteLabel
    let deleted = false

    labelModel.findLabels = async () => [{ id: 1, name: 'Vue', value: 5 }]
    labelModel.countArticlesByLabelName = async () => 5
    labelModel.deleteLabel = async () => {
        deleted = true
        return 1
    }

    try {
        const res = createRes()
        await labelController.deleteLabel({ params: { id: 1 }, user: { userId: 1, userType: 'admin' } }, res)

        assert.equal(res.body.code, 400)
        assert.match(res.body.message, /5 篇文章/)
        assert.equal(deleted, false)
    } finally {
        labelModel.findLabels = originalFind
        labelModel.countArticlesByLabelName = originalCount
        labelModel.deleteLabel = originalDelete
    }
})

test('deleteLabel succeeds for unused label', async () => {
    const originalFind = labelModel.findLabels
    const originalCount = labelModel.countArticlesByLabelName
    const originalDelete = labelModel.deleteLabel
    let deleted = false

    labelModel.findLabels = async () => [{ id: 2, name: '美食', value: 0 }]
    labelModel.countArticlesByLabelName = async () => 0
    labelModel.deleteLabel = async () => {
        deleted = true
        return 1
    }

    try {
        const res = createRes()
        await labelController.deleteLabel({ params: { id: 2 }, user: { userId: 1, userType: 'admin' } }, res)

        assert.equal(res.body.code, 200)
        assert.equal(deleted, true)
    } finally {
        labelModel.findLabels = originalFind
        labelModel.countArticlesByLabelName = originalCount
        labelModel.deleteLabel = originalDelete
    }
})

test('ensureLabels normalizes input and reports the stored names', async () => {
    const originalFind = labelModel.findLabelByName
    const originalInsert = labelModel.insertLabel
    const inserted = []

    labelModel.findLabelByName = async (name) => (name === 'Vue' ? { id: 1 } : null)
    labelModel.insertLabel = async (name) => {
        inserted.push(name)
        return { labelId: inserted.length }
    }

    try {
        const names = await labelModel.ensureLabels('  Vue , , React ,Vue  ')

        assert.deepEqual(names, ['Vue', 'React'])
        assert.deepEqual(inserted, ['React'])
    } finally {
        labelModel.findLabelByName = originalFind
        labelModel.insertLabel = originalInsert
    }
})
